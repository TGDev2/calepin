/**
 * The generation attempt lifecycle (CAL-010).
 *
 * One guarantee, expressed as one function: a generation either commits its
 * result through the single atomic write that completes it, or writes no result
 * at all and records why. Nothing here knows what is being generated, what a
 * chapter means or how a revision is stored — the persistence is a port, and
 * CAL-011/CAL-060 supply it.
 *
 * Server-side only.
 */

export type { GenerationPersistence, RunGenerationAttemptOptions } from "./attempt";
export { runGenerationAttempt } from "./attempt";
export type { AttemptContext, GenerationAttemptOutcome, GenerationStatus } from "./outcome";
export { GENERATION_STATUSES, toFailedAttempt, toSucceededAttempt } from "./outcome";
