/**
 * What an attempt at a generation is recorded as.
 *
 * CLAUDE.md §7: *a failed generation leaves the project valid and replayable —
 * the last valid revision is preserved, the `Generation` row records the
 * failure category and the attempt count, and a manual replay is possible.*
 * This file is the second half of that sentence: the exact tuple the row
 * carries. It is pure, so it can be written before the row exists (CAL-011+).
 *
 * Note what is **not** here: no message, no payload, no excerpt of what was
 * generated. An outcome is a classification (§9).
 */

import { type ErrorCategory, type ErrorCode, toAppError } from "../errors";

export const GENERATION_STATUSES = ["running", "succeeded", "failed"] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

/** Identifies the attempt being recorded, independently of its result. */
export interface AttemptContext {
  generationId: string;
  /** 1 for the first try. Recorded so a replay is auditable. */
  attempt: number;
  durationMs: number;
  /**
   * The version of the prompt this attempt ran (CAL-053) —
   * `GenerationAttempt.promptVersion`, and the second half of what ADR-001 asks
   * an output to be attributable to, beside the model.
   *
   * Known **before** the call, because the prompt has to be rendered to make
   * one, and recorded from the start of the attempt rather than read off a
   * result: a quality regression is traced through the attempts that *failed*
   * as much as the ones that succeeded, and an attempt whose worker died has no
   * result to read anything off.
   *
   * Optional, because an attempt can be recorded outside the mission pipeline —
   * a fixture, an import, a replay of a row written before the registry
   * existed. Which prompt it was is the generation's own `mission`: each
   * mission has exactly one prompt, so the pair identifies the resource.
   */
  promptVersion?: number;
}

export interface GenerationAttemptOutcome extends AttemptContext {
  status: GenerationStatus;
  /** Whether replaying this attempt unchanged has a chance of succeeding. */
  retryable: boolean;
  errorCode?: ErrorCode;
  errorCategory?: ErrorCategory;
}

export function toSucceededAttempt(context: AttemptContext): GenerationAttemptOutcome {
  return { ...context, status: "succeeded", retryable: false };
}

/**
 * Classifies a failure.
 *
 * A value that was *thrown* rather than returned becomes an `InternalError`,
 * category `internal`, non-retryable — because §7 says a throw is a bug, and
 * recording a bug as an ordinary retryable failure launders it into something
 * the queue will patiently repeat until the budget runs out.
 */
export function toFailedAttempt(
  failure: unknown,
  context: AttemptContext,
): GenerationAttemptOutcome {
  const error = toAppError(failure);

  return {
    ...context,
    status: "failed",
    retryable: error.retryable,
    errorCode: error.code,
    errorCategory: error.category,
  };
}
