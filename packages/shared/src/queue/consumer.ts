/**
 * The consuming side of the queue (CAL-060).
 *
 * `startQueueWorker` wraps a BullMQ `Worker` with the three things every
 * consumer in this repository has to do and none should have to remember:
 *
 * 1. **Parse the payload before the handler sees it.** A job that crossed a
 *    release boundary carries whatever the old producer wrote; the handler is
 *    typed as if it carries the current contract. Parsing is what makes the
 *    type true (§6). A payload that fails is a permanent failure — replaying it
 *    produces the same bytes — so it fails the job rather than being retried.
 * 2. **Trace it.** One line when a job starts, one when it ends, carrying
 *    identifiers, a duration and an error classification, and never a payload
 *    (§9). This is the *tracée* half of CAL-060's acceptance criterion.
 * 3. **Correlate it.** One id per job, opened around every line it emits, so
 *    concurrent jobs can be told apart in the output.
 *
 * The logger is injected rather than imported so a test can assert on the bytes
 * a run emitted (§8), which is the only way to prove the tracing rather than
 * claim it.
 */

import { type ConnectionOptions, Worker } from "bullmq";

import { errorLogFields, toAppError } from "../errors";
import {
  type Logger,
  logger as processLogger,
  newCorrelationId,
  runWithLogContext,
} from "../logging";
import type { JobContract } from "./jobs";
import { DEFAULT_WORKER_CONCURRENCY, QUEUE_PREFIX } from "./queues";

export interface StartQueueWorkerOptions<Payload, JobResult> {
  readonly contract: JobContract<Payload, JobResult>;
  /**
   * The work itself. It receives a parsed payload and returns the result the
   * contract promises; throwing fails the job, which is what a BullMQ worker
   * expects and the one place in this repository where a throw is the protocol
   * rather than a bug.
   */
  readonly handle: (payload: Payload, jobId: string) => Promise<JobResult> | JobResult;
  /**
   * A consumer connection — `maxRetriesPerRequest: null`. BullMQ duplicates it
   * internally for its blocking reads, so one connection serves every worker in
   * a process.
   */
  readonly connection: ConnectionOptions;
  readonly concurrency?: number;
  readonly logger?: Logger;
  /** Injected clock, so a duration is assertable (§8). */
  readonly now?: () => number;
}

/**
 * Starts consuming. The returned `Worker` is what a shell hands to
 * `createGracefulShutdown`; nothing else should need it.
 */
export function startQueueWorker<Payload, JobResult>(
  options: StartQueueWorkerOptions<Payload, JobResult>,
): Worker<Payload, JobResult> {
  const {
    contract,
    handle,
    connection,
    concurrency = DEFAULT_WORKER_CONCURRENCY,
    logger = processLogger,
    now = () => Date.now(),
  } = options;

  const trace = { queueName: contract.queue, jobName: contract.name };

  const worker = new Worker<Payload, JobResult>(
    contract.queue,
    async (job) =>
      runWithLogContext({ correlationId: newCorrelationId() }, async (): Promise<JobResult> => {
        const startedAt = now();
        const jobId = job.id ?? "unknown";
        const attempt = job.attemptsMade + 1;

        logger.info("worker.job-started", { ...trace, jobId, attempt });

        const parsed = contract.payload.safeParse(job.data);

        if (!parsed.success) {
          logger.error("worker.job-rejected", {
            ...trace,
            jobId,
            attempt,
            durationMs: now() - startedAt,
            errorCode: "VALIDATION_FAILED",
            errorCategory: "validation",
            // The path of the offending field, never its value (§6, §9).
            fieldPath: parsed.error.issues[0]?.path.join("."),
          });

          // `UnrecoverableError` would be the BullMQ idiom, but this queue does
          // not retry at all (`DEFAULT_JOB_OPTIONS`), so a plain throw already
          // ends the job for good and keeps one failure path instead of two.
          throw new Error("job payload does not match its contract");
        }

        try {
          const result = await handle(parsed.data, jobId);

          logger.info("worker.job-completed", {
            ...trace,
            jobId,
            attempt,
            durationMs: now() - startedAt,
          });

          return result;
        } catch (error: unknown) {
          logger.error("worker.job-failed", {
            ...trace,
            jobId,
            attempt,
            durationMs: now() - startedAt,
            ...errorLogFields(toAppError(error)),
          });

          throw error;
        }
      }),
    { connection, prefix: QUEUE_PREFIX, concurrency },
  );

  // Without a listener BullMQ re-emits a worker-level error as an unhandled
  // rejection and takes the process down — the opposite of the guarantee this
  // task exists to give. A connection blip must not kill the jobs in flight.
  worker.on("error", (error: unknown) => {
    logger.error("worker.error", { ...trace, ...errorLogFields(error) });
  });

  return worker;
}
