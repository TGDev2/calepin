/**
 * The guarantee: a failed generation leaves the project valid and replayable,
 * and nothing the system does to it is ever paid for twice.
 *
 * CLAUDE.md §7 states the first half and ADR-001 explains why it holds — the
 * write path for narrative entities is append-only. A successful generation
 * appends a `Revision` linked to its `Generation`; a failed one writes its
 * `Generation` record and nothing else, so the previous revision remains the
 * visible, valid state. Retries are safe by construction: they can add a
 * revision, they cannot corrupt one.
 *
 * CAL-058 adds the second half, and it changes the shape of this function. The
 * sequence is no longer "start, produce, commit" but:
 *
 *   claim ──► refused(already-succeeded | already-failed | cancelled | in-flight)
 *         │        └─► nothing runs, nothing is asked of a provider, nothing is paid
 *         └─► claimed(attempt) ──► produce ──► succeed  (one atomic write)
 *                                        └──► fail     (no result written, ever)
 *
 * **The claim is the whole idea.** A queue that redelivers a job, a worker that
 * restarts, an action replayed by a browser: all three arrive here as a second
 * call for a generation that may already be finished, may still be running
 * somewhere else, or may be genuinely owed another try. Only the persistence
 * can tell those apart, because only the database sees every worker at once —
 * so it decides, and it allocates the attempt number while it does. The caller
 * no longer names one. That deleted parameter *is* the fix: a redelivered job
 * that picked `attempt: 1` again would have written a second cost line for a
 * call the first delivery already paid for.
 *
 * **Resuming means not re-running.** A generation already `SUCCEEDED` is
 * refused with `already-succeeded`, which is a success of this function and not
 * a failure of it: the work is done, the revision is in place, and the second
 * delivery costs one `SELECT`. That is *reprise sans réexécution*, at the
 * granularity a mission call has. Across a costly operation's several calls
 * (CAL-057) it is the same mechanism one level up: each call is reserved under
 * its own idempotency key, so resuming an interrupted operation re-reserves the
 * phases it already completed and gets them back rather than running them.
 *
 * The three writes are an injected port; `@calepin/shared/repository`'s
 * `createGenerationPersistence` is the implementation over PostgreSQL, and
 * CAL-060 wires it to a queue. Injecting it is also what lets CAL-189 test the
 * guarantee without a database, per §8.
 *
 * **The contract for an implementer of `GenerationPersistence`:**
 *
 * - `claim` is atomic. Two workers claiming the same generation at the same
 *   moment must not both come away with an attempt, and neither may invent an
 *   attempt number the other also chose.
 * - `succeed` is a *single* atomic operation. It appends the revision and
 *   completes the generation together, in one transaction. Splitting it in two
 *   reintroduces the window this function exists to close — a revision with no
 *   generation marking it accepted.
 * - `succeed` and `fail` apply to an attempt that is still running, and answer
 *   `already-completed` when it is not. Reporting rather than throwing is what
 *   lets a duplicate delivery end quietly; writing anyway is what would double
 *   the cost.
 *
 * Server-side only: it logs, and the logger reads `node:async_hooks`.
 */

import { errorLogFields, fail, type Result, succeed, toAppError } from "../errors";
import { logger } from "../logging";
import {
  type AttemptContext,
  type AttemptUsage,
  type GenerationAttemptOutcome,
  toFailedAttempt,
  toSucceededAttempt,
} from "./outcome";
import type { GenerationProgress } from "./progress";
import type { GenerationRetryPolicy } from "./retry";

/**
 * Why a claim did not open an attempt. Every one of them is an ordinary state
 * of the world under a queue, never a fault: the first three say the task is
 * over, the fourth says someone else is on it.
 */
export const GENERATION_CLAIM_REFUSALS = [
  "already-succeeded",
  "already-failed",
  "cancelled",
  "in-flight",
] as const;

export type GenerationClaimRefusal = (typeof GENERATION_CLAIM_REFUSALS)[number];

/**
 * A refusal, plus the one thing that can only be learnt after the work was
 * done: `superseded` — the attempt was reclaimed as expired while it ran, and
 * another one has completed the generation since. Its answer is discarded.
 */
export type GenerationSkipReason = GenerationClaimRefusal | "superseded";

export type GenerationClaim =
  | { readonly kind: "claimed"; readonly attempt: number }
  | {
      readonly kind: "refused";
      readonly reason: GenerationClaimRefusal;
      /** The attempt the refusal is about, when there is one. */
      readonly attempt?: number;
    };

/** Whether a completion moved a row, or found the attempt already closed. */
export type AttemptCompletion = "applied" | "already-completed";

export interface GenerationClaimContext {
  readonly generationId: string;
  /**
   * The version of the prompt the attempt is about to run (CAL-053). Recorded
   * by the claim, **before** the model is called, so an attempt whose worker
   * died is attributable to a prompt too.
   */
  readonly promptVersion?: number;
}

/** What one call of `runGenerationAttempt` ended up doing. */
export type GenerationRun<T> =
  | { readonly kind: "produced"; readonly attempt: number; readonly value: T }
  | {
      readonly kind: "skipped";
      readonly reason: GenerationSkipReason;
      readonly attempt?: number;
    };

