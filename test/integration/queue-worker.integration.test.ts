/**
 * The BullMQ foundation, against a real Redis (CAL-060, CLAUDE.md §8).
 *
 * CAL-060 is finished when two things hold, and neither can be proved by a unit
 * test: *une tâche factice est produite, consommée et tracée*, and *l'arrêt du
 * travailleur ne perd aucune tâche*. The first needs a real round trip through
 * Redis; the second needs a real worker holding a real job lock.
 *
 * "No task lost" has two halves, and both are asserted below, because they fail
 * for different reasons:
 *
 * - a job **already running** must be finished before the process goes, and
 * - a job **not yet started** must still be in the queue afterwards, for the
 *   next worker to take.
 *
 * The shutdown is driven by calling the routine the signal handler calls,
 * rather than by signalling a child process. That is not a shortcut: Windows —
 * the machine this repository is developed on — cannot deliver a catchable
 * SIGTERM to a child, so a test that sent one would assert something different
 * on CI than it does locally. The wiring from a signal to this routine is
 * covered in `packages/shared/src/queue/shutdown.test.ts`.
 */

import { randomUUID } from "node:crypto";

import { createLogger } from "@calepin/shared/logging";
import {
  closeProducers,
  configureQueueConnection,
  createGracefulShutdown,
  createQueueConnection,
  enqueueJob,
  getQueue,
  handlePing,
  PING_JOB,
  type PingPayload,
  type PingResult,
  QUEUE_PREFIX,
  resetQueueConnection,
  startQueueWorker,
} from "@calepin/shared/queue";
import { createLogCapture } from "@calepin/shared/testing";
import { QueueEvents, type Worker } from "bullmq";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * Read off the factory rather than imported from `ioredis`: the suite speaks to
 * the queue only through `@calepin/shared/queue`, which is the surface a shell
 * has, and the root workspace has no reason to depend on a Redis client.
 */
type QueueConnection = ReturnType<typeof createQueueConnection>;

let producer: QueueConnection;
let consumer: QueueConnection;
let events: QueueEvents;

/** Everything a test started, torn down even when it fails half way. */
const started: Worker<PingPayload, PingResult>[] = [];

function ping(): PingPayload {
  return { token: randomUUID(), issuedAt: Date.now() };
}

function deferred(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { promise, release };
}

/** Polls a condition rather than sleeping a guessed number of milliseconds. */
async function until(predicate: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`timed out waiting for ${label}`);
}

beforeAll(async () => {
  producer = createQueueConnection({ url: REDIS_URL, role: "producer" });
  consumer = createQueueConnection({ url: REDIS_URL, role: "consumer" });
  configureQueueConnection(producer);

  // `QueueEvents` blocks on the event stream exactly as a `Worker` blocks on
  // the queue, so it takes the consumer connection: BullMQ refuses to build one
  // over a client with a finite `maxRetriesPerRequest`.
  events = new QueueEvents(PING_JOB.queue, { connection: consumer, prefix: QUEUE_PREFIX });
  await events.waitUntilReady();
});

afterEach(async () => {
  await Promise.all(started.splice(0).map((worker) => worker.close(true)));
  await getQueue(PING_JOB.queue).obliterate({ force: true });
});

afterAll(async () => {
  await events?.close();
  await closeProducers();
  resetQueueConnection();
  await Promise.all([producer?.quit(), consumer?.quit()]);
});

