/**
 * When a failed generation is worth trying again, and how long to wait
 * (CAL-063).
 *
 * CLAUDE.md §7 states the rule in one line — *classify before retrying:
 * transient and rate-limit errors are retried with exponential backoff,
 * permanent errors are not* — and names the cost of getting it wrong in both
 * directions: retrying a permanent error burns budget, abandoning a transient
 * one degrades the product. This module is that sentence, as three values and
 * two functions.
 *
 * **Three classes, not two.** `AppError` already carries a `retryable` flag, and
 * a boolean is enough to decide *whether*; it is not enough to decide *when*. A
 * provider that is down answers again in seconds, and asking early costs one
 * refused connection. A limiter that said "too many requests" is measuring a
 * window, and asking early costs another rejection inside the same window and
 * pushes the window out — so the two want the same shape of curve with a
 * different base. Splitting them is what the backlog asks for and what makes
 * the rate-limit case honest: `retryAfterMs`, when the limiter stated one, is a
 * **floor**, because the limiter knows its own window better than any policy
 * here does.
 *
 * **Where this sits, and why it is not `@calepin/ai/retry.ts`.** That module is
 * the policy *inside one model call*: three tries per model across two models,
 * milliseconds apart, all within one `produce`. This one is the policy *between
 * attempts of a generation*: one try per job delivery, minutes apart, across
 * worker restarts. They are two different loops at two different time scales,
 * and only the outer one has to survive a process dying — which is why it is
 * expressed as a timestamp on a row rather than as a `setTimeout`. It also has
 * to live here rather than there: `@calepin/shared` may not import
 * `@calepin/ai` (§3.2), and the lifecycle that reads this is `@calepin/shared`'s.
 *
 * **The wait is a column, never a timer.** `nextGenerationAttemptAt` produces a
 * `Date` that `completeGenerationAttempt` writes to `Generation.nextAttemptAt`,
 * and the reconciliation sweep refuses to redeliver a row before it. A worker
 * killed mid-backoff therefore loses nothing: the deadline is in PostgreSQL, so
 * the row is the truth here exactly as it is everywhere else in the lifecycle.
 *
 * Pure: no clock, no randomness of its own, no I/O. Both are arguments.
 */

import type { AppError } from "../errors";

/**
 * The three classes of generation failure, in increasing order of hopelessness.
 *
 * Lowercase members, as §4.2 asks of a union this package owns; the Prisma enum
 * `GenerationFailureClass` copies them in `SCREAMING_SNAKE` and
 * `prisma/schema.test.ts` pins the pair, so a fourth class cannot be added on
 * one side alone.
 */
export const GENERATION_FAILURE_CLASSES = ["transient", "rate_limited", "permanent"] as const;

export type GenerationFailureClass = (typeof GENERATION_FAILURE_CLASSES)[number];

/**
 * How many attempts a generation gets before Calepin gives up on it
 * (`GENERATION_ATTEMPTS_EXHAUSTED`).
 *
 * A **loop breaker**, and it belongs to the retry policy rather than to the
 * queue's configuration, which is where CAL-061 left it: a ceiling is one of the
 * three numbers that decide what a broken provider costs, beside the base delay
 * and the cap. The sweep is the only thing that redelivers a `QUEUED` row, so
 * without a ceiling a provider that stays broken is redelivered — and paid for —
 * for as long as it stays broken.
 *
 * Five is high enough that a host restarting twice does not consume it, and low
 * enough that with the delays below a genuinely broken generation stops costing
 * within about ten minutes rather than overnight.
 *
 * It bounds the **automatic** retries only. `replayGeneration` raises the row's
 * own `attemptCeiling` past what has already been spent, because a human asking
 * again is a decision and not a loop.
 */
export const MAX_GENERATION_ATTEMPTS = 5;

export interface GenerationRetryPolicy {
  /** First wait after a transient failure, doubled per attempt afterwards. */
  readonly transientBaseDelayMs: number;
  /** The same, after a rate limit — deliberately longer. See below. */
  readonly rateLimitBaseDelayMs: number;
  /** Ceiling on one wait, a limiter's own `retryAfterMs` included. */
  readonly maxDelayMs: number;
}

/**
 * The numbers, and why these ones.
 *
 * The sweep runs once a minute (`RECONCILIATION_INTERVAL_MS`), so a delay below
 * that is rounded up to it in practice and the interesting range starts around
 * thirty seconds. From `transientBaseDelayMs`, four automatic retries wait
 * roughly 30 s, 1 min, 2 min and 4 min — about eight minutes of patience in
 * total, which outlasts an ordinary provider blip and a rolling restart without
 * making an author watch a spinner for an hour.
 *
 * `rateLimitBaseDelayMs` is double that, because a limiter's window is the thing
 * being waited out and asking again inside it is worse than not asking: it earns
 * another rejection and, on most providers, extends the window. Where the
 * limiter said how long to wait, that number wins as a floor.
 *
 * `maxDelayMs` caps a single wait at ten minutes. Past that the ceiling has
 * usually been reached anyway, and a generation nobody has looked at for ten
 * minutes is one an author is better served by replaying deliberately.
 */
