import {
  type DestinationStream,
  type Logger as PinoLogger,
  type LoggerOptions as PinoLoggerOptions,
  pino,
  stdTimeFunctions,
} from "pino";

import { currentLogContext } from "./context";
import { toEventName } from "./events";
import { type LogFields, pickLogFields } from "./fields";
import { REDACT_PATHS, redactSecrets } from "./redaction";

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const EMITTING_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
type EmittingLevel = (typeof EMITTING_LEVELS)[number];

/**
 * The only shape a log call may take.
 *
 * `(event, fields?)` and nothing else — no `logger.info(entity)` overload, no
 * printf arguments, no free-text message. Both arguments are constrained: the
 * event name by `./events`, the fields by the allowlist in `./fields`.
 */
export type LogMethod = (event: string, fields?: LogFields) => void;

export interface Logger extends Record<EmittingLevel, LogMethod> {
  /** Fields bound to every line the returned logger emits. */
  child(fields: LogFields): Logger;
  setLevel(level: LogLevel): void;
  readonly level: LogLevel;
}

export interface CreateLoggerOptions {
  level?: LogLevel;
  /** Fields bound to every line. Allowlisted like any other field. */
  context?: LogFields;
  /** Test seam: a stream to collect output instead of stdout. */
  destination?: DestinationStream;
}

function wrap(instance: PinoLogger): Logger {
  const emit = (level: EmittingLevel, event: string, fields?: LogFields): void => {
    instance[level](
      { ...currentLogContext(), ...pickLogFields(fields, redactSecrets) },
      toEventName(event),
    );
  };

  const methods = Object.fromEntries(
    EMITTING_LEVELS.map((level) => [
      level,
      (event: string, fields?: LogFields) => emit(level, event, fields),
    ]),
  ) as Record<EmittingLevel, LogMethod>;

  return {
    ...methods,
    child: (fields: LogFields) => wrap(instance.child(pickLogFields(fields, redactSecrets))),
    setLevel: (level: LogLevel) => {
      instance.level = level;
    },
    get level(): LogLevel {
      return instance.level as LogLevel;
    },
  };
}

/**
 * Pure: no `process.env`, no configuration discovery. `@calepin/shared/config`
 * throws when the environment is incomplete, so a logger module that read it
 * would make importing a logger anywhere — a domain unit test included —
 * require a full environment. The level is injected by the process shell
 * instead, through `configureLogger`.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const { level = "info", context, destination } = options;

  const pinoOptions: PinoLoggerOptions = {
    level,
    // Replaces pino's default pid/hostname bindings. Neither identifies
    // anything useful in a containerised single-tenant deployment, and an
    // empty base keeps the output deterministic for the tests below.
    base: pickLogFields(context, redactSecrets),
    redact: { paths: [...REDACT_PATHS], censor: "[redacted]" },
    formatters: { level: (label) => ({ level: label }) },
    timestamp: stdTimeFunctions.isoTime,
  };

  return wrap(destination ? pino(pinoOptions, destination) : pino(pinoOptions));
}

/**
 * The process-wide logger. Defaults to `info` until the composition root
 * configures it — `apps/web/src/instrumentation.ts` today, `apps/worker`
 * from CAL-060.
 */
export const logger: Logger = createLogger();

export function configureLogger(options: { level: LogLevel }): void {
  logger.setLevel(options.level);
}
