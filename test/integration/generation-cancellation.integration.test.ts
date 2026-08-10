/**
 * CAL-064's acceptance criterion, against a real PostgreSQL and a real Redis:
 * **cancelling a chapter write leaves that chapter exactly in its prior state.**
 *
 * The chain under test is the whole one, not a slice of it: a real generation
 * row, a real BullMQ worker running the real `runGenerationJob`, a real
 * executor holding a real `AbortSignal`, and the real lease renewal acting as
 * the watch. What the tests block on is the executor, because that is where a
 * long provider call really sits — everything else is the code that ships.
 *
 * The three properties the task names, and where each is proved:
 *
 * | Property | Proof |
 * |---|---|
 * | propagation to the worker and to the provider call | the executor observes its own signal flipping, without the test touching it |
 * | no partial write | the chapter and its revisions are compared byte for byte against a snapshot taken before |
 * | only tokens really consumed | the attempt row carries exactly what `report` stated, and null when it stated nothing |
 *
 * A note on why the chapter is snapshotted whole rather than spot-checked: the
 * failure this suite exists to catch is an append that half-ran, and a
 * spot-check only finds the half somebody thought of. `version` and `updatedAt`
 * are in the comparison deliberately — an audited write that touched the row and
 * changed nothing visible would still move them.
 *
 * Every fixture value is technical (§9). `content: "fixture"` is a token, not
 * prose, and nothing here reads or writes anything a reader could read as part
 * of a novel.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { ConflictError, fail, type Result, succeed } from "@calepin/shared/errors";
import type { AttemptUsage } from "@calepin/shared/generation";
import { createLogger } from "@calepin/shared/logging";
import {
  closeProducers,
  configureQueueConnection,
  createQueueConnection,
  defineJob,
  enqueueGeneration,
  GENERATION_SLOW_JOB,
  type GenerationExecutors,
  type GenerationProduct,
  getQueue,
  QUEUE_PREFIX,
  RECONCILE_GENERATIONS_JOB,
  reconcileGenerations,
  resetQueueConnection,
  runGenerationJob,
  startQueueWorker,
} from "@calepin/shared/queue";
import {
  cancelGeneration,
  listFailedGenerations,
  listRunningGenerations,
  openProjectScope,
  type ProjectScope,
  replayGeneration,
  reserveGeneration,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { QueueEvents, type Worker } from "bullmq";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const MODEL = "claude-opus-5";
const USAGE: AttemptUsage = {
  model: MODEL,
  inputTokens: 1_000,
  outputTokens: 200,
  estimatedCostUsd: "0.001000",
};

/**
 * Long enough that nothing expires by itself: every stop in this file must be
 * caused by the cancellation, never by a lease running out beside it.
 */
const LEASE_MS = 60_000;
/** Fast enough to keep the suite short; the watch is the renewal (CAL-064). */
const WATCH_MS = 50;

type QueueConnection = ReturnType<typeof createQueueConnection>;

const silent = createLogger({ level: "silent" });

let producer: QueueConnection;
let consumer: QueueConnection;
let events: QueueEvents;

const started: Worker[] = [];

const { prisma, setActor } = createAuditedClient();
const seam = new PrismaClient();

let sequence = 0;

function deferred(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { promise, release };
}

/** Polls a condition rather than sleeping a guessed number of milliseconds. */
async function until(predicate: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (await predicate()) return;

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`timed out waiting for ${label}`);
}

interface Fixture {
  readonly ownerId: string;
  readonly projectId: string;
  readonly scope: ProjectScope;
  readonly chapterId: string;
  readonly generationId: string;
}

/**
 * A project with one chapter carrying one revision, and a `WRITE_SCENE`
 * generation targeting that chapter — the smallest graph in which "the chapter
 * is exactly as it was" is a statement with something to be true of.
 */
