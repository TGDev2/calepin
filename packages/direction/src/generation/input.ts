/**
 * The ask of `propose-directions` (CAL-210).
 *
 * One field, and the choice of that field is the whole design —
 * `analyzeSourceTextInputSchema`'s discipline, one stage down.
 * `Generation.input` is what `generationIdempotencyKey` digests, so what the ask
 * *names* decides when two requests are the same request, and what the
 * directions are argued out of is the text and the diagnostic of it.
 *
 * **The analysis is not named, because it cannot vary independently.** A project
 * has exactly one, this mission refuses to run until it is validated, and a
 * validated analysis is frozen — `editAnalysisSection`,
 * `regenerateAnalysisSection` and `writeGeneratedAnalysisWithin` all refuse one.
 * So the source-text version already determines the diagnostic the ask would
 * name, and a second identifier here could only ever repeat it — while costing
 * whoever reserves the generation a read to state something they cannot choose.
 *
 * Nothing else belongs here either. The language, the target readership, the
 * freedom level and the target length are columns the executor reads at run
 * time; an ask carrying copies of them would be a second answer able to disagree
 * with the project, and retuning any one of them would reopen every direction
 * ask ever made. The counts and word targets are the schema's own constants.
 *
 * `excludedEngines` is deliberately absent, unlike
 * `directionReplacementInputSchema`'s. There, the exclusions *are* the question
 * the author asked. Here they are produced and consumed inside one run of one
 * generation — the relaunch's working state, never the ask.
 */

import { z } from "zod";

export const proposeDirectionsInputSchema = z.strictObject({
  /** The `SourceTextVersion` the directions are argued out of. */
  sourceTextVersionId: z.string().min(1),
});

export type ProposeDirectionsInput = z.infer<typeof proposeDirectionsInputSchema>;

/**
 * Builds the ask a caller reserves a generation with.
 *
 * A function rather than an object literal at the call site, so the payload
 * `reserveGeneration` digests and the payload the executor parses are minted by
 * one piece of code (CAL-208's arrangement).
 */
export function proposeDirectionsAsk(sourceTextVersionId: string): ProposeDirectionsInput {
  return { sourceTextVersionId };
}
