/**
 * CAL-061's acceptance criterion, against a real PostgreSQL and a real Redis:
 * **a generation's state is always readable in the database, even after the
 * worker restarts.**
 *
 * Nothing here is simulated that could be performed. A worker is a real BullMQ
 * `Worker` over a real Redis; a generation is a real row reserved by
 * `reserveGeneration`; the recovery is the real sweep running the real
 * statements. The only thing written by hand is the *shape of a crash*, and it
 * is written the way a crash really shows up in the database: a claim whose
 * lease stops being renewed and a handler that never comes back.
 *
 * That is why the crash test runs `runGenerationJob` directly rather than
 * through a worker. A killed process leaves no handler, no renewal and no
 * worker — closing a worker in-process leaves all three alive, and a test whose
 * "dead" worker is still renewing its own lease would assert the opposite of
 * what it claims. What the queue does with the job the dead worker was holding
 * is BullMQ's stalled-job recovery, which is BullMQ's to test; what this suite
 * owns is that the database reaches a correct state with or without it, which
 * is the whole thesis: the row is the truth and the job is a hint.
 *
 * Every fixture value is technical (§9). A generation lifecycle needs no prose.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { fail, ProviderError, type Result, succeed } from "@calepin/shared/errors";
import type { AttemptUsage } from "@calepin/shared/generation";
import { createLogger } from "@calepin/shared/logging";
import {
  closeProducers,
  configureQueueConnection,
  createQueueCancellation,
  createQueueConnection,
  defineJob,
  enqueueGeneration,
  GENERATION_JOB,
  GENERATION_RECONCILIATION_SCHEDULER,
  type GenerationExecutors,
  type GenerationProduct,
  getQueue,
  NO_GENERATION_EXECUTORS,
  QUEUE_PREFIX,
  RECONCILE_GENERATIONS_JOB,
  reconcileGenerations,
  resetQueueConnection,
  runGenerationJob,
  scheduleGenerationReconciliation,
  startQueueWorker,
  unscheduleGenerationReconciliation,
} from "@calepin/shared/queue";
import {
  openProjectScope,
  type ProjectScope,
  readProjectCostSummary,
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

/** A lease short enough for a test to outlive, since nothing renews it here. */
const SHORT_LEASE_MS = 300;

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
  readonly generationId: string;
}

async function createFixture(): Promise<Fixture> {
  sequence += 1;
  const user = await prisma.user.create({
    data: { email: `lifecycle-${sequence}@example.test` },
  });
  setActor(user.id);
  const project = await prisma.project.create({
    data: { userId: user.id, title: `lifecycle-${sequence}` },
  });

  const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
  if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

  const reserved = await runWithActor(user.id, async () =>
    reserveGeneration(opened.value, {
      mission: "WRITE_SCENE",
      targetId: `chapter-${sequence}`,
      input: { baseRevisionId: `rev-${sequence}` },
    }),
  );
  if (!reserved.ok) throw new Error("the reservation was refused");

  return {
    ownerId: user.id,
    projectId: project.id,
    scope: opened.value,
    generationId: reserved.value.id,
  };
}

interface TestExecutor {
  readonly executors: GenerationExecutors;
  /** How many times a provider would have been called. */
  calls(): number;
  /** How many times the result was appended inside the completing transaction. */
  appends(): number;
}

/**
 * An executor for `WRITE_SCENE`. `produce` is supplied by the test, so a
 * blocking call, a failure and an ordinary answer are the same seam.
 */
function testExecutor(
  projectId: string,
  produce: () => Promise<Result<void>> | Result<void> = () => succeed(undefined),
): TestExecutor {
  let calls = 0;
  let appends = 0;

  return {
    calls: () => calls,
    appends: () => appends,
    executors: {
      WRITE_SCENE: {
        model: MODEL,
        promptVersion: 1,
        async produce(_request, report): Promise<Result<GenerationProduct>> {
          calls += 1;
          const produced = await produce();

          // Reported on the way to a failure as much as to an answer: a call the
          // provider billed for cost what it cost.
          report(USAGE);

          if (!produced.ok) return produced;

          return succeed({
            // A real write inside the transaction that completes the
            // generation, so "appended exactly once" is a number in a column
            // rather than a counter in this file.
            append: async (client) => {
              appends += 1;
              await client.$executeRaw`
                UPDATE "projects" SET "totalWordCount" = "totalWordCount" + 1
                WHERE "id" = ${projectId}
              `;

              return succeed(undefined);
            },
          });
        },
      },
    },
  };
}

