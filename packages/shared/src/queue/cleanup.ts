/**
 * The periodic sweep that keeps Redis from growing without bound (CAL-069).
 *
 * `Generation` and `GenerationAttempt` are the source of history — every
 * request, every try, every cost line is a row that reads back a year later.
 * A BullMQ job is not that: it is a transport envelope, evidence that a
 * delivery happened, and CLAUDE.md §9 already forbids it from carrying
 * anything narrative. Once a job has finished — completed or failed — nothing
 * downstream reads it back through the queue; the record that matters is
 * already in the database. Keeping it in Redis past that point is pure
 * growth with no reader.
 *
 * `DEFAULT_JOB_OPTIONS` already prunes a queue's completed/failed sets by age
 * every time a *new* job finishes there — but that pruning only fires on
 * that event. A queue that goes quiet (no new deliveries) keeps every
 * finished job it ever ran, forever. This sweep is the backstop: it runs on
 * its own schedule, independent of new activity, and applies the same kind of
 * age threshold `BullMQ`'s own `Queue.clean` understands directly.
 *
 * Every declared queue is swept, not just `maintenance`: the generation
 * queues already remove their own jobs immediately on completion or failure
 * (`GENERATION_JOB_OPTIONS`), so sweeping them is normally a no-op — but it is
 * the sweep, not a job option a future change could quietly loosen, that is
 * the one place this repository asserts "no finished job outlives its
 * threshold" for every queue at once.
 *
 * Server-side only.
 */

import { z } from "zod";

import { type Logger, logger as processLogger } from "../logging";
import type { JobContract } from "./jobs";
import { getQueue } from "./producer";
import {
  DEFAULT_CLEANUP_COMPLETED_JOB_TTL_MS,
  DEFAULT_CLEANUP_FAILED_JOB_TTL_MS,
  QUEUE_CLEANUP_BATCH_SIZE,
  QUEUE_CLEANUP_INTERVAL_MS,
  QUEUE_NAMES,
  type QueueName,
} from "./queues";

export const cleanQueuesPayloadSchema = z.object({});

export type CleanQueuesPayload = z.infer<typeof cleanQueuesPayloadSchema>;

const nonNegative = z.number().int().nonnegative();

export const cleanQueuesResultSchema = z.object({
  removedCompleted: nonNegative,
  removedFailed: nonNegative,
  queuesSwept: nonNegative,
  /** Whether some queue's state hit its batch limit, so more may remain. */
  batchFull: z.boolean(),
});

export type CleanQueuesResult = z.infer<typeof cleanQueuesResultSchema>;

export const CLEAN_QUEUES_JOB: JobContract<CleanQueuesPayload, CleanQueuesResult> = {
  queue: "maintenance",
  name: "clean-queues",
  payload: cleanQueuesPayloadSchema,
  result: cleanQueuesResultSchema,
};

/** The scheduler's own id. Stable, because `upsertJobScheduler` keys on it. */
export const QUEUE_CLEANUP_SCHEDULER = "queue-cleanup";

export interface CleanQueuesOptions {
  /**
   * How long a completed job is kept before it is purged — the configurable
   * threshold CAL-069 asks for. Read from `QUEUE_CLEANUP_COMPLETED_JOB_TTL_MS`
   * by the process shell and passed in explicitly (§3.3, §4.2); this module
   * never reads `process.env` itself.
   */
  readonly completedJobTtlMs?: number;
  /** Same, for a failed job — the one someone is more likely to come looking for. */
  readonly failedJobTtlMs?: number;
  readonly batchSize?: number;
  readonly logger?: Logger;
  /** Injected so a test can sweep a subset without touching every queue. */
  readonly queueNames?: readonly QueueName[];
}

export async function cleanQueues(options: CleanQueuesOptions = {}): Promise<CleanQueuesResult> {
  const {
    completedJobTtlMs = DEFAULT_CLEANUP_COMPLETED_JOB_TTL_MS,
    failedJobTtlMs = DEFAULT_CLEANUP_FAILED_JOB_TTL_MS,
    batchSize = QUEUE_CLEANUP_BATCH_SIZE,
    logger = processLogger,
    queueNames = QUEUE_NAMES,
  } = options;

  let removedCompleted = 0;
  let removedFailed = 0;
  let batchFull = false;

  for (const queueName of queueNames) {
    const queue = getQueue(queueName);

    const completed = await queue.clean(completedJobTtlMs, batchSize, "completed");
    const failed = await queue.clean(failedJobTtlMs, batchSize, "failed");

    removedCompleted += completed.length;
    removedFailed += failed.length;

    if (completed.length >= batchSize || failed.length >= batchSize) {
      // No silent caps: this queue may still hold jobs past the threshold —
      // the next sweep picks up where this one left off.
      batchFull = true;
      logger.warn("queue.cleanup-batch-full", { queueName, itemCount: batchSize });
    }
  }

  const result: CleanQueuesResult = {
    removedCompleted,
    removedFailed,
    queuesSwept: queueNames.length,
    batchFull,
  };

  const moved = removedCompleted + removedFailed;

  if (moved > 0) {
    // Same reasoning as the reconciliation sweep's own log line: this runs
    // hourly forever, and a line every hour that removed nothing is a line
    // nobody reads. One count, because the allowlist (§9) has one count field.
    logger.info("queue.cleaned", { itemCount: moved });
  }

  return result;
}

export interface ScheduleQueueCleanupOptions {
  readonly intervalMs?: number;
}

/**
 * Registers the sweep as a repeating job.
 *
 * An `upsert`, so every worker in a fleet can call it at startup and there is
 * still one schedule — the same reasoning `scheduleGenerationReconciliation`
 * already gives. The job carries no payload; the thresholds it sweeps with
 * are the shell's own handler closure (`apps/worker/src/main.ts`), not data
 * that travels through Redis.
 */
export async function scheduleQueueCleanup(
  options: ScheduleQueueCleanupOptions = {},
): Promise<void> {
  const { intervalMs = QUEUE_CLEANUP_INTERVAL_MS } = options;

  await getQueue(CLEAN_QUEUES_JOB.queue).upsertJobScheduler(
    QUEUE_CLEANUP_SCHEDULER,
    { every: intervalMs },
    {
      name: CLEAN_QUEUES_JOB.name,
      data: {},
      // A cleanup run is worth nothing once the next one is due, and its own
      // record would be exactly the kind of job this sweep exists to remove.
      opts: { removeOnComplete: true, removeOnFail: true },
    },
  );
}

/** Takes the schedule back off. For a shell that stops, and for a test. */
export async function unscheduleQueueCleanup(): Promise<void> {
  await getQueue(CLEAN_QUEUES_JOB.queue).removeJobScheduler(QUEUE_CLEANUP_SCHEDULER);
}
