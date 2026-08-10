/**
 * The consuming side of the queue (CAL-060, CAL-061).
 *
 * `startQueueWorker` wraps a BullMQ `Worker` with the four things every consumer
 * in this repository has to do and none should have to remember:
 *
 * 1. **Route by job name.** A BullMQ `Worker` consumes a whole queue, not a job
 *    kind — so a queue carrying two kinds needs *one* worker holding both
 *    handlers, never two workers each rejecting the other's jobs. That was
 *    CAL-060's shape and CAL-061 is the first task with a second job on
 *    `maintenance`, which is what turned a latent defect into a real one.
 * 2. **Parse the payload before the handler sees it.** A job that crossed a
 *    release boundary carries whatever the old producer wrote; the handler is
 *    typed as if it carries the current contract. Parsing is what makes the
 *    type true (§6). A payload that fails is a permanent failure — replaying it
 *    produces the same bytes — so it fails the job rather than being retried.
 * 3. **Trace it.** One line when a job starts, one when it ends, carrying
 *    identifiers, a duration and an error classification, and never a payload
 *    (§9). This is the *tracée* half of CAL-060's acceptance criterion.
 * 4. **Correlate it.** One id per job, opened around every line it emits, so
 *    concurrent jobs can be told apart in the output.
 *
 * The logger is injected rather than imported so a test can assert on the bytes
 * a run emitted (§8), which is the only way to prove the tracing rather than
 * claim it.
 */

import { type ConnectionOptions, Worker } from "bullmq";

import { errorLogFields, InternalError, toAppError } from "../errors";
import {
  type Logger,
  logger as processLogger,
  newCorrelationId,
  runWithLogContext,
} from "../logging";
import type { JobContract } from "./jobs";
import { DEFAULT_WORKER_CONCURRENCY, QUEUE_PREFIX, type QueueName } from "./queues";

/**
 * What one delivery came to. A rejected payload is reported rather than thrown
 * so the worker can trace it as what it is — a contract mismatch, with the path
 * of the offending field — instead of as a handler that blew up.
 */
export type JobOutcome =
  | { readonly kind: "completed"; readonly result: unknown }
  | { readonly kind: "rejected"; readonly fieldPath?: string };

/**
 * A contract bound to its handler, with the payload type erased.
 *
 * Erased on purpose: a worker holds several of these for one queue, and a
 * `readonly RegisteredJob<Payload>[]` cannot hold two different payload types
 * without either a cast or an `any`. `defineJob` closes over both halves inside
 * one generic function, so the parsed value reaches the handler at its real type
 * and nothing is cast anywhere.
 */
export interface RegisteredJob {
  readonly queue: QueueName;
  readonly name: string;
  /** Parses the payload against the contract, then runs the handler. */
  run(data: unknown, jobId: string): Promise<JobOutcome>;
}

export function defineJob<Payload, JobResult>(
  contract: JobContract<Payload, JobResult>,
  /**
   * The work itself. It receives a parsed payload and returns the result the
   * contract promises; throwing fails the job, which is what a BullMQ worker
   * expects and the one place in this repository where a throw is the protocol
   * rather than a bug.
   */
  handle: (payload: Payload, jobId: string) => Promise<JobResult> | JobResult,
): RegisteredJob {
  return {
    queue: contract.queue,
    name: contract.name,
    async run(data, jobId): Promise<JobOutcome> {
      const parsed = contract.payload.safeParse(data);

      if (!parsed.success) {
        // The path of the offending field, never its value (§6, §9).
        return { kind: "rejected", fieldPath: parsed.error.issues[0]?.path.join(".") };
      }

      return { kind: "completed", result: await handle(parsed.data, jobId) };
    },
  };
}

export interface StartQueueWorkerOptions {
  readonly queue: QueueName;
  /** Every job kind this worker knows how to run. At least one. */
  readonly jobs: readonly RegisteredJob[];
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
export function startQueueWorker(options: StartQueueWorkerOptions): Worker {
  const {
    queue,
    jobs,
    connection,
    concurrency = DEFAULT_WORKER_CONCURRENCY,
    logger = processLogger,
    now = () => Date.now(),
  } = options;

  const handlers = indexJobs(queue, jobs);

  const worker = new Worker(
    queue,
    async (job) =>
      runWithLogContext({ correlationId: newCorrelationId() }, async (): Promise<unknown> => {
        const startedAt = now();
        const jobId = job.id ?? "unknown";
        const attempt = job.attemptsMade + 1;
        const trace = { queueName: queue, jobName: job.name, jobId, attempt };

        logger.info("worker.job-started", trace);

        const registered = handlers.get(job.name);

        if (registered === undefined) {
          // A name this deployment does not know — a producer from a release
          // ahead of this worker, or a job kind that was removed. There is
          // nothing to run and nothing to wait for, so it fails; a generation
          // whose *mission* has no executor is the opposite case and is left
          // queued instead (`runGenerationJob`).
          logger.error("worker.job-unhandled", {
            ...trace,
            durationMs: now() - startedAt,
            errorCode: "JOB_NOT_HANDLED",
            errorCategory: "internal",
          });

          throw new InternalError({
            code: "JOB_NOT_HANDLED",
            message: "this worker has no handler for the job name it was delivered",
          });
        }

        let outcome: JobOutcome;

        try {
          outcome = await registered.run(job.data, jobId);
        } catch (error: unknown) {
          logger.error("worker.job-failed", {
            ...trace,
            durationMs: now() - startedAt,
            ...errorLogFields(toAppError(error)),
          });

          throw error;
        }

        if (outcome.kind === "rejected") {
          logger.error("worker.job-rejected", {
            ...trace,
            durationMs: now() - startedAt,
            errorCode: "VALIDATION_FAILED",
            errorCategory: "validation",
            fieldPath: outcome.fieldPath,
          });

          // `UnrecoverableError` would be the BullMQ idiom, but this queue does
          // not retry at all (`DEFAULT_JOB_OPTIONS`), so a plain throw already
          // ends the job for good and keeps one failure path instead of two.
          throw new Error("job payload does not match its contract");
        }

        logger.info("worker.job-completed", { ...trace, durationMs: now() - startedAt });

        return outcome.result;
      }),
    { connection, prefix: QUEUE_PREFIX, concurrency },
  );

  // Without a listener BullMQ re-emits a worker-level error as an unhandled
  // rejection and takes the process down — the opposite of the guarantee this
  // task exists to give. A connection blip must not kill the jobs in flight.
  worker.on("error", (error: unknown) => {
    logger.error("worker.error", { queueName: queue, ...errorLogFields(error) });
  });

  return worker;
}

/**
 * The routing table, checked at construction. Both failures are call-site bugs
 * that would otherwise surface as a job silently going to the wrong handler or
 * to none at all, so they throw here rather than at three in the morning (§7).
 */
function indexJobs(queue: QueueName, jobs: readonly RegisteredJob[]): Map<string, RegisteredJob> {
  if (jobs.length === 0) {
    throw new InternalError({ message: "a queue worker was started with no job to handle" });
  }

  const handlers = new Map<string, RegisteredJob>();

  for (const job of jobs) {
    if (job.queue !== queue) {
      throw new InternalError({ message: "a job was registered on a worker for another queue" });
    }

    if (handlers.has(job.name)) {
      throw new InternalError({ message: "two handlers were registered for one job name" });
    }

    handlers.set(job.name, job);
  }

  return handlers;
}
