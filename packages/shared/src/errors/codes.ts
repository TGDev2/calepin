/**
 * The closed set of error codes.
 *
 * CLAUDE.md §7 asks for a *stable* `code`. A free string is not stable: every
 * call site invents one, they drift, and CAL-067's operations views inherit an
 * open set nobody can enumerate. A code is always authored by a developer at
 * the `new SomeError(...)` site — it never comes from data — so there is no
 * untrusted source to normalise at runtime, and a closed union catches a typo
 * at compile time instead of shipping it.
 *
 * Adding a code is a one-line diff in this file. That is deliberate: it makes
 * the set reviewable.
 */

import type { ErrorCategory } from "./categories";

export const ERROR_CODES = [
  // validation
  "VALIDATION_FAILED",
  "SCHEMA_MISMATCH",

  // not_found
  "NOT_FOUND",

  // forbidden
  "FORBIDDEN",
  /** Not signed in, as opposed to signed in without the right. Maps to 401. */
  "UNAUTHENTICATED",

  // conflict
  "CONFLICT",
  "STALE_REVISION",

  // rate_limit
  "RATE_LIMITED",

  // provider
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_REJECTED",

  // timeout
  "TIMEOUT",

  // internal
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * A code belongs to exactly one category, so the category is looked up rather
 * than passed alongside. Handing both to a constructor would let them
 * disagree — `new AppError("NOT_FOUND", "conflict")` would compile — and the
 * disagreement would surface as a wrong HTTP status in production.
 */
export const CATEGORY_BY_CODE = {
  VALIDATION_FAILED: "validation",
  SCHEMA_MISMATCH: "validation",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  UNAUTHENTICATED: "forbidden",
  CONFLICT: "conflict",
  STALE_REVISION: "conflict",
  RATE_LIMITED: "rate_limit",
  PROVIDER_UNAVAILABLE: "provider",
  PROVIDER_REJECTED: "provider",
  TIMEOUT: "timeout",
  INTERNAL_ERROR: "internal",
} as const satisfies Record<ErrorCode, ErrorCategory>;
