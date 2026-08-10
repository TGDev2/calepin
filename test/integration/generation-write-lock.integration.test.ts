/**
 * CAL-067's acceptance criterion, against a real PostgreSQL: **two concurrent
 * asks on the same chapter produce a queue, never an overwrite.**
 *
 * Every claim here is raced with `Promise.all` rather than made in sequence.
 * That is the only thing that proves the lock: a sequential loop would pass
 * with the check deleted, because the first claim would already have committed
 * `RUNNING` before the second one looked (`tasks/lessons.md` — a lock is
 * proved by racing two writers, never by calling them one after the other).
 *
 * The last two cases are the ones the specification actually cares about. One
 * shows the lock releasing on its own when the worker holding it dies, through
 * the shipped reconciliation sweep and nothing written for the test. The other
 * shows what happens to the dead worker's answer if it comes back: the chapter
 * gains exactly one revision, the live worker's, and the zombie's append never
 * runs.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { type Result, succeed } from "@calepin/shared/errors";
import { toSucceededAttempt, WRITE_TARGET_RETRY_DELAY_MS } from "@calepin/shared/generation";
import { reconcileGenerations } from "@calepin/shared/queue";
import {
  claimGenerationAttempt,
  completeGenerationAttempt,
  type GenerationMission,
  listRunningGenerations,
  openProjectScope,
  type ProjectScope,
  reserveGeneration,
  type TransactionClient,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";
import { createProjectGraph } from "./project-graph";

const MODEL = "claude-opus-5";

/** Every target id is technical: §9 keeps a chapter's own title out of a test. */
const CHAPTER = "chapter-7";