async function createFixture(): Promise<Fixture> {
  sequence += 1;
  const user = await prisma.user.create({
    data: { email: `cancellation-${sequence}@example.test` },
  });
  setActor(user.id);

  const project = await prisma.project.create({
    data: { userId: user.id, title: `cancellation-${sequence}` },
  });
  const bible = await prisma.bible.create({ data: { projectId: project.id } });
  const outline = await prisma.outline.create({
    data: { projectId: project.id, bibleId: bible.id },
  });
  const part = await prisma.part.create({
    data: { outlineId: outline.id, orderKey: "i", title: `part-${sequence}` },
  });
  const chapter = await prisma.chapter.create({
    data: {
      outlineId: outline.id,
      bibleId: bible.id,
      partId: part.id,
      orderKey: "i",
      status: "TO_WRITE",
    },
  });
  await prisma.chapterRevision.create({
    data: {
      chapterId: chapter.id,
      revisionNumber: 1,
      origin: "EDITED",
      content: "fixture",
      wordCount: 1,
      createdById: user.id,
    },
  });

  const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
  if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

  const reserved = await runWithActor(user.id, async () =>
    reserveGeneration(opened.value, {
      mission: "WRITE_SCENE",
      targetId: chapter.id,
      input: { baseRevisionId: `rev-${sequence}` },
    }),
  );
  if (!reserved.ok) throw new Error("the reservation was refused");

  return {
    ownerId: user.id,
    projectId: project.id,
    scope: opened.value,
    chapterId: chapter.id,
    generationId: reserved.value.id,
  };
}

/**
 * Everything about a chapter that a write could possibly move, in one value.
 * `version` and `updatedAt` are in it on purpose: the CAL-022 audit extension
 * moves both on any write, so an append that ran and then rolled back a column
 * back to its old value would still be visible here.
 */
async function snapshotChapter(chapterId: string): Promise<unknown> {
  const chapter = await seam.chapter.findUniqueOrThrow({ where: { id: chapterId } });
  const revisions = await seam.chapterRevision.findMany({
    where: { chapterId },
    orderBy: { revisionNumber: "asc" },
  });

  return { chapter, revisions };
}

async function readGeneration(generationId: string) {
  return seam.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: {
      status: true,
      completedAt: true,
      errorCode: true,
      errorCategory: true,
      failureClass: true,
      nextAttemptAt: true,
      progressStep: true,
      progressPercent: true,
    },
  });
}

interface TestExecutor {
  readonly executors: GenerationExecutors;
  /** How many times a provider would have been called. */
  calls(): number;
  /** How many times the result reached the completing transaction. */
  appends(): number;
  /** Whether the signal the executor was handed had fired by the time it returned. */
  aborted(): boolean;
}

interface ExecutorBehaviour {
  /**
   * Come back when the signal fires, the way an aborted provider call does.
   * The default is to answer straight away, so an ordinary run needs no gate.
   */
  readonly returnsOnAbort?: boolean;
  /** Come back when the test says so, whatever the signal is doing. */
  readonly gate?: Promise<void>;
  /** What the call answers once it comes back. */
  readonly answer?: () => Result<void>;
  /** Whether the call reports usage before answering. */
  readonly reportsUsage?: boolean;
}

/**
 * A `WRITE_SCENE` executor whose `append` writes a real chapter revision — the
 * write a cancellation must prevent. It forwards nothing to a provider (there
 * is none), but it holds the signal exactly as a real one would and reports
 * what it "spent" the same way.
 */
