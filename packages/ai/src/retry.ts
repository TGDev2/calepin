/**
 * Retry and fallback classification (CAL-048, CLAUDE.md §7).
 *
 * Classify before retrying: a transient or rate-limited failure is retried
 * with exponential backoff, a permanent one is not — retrying a permanent
 * error burns budget, abandoning a transient one degrades the product. The
 * per-error `retryable` flag decides the retry; the *category* decides the
 * fallback, because a permanent provider-side failure (`PROVIDER_REJECTED`)
 * is exactly the case where the backup model is worth asking even though a
 * blind replay is not.
 */

import type { AppError, ErrorCategory } from "@calepin/shared/errors";

export interface RetryPolicy {
  /** Tries per model, the first one included. */
  readonly maxAttemptsPerModel: number;
  readonly baseDelayMs: number;
  /** Hard ceiling on one wait, a provider's own `retryAfterMs` included. */
  readonly maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttemptsPerModel: 3,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
};

/**
 * Only a provider-side failure is the backup model's problem to solve.
 * Cancellation, an unusable answer (CAL-052's territory) and bugs are not:
 * switching models would spend budget on a failure the switch cannot fix.
 */
const FALLBACK_CATEGORIES: readonly ErrorCategory[] = ["provider", "timeout", "rate_limit"];

export function isFallbackEligible(error: AppError): boolean {
  return FALLBACK_CATEGORIES.includes(error.category);
}

/**
 * Full-jitter exponential backoff. A provider's own `retryAfterMs` is a
 * floor — the limiter knows its window better than the policy does — and the
 * policy cap is a ceiling, so a queue worker is never parked for minutes on
 * one attempt.
 */
export function retryDelayMs(
  error: AppError,
  attempt: number,
  policy: RetryPolicy,
  random: () => number,
): number {
  const exponential = policy.baseDelayMs * 2 ** (attempt - 1);
  const jittered = Math.ceil(random() * exponential);

  return Math.min(Math.max(jittered, retryAfterMsOf(error)), policy.maxDelayMs);
}

/** Read structurally, like `retryAfterSecondsFor` — chunk graphs share no class. */
function retryAfterMsOf(error: AppError): number {
  const value = (error as { retryAfterMs?: unknown }).retryAfterMs;

  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
