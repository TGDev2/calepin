/**
 * The application error hierarchy (CLAUDE.md §7).
 *
 * An `AppError` carries five things: a stable `code`, the `category` that code
 * belongs to, whether it is `retryable`, the French `userMessage` the reader is
 * allowed to see, and the underlying `cause`. Everything else about a failure —
 * the technical message, the stack, the provider payload — stays on the server
 * side of the wall.
 *
 * **Invariant, and the reason this file has so few strings in it**:
 * `AppError.message` is developer-authored English, never interpolated with
 * data. It is the first line of `error.stack`, so a message built from a
 * validation value or a provider response would smuggle that content into every
 * log line carrying the stack — precisely what CLAUDE.md §9 forbids. When a
 * failure needs to say *where* it happened, it uses `fieldPath`; when it needs
 * to say *what* happened, that is the `code`.
 */

import { type ErrorCategory, RETRYABLE_BY_CATEGORY } from "./categories";
import { CATEGORY_BY_CODE, type ErrorCode } from "./codes";
import { USER_MESSAGES } from "./messages";

/**
 * `Symbol.for` rather than `instanceof`.
 *
 * `apps/web` compiles `packages/*` from source (CLAUDE.md §3.4) into separate
 * node, edge and client chunk graphs, so two copies of this class can exist in
 * one running system and `instanceof` would answer `false` across them. A
 * registry symbol is shared by every realm in a process.
 */
const APP_ERROR_BRAND: unique symbol = Symbol.for("calepin.AppError");

export interface AppErrorOptions {
  /** Developer-facing, English, never built from data. Defaults to the code. */
  message?: string;
  /** Overrides the category's default French message. */
  userMessage?: string;
  /** Overrides the category's default. */
  retryable?: boolean;
  cause?: unknown;
  /** For a validation failure: the path of the field, never its value (§6). */
  fieldPath?: string;
}

/** Options for a subclass, which fixes the category but may vary the code. */
export type TypedErrorOptions = AppErrorOptions & { code?: ErrorCode };

export class AppError extends Error {
  readonly [APP_ERROR_BRAND] = true;

  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly fieldPath: string | undefined;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? code, { cause: options.cause });

    const category = CATEGORY_BY_CODE[code];

    this.name = new.target.name;
    this.code = code;
    this.category = category;
    this.retryable = options.retryable ?? RETRYABLE_BY_CATEGORY[category];
    this.userMessage = options.userMessage ?? USER_MESSAGES[category];
    this.fieldPath = options.fieldPath;
  }
}

export function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && APP_ERROR_BRAND in value;
}

export class ValidationError extends AppError {
  constructor(options: TypedErrorOptions = {}) {
    super(options.code ?? "VALIDATION_FAILED", options);
  }
}

export class NotFoundError extends AppError {
  constructor(options: TypedErrorOptions = {}) {
    super(options.code ?? "NOT_FOUND", options);
  }
}

export class ForbiddenError extends AppError {
  constructor(options: TypedErrorOptions = {}) {
    super(options.code ?? "FORBIDDEN", options);
  }
}

export class ConflictError extends AppError {
  constructor(options: TypedErrorOptions = {}) {
    super(options.code ?? "CONFLICT", options);
  }
}

export class RateLimitError extends AppError {
  /** How long to wait before the next attempt, when the limiter said so. */
  readonly retryAfterMs: number | undefined;

  constructor(options: TypedErrorOptions & { retryAfterMs?: number } = {}) {
    super(options.code ?? "RATE_LIMITED", options);
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class ProviderError extends AppError {
  constructor(options: TypedErrorOptions = {}) {
    super(options.code ?? "PROVIDER_UNAVAILABLE", options);
  }
}

export class TimeoutError extends AppError {
  constructor(options: TypedErrorOptions = {}) {
    super(options.code ?? "TIMEOUT", options);
  }
}

export class InternalError extends AppError {
  constructor(options: TypedErrorOptions = {}) {
    super(options.code ?? "INTERNAL_ERROR", options);
  }
}
