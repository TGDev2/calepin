/**
 * The generation attempt lifecycle (CAL-010), made idempotent (CAL-058).
 *
 * One guarantee, expressed as one function: a generation either commits its
 * result through the single atomic write that completes it, or writes no result
 * at all and records why — and it does that **once**, however many times a
 * queue, a browser or a restarted worker delivers the same ask. Nothing here
 * knows what is being generated, what a chapter means or how a revision is
 * stored: the persistence is a port, and `@calepin/shared/repository` supplies
 * the implementation.
 *
 * Server-side only.
 */

export type {
  AttemptCompletion,
  GenerationClaim,
  GenerationClaimContext,
  GenerationClaimRefusal,
  GenerationPersistence,
  GenerationRun,
  GenerationSkipReason,
  RunGenerationAttemptOptions,
} from "./attempt";
export { GENERATION_CLAIM_REFUSALS, runGenerationAttempt } from "./attempt";
export {
  CAPACITY_RETRY_DELAY_MS,
  DEFAULT_PROJECT_GENERATION_CONCURRENCY_LIMIT,
  DEFAULT_USER_GENERATION_CONCURRENCY_LIMIT,
} from "./concurrency";
export type { GenerationKeyInput } from "./key";
export {
  GENERATION_KEY_PATTERN,
  generationIdempotencyKey,
  isGenerationIdempotencyKey,
} from "./key";
export type {
  AttemptContext,
  AttemptUsage,
  FailedAttemptOptions,
  GenerationAttemptOutcome,
  GenerationStatus,
} from "./outcome";
export { GENERATION_STATUSES, toFailedAttempt, toSucceededAttempt } from "./outcome";
export type { GenerationProgress } from "./progress";
export type {
  GenerationFailureClass,
  GenerationRetryDelayInput,
  GenerationRetryPolicy,
  NextGenerationAttemptInput,
} from "./retry";
export {
  classifyGenerationFailure,
  DEFAULT_GENERATION_RETRY_POLICY,
  GENERATION_FAILURE_CLASSES,
  generationRetryDelayMs,
  isRetriableFailureClass,
  MAX_GENERATION_ATTEMPTS,
  nextGenerationAttemptAt,
} from "./retry";
export type { GenerationWriteTarget, GenerationWriteTargetKind } from "./write-target";
export {
  GENERATION_WRITE_TARGET_KINDS,
  generationWriteTarget,
  isProjectWideWriteTarget,
  MISSION_WRITE_TARGET_KIND,
  missionsWritingTo,
  PROJECT_WIDE_WRITE_TARGET_KINDS,
  sameWriteTarget,
  WRITE_TARGET_RETRY_DELAY_MS,
} from "./write-target";