function testExecutor(fixture: Fixture, behaviour: ExecutorBehaviour = {}): TestExecutor {
  const {
    returnsOnAbort = false,
    gate,
    answer = (): Result<void> => succeed(undefined),
    reportsUsage = true,
  } = behaviour;

  let calls = 0;
  let appends = 0;
  let aborted = false;
  const seen = deferred();

  return {
    calls: () => calls,
    appends: () => appends,
    aborted: () => aborted,
    executors: {
      WRITE_SCENE: {
        model: MODEL,
        promptVersion: 1,
        async produce(request, report): Promise<Result<GenerationProduct>> {
          calls += 1;

          // Recorded the moment it fires rather than on the way out, so a test
          // can wait for the propagation itself instead of for its consequence.
          const note = (): void => {
            aborted = true;
            seen.release();
          };

          if (request.signal.aborted) note();
          else request.signal.addEventListener("abort", note, { once: true });

          await (returnsOnAbort ? seen.promise : (gate ?? Promise.resolve()));

          // Reported on the way to a failure as much as to an answer: a call the
          // provider billed for cost what it cost.
          if (reportsUsage) report(USAGE);

          const produced = answer();
          if (!produced.ok) return produced;

          return succeed({
            append: async (client): Promise<Result<void>> => {
              appends += 1;
              await client.chapterRevision.create({
                data: {
                  chapterId: fixture.chapterId,
                  revisionNumber: 2,
                  origin: "GENERATED",
                  content: "fixture",
                  wordCount: 1,
                  createdById: fixture.ownerId,
                },
              });
              await client.$executeRaw`
                UPDATE "chapters" SET "status" = 'FIRST_DRAFT' WHERE "id" = ${fixture.chapterId}
              `;

              return succeed(undefined);
            },
          });
        },
      },
    },
  };
}

function startGenerationWorker(executors: GenerationExecutors): Worker {
  const worker = startQueueWorker({
    queue: GENERATION_SLOW_JOB.queue,
    connection: consumer,
    logger: silent,
    jobs: [
      defineJob(GENERATION_SLOW_JOB, (payload) =>
        runGenerationJob({
          generationId: payload.generationId,
          executors,
          leaseMs: LEASE_MS,
          leaseRenewalMs: WATCH_MS,
          logger: silent,
        }),
      ),
    ],
  });
  started.push(worker);

  return worker;
}

/** Runs the generation to completion through a real worker and a real job. */
async function deliverAndWait(generationId: string): Promise<void> {
  const enqueued = await enqueueGeneration(generationId, "WRITE_SCENE");
  expect(enqueued.ok).toBe(true);

  const job = await getQueue(GENERATION_SLOW_JOB.queue).getJob(generationId);
  await job?.waitUntilFinished(events, 15_000);
}

beforeAll(async () => {
  configureDatabaseClient(seam);

  producer = createQueueConnection({ url: REDIS_URL, role: "producer" });
  consumer = createQueueConnection({ url: REDIS_URL, role: "consumer" });
  configureQueueConnection(producer);

  events = new QueueEvents(GENERATION_SLOW_JOB.queue, {
    connection: consumer,
    prefix: QUEUE_PREFIX,
  });
  await events.waitUntilReady();
});

/** The sweep is cross-project, so a row left behind is a row it would pick up. */
beforeEach(async () => {
  await seam.generation.deleteMany({});
});

afterEach(async () => {
  await Promise.all(started.splice(0).map((worker) => worker.close(true)));
  await getQueue(GENERATION_SLOW_JOB.queue).obliterate({ force: true });
  await getQueue(RECONCILE_GENERATIONS_JOB.queue).obliterate({ force: true });
});

afterAll(async () => {
  await events?.close();
  await closeProducers();
  resetQueueConnection();
  resetDatabaseClient();
  await Promise.all([producer?.quit(), consumer?.quit()]);
  await Promise.all([prisma.$disconnect(), seam.$disconnect()]);
});

