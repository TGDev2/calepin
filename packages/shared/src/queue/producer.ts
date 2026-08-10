/**
 * The producing side of the queue (CAL-060).
 *
 * What a caller gets back is an `EnqueuedJob` — three identifiers — and never
 * the BullMQ `Job`. That is the same boundary `@calepin/shared/repository`
 * draws around the Prisma client: a server action is allowed to *ask* for work
 * to happen, and is not allowed to hold the object that could cancel it, drain
 * the queue or read another job's data. The identifiers are everything a caller
 * legitimately needs, and the generation row is where its state is read from
 * anyway (ADR-001).
 *
 * Server-side only: it logs, and the logger reads `node:async_hooks`.
 */

import { type Job, type JobsOptions, Queue } from "bullmq";

import { fail, ProviderError, type Result, succeed, toAppError, ValidationError } from "../errors";
import { getQueueConnection } from "./connection";
import type { JobContract } from "./jobs";
import { DEFAULT_JOB_OPTIONS, QUEUE_PREFIX, type QueueName } from "./queues";

/** What the caller learns: enough to trace the job, not enough to steer it. */
export interface EnqueuedJob {
  readonly id: string;
  readonly queueName: QueueName;
  readonly jobName: string;
}

/**
 * One `Queue` per name per process, memoised on `globalThis` for the reason the
 * connection is (§12) and because a `Queue` holds Redis clients of its own —
 * constructing one per enqueue would leak a connection per call.
 */
const REGISTERED_QUEUES: unique symbol = Symbol.for("calepin.registeredQueues");

interface QueueRegistry {
  [REGISTERED_QUEUES]?: Map<QueueName, Queue>;
}

const registry = globalThis as unknown as QueueRegistry;

function queues(): Map<QueueName, Queue> {
  return (registry[REGISTERED_QUEUES] ??= new Map<QueueName, Queue>());
}

/**
 * The producer handle for a queue. Exported for the shell and the integration
 * suite — a page or a server action calls `enqueueJob`, which is the whole
 * point of returning identifiers from it.
 */
export function getQueue(name: QueueName): Queue {
  const existing = queues().get(name);

  if (existing !== undefined) {
    return existing;
  }

  const queue = new Queue(name, {
    connection: getQueueConnection(),
    prefix: QUEUE_PREFIX,
    defaultJobOptions: { ...DEFAULT_JOB_OPTIONS },
  });

  queues().set(name, queue);

  return queue;
}

/**
 * Enqueues one job, validating the payload against the contract on the way out.
 *
 * A `Result` rather than a throw: Redis being unreachable is a failure the
 * caller must handle and can answer for — ADR-001 calls it *a hard availability
 * dependency of the core feature* — while §7 reserves throws for bugs. The one
 * thing that does throw here is a missing connection, because that is a bug.
 */
export async function enqueueJob<Payload, JobResult>(
  contract: JobContract<Payload, JobResult>,
  payload: Payload,
  options: JobsOptions = {},
): Promise<Result<EnqueuedJob>> {
  const parsed = contract.payload.safeParse(payload);

  if (!parsed.success) {
    return fail(
      new ValidationError({
        message: "job payload does not match its contract",
        // The path, never the value (§9) — and the first one is enough to
        // point at the producer that built the payload wrong.
        fieldPath: parsed.error.issues[0]?.path.join("."),
        cause: parsed.error,
      }),
    );
  }

  let job: Job<Payload, JobResult>;

  try {
    job = await getQueue(contract.queue).add(contract.name, parsed.data, options);
  } catch (error: unknown) {
    const appError = toAppError(error);

    // Anything ioredis or BullMQ throws normalises to `INTERNAL_ERROR`, which
    // would classify a Redis outage as a bug and mark it non-retryable. An
    // `AppError` that came through unchanged already knows what it is — a
    // missing connection, most of all — and is passed on as it is.
    return fail(
      appError.code === "INTERNAL_ERROR"
        ? new ProviderError({
            code: "QUEUE_UNAVAILABLE",
            message: "the queue refused the job",
            cause: error,
          })
        : appError,
    );
  }

  if (job.id === undefined) {
    // BullMQ only leaves the id unset for a job it did not actually write.
    // Reporting success on one would hand the caller a trace token that names
    // nothing.
    return fail(
      new ProviderError({
        code: "QUEUE_UNAVAILABLE",
        message: "the queue accepted no job for this ask",
      }),
    );
  }

  return succeed({ id: job.id, queueName: contract.queue, jobName: contract.name });
}

/**
 * Closes every memoised producer. For a shell's shutdown and a test's teardown;
 * it does not close the registered connection, which the shell owns.
 */
export async function closeProducers(): Promise<void> {
  const open = [...queues().values()];
  queues().clear();

  await Promise.all(open.map((queue) => queue.close()));
}
