/**
 * The queue cleanup sweep, against a real Redis (CAL-069).
 *
 * `queue.clean()` is BullMQ's own state, not a database row a fake could
 * stand in for — the only way to prove "a finished job older than its
 * threshold is gone, and a fresher one is not" is to finish a real job and
 * read the queue back. Every fixture value is technical (§9): no payload here
 * carries anything but the dummy job's own token.
 */

import { randomUUID } from "node:crypto";

import {
  CLEAN_QUEUES_JOB,
  cleanQueues,
  closeProducers,
  configureQueueConnection,
  createQueueConnection,
  defineJob,
  enqueueJob,
  getQueue,
  handlePing,
  PING_JOB,
  type PingPayload,
  QUEUE_CLEANUP_SCHEDULER,
  QUEUE_PREFIX,
  resetQueueConnection,
  scheduleQueueCleanup,
  startQueueWorker,
  unscheduleQueueCleanup,
} from "@calepin/shared/queue";
import { QueueEvents, type Worker } from "bullmq";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

type QueueConnection = ReturnType<typeof createQueueConnection>;

let producer: QueueConnection;
let consumer: QueueConnection;
let events: QueueEvents;

/** Everything a test started, torn down even when it fails half way. */
const started: Worker[] = [];

function ping(): PingPayload {
  return { token: randomUUID(), issuedAt: Date.now() };
}

beforeAll(async () => {
  producer = createQueueConnection({ url: REDIS_URL, role: "producer" });
  consumer = createQueueConnection({ url: REDIS_URL, role: "consumer" });
  configureQueueConnection(producer);

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

async function completeOnePingJob(): Promise<void> {
  const worker = startQueueWorker({
    queue: PING_JOB.queue,
    connection: consumer,
    jobs: [defineJob(PING_JOB, (payload) => handlePing(payload))],
  });
  started.push(worker);

  const enqueued = await enqueueJob(PING_JOB, ping());
  expect(enqueued.ok).toBe(true);
  if (!enqueued.ok) return;

  const job = await getQueue(PING_JOB.queue).getJob(enqueued.value.id);
  await job?.waitUntilFinished(events, 15_000);

  await worker.close();
  started.splice(started.indexOf(worker), 1);
}

async function failOnePingJob(): Promise<void> {
  const worker = startQueueWorker({
    queue: PING_JOB.queue,
    connection: consumer,
    jobs: [
      defineJob(PING_JOB, () => {
        throw new Error("deliberate failure");
      }),
    ],
  });
  started.push(worker);

  const enqueued = await enqueueJob(PING_JOB, ping());
  expect(enqueued.ok).toBe(true);
  if (!enqueued.ok) return;

  const job = await getQueue(PING_JOB.queue).getJob(enqueued.value.id);
  await expect(job?.waitUntilFinished(events, 15_000)).rejects.toThrow();

  await worker.close();
  started.splice(started.indexOf(worker), 1);
}

describe("the cleanup sweep", () => {
  it("purges a finished job once it is older than its threshold", async () => {
    await completeOnePingJob();

    const queue = getQueue(PING_JOB.queue);
    expect(await queue.getCompletedCount()).toBe(1);

    // A threshold of 0ms: the job finished in the past relative to "now minus
    // zero", so it is eligible the moment the sweep looks at it.
    const result = await cleanQueues({
      completedJobTtlMs: 0,
      failedJobTtlMs: 0,
      queueNames: [PING_JOB.queue],
    });

    expect(result.removedCompleted).toBe(1);
    expect(result.removedFailed).toBe(0);
    expect(result.queuesSwept).toBe(1);
    expect(result.batchFull).toBe(false);
    expect(await queue.getCompletedCount()).toBe(0);
  });

  it("purges a failed job once it is older than its threshold", async () => {
    await failOnePingJob();

    const queue = getQueue(PING_JOB.queue);
    expect(await queue.getFailedCount()).toBe(1);

    const result = await cleanQueues({
      completedJobTtlMs: 0,
      failedJobTtlMs: 0,
      queueNames: [PING_JOB.queue],
    });

    expect(result.removedCompleted).toBe(0);
    expect(result.removedFailed).toBe(1);
    expect(await queue.getFailedCount()).toBe(0);
  });

  it("leaves a job younger than its threshold alone", async () => {
    await completeOnePingJob();

    const queue = getQueue(PING_JOB.queue);

    // An hour: the job just finished, so it is nowhere near this old.
    const result = await cleanQueues({
      completedJobTtlMs: 3_600_000,
      failedJobTtlMs: 3_600_000,
      queueNames: [PING_JOB.queue],
    });

    expect(result.removedCompleted).toBe(0);
    expect(await queue.getCompletedCount()).toBe(1);
  });

  it("reports a full batch instead of a silent partial pass", async () => {
    await completeOnePingJob();

    const queue = getQueue(PING_JOB.queue);
    expect(await queue.getCompletedCount()).toBe(1);

    const result = await cleanQueues({
      completedJobTtlMs: 0,
      failedJobTtlMs: 0,
      batchSize: 1,
      queueNames: [PING_JOB.queue],
    });

    expect(result.removedCompleted).toBe(1);
    expect(result.batchFull).toBe(true);
  });

  it("registers itself as a repeating job, once, however many workers ask", async () => {
    await scheduleQueueCleanup({ intervalMs: 3_600_000 });
    await scheduleQueueCleanup({ intervalMs: 3_600_000 });

    const schedulers = await getQueue(CLEAN_QUEUES_JOB.queue).getJobSchedulers();
    const ours = schedulers.filter((row) => row.key === QUEUE_CLEANUP_SCHEDULER);

    expect(ours).toHaveLength(1);
    expect(ours[0]?.name).toBe(CLEAN_QUEUES_JOB.name);
    expect(Number(ours[0]?.every)).toBe(3_600_000);

    await unscheduleQueueCleanup();
    expect(
      (await getQueue(CLEAN_QUEUES_JOB.queue).getJobSchedulers()).filter(
        (row) => row.key === QUEUE_CLEANUP_SCHEDULER,
      ),
    ).toHaveLength(0);
  });
});