describe("cancelling a chapter write that is already running", () => {
  /** The task's own acceptance criterion, stated as one assertion. */
  it("leaves the chapter exactly in its prior state", async () => {
    const fixture = await createFixture();
    const before = await snapshotChapter(fixture.chapterId);

    const executor = testExecutor(fixture, {
      // A real provider call comes back when its signal fires, answering
      // `GENERATION_CANCELLED` — this executor does exactly that and no more.
      returnsOnAbort: true,
      answer: () => fail(new ConflictError({ code: "GENERATION_CANCELLED" })),
    });
    startGenerationWorker(executor.executors);

    const enqueued = await enqueueGeneration(fixture.generationId, "WRITE_SCENE");
    expect(enqueued.ok).toBe(true);

    // Wait for the write to really be under way — cancelling a row that has not
    // been claimed yet would prove the `QUEUED` case, which is a later test.
    await until(
      async () => (await readGeneration(fixture.generationId)).status === "RUNNING",
      "the generation to be claimed",
    );

    const cancelled = await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );
    expect(cancelled.ok && cancelled.value).toBe("cancelled");

    // Nothing here releases the executor: the only thing that can end this run
    // is the watch noticing the row and aborting the signal.
    const job = await getQueue(GENERATION_SLOW_JOB.queue).getJob(fixture.generationId);
    await job?.waitUntilFinished(events, 15_000);

    expect(await snapshotChapter(fixture.chapterId)).toEqual(before);
    expect(executor.appends()).toBe(0);
  });

  it("aborts the signal the executor was handed, without the test touching it", async () => {
    const fixture = await createFixture();

    const executor = testExecutor(fixture, {
      returnsOnAbort: true,
      answer: () => fail(new ConflictError({ code: "GENERATION_CANCELLED" })),
    });
    startGenerationWorker(executor.executors);

    await enqueueGeneration(fixture.generationId, "WRITE_SCENE");
    await until(
      async () => (await readGeneration(fixture.generationId)).status === "RUNNING",
      "the generation to be claimed",
    );

    await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );

    // This is the propagation the task asks for, end to end: a row written by a
    // server action reaches an `AbortSignal` an executor forwards to
    // `ModelRequest.signal`, with no message and nothing in memory between them.
    await until(async () => executor.aborted(), "the abort to reach the executor");

    const job = await getQueue(GENERATION_SLOW_JOB.queue).getJob(fixture.generationId);
    await job?.waitUntilFinished(events, 15_000);
    expect(executor.calls()).toBe(1);
  });

  /**
   * The dangerous race, and the reason cancelling does not close the attempt
   * itself: the call comes back with a perfectly good answer *after* the author
   * has stopped it. Writing that answer would be the partial write §7 forbids,
   * and it is a plausible outcome of any design where the cancel and the
   * completion do not meet under the same lock.
   */
  it("writes nothing even when the call succeeds after the cancellation", async () => {
    const fixture = await createFixture();
    const before = await snapshotChapter(fixture.chapterId);

    const gate = deferred();
    const executor = testExecutor(fixture, { gate: gate.promise });
    startGenerationWorker(executor.executors);

    await enqueueGeneration(fixture.generationId, "WRITE_SCENE");
    await until(
      async () => (await readGeneration(fixture.generationId)).status === "RUNNING",
      "the generation to be claimed",
    );

    await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );
    gate.release();

    const job = await getQueue(GENERATION_SLOW_JOB.queue).getJob(fixture.generationId);
    await job?.waitUntilFinished(events, 15_000);

    expect(await snapshotChapter(fixture.chapterId)).toEqual(before);
    expect(executor.appends()).toBe(0);
    expect(await readGeneration(fixture.generationId)).toMatchObject({ status: "CANCELLED" });
  });

  it("closes the row and releases every lock it held", async () => {
    const fixture = await createFixture();

    const executor = testExecutor(fixture, {
      returnsOnAbort: true,
      answer: () => fail(new ConflictError({ code: "GENERATION_CANCELLED" })),
    });
    startGenerationWorker(executor.executors);

    await enqueueGeneration(fixture.generationId, "WRITE_SCENE");
    await until(
      async () => (await readGeneration(fixture.generationId)).status === "RUNNING",
      "the generation to be claimed",
    );

    await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );

    const job = await getQueue(GENERATION_SLOW_JOB.queue).getJob(fixture.generationId);
    await job?.waitUntilFinished(events, 15_000);

    const row = await readGeneration(fixture.generationId);
    expect(row.status).toBe("CANCELLED");
    expect(row.completedAt).not.toBeNull();
    // generations_retry_check: a terminal row is not waiting for anything.
    expect(row.nextAttemptAt).toBeNull();
    // A cancellation is not a failure, so nothing offers *Relancer* for it.
    expect(row.failureClass).toBeNull();
    expect(row.errorCode).toBeNull();
    expect(row.progressStep).toBeNull();

    const attempts = await seam.generationAttempt.findMany({
      where: { generationId: fixture.generationId },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      attempt: 1,
      status: "FAILED",
      errorCode: "GENERATION_CANCELLED",
      errorCategory: "CONFLICT",
      // generation_attempts_lease_check — the lease is the lock, and it is gone.
      leaseExpiresAt: null,
    });
    expect(attempts[0]?.completedAt).not.toBeNull();

    // Neither list shows it: it is not running, and it is not a failure to fix.
    expect(await listRunningGenerations(fixture.scope)).toEqual([]);
    expect(await listFailedGenerations(fixture.scope)).toEqual([]);
  });

  it("counts the tokens the interrupted call really reported, and no others", async () => {
    const fixture = await createFixture();

    const executor = testExecutor(fixture, {
      returnsOnAbort: true,
      answer: () => fail(new ConflictError({ code: "GENERATION_CANCELLED" })),
    });
    startGenerationWorker(executor.executors);

    await enqueueGeneration(fixture.generationId, "WRITE_SCENE");
    await until(
      async () => (await readGeneration(fixture.generationId)).status === "RUNNING",
      "the generation to be claimed",
    );

    await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );

    const job = await getQueue(GENERATION_SLOW_JOB.queue).getJob(fixture.generationId);
    await job?.waitUntilFinished(events, 15_000);

    const attempt = await seam.generationAttempt.findFirstOrThrow({
      where: { generationId: fixture.generationId },
    });
    // What the provider actually billed, on the one row where a token count is
    // ever true. Not zero: the call happened and cost something.
    expect(attempt).toMatchObject({ model: MODEL, inputTokens: 1_000, outputTokens: 200 });
    expect(Number(attempt.estimatedCostUsd)).toBeCloseTo(0.001, 6);
  });

  it("invents nothing when the call reported no usage at all", async () => {
    const fixture = await createFixture();

    const executor = testExecutor(fixture, {
      returnsOnAbort: true,
      reportsUsage: false,
      answer: () => fail(new ConflictError({ code: "GENERATION_CANCELLED" })),
    });
    startGenerationWorker(executor.executors);

    await enqueueGeneration(fixture.generationId, "WRITE_SCENE");
    await until(
      async () => (await readGeneration(fixture.generationId)).status === "RUNNING",
      "the generation to be claimed",
    );

    await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );

    const job = await getQueue(GENERATION_SLOW_JOB.queue).getJob(fixture.generationId);
    await job?.waitUntilFinished(events, 15_000);

    const attempt = await seam.generationAttempt.findFirstOrThrow({
      where: { generationId: fixture.generationId },
    });
    // Nobody can say what an unfinished call consumed, so nothing is written
    // where a number would be invented — the `GENERATION_INTERRUPTED` doctrine,
    // applied to a stop the author asked for.
    expect(attempt.inputTokens).toBeNull();
    expect(attempt.outputTokens).toBeNull();
    expect(attempt.estimatedCostUsd).toBeNull();
  });
});