describe("generation write lock per narrative target (CAL-067)", () => {
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
    readonly scope: ProjectScope;
  }

  /** One owner, one project, one open scope — no narrative rows needed. */
  async function createFixture(): Promise<Fixture> {
    sequence += 1;
    const user = await prisma.user.create({
      data: { email: `write-lock-${sequence}@example.test` },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: { userId: user.id, title: `write-lock-${sequence}` },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    return { ownerId: user.id, scope: opened.value };
  }

  interface Ask {
    readonly mission: GenerationMission;
    readonly targetId: string;
    /** Distinguishes two asks that would otherwise share an idempotency key. */
    readonly label: string;
  }

  /** Reserves one generation per ask, in order, none of them claimed yet. */
  async function reserveAll(
    ownerId: string,
    scope: ProjectScope,
    asks: readonly Ask[],
  ): Promise<string[]> {
    const ids: string[] = [];

    for (const ask of asks) {
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, {
          mission: ask.mission,
          targetId: ask.targetId,
          input: { baseRevisionId: ask.label },
        }),
      );
      if (!reserved.ok) throw new Error("a reservation was refused");

      ids.push(reserved.value.id);
    }

    return ids;
  }

  /** Every claim at once — the race that makes the assertions mean something. */
  function claimAll(scope: ProjectScope, ids: readonly string[], now?: Date) {
    return Promise.all(
      ids.map((generationId) => claimGenerationAttempt(scope, { generationId, model: MODEL, now })),
    );
  }

  function countBy(
    claims: Awaited<ReturnType<typeof claimAll>>,
  ): Record<"claimed" | "target-locked" | "other", number> {
    const counts = { claimed: 0, "target-locked": 0, other: 0 };

    for (const claim of claims) {
      if (!claim.ok) counts.other += 1;
      else if (claim.value.kind === "claimed") counts.claimed += 1;
      else if (claim.value.reason === "target-locked") counts["target-locked"] += 1;
      else counts.other += 1;
    }

    return counts;
  }

  it("admits exactly one generation per chapter, under a real race", async () => {
    const { ownerId, scope } = await createFixture();
    const ids = await reserveAll(ownerId, scope, [
      { mission: "WRITE_SCENE", targetId: CHAPTER, label: "a" },
      { mission: "WRITE_SCENE", targetId: CHAPTER, label: "b" },
      { mission: "FIX_ISSUE", targetId: CHAPTER, label: "c" },
      { mission: "SUMMARIZE_CHAPTER", targetId: CHAPTER, label: "d" },
    ]);

    expect(countBy(await claimAll(scope, ids))).toEqual({
      claimed: 1,
      "target-locked": 3,
      other: 0,
    });

    // The rows are the truth, not the return values: one generation running,
    // and one attempt in the whole project — nothing was half-opened.
    expect(
      await prisma.generation.count({ where: { projectId: scope.projectId, status: "RUNNING" } }),
    ).toBe(1);
    expect(
      await prisma.generationAttempt.count({
        where: { generation: { projectId: scope.projectId } },
      }),
    ).toBe(1);
  });

  it("still writes two chapters of one novel at once", async () => {
    // The lock is per target, not per project. Serialising a whole novel would
    // be the easy wrong answer, and `claimGenerationAttempt` has always been
    // careful to lock the generation rather than the project for this reason.
    const { ownerId, scope } = await createFixture();
    const ids = await reserveAll(ownerId, scope, [
      { mission: "WRITE_SCENE", targetId: "chapter-1", label: "a" },
      { mission: "WRITE_SCENE", targetId: "chapter-2", label: "b" },
      { mission: "WRITE_SCENE", targetId: "chapter-3", label: "c" },
    ]);

    expect(countBy(await claimAll(scope, ids))).toEqual({
      claimed: 3,
      "target-locked": 0,
      other: 0,
    });
  });

  it("excludes two missions that write one bible, whatever each of them names", async () => {
    // The case `targetId` alone cannot answer: a character sheet names a
    // character, a fact extraction names a chapter, and both write the bible.
    const { ownerId, scope } = await createFixture();
    const ids = await reserveAll(ownerId, scope, [
      { mission: "CREATE_CHARACTER_SHEET", targetId: "character-1", label: "a" },
      { mission: "EXTRACT_FACTS", targetId: "chapter-9", label: "b" },
    ]);

    expect(countBy(await claimAll(scope, ids))).toEqual({
      claimed: 1,
      "target-locked": 1,
      other: 0,
    });
  });

  it("lets a coherence audit run beside the chapter it is reading", async () => {
    // An audit writes QualityIssue rows and no narrative text, so holding a
    // chapter would only stop work it never conflicts with.
    const { ownerId, scope } = await createFixture();
    const ids = await reserveAll(ownerId, scope, [
      { mission: "WRITE_SCENE", targetId: CHAPTER, label: "a" },
      { mission: "CHECK_COHERENCE", targetId: CHAPTER, label: "b" },
    ]);

    expect(countBy(await claimAll(scope, ids))).toEqual({
      claimed: 2,
      "target-locked": 0,
      other: 0,
    });
  });

  it("queues the concurrent ask rather than refusing it", async () => {
    const { ownerId, scope } = await createFixture();
    const [firstId, secondId] = await reserveAll(ownerId, scope, [
      { mission: "WRITE_SCENE", targetId: CHAPTER, label: "a" },
      { mission: "WRITE_SCENE", targetId: CHAPTER, label: "b" },
    ]);
    if (firstId === undefined || secondId === undefined) {
      throw new Error("two generations should have been reserved");
    }

    const now = new Date("2026-04-01T10:00:00.000Z");

    const first = await claimGenerationAttempt(scope, { generationId: firstId, model: MODEL, now });
    expect(first.ok && first.value).toEqual({ kind: "claimed", attempt: 1 });

    const second = await claimGenerationAttempt(scope, {
      generationId: secondId,
      model: MODEL,
      now,
    });
    expect(second.ok && second.value).toEqual({ kind: "refused", reason: "target-locked" });

    const row = await prisma.generation.findUniqueOrThrow({
      where: { id: secondId },
      select: { status: true, failureClass: true, errorCode: true, nextAttemptAt: true },
    });

    // Waiting, not failing: still queued, nothing classified, nothing to
    // explain to an author — only the deadline that gets it looked at again.
    expect(row.status).toBe("QUEUED");
    expect(row.failureClass).toBeNull();
    expect(row.errorCode).toBeNull();
    expect(row.nextAttemptAt).toEqual(new Date(now.getTime() + WRITE_TARGET_RETRY_DELAY_MS));

    // And no try was spent on it, so the attempt ceiling never closes a
    // generation for having queued politely.
    expect(await prisma.generationAttempt.count({ where: { generationId: secondId } })).toBe(0);

    const inFlight = await listRunningGenerations(scope);
    expect(inFlight.find((view) => view.id === secondId)?.blockedByWriteTarget).toBe(true);
    expect(inFlight.find((view) => view.id === firstId)?.blockedByWriteTarget).toBe(false);
  });

  it("releases the lock on its own when the worker holding it dies", async () => {
    const { ownerId, scope } = await createFixture();
    const [firstId, secondId] = await reserveAll(ownerId, scope, [
      { mission: "WRITE_SCENE", targetId: CHAPTER, label: "a" },
      { mission: "WRITE_SCENE", targetId: CHAPTER, label: "b" },
    ]);
    if (firstId === undefined || secondId === undefined) {
      throw new Error("two generations should have been reserved");
    }

    const held = new Date("2026-04-01T10:00:00.000Z");
    const claimed = await claimGenerationAttempt(scope, {
      generationId: firstId,
      model: MODEL,
      leaseMs: 60_000,
      now: held,
    });
    expect(claimed.ok && claimed.value).toEqual({ kind: "claimed", attempt: 1 });

    const blocked = await claimGenerationAttempt(scope, {
      generationId: secondId,
      model: MODEL,
      now: held,
    });
    expect(blocked.ok && blocked.value).toEqual({ kind: "refused", reason: "target-locked" });

    // The worker is killed. Nothing renews the lease, and the sweep that ships
    // with the queue — not a statement written for this test — is what notices.
    const afterDeath = new Date(held.getTime() + 10 * 60_000);
    const delivered: string[] = [];

    await reconcileGenerations({
      now: () => afterDeath,
      enqueue: async (generationId) => {
        delivered.push(generationId);

        return succeed(undefined);
      },
    });

    // The dead worker's attempt is closed with its usage columns untouched, and
    // its generation is back in the queue — which is what released the target.
    const abandoned = await prisma.generationAttempt.findFirstOrThrow({
      where: { generationId: firstId, attempt: 1 },
      select: { status: true, errorCode: true, inputTokens: true, estimatedCostUsd: true },
    });
    expect(abandoned.status).toBe("FAILED");
    expect(abandoned.errorCode).toBe("GENERATION_INTERRUPTED");
    expect(abandoned.inputTokens).toBeNull();
    expect(abandoned.estimatedCostUsd).toBeNull();

    expect(delivered).toContain(secondId);

    const retaken = await claimGenerationAttempt(scope, {
      generationId: secondId,
      model: MODEL,
      now: afterDeath,
    });
    expect(retaken.ok && retaken.value).toEqual({ kind: "claimed", attempt: 1 });
  });

  it("never lets a superseded worker write over the chapter that replaced it", async () => {
    // The guarantee in full, with a real chapter: the dead worker's answer
    // arrives after another generation has already written, and the chapter
    // keeps exactly the revisions that were actually produced.
    sequence += 1;
    const graph = await createProjectGraph(prisma, setActor, `write-lock-graph-${sequence}`);
    const opened = await openProjectScope({
      ownerId: graph.ownerId,
      projectId: graph.projectId,
    });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    const scope = opened.value;
    const chapterId = graph.rows.Chapter;

    const [deadId, liveId] = await reserveAll(graph.ownerId, scope, [
      { mission: "WRITE_SCENE", targetId: chapterId, label: "dead" },
      { mission: "WRITE_SCENE", targetId: chapterId, label: "live" },
    ]);
    if (deadId === undefined || liveId === undefined) {
      throw new Error("two generations should have been reserved");
    }

    /** The write a mission would append — the only thing that touches prose. */
    const appendRevision =
      (generationId: string, revisionNumber: number) =>
      async (client: TransactionClient): Promise<Result<void>> => {
        await client.chapterRevision.create({
          data: {
            chapterId,
            generationId,
            revisionNumber,
            origin: "GENERATED",
            content: "fixture",
            wordCount: 1,
            createdById: graph.ownerId,
          },
        });

        return succeed(undefined);
      };

    const start = new Date("2026-04-01T11:00:00.000Z");
    const dead = await claimGenerationAttempt(scope, {
      generationId: deadId,
      model: MODEL,
      leaseMs: 60_000,
      now: start,
    });
    expect(dead.ok && dead.value).toEqual({ kind: "claimed", attempt: 1 });

    // Its worker dies mid-call; the sweep reclaims the attempt and frees the
    // chapter. The lease is the only thing that ever held it.
    const afterDeath = new Date(start.getTime() + 10 * 60_000);
    await reconcileGenerations({ now: () => afterDeath, enqueue: async () => succeed(undefined) });

    const live = await claimGenerationAttempt(scope, {
      generationId: liveId,
      model: MODEL,
      now: afterDeath,
    });
    expect(live.ok && live.value.kind === "claimed").toBe(true);

    const written = await runWithActor(graph.ownerId, async () =>
      completeGenerationAttempt(
        scope,
        toSucceededAttempt({ generationId: liveId, attempt: 1, durationMs: 1000 }),
        appendRevision(liveId, 2),
      ),
    );
    expect(written.ok && written.value).toBe("applied");

    // The zombie comes back with the answer it spent ten minutes on.
    const late = await runWithActor(graph.ownerId, async () =>
      completeGenerationAttempt(
        scope,
        toSucceededAttempt({ generationId: deadId, attempt: 1, durationMs: 600_000 }),
        appendRevision(deadId, 3),
      ),
    );
    expect(late.ok && late.value).toBe("already-completed");

    // Two revisions: the fixture's and the live generation's. The zombie's
    // append never ran, so nothing it computed reached the chapter.
    const revisions = await prisma.chapterRevision.findMany({
      where: { chapterId },
      orderBy: { revisionNumber: "asc" },
      select: { revisionNumber: true, generationId: true },
    });
    expect(revisions.map((revision) => revision.revisionNumber)).toEqual([1, 2]);
    expect(revisions[1]?.generationId).toBe(liveId);
  });
});
