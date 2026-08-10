/**
 * The declared queues, and the settings every one of them is used with
 * (CAL-060).
 *
 * One entry per queue, and the union is closed: a queue is a deployment fact —
 * something has to consume it — so it is declared here rather than named as a
 * string at a call site. Adding one is a one-line diff, and the type then
 * forces every producer and every worker to name a queue that exists.
 *
 * `maintenance` is the only one today. The generation queue belongs to CAL-061,
 * which is what will give it a producer; declaring it now would be a guess
 * about the shape of a job nothing enqueues.
 */

export const QUEUE_NAMES = ["maintenance"] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export function isQueueName(value: string): value is QueueName {
  return (QUEUE_NAMES as readonly string[]).includes(value);
}

/**
 * Every Redis key BullMQ writes is prefixed with this.
 *
 * The local stack and the integration harness both reach a Redis that other
 * things may use, and an unprefixed `bull:maintenance:*` says nothing about
 * whose it is. It is also what makes a stray key attributable during an
 * incident, which is the only time anyone reads them.
 */
export const QUEUE_PREFIX = "calepin";

/**
 * The default options every job is enqueued with.
 *
 * **`attempts: 1` is deliberate, and it is the interesting line here.** BullMQ
 * will happily retry a job for you, and letting it would put retry policy in
 * the transport — where CLAUDE.md §7 explicitly does not want it: *classify
 * before retrying*, which is CAL-064's, and the re-delivery of a generation is
 * decided by the lifecycle CAL-061 builds on `completeGenerationAttempt`. A
 * queue retrying on its own would replay permanent failures until the budget
 * ran out, and it would do it behind the back of the attempt counter that
 * exists to make the cost of a retry visible.
 *
 * Retention is bounded on both sides but asymmetric: a completed job is
 * evidence for a day, a failed one for a week, because the failed one is the
 * one someone comes looking for.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;

/**
 * How many jobs one worker runs at once, by default.
 *
 * One, because a generation is the unit of load and the tariff table prices it
 * that way. CAL-065 owns concurrency limits properly, with a policy rather than
 * a constant; this is the value that behaves predictably until then.
 */
export const DEFAULT_WORKER_CONCURRENCY = 1;