describe("the dummy job, end to end", () => {
  it("is produced, consumed and traced", async () => {
    const capture = createLogCapture();
    const logger = createLogger({ level: "debug", destination: capture.stream });
    const payload = ping();

    const worker = startQueueWorker({
      contract: PING_JOB,
      connection: consumer,
      logger,
      handle: (received) => handlePing(received),
    });
    started.push(worker);

    const enqueued = await enqueueJob(PING_JOB, payload);
    expect(enqueued.ok).toBe(true);
    if (!enqueued.ok) return;

    const job = await getQueue(PING_JOB.queue).getJob(enqueued.value.id);
    expect(job).toBeDefined();

    const result = (await job?.waitUntilFinished(events, 15_000)) as PingResult;

    // Consumed, and provably *this* job: the token came back.
    expect(result.token).toBe(payload.token);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    // Traced — the third word of the acceptance criterion.
    const lines = capture.lines();
    const completed = lines.find((line) => line.msg === "worker.job-completed");

    expect(lines.map((line) => line.msg)).toEqual(["worker.job-started", "worker.job-completed"]);
    expect(completed).toMatchObject({
      jobId: enqueued.value.id,
      queueName: "maintenance",
      jobName: "ping",
      attempt: 1,
    });
    expect(completed?.durationMs).toBeTypeOf("number");
    expect(completed?.correlationId).toBeTypeOf("string");

    // §9: the payload never reaches the log, only identifiers about it.
    expect(capture.raw()).not.toContain(payload.token);
  });

  it("refuses a payload that does not match the contract, without retrying it", async () => {
    const capture = createLogCapture();
    const logger = createLogger({ level: "debug", destination: capture.stream });

    const worker = startQueueWorker({
      contract: PING_JOB,
      connection: consumer,
      logger,
      handle: (received) => handlePing(received),
    });
    started.push(worker);

    // A distinctive value, so "it never reached the log" is a real assertion:
    // a short one like `42` matches the digits of an ISO timestamp and would
    // pass or fail depending on the clock.
    const marker = "SENTINEL_MUST_NOT_BE_LOGGED";

    // A job written by a previous release: enqueued around the contract, the
    // way an old producer would have written it.
    const job = await getQueue(PING_JOB.queue).add(PING_JOB.name, {
      token: "still-a-string",
      issuedAt: marker,
    } as unknown as PingPayload);

    await expect(job.waitUntilFinished(events, 15_000)).rejects.toThrow();

    const queue = getQueue(PING_JOB.queue);
    expect(await queue.getFailedCount()).toBe(1);
    // `attempts: 1` — the transport does not decide to retry (CAL-064 does).
    expect((await queue.getJob(job.id ?? ""))?.attemptsMade).toBe(1);

    const rejected = capture.lines().find((line) => line.msg === "worker.job-rejected");
    expect(rejected).toMatchObject({ errorCode: "VALIDATION_FAILED", fieldPath: "issuedAt" });
    // The path of the bad field, never its value (§6).
    expect(capture.raw()).not.toContain(marker);
  });
});

describe("shutting the worker down", () => {
  it("finishes the job already in flight instead of dropping it", async () => {
    const held = deferred();
    let finished = false;

    const worker = startQueueWorker({
      contract: PING_JOB,
      connection: consumer,
      logger: createLogger({ level: "silent" }),
      handle: async (received) => {
        await held.promise;
        finished = true;

        return handlePing(received);
      },
    });
    started.push(worker);

    const enqueued = await enqueueJob(PING_JOB, ping());
    expect(enqueued.ok).toBe(true);
    if (!enqueued.ok) return;

    const queue = getQueue(PING_JOB.queue);
    await until(async () => (await queue.getActiveCount()) === 1, "the job to go active");

    const shutdown = createGracefulShutdown({
      stop: () => worker.close(),
      forceStop: () => worker.close(true),
      logger: createLogger({ level: "silent" }),
      graceMs: 20_000,
    });

    const stopping = shutdown.requestShutdown("SIGTERM");

    // The guarantee, stated as an assertion: the shutdown has not concluded
    // while the handler is still running.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(finished).toBe(false);

    held.release();

    await expect(stopping).resolves.toBe("graceful");
    expect(finished).toBe(true);

    // Completed, not abandoned: nothing is active, nothing went back to the
    // queue, and the result is there to read.
    expect(await queue.getActiveCount()).toBe(0);
    expect(await queue.getWaitingCount()).toBe(0);
    expect(await queue.getFailedCount()).toBe(0);
    expect(await queue.getCompletedCount()).toBe(1);
  });

  it("leaves a job it never started in the queue, for the next worker", async () => {
    const held = deferred();

    const first = startQueueWorker({
      contract: PING_JOB,
      connection: consumer,
      concurrency: 1,
      logger: createLogger({ level: "silent" }),
      handle: async (received) => {
        await held.promise;

        return handlePing(received);
      },
    });
    started.push(first);

    const running = await enqueueJob(PING_JOB, ping());
    const queued = await enqueueJob(PING_JOB, ping());
    expect(running.ok && queued.ok).toBe(true);
    if (!queued.ok) return;

    const queue = getQueue(PING_JOB.queue);
    await until(async () => (await queue.getActiveCount()) === 1, "the first job to go active");

    const shutdown = createGracefulShutdown({
      stop: () => first.close(),
      logger: createLogger({ level: "silent" }),
      graceMs: 20_000,
    });

    const stopping = shutdown.requestShutdown("SIGTERM");
    held.release();
    await expect(stopping).resolves.toBe("graceful");

    // The second job was never touched, so it is exactly where it was left.
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await queue.getFailedCount()).toBe(0);

    // And a replacement worker — a new deployment — picks it up.
    const second = startQueueWorker({
      contract: PING_JOB,
      connection: consumer,
      logger: createLogger({ level: "silent" }),
      handle: (received) => handlePing(received),
    });
    started.push(second);

    const job = await queue.getJob(queued.value.id);
    const result = (await job?.waitUntilFinished(events, 15_000)) as PingResult;

    expect(result.token).toBeTypeOf("string");
    expect(await queue.getCompletedCount()).toBe(2);
  });
});
