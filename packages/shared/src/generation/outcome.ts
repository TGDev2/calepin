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
import {
  classifyGenerationFailure,
  type GenerationFailureClass,
  type GenerationRetryPolicy,
  nextGenerationAttemptAt,
} from "./retry";

export const GENERATION_STATUSES = ["running", "succeeded", "failed"] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

/**
 * What one attempt consumed, exactly as the provider reported it (CAL-056,
 * CAL-058).
 *
 * **Reported, never inferred.** An attempt whose worker died, or whose call
 * never reached an endpoint, has no usage — and the honest record of that is
 * the absence of one, not a number reconstructed from what the call was
 * expected to cost. That absence is what makes the specification's rule
 * arithmetic rather than a promise: *aucune facturation interne ne doit être
 * comptabilisée deux fois si l'échec provient du système*. A try nobody can
 * measure sums to nothing, so the replay that follows it is charged once.
 *
 * **Stated, never accumulated.** `report` in `runGenerationAttempt` replaces
 * this value; it does not add to it. Retries and a provider switch *inside* one
 * call are already summed by `@calepin/ai`'s port before it returns, and adding
 * the same total twice is precisely the double count this task exists to close.
 *
 * Present on a failure as much as on a success: a call the provider billed for
 * before rejecting the answer cost what it cost.
 */
export interface AttemptUsage {
  /**
   * The model that actually served — the backup model's identifier when a
   * failover put it there, which is why this belongs to the attempt and never
   * to the generation above it.
   */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * The tokens above priced at today's tariff, as a six-decimal string. Priced
   * by the caller: money is `@calepin/ai`'s `estimateCostUsd`, and a package
   * that must not import it does not get to guess.
   */
  estimatedCostUsd?: string;
}

/** Identifies the attempt being recorded, independently of its result. */
export interface AttemptContext {
  generationId: string;
  /**
   * 1 for the first try. Recorded so a replay is auditable — and **allocated by
   * the persistence**, never chosen by the caller (CAL-058): a redelivered job
   * that picked its own number is how one physical call becomes two cost lines.
   */
  attempt: number;
  durationMs: number;
  /** What the provider reported, when it reported anything. */
  usage?: AttemptUsage;
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
  /**
   * Which of the three classes the failure fell into (CAL-063). Absent on a
   * success, and absent nowhere else: it is what decided the wait below, so
   * recording it is what makes that decision inspectable a week later.
   */
  failureClass?: GenerationFailureClass;
  /**
   * When the next automatic attempt becomes due, for a failure worth one.
   *
   * Computed here rather than by the persistence, because *when to try again* is
   * a policy decision about a classified failure and the repository's job is to
   * write down what it is told (see `repository/generation-run.ts`'s own note on
   * transitions authored by nobody). Absent for a permanent failure: there is no
   * next attempt to be due.
   */
  nextAttemptAt?: Date;
}

export function toSucceededAttempt(context: AttemptContext): GenerationAttemptOutcome {
  return { ...context, status: "succeeded", retryable: false };
}

export interface FailedAttemptOptions {
  /** Injected clock (§8) — the instant the wait below is measured from. */
  readonly now?: number;
  readonly policy?: GenerationRetryPolicy;
  /** Injected jitter (§8). */
  readonly random?: () => number;
}

/**
 * Classifies a failure, and schedules the retry it earns.
 *
 * A value that was *thrown* rather than returned becomes an `InternalError`,
 * category `internal`, non-retryable — because §7 says a throw is a bug, and
 * recording a bug as an ordinary retryable failure launders it into something
 * the queue will patiently repeat until the budget runs out.
 *
 * The three classes and the curve are `./retry`'s; what this function adds is
 * that a caller cannot record a failure without also recording which class it
 * was and when it may be tried again. Those two travel together because they are
 * one decision, and a row carrying a deadline with no class — or a class with a
 * deadline that contradicts it — is a state the database refuses outright
 * (`generations_retry_check`).
 */
export function toFailedAttempt(
  failure: unknown,
  context: AttemptContext,
  options: FailedAttemptOptions = {},
): GenerationAttemptOutcome {
  const error = toAppError(failure);
  const failureClass = classifyGenerationFailure(error);

  return {
    ...context,
    status: "failed",
    retryable: error.retryable,
    errorCode: error.code,
    errorCategory: error.category,
    failureClass,
    nextAttemptAt: nextGenerationAttemptAt(
      {
        failureClass,
        attempt: context.attempt,
        retryAfterMs: retryAfterMsOf(error),
        now: options.now ?? Date.now(),
      },
      options.policy,
      options.random,
    ),
  };
}

/**
 * A limiter's own instruction, read structurally rather than through
 * `instanceof RateLimitError`.
 *
 * `apps/web` compiles this package from source into more than one chunk graph
 * (§12), so two copies of that class can exist in one process and `instanceof`
 * would answer `false` across them — the reason `AppError` is branded with
 * `Symbol.for` in the first place. `@calepin/ai`'s `retry.ts` reads it the same
 * way, for the same reason.
 */
function retryAfterMsOf(error: unknown): number | undefined {
  const value = (error as { retryAfterMs?: unknown }).retryAfterMs;

  return typeof value === "number" ? value : undefined;
}
