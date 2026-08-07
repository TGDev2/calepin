/**
 * The mapping from a failure to what leaves the process.
 *
 * Two outputs, and the split between them is the whole point of CLAUDE.md §7:
 * a status code, which is for machines, and an `ErrorPayload`, which is the
 * only thing a human on the other side is ever shown.
 */

import { type ErrorCategory, HTTP_STATUS_BY_CATEGORY } from "./categories";
import type { ErrorCode } from "./codes";
import { toAppError } from "./normalize";

/**
 * The one place a code overrides its category's status.
 *
 * `UNAUTHENTICATED` sits under `forbidden` because §7's category list is
 * closed — but 403 tells a client "you are known and this is not yours", while
 * 401 tells it "sign in". Collapsing the two would leave the auth task unable
 * to redirect to a login page without reopening the category list.
 */
export const HTTP_STATUS_BY_CODE = {
  UNAUTHENTICATED: 401,
} as const satisfies Partial<Record<ErrorCode, number>>;

export function httpStatusFor(value: unknown): number {
  const error = toAppError(value);

  return (
    (HTTP_STATUS_BY_CODE as Partial<Record<ErrorCode, number>>)[error.code] ??
    HTTP_STATUS_BY_CATEGORY[error.category]
  );
}

/**
 * The `Retry-After` value, in seconds, when the failure carries one.
 *
 * Read structurally rather than through `instanceof RateLimitError`, for the
 * same reason `isAppError` uses a registry symbol: two copies of the class can
 * coexist across the node, edge and client chunk graphs.
 */
export function retryAfterSecondsFor(value: unknown): number | undefined {
  const error: unknown = toAppError(value);

  if (typeof error !== "object" || error === null || !("retryAfterMs" in error)) {
    return undefined;
  }

  const retryAfterMs = (error as { retryAfterMs: unknown }).retryAfterMs;

  if (typeof retryAfterMs !== "number" || !Number.isFinite(retryAfterMs) || retryAfterMs < 0) {
    return undefined;
  }

  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

/**
 * The only shape of a failure that ever crosses to a client.
 *
 * A plain object, not an `AppError`: ADR-001 makes server actions the door for
 * everything request-shaped, and React refuses to serialise a class instance
 * across that boundary. Making the payload the contract means a server action
 * returning `Result<T, ErrorPayload>` works, and nobody has to discover the
 * limitation by hitting it.
 *
 * What is *not* in it matters more than what is: no technical message, no
 * stack, no cause, no `fieldPath`. §7 — the user sees `userMessage`, in French,
 * and nothing else. `code` and `correlationId` are there so a reader can quote
 * something to support; neither describes the fault.
 */
export interface ErrorPayload {
  code: ErrorCode;
  category: ErrorCategory;
  /** French, user-facing. */
  message: string;
  correlationId?: string;
}

export function toErrorPayload(value: unknown, correlationId?: string): ErrorPayload {
  const error = toAppError(value);

  return {
    code: error.code,
    category: error.category,
    message: error.userMessage,
    ...(correlationId === undefined ? {} : { correlationId }),
  };
}
