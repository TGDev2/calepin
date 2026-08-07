/**
 * Structured logging (CAL-009).
 *
 * Two rules hold this package together, both from CLAUDE.md §9:
 *
 * 1. A log call is `(event, fields?)`. The event name has an identifier shape;
 *    the fields come from a closed allowlist of identifiers, counts, durations
 *    and classifications. Neither argument can carry prose.
 * 2. Correlation is ambient. `runWithRequestContext` and
 *    `runWithGenerationContext` open a scope; every line emitted inside it
 *    carries the identifier without any function having to pass it on.
 *
 * Server-side only — it reads `node:async_hooks`.
 */

export type { GenerationContext, RequestContext } from "./context";
export {
  currentCorrelationId,
  currentLogContext,
  newCorrelationId,
  runWithGenerationContext,
  runWithLogContext,
  runWithRequestContext,
} from "./context";
export { INVALID_EVENT_NAME, isValidEventName } from "./events";
export type { LogFields } from "./fields";
export { LOG_FIELD_KEYS } from "./fields";
export type { CreateLoggerOptions, Logger, LogLevel } from "./logger";
export { configureLogger, createLogger, LOG_LEVELS, logger } from "./logger";
export { redactSecrets } from "./redaction";
