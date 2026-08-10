/**
 * What a summarising mission is allowed to return (CAL-055, §6).
 *
 * The domain owns these schemas and the AI layer references them (§5.5): the
 * mission registry names `manuscript` as the owner of both summarising
 * missions' output, and the schema itself travels per call through
 * `StructuredGenerationRequest.schema`, so there is one of it and nothing to
 * drift.
 *
 * **The targets and the bounds are the same numbers.** The prompt asks for
 * about fifty words and about two hundred; the schema refuses an answer that is
 * wildly outside that. Stating the target in the prompt text and the bound here
 * would be two numbers that agree today, so the target is a variable the prompt
 * renders and this module owns it.
 *
 * **The bounds are in characters, and they are generous.** Characters because a
 * character bound is a `too_big` issue, and CAL-052's repair pass phrases its
 * clauses from issue *codes* — a `.refine` would come back as `custom` and the
 * re-ask would have nothing to say. Generous because the bound is not there to
 * enforce a word count: a fifty-five-word summary is a good summary, and
 * failing it would burn a repair pass on nothing. What it is there to refuse is
 * the answer that is not a summary at all — a model handed a chapter and asked
 * to compress it can return the chapter, and that answer would then be stored
 * as memory and replayed into the context of every later chapter, which is
 * exactly the §5.8 failure the composer's own ceilings exist to prevent one
 * layer up.
 */

import { CONTEXT_ITEM_CEILINGS, ESTIMATED_CHARS_PER_TOKEN } from "@calepin/ai";
import { z } from "zod";

/**
 * The lengths the prompts ask for, in words — the specification's own numbers.
 *
 * `part` matches `detailed` on purpose: a part summary stands in for several
 * chapters, so it is the detailed level of the coarse tier rather than a third
 * length nobody chose.
 */
export const SUMMARY_WORD_TARGETS = {
  brief: 50,
  detailed: 200,
  part: 200,
} as const;

/**
 * Roughly how many characters a French word costs, including its separator.
 *
 * Used only to turn the word targets above into the character bounds below, and
 * deliberately rounded up: this converts a *target* into a *ceiling*, so
 * erring high costs a slightly later refusal and erring low would reject good
 * answers.
 */
const CHARS_PER_WORD = 7;

/**
 * How far past its target an answer may run before it stops being a summary.
 *
 * Twice: a hundred-word "brief" summary is merely verbose and worth keeping,
 * and a four-hundred-word "detailed" one is unmistakably not the two hundred
 * that was asked for. The thing this refuses is an answer an order of magnitude
 * out, which is what a returned chapter looks like.
 *
 * It is also what keeps every bound below comfortably inside the composer's own
 * ceilings — see `CONTEXT_CHAR_CEILINGS`. Raising it narrows that margin, and
 * `schema.test.ts` fails when it closes.
 */
const OVERRUN_FACTOR = 2;

function ceilingFor(wordTarget: number): number {
  return Math.ceil(wordTarget * CHARS_PER_WORD * OVERRUN_FACTOR);
}

/** The character ceilings the schemas below enforce. */
export const SUMMARY_CHAR_CEILINGS = {
  brief: ceilingFor(SUMMARY_WORD_TARGETS.brief),
  detailed: ceilingFor(SUMMARY_WORD_TARGETS.detailed),
  part: ceilingFor(SUMMARY_WORD_TARGETS.part),
} as const;

/**
 * The ceilings the *composer* applies to the same strings, in characters.
 *
 * Derived from `@calepin/ai`'s own numbers rather than restated, so the
 * invariant that matters — a summary this schema accepts always fits the
 * context it was written for — is arithmetic over one source instead of two
 * constants somebody has to keep in step. `summary/schema.test.ts` asserts it.
 */
export const CONTEXT_CHAR_CEILINGS = {
  brief: CONTEXT_ITEM_CEILINGS.briefSummary * ESTIMATED_CHARS_PER_TOKEN,
  detailed: CONTEXT_ITEM_CEILINGS.detailedSummary * ESTIMATED_CHARS_PER_TOKEN,
  part: CONTEXT_ITEM_CEILINGS.partSummary * ESTIMATED_CHARS_PER_TOKEN,
} as const;

/** The answer to `summarize-chapter` — *résumé court* and *résumé détaillé*. */
export const chapterSummarySchema = z.strictObject({
  briefSummary: z.string().trim().min(1).max(SUMMARY_CHAR_CEILINGS.brief),
  detailedSummary: z.string().trim().min(1).max(SUMMARY_CHAR_CEILINGS.detailed),
});

export type ChapterSummary = z.infer<typeof chapterSummarySchema>;

/** The answer to `summarize-part`. */
export const partSummarySchema = z.strictObject({
  summary: z.string().trim().min(1).max(SUMMARY_CHAR_CEILINGS.part),
});

export type PartSummary = z.infer<typeof partSummarySchema>;