function startGenerationWorker(executors: GenerationExecutors, leaseRenewalMs = 0): Worker {
  const worker = startQueueWorker({
    queue: GENERATION_JOB.queue,
    connection: consumer,
    logger: silent,
    jobs: [
      defineJob(GENERATION_JOB, (payload) =>
        runGenerationJob({
          generationId: payload.generationId,
          executors,
          leaseMs: SHORT_LEASE_MS,
          leaseRenewalMs,
          logger: silent,
        }),
      ),
    ],
  });
  started.push(worker);

  return worker;
}

beforeAll(async () => {
  configureDatabaseClient(seam);

  producer = createQueueConnection({ url: REDIS_URL, role: "producer" });
  consumer = createQueueConnection({ url: REDIS_URL, role: "consumer" });
  configureQueueConnection(producer);

  events = new QueueEvents(GENERATION_JOB.queue, { connection: consumer, prefix: QUEUE_PREFIX });
  await events.waitUntilReady();
});

/**
 * The sweep is cross-project by design — it acts for nobody and looks at every
 * row — so a generation another test left behind is a generation it will pick
 * up. Wiping first is what lets the counts below be exact instead of "at least
 * one", and exact is the difference between proving a decision and observing
 * one. Cascades take the attempts with them.
 */
beforeEach(async () => {
  await seam.generation.deleteMany({});
});

afterEach(async () => {
  await Promise.all(started.splice(0).map((worker) => worker.close(true)));
  // Both queues: the sweep's schedule lives on `maintenance`, and a repeating
  // job left behind would be delivered to the next suite's ping worker, which
  // has no handler for it.
  await getQueue(GENERATION_JOB.queue).obliterate({ force: true });
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

describe("a generation driven by the queue", () => {
  it("runs, commits its result and completes the row, all in one delivery", async () => {
    const fixture = await createFixture();
    const executor = testExecutor(fixture.projectId);
    startGenerationWorker(executor.executors);

    const enqueued = await enqueueGeneration(fixture.generationId);
    expect(enqueued.ok).toBe(true);
    if (!enqueued.ok) return;

    // The job is named by the generation, which is what makes the queue's own
    // deduplication the answer to a second enqueue.
    expect(enqueued.value.id).toBe(fixture.generationId);

    const job = await getQueue(GENERATION_JOB.queue).getJob(fixture.generationId);
    await job?.waitUntilFinished(events, 15_000);

    const generation = await prisma.generation.findUniqueOrThrow({
      where: { id: fixture.generationId },
    });
    expect(generation).toMatchObject({ status: "SUCCEEDED", errorCode: null });
    expect(generation.completedAt).not.toBeNull();

    const attempts = await prisma.generationAttempt.findMany({
      where: { generationId: fixture.generationId },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      attempt: 1,
      status: "SUCCEEDED",
      model: MODEL,
      promptVersion: 1,
      inputTokens: 1_000,
      outputTokens: 200,
      // A lease exists exactly while an attempt runs — generation_attempts_lease_check.
      leaseExpiresAt: null,
    });

    expect(executor.calls()).toBe(1);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: fixture.projectId } });
    expect(project.totalWordCount).toBe(1);
  });

  it("drops a second job for the same ask instead of running it twice", async () => {
    const fixture = await createFixture();

    const first = await enqueueGeneration(fixture.generationId);
    const second = await enqueueGeneration(fixture.generationId);

    expect(first.ok && second.ok).toBe(true);
    // The producer of an ask and the reconciliation sweep both enqueue without
    // asking what the other did; the id is what makes that safe.
    expect(await getQueue(GENERATION_JOB.queue).getWaitingCount()).toBe(1);
  });

  it("asks no provider when the generation has already succeeded", async () => {
    const fixture = await createFixture();
    const executor = testExecutor(fixture.projectId);
    startGenerationWorker(executor.executors);

    await enqueueGeneration(fixture.generationId);
    await until(
      async () =>
        (await prisma.generation.findUniqueOrThrow({ where: { id: fixture.generationId } }))
          .status === "SUCCEEDED",
      "the first delivery to complete",
    );

    // The job was removed on completion, so the id is free — which is what lets
    // a replay be enqueued at all, and what lets a redelivery happen here.
    const again = await enqueueGeneration(fixture.generationId);
    expect(again.ok).toBe(true);
    if (!again.ok) return;

    const job = await getQueue(GENERATION_JOB.queue).getJob(fixture.generationId);
    const result = await job?.waitUntilFinished(events, 15_000);

    expect(result).toMatchObject({ outcome: "skipped" });
    expect(executor.calls()).toBe(1);
    expect(
      await prisma.generationAttempt.count({ where: { generationId: fixture.generationId } }),
    ).toBe(1);
  });

  it("records the failure on the row and leaves the project untouched", async () => {
    const fixture = await createFixture();
    const executor = testExecutor(fixture.projectId, () =>
      fail(new ProviderError({ code: "PROVIDER_REJECTED", message: "the endpoint refused" })),
    );
    startGenerationWorker(executor.executors);

    await enqueueGeneration(fixture.generationId);
    // Waited on the *attempt*, not on the generation: a retryable failure puts
    // the row back to `QUEUED`, which is where it started.
    await until(
      async () =>
        (await prisma.generationAttempt.count({
          where: { generationId: fixture.generationId, status: "FAILED" },
        })) === 1,
      "the delivery to record an outcome",
    );

    const generation = await prisma.generation.findUniqueOrThrow({
      where: { id: fixture.generationId },
    });

    // `provider` is retryable, so the row goes back to the queue rather than
    // closing — the sweep is what redelivers it (§7, CAL-063 tunes the wait).
    expect(generation.status).toBe("QUEUED");
    expect(generation.completedAt).toBeNull();

    const project = await prisma.project.findUniqueOrThrow({ where: { id: fixture.projectId } });
    expect(project.totalWordCount).toBe(0);
    expect(executor.appends()).toBe(0);
  });
});

