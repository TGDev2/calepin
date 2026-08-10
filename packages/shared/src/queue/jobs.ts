/**
 * The job registry (CAL-060).
 *
 * A `JobContract` is what a producer and a consumer agree on: which queue, what
 * the job is called, and the schema of what travels in each direction. Both
 * sides import the same constant, so a payload the consumer cannot read is a
 * type error rather than a job that fails in production at three in the
 * morning.
 *
 * **The payload is parsed on arrival, not trusted.** It is our own data, but it
 * crossed a serialisation boundary and it may have been written by a previous
 * deployment: a job enqueued before a release and consumed after it carries the
 * old shape. CLAUDE.md §6's rule for untrusted input is the right one here for
 * exactly the reason it is the right one for a model response — the value is
 * whatever the wire says it is.
 *
 * **Nothing a job carries may be literary content (§9).** A payload is
 * identifiers and options; the text a mission works on is read from the
 * database by the code that runs it, never posted through Redis, where it would
 * land in every queue inspector and every stalled-job dump.
 */

import { z } from "zod";

import type { QueueName } from "./queues";

export interface JobContract<Payload, Result> {
  readonly queue: QueueName;
  readonly name: string;
  readonly payload: z.ZodType<Payload>;
  readonly result: z.ZodType<Result>;
}

/** The payload type a contract describes, for a handler's signature. */
export type JobPayload<Contract> =
  Contract extends JobContract<infer Payload, unknown> ? Payload : never;

/** The result type a contract describes. */
export type JobResult<Contract> =
  Contract extends JobContract<unknown, infer Result> ? Result : never;

/**
 * The dummy job the foundation is proved with — *une tâche factice*, produced,
 * consumed and traced.
 *
 * It survives past this task as a health probe: it is the one job that asks
 * nothing of the database, of a provider or of a project, so a `ping` that
 * completes says the transport works and says nothing else. That is precisely
 * what you want to know first when generations stop moving.
 */
export const pingPayloadSchema = z.object({
  /**
   * An opaque identifier minted by the producer. It is what makes "this job was
   * consumed" provable rather than asserted: the result echoes it, so a test
   * reads back the token it sent instead of trusting that *some* job ran.
   */
  token: z.string().min(1),
  /** Epoch milliseconds at which the job was enqueued. */
  issuedAt: z.number().int().nonnegative(),
});

export type PingPayload = z.infer<typeof pingPayloadSchema>;

export const pingResultSchema = z.object({
  token: z.string().min(1),
  receivedAt: z.number().int().nonnegative(),
  /**
   * How long the job waited in the queue. Non-negative even when the two
   * clocks disagree: this is a health signal, not a measurement, and a negative
   * latency would only ever be read as a bug in the probe.
   */
  latencyMs: z.number().int().nonnegative(),
});

export type PingResult = z.infer<typeof pingResultSchema>;

export const PING_JOB: JobContract<PingPayload, PingResult> = {
  queue: "maintenance",
  name: "ping",
  payload: pingPayloadSchema,
  result: pingResultSchema,
};

/**
 * The handler, here rather than in the worker, so the integration suite runs
 * the same code `pnpm worker` does. A dummy job whose test reimplements it
 * proves the test.
 */
export function handlePing(payload: PingPayload, now: () => number = Date.now): PingResult {
  const receivedAt = now();

  return {
    token: payload.token,
    receivedAt,
    latencyMs: Math.max(0, receivedAt - payload.issuedAt),
  };
}
