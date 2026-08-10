/**
 * `readMissionMeasurements` (CAL-057), against a real PostgreSQL: the median a
 * pre-flight estimate is founded on, taken over succeeded generations, each
 * counted with everything its attempts consumed.
 *
 * Same shape as `generation-cost.integration.test.ts` — a `createAuditedClient`
 * for seeding, a separate bare `PrismaClient` registered on the seam the
 * repository function reads through — and, like it, an independent fixture: it
 * needs hand-picked token and duration values whose median is known in advance,
 * which the shared 35-model graph does not carry.
 */

import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  openProjectScope,
  type ProjectScope,
  readMissionMeasurements,
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

describe("readMissionMeasurements (CAL-057)", () => {
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

  it("takes the median over generations, counting each with all of its attempts", async () => {
    const user = await prisma.user.create({
      data: { email: "mission-measurements-owner@example.test" },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: { userId: user.id, title: "Mission measurement fixture" },
    });

    const at = new Date("2026-02-01T08:00:00.000Z");
    let sequence = 0;

    /** One succeeded generation, and the attempts it took to get there. */
    async function seedGeneration(
      mission: "WRITE_SCENE" | "SUMMARIZE_CHAPTER",
      attempts: readonly { inputTokens: number; outputTokens: number; durationMs: number }[],
    ): Promise<void> {
      sequence += 1;
      const generation = await prisma.generation.create({
        data: {
          projectId: project.id,
          mission,
          status: "SUCCEEDED",
          completedAt: at,
          input: {},
          idempotencyKey: fixtureGenerationKey(`measurements-${sequence}`),
        },
      });

      for (const [index, attempt] of attempts.entries()) {
        await prisma.generationAttempt.create({
          data: {
            generationId: generation.id,
            attempt: index + 1,
            model: "fixture-model",
            status: index === attempts.length - 1 ? "SUCCEEDED" : "FAILED",
            startedAt: at,
            completedAt: at,
            ...attempt,
          },
        });
      }
    }

    // Three succeeded generations of one mission: 1 000, 3 000 and 5 000 input
    // tokens. The middle one is the answer, and the mean would not be — the
    // first of them took two attempts and carries its retry, which is the whole
    // reason the unit of measurement is the generation.
    await seedGeneration("WRITE_SCENE", [
      { inputTokens: 400, outputTokens: 100, durationMs: 40_000 },
      { inputTokens: 600, outputTokens: 100, durationMs: 60_000 },
    ]);
    await seedGeneration("WRITE_SCENE", [
      { inputTokens: 3_000, outputTokens: 900, durationMs: 200_000 },
    ]);
    await seedGeneration("WRITE_SCENE", [
      { inputTokens: 5_000, outputTokens: 1_500, durationMs: 300_000 },
    ]);

    await seedGeneration("SUMMARIZE_CHAPTER", [
      { inputTokens: 800, outputTokens: 200, durationMs: 10_000 },
    ]);

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    const read = await readMissionMeasurements(opened.value);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("the owner's own measurements were refused");

    expect(read.value).toEqual([
      {
        mission: "WRITE_SCENE",
        sampleCount: 3,
        inputTokens: 3_000,
        outputTokens: 900,
        durationMs: 200_000,
      },
      {
        mission: "SUMMARIZE_CHAPTER",
        sampleCount: 1,
        inputTokens: 800,
        outputTokens: 200,
        durationMs: 10_000,
      },
    ]);
  });

  it("leaves out a generation that failed, one still running and one only half measured", async () => {
    const user = await prisma.user.create({
      data: { email: "mission-measurements-excluded@example.test" },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: { userId: user.id, title: "Excluded generations fixture" },
    });

    const at = new Date("2026-02-02T08:00:00.000Z");
    const measured = { inputTokens: 900, outputTokens: 300, durationMs: 30_000 };

    // Succeeded and fully measured — the one row that should survive.
    const kept = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "EXTRACT_FACTS",
        status: "SUCCEEDED",
        completedAt: at,
        input: {},
        idempotencyKey: fixtureGenerationKey("measurements-kept"),
      },
    });
    await prisma.generationAttempt.create({
      data: {
        generationId: kept.id,
        attempt: 1,
        model: "fixture-model",
        status: "SUCCEEDED",
        startedAt: at,
        completedAt: at,
        ...measured,
      },
    });

    // A failed generation. Its tokens were spent and `readProjectCostSummary`
    // counts them; what the next operation is expected to cost is another
    // question, and a failure is not the answer to it.
    const failed = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "EXTRACT_FACTS",
        status: "FAILED",
        completedAt: at,
        errorCode: "TIMEOUT",
        errorCategory: "TIMEOUT",
        input: {},
        idempotencyKey: fixtureGenerationKey("measurements-failed"),
      },
    });
    await prisma.generationAttempt.create({
      data: {
        generationId: failed.id,
        attempt: 1,
        model: "fixture-model",
        status: "FAILED",
        startedAt: at,
        completedAt: at,
        inputTokens: 90_000,
        outputTokens: 90_000,
        durationMs: 900_000,
      },
    });

    // Still running: a partial measurement, and one whose numbers would drag
    // the median down for as long as it runs.
    const running = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "EXTRACT_FACTS",
        status: "RUNNING",
        input: {},
        idempotencyKey: fixtureGenerationKey("measurements-running"),
      },
    });
    await prisma.generationAttempt.create({
      data: {
        generationId: running.id,
        attempt: 1,
        model: "fixture-model",
        status: "RUNNING",
        startedAt: at,
        leaseExpiresAt: fixtureLease(),
      },
    });

    // Succeeded, but one of its two attempts was never measured — the state
    // every row is in until a worker writes these columns. Summing over it
    // would understate, so the generation is dropped whole.
    const partial = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "EXTRACT_FACTS",
        status: "SUCCEEDED",
        completedAt: at,
        input: {},
        idempotencyKey: fixtureGenerationKey("measurements-partial"),
      },
    });
    await prisma.generationAttempt.create({
      data: {
        generationId: partial.id,
        attempt: 1,
        model: "fixture-model",
        status: "FAILED",
        startedAt: at,
        completedAt: at,
      },
    });
    await prisma.generationAttempt.create({
      data: {
        generationId: partial.id,
        attempt: 2,
        model: "fixture-model",
        status: "SUCCEEDED",
        startedAt: at,
        completedAt: at,
        ...measured,
      },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    const read = await readMissionMeasurements(opened.value);
    if (!read.ok) throw new Error("the owner's own measurements were refused");

    expect(read.value).toEqual([
      {
        mission: "EXTRACT_FACTS",
        sampleCount: 1,
        inputTokens: measured.inputTokens,
        outputTokens: measured.outputTokens,
        durationMs: measured.durationMs,
      },
    ]);
  });

  it("answers an empty history for a project that has generated nothing", async () => {
    const user = await prisma.user.create({
      data: { email: "mission-measurements-empty@example.test" },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: { userId: user.id, title: "Empty history fixture" },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    const read = await readMissionMeasurements(opened.value);

    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("an empty history was refused");
    expect(read.value).toEqual([]);
  });

  // Nothing measured and not yours are different answers: the first is what
  // makes the estimate fall back on the registry, the second is a refusal.
  it("refuses a project that is not the scope owner's", async () => {
    const owner = await prisma.user.create({
      data: { email: "mission-measurements-alice@example.test" },
    });
    const stranger = await prisma.user.create({
      data: { email: "mission-measurements-bob@example.test" },
    });
    setActor(owner.id);

    const project = await prisma.project.create({
      data: { userId: owner.id, title: "Owned by Alice" },
    });

    const refused = await readMissionMeasurements(forgedScope(stranger.id, project.id));

    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("another owner's measurements were returned");
    expect(refused.error.code).toBe("NOT_FOUND");
  });
});