describe("a worker killed in the middle of a generation", () => {
  it("leaves the state readable, recovers it, and pays for exactly one answer", async () => {
    const fixture = await createFixture();
    const held = deferred();

    // The worker that is about to die. No renewal, a short lease: exactly what a
    // process that stops existing looks like from the database.
    const dying = testExecutor(fixture.projectId, async () => {
      await held.promise;

      return succeed(undefined);
    });

    const abandoned = runGenerationJob({
      generationId: fixture.generationId,
      executors: dying.executors,
      leaseMs: SHORT_LEASE_MS,
      leaseRenewalMs: 0,
      logger: silent,
    });

    await until(
      async () =>
        (await prisma.generationAttempt.count({
          where: { generationId: fixture.generationId, status: "RUNNING" },
        })) === 1,
      "the first attempt to be claimed",
    );

    // The criterion, read literally: mid-generation, the state is in the
    // database and it says what is happening.
    const midFlight = await prisma.generation.findUniqueOrThrow({
      where: { id: fixture.generationId },
    });
    expect(midFlight.status).toBe("RUNNING");
    const claimed = await prisma.generationAttempt.findFirstOrThrow({
      where: { generationId: fixture.generationId, attempt: 1 },
    });
    expect(claimed.leaseExpiresAt).not.toBeNull();

    // ...and the process is gone. Nothing renews the lease from here.
    await until(async () => {
      const attempt = await prisma.generationAttempt.findFirstOrThrow({
        where: { generationId: fixture.generationId, attempt: 1 },
      });

      return (attempt.leaseExpiresAt?.getTime() ?? 0) <= Date.now();
    }, "the lease to run out");

    const survivor = testExecutor(fixture.projectId);
    startGenerationWorker(survivor.executors);

    const swept = await reconcileGenerations({ staleAfterMs: 0, logger: silent });

    expect(swept).toMatchObject({
      reclaimedAttempts: 1,
      requeuedGenerations: 1,
      exhaustedGenerations: 0,
      deliveredGenerations: 1,
      undeliveredGenerations: 0,
    });

    await until(
      async () =>
        (await prisma.generation.findUniqueOrThrow({ where: { id: fixture.generationId } }))
          .status === "SUCCEEDED",
      "the replacement worker to finish it",
    );

    const interrupted = await prisma.generationAttempt.findFirstOrThrow({
      where: { generationId: fixture.generationId, attempt: 1 },
    });
    expect(interrupted).toMatchObject({
      status: "FAILED",
      errorCode: "GENERATION_INTERRUPTED",
      errorCategory: "INTERNAL",
      leaseExpiresAt: null,
    });
    // The four columns that decide money, all null: nobody can say what an
    // unfinished call consumed, so nothing was invented (CAL-058).
    expect(interrupted.inputTokens).toBeNull();
    expect(interrupted.outputTokens).toBeNull();
    expect(interrupted.estimatedCostUsd).toBeNull();
    expect(interrupted.durationMs).toBeNull();

    const replacement = await prisma.generationAttempt.findFirstOrThrow({
      where: { generationId: fixture.generationId, attempt: 2 },
    });
    expect(replacement).toMatchObject({ status: "SUCCEEDED", inputTokens: 1_000 });

    // The zombie comes back. Its lease was taken while it was "calling", so its
    // answer is dropped rather than written beside the replacement's.
    held.release();
    await expect(abandoned).resolves.toMatchObject({ outcome: "skipped", attempt: 1 });

    expect(
      await prisma.generationAttempt.count({ where: { generationId: fixture.generationId } }),
    ).toBe(2);
    expect(survivor.appends()).toBe(1);
    expect(dying.appends()).toBe(0);

    const project = await prisma.project.findUniqueOrThrow({ where: { id: fixture.projectId } });
    expect(project.totalWordCount).toBe(1);

    // One ask, one interruption, one price.
    const cost = await readProjectCostSummary(fixture.scope);
    expect(cost.ok && cost.value.estimatedCostUsd).toBe(USAGE.estimatedCostUsd);
  });
});

