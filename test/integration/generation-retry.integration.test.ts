/**
 * CAL-063's acceptance criterion, against a real PostgreSQL: **a failed
 * generation is replayable from the interface without losing the last valid
 * version** — and, on the way there, that the three error classes are treated
 * differently rather than uniformly.
 *
 * The backlog asks for *les tests par classe d'erreur*, and this is where that
 * means something: the classification is only real if it changes what the
 * database ends up holding. So each class is driven through the real
 * `runGenerationAttempt` over the real repository, and what is asserted is the
 * row — its status, its class, its deadline — never a return value that a
 * refactor could keep true while the row moved.
 *
 * Four things are performed rather than simulated:
 *
 * - **The classification**, by failing `produce` with the real `AppError` a
 *   provider outage, a rate limiter and a malformed answer actually produce.
 * - **The backoff**, by reading `nextAttemptAt` off the row and handing the same
 *   clock to `listDeliverableGenerations` — so "a generation in backoff is not
 *   redelivered" is asserted against the query the sweep really runs.
 * - **The loop breaker**, by exhausting a generation and replaying it, which is
 *   the case a per-row ceiling exists for: without one the sweep closes the
 *   replay again before delivering it.
 * - **The preservation of the last valid version**, against
 *   `AnalysisSectionRevision` — the only versioned entity that exists today whose
 *   rows name the generation that produced them. A failing attempt's `append` is
 *   the write that must not happen, and the oracle is the revision count.
 *
 * Every fixture value is technical (§9). A retry policy needs no prose.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  type AppError,
  fail,
  InternalError,
  ProviderError,
  RateLimitError,
  type Result,
  succeed,
  TimeoutError,
} from "@calepin/shared/errors";
import {
  DEFAULT_GENERATION_RETRY_POLICY,
  type GenerationFailureClass,
  MAX_GENERATION_ATTEMPTS,
  runGenerationAttempt,
} from "@calepin/shared/generation";
import {
  createGenerationPersistence,
  exhaustSpentGenerations,
  listDeliverableGenerations,
  listFailedGenerations,
  listRunningGenerations,
  openProjectScope,
  type ProjectScope,
  replayGeneration,
  reserveGeneration,
  type TransactionClient,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const MODEL = "claude-opus-5";

/** A lease long enough that nothing in this suite reclaims an attempt by accident. */
const LEASE_MS = 60 * 60_000;

/** A fixed instant, so a deadline is arithmetic rather than a range. */
const NOW = new Date("2026-08-10T12:00:00.000Z");

/** No jitter: the wait is then the guaranteed half of the interval, exactly. */
const NO_JITTER = (): number => 0;

interface Fixture {
  readonly ownerId: string;
  readonly projectId: string;
  readonly scope: ProjectScope;
  readonly analysisId: string;
  readonly sourceTextVersionId: string;
}

