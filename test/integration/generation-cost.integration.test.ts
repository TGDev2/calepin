/**
 * `readProjectCostSummary` (CAL-056), against a real PostgreSQL: totals, the
 * breakdown by mission and the breakdown by day all sum correctly across a
 * mix of successful, failed and still-running attempts.
 *
 * Same shape as `generation-repository.integration.test.ts`: a
 * `createAuditedClient` for seeding, a separate bare `PrismaClient`
 * registered on the seam the repository function itself reads through. The
 * fixture is independent of `project-graph.ts` — it needs real, hand-picked
 * token and cost values to sum, which the shared 35-model graph fixture does
 * not carry.
 */

import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  openProjectScope,
  type ProjectScope,
  readProjectCostSummary,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";
import { fixtureGenerationKey, fixtureLease } from "./generation-fixture";

/** A scope naming a project the owner does not own — CAL-023's own fixture shape. */
function forgedScope(ownerId: string, projectId: string): ProjectScope {
  return {
    [Symbol.for("calepin.ProjectScope")]: true,
    projectId,
    ownerId,
  } as unknown as ProjectScope;
}

describe("readProjectCostSummary (CAL-056)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  beforeAll(() => {
    configureDatabaseClient(seam);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  it("sums every attempt across two missions and two days, failures and running attempts included", async () => {
    const user = await prisma.user.create({
      data: { email: "generation-cost-owner@example.test" },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: { userId: user.id, title: "Generation cost fixture" },
    });

    const day1 = new Date("2026-01-01T10:00:00.000Z");
    const day2 = new Date("2026-01-02T09:00:00.000Z");

    const writeScene = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "WRITE_SCENE",
        input: {},
        idempotencyKey: fixtureGenerationKey("generation-cost-write-scene"),
      },
    });
    await prisma.generationAttempt.create({
      data: {
        generationId: writeScene.id,
        attempt: 1,
        model: "claude-opus-5",
        status: "SUCCEEDED",
        inputTokens: 1000,
        outputTokens: 200,
        estimatedCostUsd: "1.500000",
        startedAt: day1,
        completedAt: day1,
      },
    });
    await prisma.generationAttempt.create({
      data: {
        generationId: writeScene.id,
        attempt: 2,
        model: "claude-opus-5",
        status: "FAILED",
        inputTokens: 500,
        outputTokens: 100,
        estimatedCostUsd: "0.750000",
        startedAt: day2,
        completedAt: day2,
      },
    });

    const summarizeChapter = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "SUMMARIZE_CHAPTER",
        input: {},
        idempotencyKey: fixtureGenerationKey("generation-cost-summarize"),
      },
    });
    await prisma.generationAttempt.create({
      data: {
        generationId: summarizeChapter.id,
        attempt: 1,
        model: "claude-sonnet-5",
        status: "SUCCEEDED",
        inputTokens: 300,
        outputTokens: 50,
        estimatedCostUsd: "0.250000",
        startedAt: day1,
        completedAt: day1,
      },
    });
    await prisma.generationAttempt.create({
      data: {
        generationId: summarizeChapter.id,
        attempt: 2,
        model: "claude-sonnet-5",
        status: "RUNNING",
        startedAt: day2,
        leaseExpiresAt: fixtureLease(),
      },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    const summary = await readProjectCostSummary(opened.value);
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;

    expect(summary.value.attemptCount).toBe(4);
    expect(summary.value.inputTokens).toBe(1800);
    expect(summary.value.outputTokens).toBe(350);
    expect(summary.value.estimatedCostUsd).toBe("2.500000");

    // Ordered by the `GenerationMission` enum's own declaration order
    // (WRITE_SCENE before SUMMARIZE_CHAPTER), not alphabetically — Postgres
    // orders an enum column by ordinal position, not by text.
    expect(summary.value.byMission).toEqual([
      {
        mission: "WRITE_SCENE",
        attemptCount: 2,
        inputTokens: 1500,
        outputTokens: 300,
        estimatedCostUsd: "2.250000",
      },
      {
        mission: "SUMMARIZE_CHAPTER",
        attemptCount: 2,
        inputTokens: 300,
        outputTokens: 50,
        estimatedCostUsd: "0.250000",
      },
    ]);

    expect(summary.value.byDay).toEqual([
      {
        day: new Date("2026-01-01T00:00:00.000Z"),
        attemptCount: 2,
        inputTokens: 1300,
        outputTokens: 250,
        estimatedCostUsd: "1.750000",
      },
      {
        day: new Date("2026-01-02T00:00:00.000Z"),
        attemptCount: 2,
        inputTokens: 500,
        outputTokens: 100,
        estimatedCostUsd: "0.750000",
      },
    ]);
  });

  it("answers real zeros for a project that has never generated anything", async () => {
    const user = await prisma.user.create({
      data: { email: "generation-cost-idle@example.test" },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: { userId: user.id, title: "Idle project" },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    const summary = await readProjectCostSummary(opened.value);
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.value).toEqual({
        attemptCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: "0.000000",
        byMission: [],
        byDay: [],
      });
    }
  });

  it("refuses a project that is not the scope's owner's", async () => {
    const owner = await prisma.user.create({
      data: { email: "generation-cost-real-owner@example.test" },
    });
    setActor(owner.id);
    const project = await prisma.project.create({
      data: { userId: owner.id, title: "Someone else's project" },
    });

    const intruder = await prisma.user.create({
      data: { email: "generation-cost-intruder@example.test" },
    });

    const theirs = await readProjectCostSummary(forgedScope(intruder.id, project.id));
    expect(theirs.ok).toBe(false);
    if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");

    const missing = await readProjectCostSummary(forgedScope(owner.id, "no_such_project"));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("NOT_FOUND");
  });
});
