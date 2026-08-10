/**
 * The guarantee: a failed generation leaves the project valid and replayable.
 *
 * CLAUDE.md §7 states it and ADR-001 explains why it holds — the write path for
 * narrative entities is append-only. A successful generation appends a
 * `Revision` linked to its `Generation`; a failed one writes its `Generation`
 * record and nothing else, so the previous revision remains the visible, valid
 * state. Retries are safe by construction: they can add a revision, they cannot
 * corrupt one.
 *
 * `runGenerationAttempt` is that sequence, and only that sequence:
 *
 *   start ──► produce ──► succeed        (one atomic write)
 *               └───────► fail           (no result written, ever)
 *
 * The three writes are an injected port. No `Generation` table exists yet
 * (CLAUDE.md §13) — CAL-011 and CAL-060 supply the implementation, and the
 * shape above is what they have to satisfy. Injecting it is also what lets
 * CAL-189 test the guarantee without a database, per §8.
 *
 * **The contract for an implementer of `GenerationPersistence`:**
 *
 * - `succeed` is a *single* atomic operation. It appends the revision and
 *   completes the generation together, in one transaction. Splitting it in two
 *   reintroduces the window this function exists to close — a revision with no
 *   generation marking it accepted.
 * - `succeed` and `fail` are idempotent for a given `(generationId, attempt)`.
 *   BullMQ may redeliver a job whose work already completed; ADR-001 allows
 *   that precisely because the write path tolerates it.
 *
 * Server-side only: it logs, and the logger reads `node:async_hooks`.
 */

import { errorLogFields, fail, type Result, toAppError } from "../errors";
import { logger } from "../logging";
import {
  type AttemptContext,
  type GenerationAttemptOutcome,
  toFailedAttempt,
  toSucceededAttempt,
} from "./outcome";

export interface GenerationPersistence<T> {
  /**
   * Records the attempt as running, **before** the model is called. A worker
   * that dies mid-generation therefore leaves a visible row rather than
   * silence, which is what makes the attempt replayable rather than lost.
   */
  start(context: Omit<AttemptContext, "durationMs">): Promise<void> | void;
  /** One atomic write: append the revision *and* complete the generation. */
  succeed(value: T, outcome: GenerationAttemptOutcome): Promise<void> | void;
  /** Completes the generation as failed. Writes no result, by construction. */
  fail(outcome: GenerationAttemptOutcome): Promise<void> | void;
}

export interface RunGenerationAttemptOptions<T> {
  generationId: string;
  /** 1 for the first try. */
  attempt?: number;
  /**
   * The version of the prompt `produce` is about to run (CAL-053). Passed to
   * `start`, so an attempt that never returns is still attributable to the
   * prompt that produced it.
   */
  promptVersion?: number;
  /** The model call and the validation of its output. Never persists. */
  produce: () => Promise<Result<T>> | Result<T>;
  persist: GenerationPersistence<T>;
  /** Injected clock (§8). */
  now?: () => number;
}

export async function runGenerationAttempt<T>(
  options: RunGenerationAttemptOptions<T>,
): Promise<Result<T>> {
  const {
    generationId,
    attempt = 1,
    promptVersion,
    produce,
    persist,
    now = () => Date.now(),
  } = options;

  const startedAt = now();
  const context = (): AttemptContext => ({
    generationId,
    attempt,
    promptVersion,
    durationMs: now() - startedAt,
  });

  try {
    await persist.start({ generationId, attempt, promptVersion });
  } catch (error: unknown) {
    // Nothing has run and nothing has been written. There is no generation to
    // mark as failed — reporting the failure to the caller is the whole answer.
    return fail(toAppError(error));
  }

  let produced: Result<T>;

  try {
    produced = await produce();
  } catch (error: unknown) {
    produced = fail(toAppError(error));
  }

  if (!produced.ok) {
    await recordFailure(persist, toFailedAttempt(produced.error, context()));
    return produced;
  }

  try {
    await persist.succeed(produced.value, toSucceededAttempt(context()));
  } catch (error: unknown) {
    const appError = toAppError(error);
    await recordFailure(persist, toFailedAttempt(appError, context()));
    return fail(appError);
  }

  return produced;
}

/**
 * If recording the failure itself fails, the generation stays `running` and the
 * caller still learns why the attempt failed. That is the right trade: the
 * original cause is the useful one, and a row left `running` is exactly the
 * state a replay looks for. Swallowing it silently would not be — hence the
 * log line.
 */
async function recordFailure<T>(
  persist: GenerationPersistence<T>,
  outcome: GenerationAttemptOutcome,
): Promise<void> {
  try {
    await persist.fail(outcome);
  } catch (error: unknown) {
    logger.error("generation.outcome-not-recorded", {
      generationId: outcome.generationId,
      attempt: outcome.attempt,
      ...errorLogFields(error),
    });
  }
}
