/**
 * The eight error categories of CLAUDE.md §7, and the two tables that hang off
 * them.
 *
 * Both tables are data, not `switch` statements: a category added to the list
 * without an entry here is a compile error, which is the only reliable way to
 * keep three parallel lists in step.
 */

export const ERROR_CATEGORIES = [
  "validation",
  "not_found",
  "forbidden",
  "conflict",
  "rate_limit",
  "provider",
  "timeout",
  "internal",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/**
 * Whether a failure of this category is worth trying again *as it stands*.
 *
 * Retrying a permanent error burns budget and abandoning a transient one
 * degrades the product (CLAUDE.md §7), so the default is a property of the
 * category rather than a decision each call site improvises. An individual
 * error may override it — a `conflict` resolved by re-reading the current state
 * is retryable, a `provider` error that returns "unsupported model" is not.
 */
export const RETRYABLE_BY_CATEGORY = {
  validation: false,
  not_found: false,
  forbidden: false,
  conflict: false,
  rate_limit: true,
  provider: true,
  timeout: true,
  internal: false,
} as const satisfies Record<ErrorCategory, boolean>;

/**
 * The HTTP status a category maps to.
 *
 * Two choices worth stating:
 *
 * - `provider` is 503, not 502. Calepin is not a gateway; a degraded model
 *   provider makes *this* service temporarily unable to serve the request, and
 *   503 is the status a client may reasonably retry after a delay.
 * - `timeout` is 504. Unlike `provider`, it names an upstream that accepted the
 *   work and did not answer in time, which is precisely what 504 describes.
 */
export const HTTP_STATUS_BY_CATEGORY = {
  validation: 400,
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  rate_limit: 429,
  provider: 503,
  timeout: 504,
  internal: 500,
} as const satisfies Record<ErrorCategory, number>;
