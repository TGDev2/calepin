/**
 * CAL-065's acceptance criterion, against a real PostgreSQL: **launching
 * several generations at once never admits more than the configured cap.**
 *
 * The claim is the arbiter, exactly as it is for every other admission
 * question in this lifecycle (already-succeeded, in-flight, cancelled) — see
 * `claimGenerationAttempt`'s own doc comment. Racing several real concurrent
 * calls to it, rather than calling it in sequence, is the only thing that
 * proves the row lock actually closes the race: a sequential loop would pass
 * even with the lock deleted (`tasks/lessons.md`'s own warning about proving a
 * lock by racing two writers).
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { CAPACITY_RETRY_DELAY_MS } from "@calepin/shared/generation";
import {
  claimGenerationAttempt,
  openProjectScope,
  type ProjectScope,
  reserveGeneration,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const MODEL = "claude-opus-5";

describe("generation concurrency limiting (CAL-065)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();
  let sequence = 0;

  beforeAll(() => {
    configureDatabaseClient(seam);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  interface Fixture {
    readonly ownerId: string;
    /** The first project's scope — every single-project test uses this. */
    readonly scope: ProjectScope;
    readonly scopes: ProjectScope[];
  }

  /** One owner and `projectCount` open scopes on projects they own. */
  async function createFixture(projectCount = 1): Promise<Fixture> {
    sequence += 1;
    const user = await prisma.user.create({
      data: { email: `concurrency-${sequence}@example.test` },
    });
    setActor(user.id);

    const scopes: ProjectScope[] = [];

    for (let index = 0; index < projectCount; index += 1) {
      const project = await prisma.project.create({
        data: { userId: user.id, title: `concurrency-${sequence}-${index}` },
      });
      const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
      if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

      scopes.push(opened.value);
    }

    const [scope] = scopes;
    if (scope === undefined) throw new Error("a fixture must open at least one project scope");

    return { ownerId: user.id, scope, scopes };
  }

  /** `count` reserved generations under `scope`, none of them claimed yet. */
  async function reserveMany(
    ownerId: string,
    scope: ProjectScope,
    count: number,
    label: string,
  ): Promise<string[]> {
    const ids: string[] = [];

    for (let index = 0; index < count; index += 1) {
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, {
          mission: "WRITE_SCENE",
          targetId: `${label}-${index}`,
          input: { baseRevisionId: `${label}-${index}` },
        }),
      );
      if (!reserved.ok) throw new Error("a reservation was refused");

      ids.push(reserved.value.id);
    }

    return ids;
  }

  it("never admits more than a project's own cap, under a real race", async () => {
    const { ownerId, scope } = await createFixture();
    await prisma.project.update({
      where: { id: scope.projectId },
      data: { generationConcurrencyLimit: 2 },
    });

    const ids = await reserveMany(ownerId, scope, 5, "project-cap");

    const claims = await Promise.all(
      ids.map((generationId) => claimGenerationAttempt(scope, { generationId, model: MODEL })),
    );

    const claimed = claims.filter((claim) => claim.ok && claim.value.kind === "claimed");
    const overCapacity = claims.filter(
      (claim) => claim.ok && claim.value.kind === "refused" && claim.value.reason === "at-capacity",
    );

    expect(claimed).toHaveLength(2);
    expect(overCapacity).toHaveLength(3);

    // The database itself agrees — the row is the truth, not the return value.
    expect(
      await prisma.generation.count({ where: { projectId: scope.projectId, status: "RUNNING" } }),
    ).toBe(2);
  });

  it("never admits more than the owner's cap across two of their projects", async () => {
    const { ownerId, scopes } = await createFixture(2);
    const [scopeA, scopeB] = scopes;
    if (scopeA === undefined || scopeB === undefined) {
      throw new Error("the fixture must open exactly two project scopes");
    }

    // Left at the default project cap (3, comfortably above what this test
    // claims per project) so only the tighter owner-wide cap binds.
    await prisma.user.update({
      where: { id: ownerId },
      data: { generationConcurrencyLimit: 3 },
    });

    const idsA = await reserveMany(ownerId, scopeA, 3, "user-cap-a");
    const idsB = await reserveMany(ownerId, scopeB, 3, "user-cap-b");

    const claims = await Promise.all([
      ...idsA.map((generationId) => claimGenerationAttempt(scopeA, { generationId, model: MODEL })),
      ...idsB.map((generationId) => claimGenerationAttempt(scopeB, { generationId, model: MODEL })),
    ]);

    const claimed = claims.filter((claim) => claim.ok && claim.value.kind === "claimed");
    expect(claimed).toHaveLength(3);

    const runningCount = await prisma.generation.count({
      where: { status: "RUNNING", project: { userId: ownerId } },
    });
    expect(runningCount).toBe(3);
  });

  it("binds a project to its own override rather than the system default", async () => {
    const { ownerId, scope } = await createFixture();
    await prisma.project.update({
      where: { id: scope.projectId },
      data: { generationConcurrencyLimit: 1 },
    });

    const ids = await reserveMany(ownerId, scope, 3, "override");

    const claims = await Promise.all(
      ids.map((generationId) => claimGenerationAttempt(scope, { generationId, model: MODEL })),
    );

    expect(claims.filter((claim) => claim.ok && claim.value.kind === "claimed")).toHaveLength(1);
  });

  it("schedules a near retry for a generation refused over capacity, classifying nothing", async () => {
    const { ownerId, scope } = await createFixture();
    await prisma.project.update({
      where: { id: scope.projectId },
      data: { generationConcurrencyLimit: 1 },
    });

    const [firstId, secondId] = await reserveMany(ownerId, scope, 2, "retry-deadline");
    if (firstId === undefined || secondId === undefined) {
      throw new Error("two generations should have been reserved");
    }

    const now = new Date("2026-03-01T10:00:00.000Z");

    const first = await claimGenerationAttempt(scope, { generationId: firstId, model: MODEL, now });
    expect(first.ok && first.value).toEqual({ kind: "claimed", attempt: 1 });

    const second = await claimGenerationAttempt(scope, {
      generationId: secondId,
      model: MODEL,
      now,
    });
    expect(second.ok && second.value).toEqual({ kind: "refused", reason: "at-capacity" });

    const row = await prisma.generation.findUniqueOrThrow({
      where: { id: secondId },
      select: { status: true, failureClass: true, nextAttemptAt: true },
    });

    // Nothing failed and no attempt was opened, so there is nothing to
    // classify — only the deadline that gets it looked at again soon.
    expect(row.status).toBe("QUEUED");
    expect(row.failureClass).toBeNull();
    expect(row.nextAttemptAt).toEqual(new Date(now.getTime() + CAPACITY_RETRY_DELAY_MS));
  });

  it("lets a generation resume after a crash even while its project is at capacity", async () => {
    const { ownerId, scope } = await createFixture();
    await prisma.project.update({
      where: { id: scope.projectId },
      data: { generationConcurrencyLimit: 1 },
    });

    const [id] = await reserveMany(ownerId, scope, 1, "resume-at-capacity");
    if (id === undefined) throw new Error("one generation should have been reserved");

    const held = new Date("2026-03-01T10:00:00.000Z");
    const claimed = await claimGenerationAttempt(scope, {
      generationId: id,
      model: MODEL,
      leaseMs: 60_000,
      now: held,
    });
    expect(claimed.ok && claimed.value).toEqual({ kind: "claimed", attempt: 1 });

    // The worker dies and the queue redelivers past the lease. The project
    // is nominally "at capacity" for the whole of this window — this row is
    // the one `RUNNING` generation it has, and the cap is 1 — but the row
    // never competes against itself.
    const afterRestart = new Date(held.getTime() + 120_000);
    const retaken = await claimGenerationAttempt(scope, {
      generationId: id,
      model: MODEL,
      now: afterRestart,
    });

    expect(retaken.ok && retaken.value).toEqual({ kind: "claimed", attempt: 2 });
  });
});