describe("cancelling a generation that has not started", () => {
  it("closes the row without opening an attempt", async () => {
    const fixture = await createFixture();

    const cancelled = await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );
    expect(cancelled.ok && cancelled.value).toBe("cancelled");

    const row = await readGeneration(fixture.generationId);
    expect(row.status).toBe("CANCELLED");
    expect(row.completedAt).not.toBeNull();
    expect(
      await seam.generationAttempt.count({ where: { generationId: fixture.generationId } }),
    ).toBe(0);
  });

  /**
   * The reason no queue call is needed. A job already in Redis when the author
   * cancels is not corrected — it is delivered, refused under the row's own
   * lock, and reported as skipped. That is why cancelling is one statement in
   * one place rather than a write plus a best-effort Redis removal that could
   * fail on its own.
   */
  it("makes a job already in the queue answer skipped, calling no provider", async () => {
    const fixture = await createFixture();
    const executor = testExecutor(fixture);

    await enqueueGeneration(fixture.generationId, "WRITE_SCENE");
    await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );

    // Only now does a worker appear, so the delivery is guaranteed to happen
    // after the cancellation rather than racing it.
    startGenerationWorker(executor.executors);

    const job = await getQueue(GENERATION_SLOW_JOB.queue).getJob(fixture.generationId);
    const result: unknown = await job?.waitUntilFinished(events, 15_000);

    expect(result).toMatchObject({ generationId: fixture.generationId, outcome: "skipped" });
    expect(executor.calls()).toBe(0);
    expect(await readGeneration(fixture.generationId)).toMatchObject({ status: "CANCELLED" });
  });

  it("is left alone by the reconciliation sweep", async () => {
    const fixture = await createFixture();

    await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );
    const before = await readGeneration(fixture.generationId);

    const swept = await reconcileGenerations({
      staleAfterMs: 0,
      logger: silent,
      enqueue: () => Promise.resolve(succeed(undefined)),
    });

    // A cancelled row is terminal: nothing reclaims it, requeues it, exhausts it
    // or offers it to a worker again.
    expect(swept.deliveredGenerations).toBe(0);
    expect(swept.requeuedGenerations).toBe(0);
    expect(swept.exhaustedGenerations).toBe(0);
    expect(await readGeneration(fixture.generationId)).toEqual(before);
  });
});