describe("the reconciliation sweep", () => {
  it("delivers a generation the queue never received", async () => {
    // Redis refused the enqueue after the row was already committed — the one
    // ordering the design cannot avoid, since the row has to exist first.
    const fixture = await createFixture();
    const executor = testExecutor(fixture.projectId);
    startGenerationWorker(executor.executors);

    expect(await getQueue(GENERATION_JOB.queue).getJobCountByTypes("waiting", "active")).toBe(0);

    const swept = await reconcileGenerations({ staleAfterMs: 0, logger: silent });
    expect(swept.deliveredGenerations).toBe(1);

    await until(
      async () =>
        (await prisma.generation.findUniqueOrThrow({ where: { id: fixture.generationId } }))
          .status === "SUCCEEDED",
      "the swept generation to run",
    );
    expect(executor.calls()).toBe(1);
  });

  it("leaves a generation younger than the staleness threshold alone", async () => {
    const fixture = await createFixture();

    const swept = await reconcileGenerations({ staleAfterMs: 60_000, logger: silent });

    expect(swept.deliveredGenerations).toBe(0);
    expect(
      (await prisma.generation.findUniqueOrThrow({ where: { id: fixture.generationId } })).status,
    ).toBe("QUEUED");
  });

  it("gives up on a generation that has run out of tries, instead of paying for another", async () => {
    const fixture = await createFixture();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await prisma.generationAttempt.create({
        data: {
          generationId: fixture.generationId,
          attempt,
          model: MODEL,
          status: "FAILED",
          errorCode: "PROVIDER_UNAVAILABLE",
          errorCategory: "PROVIDER",
          completedAt: new Date(),
        },
      });
    }

    const swept = await reconcileGenerations({
      staleAfterMs: 0,
      maxAttempts: 3,
      logger: silent,
    });

    expect(swept).toMatchObject({ exhaustedGenerations: 1, deliveredGenerations: 0 });

    const generation = await prisma.generation.findUniqueOrThrow({
      where: { id: fixture.generationId },
    });
    expect(generation).toMatchObject({
      status: "FAILED",
      errorCode: "GENERATION_ATTEMPTS_EXHAUSTED",
      errorCategory: "INTERNAL",
    });
    expect(generation.completedAt).not.toBeNull();
  });

  it("never closes a generation nothing has tried, so a rolling release can catch up", async () => {
    const fixture = await createFixture();

    const swept = await reconcileGenerations({ staleAfterMs: 0, maxAttempts: 1, logger: silent });

    expect(swept.exhaustedGenerations).toBe(0);
    expect(
      (await prisma.generation.findUniqueOrThrow({ where: { id: fixture.generationId } })).status,
    ).toBe("QUEUED");
  });

  it("reports what the queue refused rather than losing it", async () => {
    const fixture = await createFixture();

    const swept = await reconcileGenerations({
      staleAfterMs: 0,
      logger: silent,
      enqueue: () =>
        Promise.resolve(
          fail(
            new ProviderError({
              code: "QUEUE_UNAVAILABLE",
              message: "the queue refused the job",
            }),
          ),
        ),
    });

    expect(swept).toMatchObject({ deliveredGenerations: 0, undeliveredGenerations: 1 });
    // Nothing is lost: the row is still queued and the next sweep offers it again.
    expect(
      (await prisma.generation.findUniqueOrThrow({ where: { id: fixture.generationId } })).status,
    ).toBe("QUEUED");
  });

  it("registers itself as a repeating job, once, however many workers ask", async () => {
    await scheduleGenerationReconciliation({ intervalMs: 60_000 });
    await scheduleGenerationReconciliation({ intervalMs: 60_000 });

    const schedulers = await getQueue(RECONCILE_GENERATIONS_JOB.queue).getJobSchedulers();
    const ours = schedulers.filter((row) => row.key === GENERATION_RECONCILIATION_SCHEDULER);

    expect(ours).toHaveLength(1);
    expect(ours[0]?.name).toBe(RECONCILE_GENERATIONS_JOB.name);
    expect(Number(ours[0]?.every)).toBe(60_000);

    await unscheduleGenerationReconciliation();
    expect(
      (await getQueue(RECONCILE_GENERATIONS_JOB.queue).getJobSchedulers()).filter(
        (row) => row.key === GENERATION_RECONCILIATION_SCHEDULER,
      ),
    ).toHaveLength(0);
  });
});

