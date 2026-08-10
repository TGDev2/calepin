/**
 * The periodic sweep that makes "no generation is stuck" true (CAL-061).
 *
 * Everything else in the lifecycle recovers *if something delivers the job*.
 * This is what runs when nothing does — the case where the worker was killed and
 * took its delivery with it, or where Redis refused the enqueue after the row
 * was already committed. It reads the database, decides from the database, and
 * hands the queue whatever the database says is owed.
 *
 * Four statements, in an order that matters:
 *
 * 1. **Reclaim expired attempts.** A `RUNNING` attempt past its lease is a
 *    worker that is gone. It is closed as `GENERATION_INTERRUPTED` with its
 *    token, cost and duration columns untouched — nobody can say what an
 *    unfinished call consumed, and inventing a number is how one call becomes
 *    two cost lines (CAL-058).
 * 2. **Return orphaned generations to the queue.** A `RUNNING` generation with
 *    no `RUNNING` attempt is the ghost; step 1 is what creates most of them, so
 *    this has to come after it.
 * 3. **Close the ones that are out of tries.** The loop breaker: without it a
 *    provider that stays broken is redelivered, and paid for, once a minute.
 * 4. **Deliver the rest.** Every `QUEUED` row older than the staleness
 *    threshold is enqueued — blindly, because the job id is the generation id
 *    and Redis drops the duplicate. Asking the queue what it already holds would
 *    be a round trip that changes no decision.
 *
 * **Idempotent, and safe to run twice at once.** Every step is set-based and
 * conditional on the state it is fixing, so two workers sweeping together do the
 * same work twice and leave the same rows. No lock, deliberately: a recovery
 * task must not depend on the thing most likely to be broken when it is needed.
 *
 * Server-side only.
 */

import { z } from "zod";

import { type Result } from "../errors";
import { MAX_GENERATION_ATTEMPTS } from "../generation";
import { type Logger, logger as processLogger } from "../logging";
import {
  exhaustSpentGenerations,
  listDeliverableGenerations,
  reclaimExpiredAttempts,
  requeueOrphanedGenerations,
} from "../repository";
import { enqueueGeneration } from "./generation";
import type { JobContract } from "./jobs";
import { getQueue } from "./producer";
import {
  GENERATION_STALE_AFTER_MS,
  RECONCILIATION_BATCH_SIZE,
  RECONCILIATION_INTERVAL_MS,
} from "./queues";

export const reconcileGenerationsPayloadSchema = z.object({});

export type ReconcileGenerationsPayload = z.infer<typeof reconcileGenerationsPayloadSchema>;

const nonNegative = z.number().int().nonnegative();

export const reconcileGenerationsResultSchema = z.object({
  reclaimedAttempts: nonNegative,
  requeuedGenerations: nonNegative,
  exhaustedGenerations: nonNegative,
  deliveredGenerations: nonNegative,
  /** Rows the queue refused this pass. Not lost — the next sweep offers them again. */
  undeliveredGenerations: nonNegative,
  /** Whether the batch was full, so the log never reads as "all clear" when it is not. */
  batchFull: z.boolean(),
});

export type ReconcileGenerationsResult = z.infer<typeof reconcileGenerationsResultSchema>;

export const RECONCILE_GENERATIONS_JOB: JobContract<
  ReconcileGenerationsPayload,
  ReconcileGenerationsResult
> = {
  queue: "maintenance",
  name: "reconcile-generations",
  payload: reconcileGenerationsPayloadSchema,
  result: reconcileGenerationsResultSchema,
};

/** The scheduler's own id. Stable, because `upsertJobScheduler` keys on it. */
export const GENERATION_RECONCILIATION_SCHEDULER = "generation-reconciliation";

export interface ReconcileGenerationsOptions {
  /** Injected clock (§8). */
  readonly now?: () => Date;
  readonly staleAfterMs?: number;
  readonly batchSize?: number;
  readonly maxAttempts?: number;
  readonly logger?: Logger;
  /**
   * Injected so the decisions can be tested without Redis, and so a caller with
   * its own producer can supply it. Defaults to the real one.
   */
  readonly enqueue?: (generationId: string) => Promise<Result<unknown>>;
}