describe("what cancelling refuses to decide", () => {
  it("is a conflict once the generation has already finished", async () => {
    const fixture = await createFixture();
    const executor = testExecutor(fixture);
    startGenerationWorker(executor.executors);

    await deliverAndWait(fixture.generationId);
    expect(await readGeneration(fixture.generationId)).toMatchObject({ status: "SUCCEEDED" });

    const cancelled = await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );

    // Not `NOT_FOUND`: the row is theirs and they can see it. The remedy is a
    // reload, which is what the `cancellation` reason code says in French.
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) expect(cancelled.error.code).toBe("CONFLICT");
    expect(await readGeneration(fixture.generationId)).toMatchObject({ status: "SUCCEEDED" });
  });

  it("is idempotent, because a second click is the same decision", async () => {
    const fixture = await createFixture();

    const first = await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );
    const second = await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );

    expect(first.ok && first.value).toBe("cancelled");
    expect(second.ok && second.value).toBe("already-cancelled");
  });

  it("cannot be undone by a replay", async () => {
    const fixture = await createFixture();

    await runWithActor(fixture.ownerId, async () =>
      cancelGeneration(fixture.scope, fixture.generationId),
    );
    const replayed = await runWithActor(fixture.ownerId, async () =>
      replayGeneration(fixture.scope, fixture.generationId),
    );

    // Asking again is `reserveGeneration` with the same input, which mints the
    // same idempotency key and is therefore a decision the author takes in the
    // open. Reopening a cancelled row behind their back is not.
    expect(replayed.ok).toBe(false);
    if (!replayed.ok) expect(replayed.error.code).toBe("CONFLICT");
    expect(await readGeneration(fixture.generationId)).toMatchObject({ status: "CANCELLED" });
  });

  it("refuses a generation belonging to another project", async () => {
    const mine = await createFixture();
    const theirs = await createFixture();

    const crossed = await runWithActor(mine.ownerId, async () =>
      cancelGeneration(mine.scope, theirs.generationId),
    );

    // Not yours and not there are the same answer (§3.5): a second code would
    // confirm the generation exists.
    expect(crossed.ok).toBe(false);
    if (!crossed.ok) expect(crossed.error.code).toBe("NOT_FOUND");
    expect(await readGeneration(theirs.generationId)).toMatchObject({ status: "QUEUED" });
  });
});