describe("generation failure recovery (CAL-063)", () => {
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

  /**
   * One owner, one project, and the two rows an analysis revision needs to be
   * appendable — so the "last valid version" oracle has something to preserve.
   */
  async function createFixture(): Promise<Fixture> {
    sequence += 1;
    const label = `retry-${sequence}`;

    const user = await prisma.user.create({ data: { email: `${label}@example.test` } });
    setActor(user.id);

    const project = await prisma.project.create({ data: { userId: user.id, title: label } });
    const sourceText = await prisma.sourceText.create({ data: { projectId: project.id } });
    const sourceTextVersion = await prisma.sourceTextVersion.create({
      data: {
        sourceTextId: sourceText.id,
        versionNumber: 1,
        content: "fixture",
        wordCount: 1,
        editedById: user.id,
      },
    });
    const analysis = await prisma.analysis.create({ data: { projectId: project.id } });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    return {
      ownerId: user.id,
      projectId: project.id,
      scope: opened.value,
      analysisId: analysis.id,
      sourceTextVersionId: sourceTextVersion.id,
    };
  }

  async function reserve(fixture: Fixture, label: string): Promise<string> {
    const reserved = await runWithActor(fixture.ownerId, async () =>
      reserveGeneration(fixture.scope, {
        mission: "ANALYZE_SOURCE_TEXT",
        targetId: null,
        input: { sourceTextVersionId: fixture.sourceTextVersionId, label },
      }),
    );

    if (!reserved.ok) throw new Error("a reservation was refused");

    return reserved.value.id;
  }

  /** The row itself. The whole suite asserts on this and on nothing else. */
  function readRow(generationId: string) {
    return seam.generation.findUniqueOrThrow({
      where: { id: generationId },
      select: {
        status: true,
        errorCode: true,
        errorCategory: true,
        failureClass: true,
        nextAttemptAt: true,
        attemptCeiling: true,
        completedAt: true,
      },
    });
  }

  /**
   * The write a successful analysis generation performs — one appended revision,
   * naming the generation that produced it. The `revisionNumber` is read inside
   * the transaction, which is also what makes a second successful attempt append
   * a second revision rather than collide.
   */
  function appendRevision(fixture: Fixture, generationId: string) {
    return async (client: TransactionClient): Promise<Result<void>> => {
      const last = await client.analysisSectionRevision.findFirst({
        where: { analysisId: fixture.analysisId, section: "FACTUAL_SUMMARY" },
        orderBy: { revisionNumber: "desc" },
        select: { revisionNumber: true },
      });

      await client.analysisSectionRevision.create({
        data: {
          analysisId: fixture.analysisId,
          section: "FACTUAL_SUMMARY",
          revisionNumber: (last?.revisionNumber ?? 0) + 1,
          origin: "GENERATED",
          sourceTextVersionId: fixture.sourceTextVersionId,
          createdById: fixture.ownerId,
          generationId,
        },
      });

      return succeed(undefined);
    };
  }

  function revisionCount(fixture: Fixture): Promise<number> {
    return seam.analysisSectionRevision.count({ where: { analysisId: fixture.analysisId } });
  }

  /**
   * One attempt, failing the way a caller's `produce` fails. The clock is fixed
   * and the jitter removed, so the deadline the row ends up carrying is a number
   * this test can name.
   */
  async function runFailing(
    fixture: Fixture,
    generationId: string,
    failure: AppError,
  ): Promise<void> {
    const persistence = createGenerationPersistence(fixture.scope, {
      generationId,
      model: MODEL,
      leaseMs: LEASE_MS,
      now: () => NOW,
      append: (client) => appendRevision(fixture, generationId)(client),
    });

    await runWithActor(fixture.ownerId, async () => {
      await runGenerationAttempt({
        generationId,
        persist: persistence,
        produce: () => fail(failure),
        now: () => NOW.getTime(),
        random: NO_JITTER,
      });
    });
  }

  /** One attempt that produces. Its `append` is the write worth preserving. */
  async function runSucceeding(fixture: Fixture, generationId: string): Promise<void> {
    const persistence = createGenerationPersistence(fixture.scope, {
      generationId,
      model: MODEL,
      leaseMs: LEASE_MS,
      now: () => NOW,
      append: (client) => appendRevision(fixture, generationId)(client),
    });

    await runWithActor(fixture.ownerId, async () => {
      await runGenerationAttempt({
        generationId,
        persist: persistence,
        produce: () => succeed(undefined),
        now: () => NOW.getTime(),
        random: NO_JITTER,
      });
    });
  }

  /** The wait the policy owes an attempt of this class, with no jitter. */
  function expectedDelayMs(failureClass: GenerationFailureClass, attempt: number): number {
    const base =
      failureClass === "rate_limited"
        ? DEFAULT_GENERATION_RETRY_POLICY.rateLimitBaseDelayMs
        : DEFAULT_GENERATION_RETRY_POLICY.transientBaseDelayMs;

    return (base * 2 ** (attempt - 1)) / 2;
  }

  describe("a transient failure", () => {
    it("returns the generation to the queue behind an exponential wait", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "transient");

      await runFailing(fixture, generationId, new ProviderError());

      const row = await readRow(generationId);

      expect(row.status).toBe("QUEUED");
      expect(row.failureClass).toBe("TRANSIENT");
      expect(row.nextAttemptAt).toEqual(new Date(NOW.getTime() + expectedDelayMs("transient", 1)));
      // Open again, so it carries no failure a client may be shown — the class is
      // what says why it is waiting. `generations_failure_check` requires this.
      expect(row.errorCode).toBeNull();
      expect(row.completedAt).toBeNull();
    });

    it("doubles the wait on the second failure", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "transient-twice");

      await runFailing(fixture, generationId, new ProviderError());
      await runFailing(fixture, generationId, new TimeoutError());

      const row = await readRow(generationId);

      expect(row.status).toBe("QUEUED");
      expect(row.nextAttemptAt).toEqual(new Date(NOW.getTime() + expectedDelayMs("transient", 2)));
      expect(await seam.generationAttempt.count({ where: { generationId } })).toBe(2);
    });

    // The whole reason the deadline is a column: the sweep is what redelivers a
    // queued row, and it must refuse one whose backoff has not elapsed.
    it("is not redelivered while its wait is running", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "transient-not-yet");

      await runFailing(fixture, generationId, new ProviderError());
      const row = await readRow(generationId);
      if (row.nextAttemptAt === null) throw new Error("the failure scheduled no retry");

      const tooEarly = await listDeliverableGenerations({
        // Stale by any measure — which is exactly the trap, and the threshold is
        // taken from the **real** clock rather than from `NOW`, because
        // `createdAt` is written by PostgreSQL's own. A fixed threshold in the
        // past would exclude the row for the wrong reason and the assertion would
        // hold with the backoff deleted. Before CAL-063 the sweep judged a queued
        // row by `createdAt` alone, so a transient failure on an old generation
        // was retried on the very next tick at full speed.
        staleBefore: new Date(Date.now() + 60 * 60_000),
        now: new Date(row.nextAttemptAt.getTime() - 1),
        limit: 100,
      });

      expect(tooEarly).not.toContain(generationId);
    });

    it("is redelivered as soon as its wait has elapsed", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "transient-now");

      await runFailing(fixture, generationId, new ProviderError());
      const row = await readRow(generationId);
      if (row.nextAttemptAt === null) throw new Error("the failure scheduled no retry");

      const due = await listDeliverableGenerations({
        // Not stale at all, so only the deadline can make it deliverable.
        staleBefore: new Date(NOW.getTime() - 60 * 60_000),
        now: row.nextAttemptAt,
        limit: 100,
      });

      expect(due).toContain(generationId);
    });

    // A generation waiting out a backoff is still in flight, so the indicator is
    // where it belongs — offering a "Relancer" button for work about to run by
    // itself would invite an author to pay for the same call twice.
    it("stays in the running list and out of the failed list", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "transient-listing");

      await runFailing(fixture, generationId, new ProviderError());

      const running = await listRunningGenerations(fixture.scope);
      const failed = await listFailedGenerations(fixture.scope);

      expect(running.map((row) => row.id)).toContain(generationId);
      expect(running[0]?.failureClass).toBe("transient");
      expect(failed).toEqual([]);
    });

    it("clears the retry state when the next attempt opens", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "transient-claimed");

      await runFailing(fixture, generationId, new ProviderError());
      await runSucceeding(fixture, generationId);

      const row = await readRow(generationId);

      expect(row.status).toBe("SUCCEEDED");
      expect(row.failureClass).toBeNull();
      expect(row.nextAttemptAt).toBeNull();
    });
  });

  describe("a rate limit", () => {
    it("waits longer than a transient failure at the same attempt", async () => {
      const limited = await createFixture();
      const outage = await createFixture();
      const limitedId = await reserve(limited, "rate-limited");
      const outageId = await reserve(outage, "outage");

      await runFailing(limited, limitedId, new RateLimitError());
      await runFailing(outage, outageId, new ProviderError());

      const limitedRow = await readRow(limitedId);
      const outageRow = await readRow(outageId);

      expect(limitedRow.failureClass).toBe("RATE_LIMITED");
      expect(outageRow.failureClass).toBe("TRANSIENT");
      expect(limitedRow.nextAttemptAt?.getTime()).toBeGreaterThan(
        outageRow.nextAttemptAt?.getTime() ?? 0,
      );
    });

    // The limiter knows its own window; the policy is guessing at it. So a stated
    // `retryAfterMs` is a floor, and it has to reach the column to mean anything.
    it("honours a limiter's own retryAfterMs as a floor", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "rate-limited-after");
      const retryAfterMs = 5 * 60_000;

      await runFailing(fixture, generationId, new RateLimitError({ retryAfterMs }));

      const row = await readRow(generationId);

      expect(row.nextAttemptAt).toEqual(new Date(NOW.getTime() + retryAfterMs));
    });
  });

  describe("a permanent failure", () => {
    // The one class that must not cost a second call. `MODEL_OUTPUT_INVALID` is
    // the case worth naming: a `provider` failure — a retryable *category* —
    // constructed non-retryable, because a blind replay is not the treatment.
    it.each([
      ["a malformed model answer", new ProviderError({ code: "MODEL_OUTPUT_INVALID", retryable: false })], // prettier-ignore
      ["an off-topic answer", new ProviderError({ code: "MODEL_OUTPUT_OFF_TOPIC", retryable: false })], // prettier-ignore
      ["a bug", new InternalError()],
    ])("fails the generation at once, for %s", async (_label, failure) => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, `permanent-${_label}`);

      await runFailing(fixture, generationId, failure);

      const row = await readRow(generationId);

      expect(row.status).toBe("FAILED");
      expect(row.failureClass).toBe("PERMANENT");
      expect(row.nextAttemptAt).toBeNull();
      expect(row.completedAt).not.toBeNull();
      expect(await seam.generationAttempt.count({ where: { generationId } })).toBe(1);
    });

    it("is never redelivered by the sweep, however stale", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "permanent-not-delivered");

      await runFailing(fixture, generationId, new InternalError());

      const deliverable = await listDeliverableGenerations({
        staleBefore: new Date(NOW.getTime() + 60 * 60_000),
        now: new Date(NOW.getTime() + 60 * 60_000),
        limit: 100,
      });

      expect(deliverable).not.toContain(generationId);
    });

    it("reaches the failed list with its code, its category and its class", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "permanent-listed");

      await runFailing(
        fixture,
        generationId,
        new ProviderError({ code: "MODEL_OUTPUT_OFF_TOPIC", retryable: false }),
      );

      const failed = await listFailedGenerations(fixture.scope);

      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({
        id: generationId,
        mission: "ANALYZE_SOURCE_TEXT",
        errorCode: "MODEL_OUTPUT_OFF_TOPIC",
        errorCategory: "provider",
        failureClass: "permanent",
        attemptCount: 1,
      });
    });
  });

  describe("the attempt ceiling", () => {
    it("closes a generation that has spent every automatic try", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "exhausted");

      for (let index = 0; index < MAX_GENERATION_ATTEMPTS; index += 1) {
        await runFailing(fixture, generationId, new ProviderError());
      }

      expect((await readRow(generationId)).status).toBe("QUEUED");

      await exhaustSpentGenerations(MAX_GENERATION_ATTEMPTS);

      const row = await readRow(generationId);

      expect(row.status).toBe("FAILED");
      expect(row.errorCode).toBe("GENERATION_ATTEMPTS_EXHAUSTED");
      expect(row.failureClass).toBe("PERMANENT");
      // The deadline the last failure wrote is now a wait nobody is waiting for.
      expect(row.nextAttemptAt).toBeNull();
    });

    it("leaves a generation nothing has ever tried where it is", async () => {
      // The rolling-deployment case: the mission is unknown to every worker
      // running right now, nothing has been spent, and closing it would fail an
      // author's work over a deploy that has not finished.
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "never-tried");

      await exhaustSpentGenerations(MAX_GENERATION_ATTEMPTS);

      expect((await readRow(generationId)).status).toBe("QUEUED");
    });
  });

  describe("a manual replay", () => {
    it("reopens a failed generation without a second row", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "replayed");

      await runFailing(fixture, generationId, new InternalError());
      const replayed = await runWithActor(fixture.ownerId, async () =>
        replayGeneration(fixture.scope, generationId),
      );

      if (!replayed.ok) throw new Error("the owner's own failed generation refused a replay");

      expect(replayed.value.id).toBe(generationId);
      expect(replayed.value.created).toBe(false);
      expect(await seam.generation.count({ where: { projectId: fixture.projectId } })).toBe(1);

      const row = await readRow(generationId);

      expect(row.status).toBe("QUEUED");
      expect(row.errorCode).toBeNull();
      expect(row.failureClass).toBeNull();
      expect(row.nextAttemptAt).toBeNull();
      expect(row.completedAt).toBeNull();
    });

    /**
     * The defect a per-row ceiling exists to close, and the reason it is asserted
     * rather than assumed: the attempts are append-only, so a replayed generation
     * still has `MAX_GENERATION_ATTEMPTS` of them — and the sweep closes an
     * over-ceiling row *before* it delivers anything. Without the raised ceiling
     * the replay is undone within a minute, every time, and the button in the
     * interface would look broken while doing exactly what it was told.
     */
    it("survives the very next sweep, and is then deliverable", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "replayed-after-exhaustion");

      for (let index = 0; index < MAX_GENERATION_ATTEMPTS; index += 1) {
        await runFailing(fixture, generationId, new ProviderError());
      }
      await exhaustSpentGenerations(MAX_GENERATION_ATTEMPTS);

      const replayed = await runWithActor(fixture.ownerId, async () =>
        replayGeneration(fixture.scope, generationId),
      );
      if (!replayed.ok) throw new Error("an exhausted generation refused a replay");

      const row = await readRow(generationId);
      expect(row.attemptCeiling).toBe(MAX_GENERATION_ATTEMPTS * 2);

      // The sweep, in the order it really runs: close what is spent, then deliver.
      await exhaustSpentGenerations(MAX_GENERATION_ATTEMPTS);

      expect((await readRow(generationId)).status).toBe("QUEUED");
      expect(
        await listDeliverableGenerations({
          staleBefore: new Date(Date.now() + 60_000),
          now: new Date(),
          limit: 100,
        }),
      ).toContain(generationId);
    });

    it("clears a backoff rather than making the author wait it out", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "replayed-in-backoff");

      await runFailing(fixture, generationId, new RateLimitError({ retryAfterMs: 10 * 60_000 }));
      expect((await readRow(generationId)).nextAttemptAt).not.toBeNull();

      const replayed = await runWithActor(fixture.ownerId, async () =>
        replayGeneration(fixture.scope, generationId),
      );
      if (!replayed.ok) throw new Error("a generation in backoff refused a replay");

      expect((await readRow(generationId)).nextAttemptAt).toBeNull();
    });

    it("refuses a generation that succeeded — that is a new ask, not a retry", async () => {
      const fixture = await createFixture();
      const generationId = await reserve(fixture, "replayed-after-success");

      await runSucceeding(fixture, generationId);

      const replayed = await runWithActor(fixture.ownerId, async () =>
        replayGeneration(fixture.scope, generationId),
      );

      expect(replayed).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      expect((await readRow(generationId)).status).toBe("SUCCEEDED");
    });

    it("is refused for a generation that is not the scope owner's", async () => {
      const mine = await createFixture();
      const theirs = await createFixture();
      const generationId = await reserve(theirs, "not-mine");
      await runFailing(theirs, generationId, new InternalError());

      const forged = { ...mine.scope, projectId: theirs.projectId } as ProjectScope;
      const replayed = await runWithActor(mine.ownerId, async () =>
        replayGeneration(forged, generationId),
      );

      expect(replayed).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect((await readRow(generationId)).status).toBe("FAILED");
    });
  });

  /**
   * CLAUDE.md §7's own words: *a failed generation leaves the project valid and
   * replayable — the last valid revision is preserved.* The mechanism is
   * structural (the result is written only by the single transaction that
   * completes the generation, and a failure never reaches it), but a structural
   * guarantee nobody exercised is a comment.
   */
  describe("the last valid version", () => {
    it("is untouched by a failing attempt, whatever the class", async () => {
      const fixture = await createFixture();

      const first = await reserve(fixture, "valid-1");
      await runSucceeding(fixture, first);
      expect(await revisionCount(fixture)).toBe(1);

      for (const failure of [
        new ProviderError(),
        new RateLimitError(),
        new ProviderError({ code: "MODEL_OUTPUT_INVALID", retryable: false }),
      ]) {
        const generationId = await reserve(fixture, `valid-fail-${failure.code}`);
        await runFailing(fixture, generationId, failure);
      }

      // Three failures, three classes, and the revision the author already had is
      // still the one and only one.
      expect(await revisionCount(fixture)).toBe(1);
      const surviving = await seam.analysisSectionRevision.findFirstOrThrow({
        where: { analysisId: fixture.analysisId },
        select: { revisionNumber: true, generationId: true },
      });
      expect(surviving).toMatchObject({ revisionNumber: 1, generationId: first });
    });

    it("is still there after a replay that fails again", async () => {
      const fixture = await createFixture();

      const first = await reserve(fixture, "replay-valid-1");
      await runSucceeding(fixture, first);

      const failing = await reserve(fixture, "replay-valid-2");
      await runFailing(fixture, failing, new InternalError());
      await runWithActor(fixture.ownerId, async () => replayGeneration(fixture.scope, failing));
      await runFailing(fixture, failing, new InternalError());

      expect(await revisionCount(fixture)).toBe(1);
      expect((await readRow(failing)).status).toBe("FAILED");
    });

    it("is superseded only by an attempt that actually produced", async () => {
      const fixture = await createFixture();

      const failing = await reserve(fixture, "supersede-1");
      await runFailing(fixture, failing, new ProviderError());
      expect(await revisionCount(fixture)).toBe(0);

      // The same generation, retried, now succeeding: one revision appears, and
      // it is the retry's — which is the other half of "replayable".
      await runSucceeding(fixture, failing);

      expect(await revisionCount(fixture)).toBe(1);
      expect((await readRow(failing)).status).toBe("SUCCEEDED");
    });
  });
});
