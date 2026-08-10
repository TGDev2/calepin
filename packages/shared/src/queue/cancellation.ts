/**
 * The BullMQ implementation of account deletion's `QueueCancellation` port
 * (CAL-031, CAL-061).
 *
 * `@calepin/shared/account` declares the port and every process has been
 * composing `unavailableQueueCancellation` — which succeeds on an empty list and
 * **refuses a non-empty one**, deliberately, so that the first task to enqueue a
 * real job would fail loudly instead of reporting a cancellation nobody
 * performed. This is that task, so this is the adapter.
 *
 * Keyed by generation id because that *is* the job id (`enqueueGeneration`).
 * There is no column storing a job id and there does not need to be.
 *
 * **Removing a job is best effort, and it is not what protects the data.** The
 * rows are already gone by the time this runs — deletion is one transaction,
 * and these side effects come after it (see the port's own note). A job that
 * survives finds no generation and ends `vanished`. What removing it buys is
 * that the survivor never runs at all, which keeps a deleted account out of
 * every worker log for the next few minutes.
 *
 * **The port gets ids, not missions** (CAL-066), so it cannot look up
 * `MISSION_QUEUE` to know which of the three generation queues a job landed
 * on — it tries all three. Job ids are the generation's own id, globally
 * unique, so at most one of the three ever holds a match.
 */

import type { QueueCancellation } from "../account";
import { errorLogFields } from "../errors";
import { type Logger, logger as processLogger } from "../logging";
import { getQueue } from "./producer";
import { GENERATION_QUEUE_NAMES } from "./queues";

export interface CreateQueueCancellationOptions {
  readonly logger?: Logger;
}

export function createQueueCancellation(
  options: CreateQueueCancellationOptions = {},
): QueueCancellation {
  const { logger = processLogger } = options;

  return {
    async cancelGenerations(generationIds): Promise<number> {
      if (generationIds.length === 0) return 0;

      const queues = GENERATION_QUEUE_NAMES.map((name) => getQueue(name));
      let removed = 0;

      for (const generationId of generationIds) {
        try {
          // Looked up first, because `remove` reports success for a job that was
          // never there: its script answers 1 for anything it did not find
          // *locked*. The port's contract is a count of what was removed, and a
          // deletion that reports removing jobs it invented is a number nobody
          // can act on. Tried against each generation queue in turn, stopping at
          // the first match — a job id names exactly one queue.
          let ownerQueue: (typeof queues)[number] | undefined;

          for (const queue of queues) {
            if ((await queue.getJob(generationId)) !== undefined) {
              ownerQueue = queue;
              break;
            }
          }

          if (ownerQueue === undefined) continue;

          // 0 here means the job is locked by a worker running it right now.
          // Honestly not removed — and harmless: that run will find no row and
          // end as `vanished`.
          removed += await ownerQueue.remove(generationId);
        } catch (error: unknown) {
          // Never propagated. §CAL-031: a side effect may not keep a deleted
          // account alive, so a failure here is counted and logged.
          logger.warn("queue.cancellation-failed", {
            generationId,
            ...errorLogFields(error),
          });
        }
      }

      return removed;
    },
  };
}
