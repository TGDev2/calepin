/**
 * What the logger is allowed to learn about a failure.
 *
 * CAL-009 built the allowlist; this is the producer that fills its error keys.
 * Two things it deliberately does not do:
 *
 * 1. **It never emits a message.** `errorMessage` is absent from the log field
 *    allowlist by design (CLAUDE.md §9), and this function does not try to
 *    smuggle one in under another key.
 * 2. **It never emits a raw stack.** The first line of `error.stack` is
 *    `Name: message` — so a stack copied verbatim carries the message the
 *    allowlist just refused. Only *location frames* survive: lines that name a
 *    file and a position. A message, however many lines it spans and however it
 *    is indented, does not name a position.
 */

import type { LogFields } from "../logging/fields";
import { isAppError } from "./app-error";
import { toAppError } from "./normalize";

/**
 * A V8 stack frame, and only a V8 stack frame:
 *
 *     at buildContext (C:\src\context.ts:12:34)
 *     at C:\src\context.ts:12:34
 *     at Object.<anonymous> (<anonymous>)
 *
 * The trailing position is what makes the predicate tight. A prose line that
 * happens to start with "at " — the reason a naive `startsWith("at ")` filter
 * is not enough — does not end in `:line:column`.
 */
const STACK_FRAME = /^at\s\S.*(?:\(.*:\d+:\d+\)|\(<anonymous>\)|\(native\)|:\d+:\d+)$/;

/** Deep enough to explain a fault, short enough to stay one readable line. */
const MAX_FRAMES = 20;
const MAX_STACK_CHARS = 2000;
const MAX_CAUSE_DEPTH = 4;

type ErrorLogFields = Pick<
  LogFields,
  "errorCode" | "errorCategory" | "errorName" | "errorStack" | "fieldPath"
>;

/**
 * The fields for `logger.error("...", errorLogFields(error))`.
 *
 * `errorName` reports the **deepest non-`AppError`** in the cause chain when
 * there is one. The `AppError` itself is already fully described by `errorCode`
 * and `errorCategory`; `errorName` is the only channel left for the type of the
 * underlying fault — a `TypeError` and a driver error deserve to be
 * distinguishable in a log without anyone opening a payload.
 */
export function errorLogFields(value: unknown): ErrorLogFields {
  const error = toAppError(value);
  // Walk from the value as it was thrown, not from the wrapper `toAppError`
  // just built: the wrapper's own stack starts inside this module, and those
  // frames would push the frames that explain the fault past the cap.
  const chain = collectCauseChain(value instanceof Error ? value : error);

  return {
    errorCode: error.code,
    errorCategory: error.category,
    errorName: underlyingName(chain),
    errorStack: locationFrames(chain),
    fieldPath: error.fieldPath,
  };
}

function collectCauseChain(error: Error): Error[] {
  const chain: Error[] = [];
  let current: unknown = error;

  while (current instanceof Error && chain.length < MAX_CAUSE_DEPTH) {
    chain.push(current);
    current = current.cause;
  }

  return chain;
}

function underlyingName(chain: readonly Error[]): string | undefined {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const error = chain[index];
    if (error && !isAppError(error)) {
      return error.name;
    }
  }

  return chain[0]?.name;
}

function locationFrames(chain: readonly Error[]): string | undefined {
  const frames: string[] = [];

  for (const error of chain) {
    if (typeof error.stack !== "string") {
      continue;
    }

    for (const line of error.stack.split("\n")) {
      const trimmed = line.trim();

      if (STACK_FRAME.test(trimmed)) {
        frames.push(trimmed);

        if (frames.length >= MAX_FRAMES) {
          return join(frames);
        }
      }
    }
  }

  return frames.length > 0 ? join(frames) : undefined;
}

function join(frames: readonly string[]): string {
  return frames.join(" | ").slice(0, MAX_STACK_CHARS);
}