describe("what a worker refuses to decide", () => {
  it("leaves a mission it cannot run queued, for a worker that can", async () => {
    const fixture = await createFixture();

    await expect(
      runGenerationJob({
        generationId: fixture.generationId,
        executors: NO_GENERATION_EXECUTORS,
        logger: silent,
      }),
    ).rejects.toThrow(/no executor/);

    // A rolling release: the job was written by a version this worker is not.
    // Failing the author's generation for that would be the wrong answer, and
    // nothing has been spent while it waits.
    const generation = await prisma.generation.findUniqueOrThrow({
      where: { id: fixture.generationId },
    });
    expect(generation.status).toBe("QUEUED");
    expect(
      await prisma.generationAttempt.count({ where: { generationId: fixture.generationId } }),
    ).toBe(0);
  });

  it("completes quietly when the row is gone", async () => {
    const fixture = await createFixture();
    await prisma.generation.delete({ where: { id: fixture.generationId } });

    await expect(
      runGenerationJob({
        generationId: fixture.generationId,
        executors: testExecutor(fixture.projectId).executors,
        logger: silent,
      }),
    ).resolves.toEqual({ generationId: fixture.generationId, outcome: "vanished" });
  });
});

describe("cancelling an account's queued work", () => {
  it("removes the jobs of the generations it is given, and counts them", async () => {
    const fixture = await createFixture();
    await enqueueGeneration(fixture.generationId);

    const cancellation = createQueueCancellation({ logger: silent });

    // The port that account deletion composes (CAL-031). Before CAL-061 every
    // process passed the stand-in, which refuses a non-empty list on purpose —
    // so the first task able to enqueue a generation is the one that owes it a
    // real adapter.
    expect(await cancellation.cancelGenerations([])).toBe(0);
    expect(await cancellation.cancelGenerations([fixture.generationId])).toBe(1);
    expect(await getQueue(GENERATION_JOB.queue).getWaitingCount()).toBe(0);

    // Idempotent, and the count is *true*: BullMQ's own script reports success
    // for a job it never found, so a second pass would otherwise claim to have
    // removed something twice.
    expect(await cancellation.cancelGenerations([fixture.generationId])).toBe(0);
  });
});
