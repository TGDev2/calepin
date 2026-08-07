/**
 * Unified error handling (CAL-010).
 *
 * Four things live here, and they only make sense together:
 *
 * 1. `AppError` and its eight subclasses — a stable code, a category, a
 *    retryable flag, a French `userMessage`, a preserved cause.
 * 2. `Result` — the value shape an expected failure travels in, so a domain
 *    never has to choose between returning and throwing (CLAUDE.md §7).
 * 3. The two projections of a failure: `toErrorPayload` for the reader, who
 *    gets French and nothing technical, and `errorLogFields` for the log, which
 *    gets everything technical and no prose.
 * 4. `httpStatusFor` — the status code that projection maps to.
 *
 * This module imports nothing: not zod, not the logger, not a domain. That is
 * what makes it safe in a client bundle as well as in the worker.
 */

export {
  AppError,
  type AppErrorOptions,
  ConflictError,
  ForbiddenError,
  InternalError,
  isAppError,
  NotFoundError,
  ProviderError,
  RateLimitError,
  TimeoutError,
  type TypedErrorOptions,
  ValidationError,
} from "./app-error";
export {
  ERROR_CATEGORIES,
  type ErrorCategory,
  HTTP_STATUS_BY_CATEGORY,
  RETRYABLE_BY_CATEGORY,
} from "./categories";
export { CATEGORY_BY_CODE, ERROR_CODES, type ErrorCode } from "./codes";
export {
  type ErrorPayload,
  HTTP_STATUS_BY_CODE,
  httpStatusFor,
  retryAfterSecondsFor,
  toErrorPayload,
} from "./http";
export { errorLogFields } from "./log-fields";
export { GENERIC_ERROR_TITLE, NOT_FOUND_MESSAGE, NOT_FOUND_TITLE, USER_MESSAGES } from "./messages";
export {
  fromValidationIssues,
  toAppError,
  toFieldPath,
  type ValidationIssueLike,
} from "./normalize";
export {
  fail,
  flatMapResult,
  isErr,
  isOk,
  mapResult,
  type Result,
  succeed,
  unwrapOr,
} from "./result";