export interface GenerationPersistence<T> {
  /**
   * Decides whether an attempt is owed, and opens one if it is. Atomic, and the
   * only place an attempt number is chosen.
   */
  claim(context: GenerationClaimContext): Promise<GenerationClaim> | GenerationClaim;
  /** One atomic write: append the revision *and* complete the generation. */
  succeed(
    value: T,
    outcome: GenerationAttemptOutcome,
  ): Promise<AttemptCompletion> | AttemptCompletion;
  /** Completes the generation as failed. Writes no result, by construction. */
  fail(outcome: GenerationAttemptOutcome): Promise<AttemptCompletion> | AttemptCompletion;
}

export interface RunGenerationAttemptOptions<T> {
  generationId: string;
  promptVersion?: number;
  /**
   * The model call and the validation of its output. Never persists.
   *
   * It receives `report`, and calls it as soon as a provider has reported
   * usage — on the way to a failure as much as on the way to an answer, since a
   * call billed before its answer was rejected still cost what it cost. A
   * second call *states* the total again; it does not add to it.
   *
   * It also receives `reportProgress` (CAL-062), the same shape one level
   * over: a named step and an indicative percentage, for a screen watching
   * this generation. Unlike `report`, a call reaches `onProgress` immediately
   * rather than being read back at completion — a percentage nobody sees
   * until the work is done is not progress.
   */
  produce: (
    report: (usage: AttemptUsage) => void,
    reportProgress: (progress: GenerationProgress) => void,
  ) => Promise<Result<T>> | Result<T>;
  persist: GenerationPersistence<T>;
  /**
   * Best-effort sink for `reportProgress` (CAL-062). Never awaited and never
   * allowed to fail the attempt: a progress update is display, not the
   * result, so a caller that wants it persisted takes care of its own errors
   * rather than have one turn a working generation into a failed one.
   */
  onProgress?: (
    progress: GenerationProgress,
    context: { generationId: string; attempt: number },
  ) => void;
  /**
   * The backoff a retryable failure earns (CAL-063). Injectable so a test can
   * assert a deadline rather than a range; the default is the shipped policy.
   */
  retryPolicy?: GenerationRetryPolicy;
  /** Injected clock (§8). */
  now?: () => number;
  /** Injected jitter (§8), for the backoff above. */
  random?: () => number;
}

export async function runGenerationAttempt<T>(
  options: RunGenerationAttemptOptions<T>,
): Promise<Result<GenerationRun<T>>> {
  const {
    generationId,
    promptVersion,
    produce,
    persist,
    onProgress,
    retryPolicy,
    now = () => Date.now(),
    random,
  } = options;

  let claim: GenerationClaim;

  try {
    claim = await persist.claim({ generationId, promptVersion });
  } catch (error: unknown) {
    // Nothing has run and nothing has been written. There is no attempt to mark
    // as failed — reporting the failure to the caller is the whole answer.
    return fail(toAppError(error));
  }

  if (claim.kind === "refused") {
    // Deliberately not a log line of its own: a redelivery is the normal
    // working of a queue, and one line per redelivery buys noise. The caller
    // has the reason and decides whether it is worth saying anything.
    return succeed({ kind: "skipped", reason: claim.reason, attempt: claim.attempt });
  }

  const attempt = claim.attempt;
  const startedAt = now();

  let usage: AttemptUsage | undefined;
  const report = (reported: AttemptUsage): void => {
    usage = reported;
  };

  const reportProgress = (progress: GenerationProgress): void => {
    onProgress?.(progress, { generationId, attempt });
  };

  const context = (): AttemptContext => ({
    generationId,
    attempt,
    promptVersion,
    durationMs: now() - startedAt,
    usage,
  });

  /**
   * The failure, classified and with its retry scheduled (CAL-063). The clock is
   * this function's own injected one, so a test that fixes time sees a deadline
   * it can predict rather than one read off the wall.
   */
  const failedAttempt = (failure: unknown): GenerationAttemptOutcome =>
    toFailedAttempt(failure, context(), { now: now(), policy: retryPolicy, random });

  let produced: Result<T>;

  try {
    produced = await produce(report, reportProgress);
  } catch (error: unknown) {
    produced = fail(toAppError(error));
  }

  if (!produced.ok) {
    await recordFailure(persist, failedAttempt(produced.error));

    return produced;
  }

  let completion: AttemptCompletion;

  try {
    completion = await persist.succeed(produced.value, toSucceededAttempt(context()));
  } catch (error: unknown) {
    const appError = toAppError(error);
    await recordFailure(persist, failedAttempt(appError));

    return fail(appError);
  }

  if (completion === "already-completed") {
    // Our lease expired while the call was in flight, someone reclaimed the
    // attempt, and the generation has been completed since. The answer is
    // dropped rather than written beside theirs — two revisions and two cost
    // lines for one ask is exactly what this task forbids. The tokens this call
    // did spend are unrecordable, which under-counts; that is the safe
    // direction, and the only one the specification names.
    logger.warn("generation.attempt-superseded", { generationId, attempt });

    return succeed({ kind: "skipped", reason: "superseded", attempt });
  }

  return succeed({ kind: "produced", attempt, value: produced.value });
}

/**
 * If recording the failure itself fails, the generation stays `running` and the
 * caller still learns why the attempt failed. That is the right trade: the
 * original cause is the useful one, and a row left `running` is exactly the
 * state the next claim reclaims. Swallowing it silently would not be — hence
 * the log line.
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