export async function reconcileGenerations(
  options: ReconcileGenerationsOptions = {},
): Promise<ReconcileGenerationsResult> {
  const {
    now = () => new Date(),
    staleAfterMs = GENERATION_STALE_AFTER_MS,
    batchSize = RECONCILIATION_BATCH_SIZE,
    maxAttempts = MAX_GENERATION_ATTEMPTS,
    logger = processLogger,
    enqueue = enqueueGeneration,
  } = options;

  const at = now();

  const reclaimedAttempts = await reclaimExpiredAttempts(at);
  const requeuedGenerations = await requeueOrphanedGenerations();
  const exhaustedGenerations = await exhaustSpentGenerations(maxAttempts);

  const deliverable = await listDeliverableGenerations({
    staleBefore: new Date(at.getTime() - staleAfterMs),
    now: at,
    limit: batchSize,
  });

  let deliveredGenerations = 0;
  let undeliveredGenerations = 0;

  for (const generationId of deliverable) {
    const enqueued = await enqueue(generationId);

    if (enqueued.ok) {
      deliveredGenerations += 1;
      continue;
    }

    undeliveredGenerations += 1;

    // Redis is down. Nothing is lost: the row is still `QUEUED` and the next
    // sweep offers it again. Logged once per row, because a partial pass that
    // said nothing would look exactly like a clean one.
    logger.warn("generation.delivery-refused", {
      generationId,
      errorCode: enqueued.error.code,
      errorCategory: enqueued.error.category,
    });
  }

  const result: ReconcileGenerationsResult = {
    reclaimedAttempts,
    requeuedGenerations,
    exhaustedGenerations,
    deliveredGenerations,
    undeliveredGenerations,
    batchFull: deliverable.length >= batchSize,
  };

  const moved =
    reclaimedAttempts + requeuedGenerations + exhaustedGenerations + deliveredGenerations;

  if (moved > 0) {
    // A quiet sweep says nothing — it runs every minute forever, and a line per
    // minute is a log nobody reads. A sweep that *moved* something is the trace
    // that a worker died, and it is the only one there is.
    //
    // One number, because the allowlist has one count field (§9) and four
    // near-identical ones would be a decision about the prohibition taken for
    // convenience. It is deliberately the **total**: an operator who reads a
    // nonzero count goes to `generations`, and a line that said `0` while the
    // sweep redelivered a row would send them nowhere.
    logger.info("generation.reconciled", { itemCount: moved });
  }

  if (result.batchFull) {
    // No silent caps: the pass covered `batchSize` rows and there may be more.
    logger.warn("generation.reconciliation-batch-full", { itemCount: batchSize });
  }

  return result;
}

export interface ScheduleGenerationReconciliationOptions {
  readonly intervalMs?: number;
}

/**
 * Registers the sweep as a repeating job.
 *
 * An `upsert`, so every worker in a fleet can call it at startup and there is
 * still one schedule — and so changing the interval is a deploy rather than a
 * manual cleanup. It lives in Redis rather than in a `setInterval` for one
 * reason worth the dependency: N replicas with N timers is N sweeps a minute,
 * while a scheduler fires once and any one worker takes it.
 */
export async function scheduleGenerationReconciliation(
  options: ScheduleGenerationReconciliationOptions = {},
): Promise<void> {
  const { intervalMs = RECONCILIATION_INTERVAL_MS } = options;

  await getQueue(RECONCILE_GENERATIONS_JOB.queue).upsertJobScheduler(
    GENERATION_RECONCILIATION_SCHEDULER,
    { every: intervalMs },
    {
      name: RECONCILE_GENERATIONS_JOB.name,
      data: {},
      // A sweep is worth nothing once the next one is due, and its record is
      // worth nothing at all — everything it decided is in the database.
      opts: { removeOnComplete: true, removeOnFail: true },
    },
  );
}

/** Takes the schedule back off. For a shell that stops, and for a test. */
export async function unscheduleGenerationReconciliation(): Promise<void> {
  await getQueue(RECONCILE_GENERATIONS_JOB.queue).removeJobScheduler(
    GENERATION_RECONCILIATION_SCHEDULER,
  );
}