export const DEFAULT_GENERATION_RETRY_POLICY: GenerationRetryPolicy = {
  transientBaseDelayMs: 30_000,
  rateLimitBaseDelayMs: 60_000,
  maxDelayMs: 10 * 60_000,
};

/**
 * Classifies a failure into the three classes above.
 *
 * Read off the error rather than off a list of codes maintained here, so a code
 * added elsewhere is classified by the decision its own construction site
 * already took. Two rules, in order:
 *
 * - The `rate_limit` category is its own class. It is the only category whose
 *   remedy is a *longer* wait rather than a wait at all.
 * - Everything else follows `retryable`, which the category's default sets and
 *   an individual error may override. That override is the load-bearing part:
 *   `MODEL_OUTPUT_INVALID` is a `provider` error — a retryable category — and is
 *   constructed non-retryable, because a blind replay is not the treatment for a
 *   malformed answer. Classifying by category alone would call it transient and
 *   pay for the same rejected answer five times.
 */
export function classifyGenerationFailure(error: AppError): GenerationFailureClass {
  if (error.category === "rate_limit") return "rate_limited";

  return error.retryable ? "transient" : "permanent";
}

/** Whether a failure of this class is retried automatically at all. */
export function isRetriableFailureClass(failureClass: GenerationFailureClass): boolean {
  return failureClass !== "permanent";
}

export interface GenerationRetryDelayInput {
  readonly failureClass: GenerationFailureClass;
  /** The attempt that just failed. 1 for the first one, as the row counts. */
  readonly attempt: number;
  /** What the limiter asked for, when it asked for anything. A floor. */
  readonly retryAfterMs?: number | undefined;
}

/**
 * How long to wait after the attempt that just failed.
 *
 * Zero for a permanent failure: there is no next attempt, and returning a delay
 * for one would invite a caller to schedule it.
 *
 * **Equal jitter, not full jitter.** `@calepin/ai`'s own `retryDelayMs` uses
 * full jitter (`random() * exponential`), which is right there: many callers
 * hammering one provider inside one call want their retries spread across the
 * whole interval, and a wait that collapses to nearly zero costs one extra
 * request. Here it would cost the backoff itself — the sweep's granularity is a
 * minute, so a delay of 200 ms and a delay of 0 are the same delay, and a curve
 * that can collapse is not a curve. Half the interval is therefore fixed and
 * half is random: the spread that keeps a fleet of workers from converging on
 * one instant survives, the growth does not.
 */
export function generationRetryDelayMs(
  input: GenerationRetryDelayInput,
  policy: GenerationRetryPolicy = DEFAULT_GENERATION_RETRY_POLICY,
  random: () => number = Math.random,
): number {
  if (!isRetriableFailureClass(input.failureClass)) return 0;

  const base =
    input.failureClass === "rate_limited"
      ? policy.rateLimitBaseDelayMs
      : policy.transientBaseDelayMs;

  const exponent = Math.max(0, Math.trunc(input.attempt) - 1);
  const exponential = base * 2 ** exponent;
  const jittered = Math.round(exponential / 2 + random() * (exponential / 2));

  return Math.min(Math.max(jittered, floorOf(input.retryAfterMs)), policy.maxDelayMs);
}

/**
 * A limiter's own instruction, if it gave one that means anything. Anything
 * else — absent, negative, `NaN` — is no floor rather than a broken one.
 */
function floorOf(retryAfterMs: number | undefined): number {
  return retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? retryAfterMs
    : 0;
}

export interface NextGenerationAttemptInput extends GenerationRetryDelayInput {
  /** The instant the failure was recorded at — injected, never read here (§8). */
  readonly now: number;
}

/**
 * When the next automatic attempt becomes due, or `undefined` when there is
 * none.
 *
 * `undefined` rather than `null` because it is the value that goes onto an
 * optional field of `GenerationAttemptOutcome`; the repository turns it into the
 * `NULL` the column holds.
 *
 * **The ceiling is deliberately not consulted here.** An attempt that was the
 * last one allowed still gets a deadline, and that is correct rather than sloppy:
 * the row's own ceiling may have been raised since (`replayGeneration`), and this
 * function is handed an outcome, not a row. Scheduling a deadline the sweep will
 * never reach costs nothing — the sweep closes an exhausted generation *before*
 * it delivers anything, and closing it clears the deadline — while refusing one
 * would leave a replayed generation's later attempts running back to back with
 * no backoff at all, which is the failure this whole module exists to prevent.
 */
export function nextGenerationAttemptAt(
  input: NextGenerationAttemptInput,
  policy: GenerationRetryPolicy = DEFAULT_GENERATION_RETRY_POLICY,
  random: () => number = Math.random,
): Date | undefined {
  if (!isRetriableFailureClass(input.failureClass)) return undefined;

  return new Date(input.now + generationRetryDelayMs(input, policy, random));
}
