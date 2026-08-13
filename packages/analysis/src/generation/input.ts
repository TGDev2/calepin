/**
 * The ask of `analyze-source-text` (CAL-208).
 *
 * One field, and the choice of that field is the whole design. `Generation.input`
 * is what `generationIdempotencyKey` digests, so what the ask *names* decides
 * when two requests are the same request. Naming the source-text **version**
 * makes the answer exactly right in both directions: asking again for a text
 * nobody has touched is the same ask and costs one `SELECT`, and asking after
 * an edit is a different ask and runs.
 *
 * Nothing else belongs here. The project's language and target readership are
 * columns the executor reads at run time, not parameters of the request: an ask
 * that carried a copy of them would be a second answer able to disagree with
 * the project, and retuning the readership would reopen every analysis ask ever
 * made. The word targets are the schema's own constants. What is left is the
 * one thing that identifies which text is being diagnosed.
 */

import { z } from "zod";

export const analyzeSourceTextInputSchema = z.strictObject({
  /** The `SourceTextVersion` this diagnostic is asked of, and attributed to. */
  sourceTextVersionId: z.string().min(1),
});

export type AnalyzeSourceTextInput = z.infer<typeof analyzeSourceTextInputSchema>;

/**
 * Builds the ask a caller reserves a generation with.
 *
 * A function rather than an object literal at the call site, so the payload
 * `reserveGeneration` digests and the payload the executor parses are minted by
 * one piece of code — the shape `generationIdempotencyKey`'s own doc comment
 * asks for when it says the key is derived from the row's columns and never
 * supplied.
 */
export function analyzeSourceTextAsk(sourceTextVersionId: string): AnalyzeSourceTextInput {
  return { sourceTextVersionId };
}
