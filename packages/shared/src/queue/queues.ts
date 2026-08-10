/**
 * The declared queues, and the settings every one of them is used with
 * (CAL-060).
 *
 * One entry per queue, and the union is closed: a queue is a deployment fact —
 * something has to consume it — so it is declared here rather than named as a
 * string at a call site. Adding one is a one-line diff, and the type then
 * forces every producer and every worker to name a queue that exists.
 *
 * Two today. `generation` carries the work an author paid for, one job per
 * `Generation` row (CAL-061); `maintenance` carries everything the system does
 * for itself — the health probe and the reconciliation sweep. They are separate
 * queues rather than two job names on one because a generation is minutes long
 * and the sweep must not queue behind it: with `DEFAULT_WORKER_CONCURRENCY` at
 * one, sharing a queue would mean the recovery task waits for the very
 * generation it exists to recover.
 */

export const QUEUE_NAMES = ["generation", "maintenance"] as const;

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
 * What a generation job is enqueued with, on top of the defaults (CAL-061).
 *
 * **Nothing is retained, and that is the load-bearing line.** A generation job
 * is keyed by its generation id, so Redis deduplicates a second enqueue of the
 * same ask instead of running it twice — but a custom job id is only free again
 * once the job is gone. Keep a completed job for a day and `replayGeneration`
 * silently enqueues nothing for a day; keep a failed one for a week and the
 * reconciliation sweep can never redeliver it. The history a queue would be
 * keeping is already in `generations` and `generation_attempts`, in a table
 * that can be read a year later.
 */
export const GENERATION_JOB_OPTIONS = {
  removeOnComplete: true,
  removeOnFail: true,
} as const;

/**
 * How often the reconciliation sweep runs (CAL-061). A minute: it is four
 * statements and a handful of enqueues, and it is the only thing that redelivers
 * a generation nothing is holding.
 */
export const RECONCILIATION_INTERVAL_MS = 60_000;

/**
 * How long a `QUEUED` generation is left alone before the sweep enqueues it
 * again.
 *
 * Twice the interval, and comfortably longer than the gap between
 * `reserveGeneration` committing and its caller's enqueue returning. Shorter
 * would have the sweep racing every ordinary producer; longer would be latency
 * an author waits through after a Redis outage for no benefit. Re-enqueueing one
 * that is already queued costs nothing — the job id is the generation id, so
 * Redis drops the duplicate.
 *
 * It governs a row with **no** retry deadline. Since CAL-063 a row that failed
 * transiently carries its own `nextAttemptAt`, and that deadline is what decides
 * when it comes back — see `listDeliverableGenerations`.
 */
export const GENERATION_STALE_AFTER_MS = 2 * RECONCILIATION_INTERVAL_MS;

/**
 * How many generations one sweep will deliver. A bound on the work one job
 * does, not on recovery: what is left over is picked up a minute later, and the
 * sweep says so in its log rather than reporting a clean pass.
 */
export const RECONCILIATION_BATCH_SIZE = 100;

/**
 * How long a worker's claim on an attempt is believed while the runner renews
 * it (CAL-061).
 *
 * Two minutes rather than `DEFAULT_ATTEMPT_LEASE_MS`'s thirty, and the two are
 * different for a reason worth keeping straight: thirty minutes is the safe
 * value for a caller that does **not** renew, because the lease then has to
 * outlast the longest mission. A runner that renews every
 * `GENERATION_LEASE_RENEWAL_MS` needs the lease only to outlast a plausible
 * pause, and the shorter it is the sooner a killed worker is noticed. Recovery
 * after a crash is this plus one sweep.
 */
export const GENERATION_LEASE_MS = 120_000;

/**
 * How often that lease is pushed back. Four renewals inside one lease, so three
 * have to be missed in a row before a healthy attempt is reclaimed — and
 * reclaiming a healthy attempt is the expensive mistake: its answer is
 * discarded as `superseded` after the provider has been paid for it.
 */
export const GENERATION_LEASE_RENEWAL_MS = 30_000;

/**
 * How many jobs one worker runs at once, by default.
 *
 * One, because a generation is the unit of load and the tariff table prices it
 * that way. CAL-065 owns concurrency limits properly, with a policy rather than
 * a constant; this is the value that behaves predictably until then.
 */
export const DEFAULT_WORKER_CONCURRENCY = 1;
