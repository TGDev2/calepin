/**
 * The summary output contract (CAL-055, §6).
 *
 * Two things are worth asserting here and neither is "Zod validates strings".
 * The first is the invariant that ties this schema to the layer above it: an
 * answer this schema accepts must fit the context it was written for, or the
 * product stores memory it can never read. The second is what the bound is for
 * — refusing the answer that is not a summary at all.
 */

import { CONTEXT_ITEM_CEILINGS, ESTIMATED_CHARS_PER_TOKEN } from "@calepin/ai";
import { describe, expect, it } from "vitest";

import {
  chapterSummarySchema,
  CONTEXT_CHAR_CEILINGS,
  partSummarySchema,
  SUMMARY_CHAR_CEILINGS,
  SUMMARY_WORD_TARGETS,
} from "./schema";

/** A synthetic French-shaped string of a given length. No literary content. */
function filler(chars: number): string {
  return "resume ".repeat(Math.ceil(chars / 7)).slice(0, chars);
}

describe("the summary schemas", () => {
  it("asks for the two lengths the specification names", () => {
    expect(SUMMARY_WORD_TARGETS.brief).toBe(50);
    expect(SUMMARY_WORD_TARGETS.detailed).toBe(200);
  });

  it("accepts a summary of about the length that was asked for", () => {
    const parsed = chapterSummarySchema.safeParse({
      briefSummary: filler(SUMMARY_WORD_TARGETS.brief * 7),
      detailedSummary: filler(SUMMARY_WORD_TARGETS.detailed * 7),
    });

    expect(parsed.success).toBe(true);
  });

  // The bound is not a word count. A summary that overshoots its target by half
  // is a good summary and failing it would burn a repair pass on nothing.
  it("accepts an answer that overshoots its target by half", () => {
    const parsed = chapterSummarySchema.safeParse({
      briefSummary: filler(Math.round(SUMMARY_WORD_TARGETS.brief * 7 * 1.5)),
      detailedSummary: filler(Math.round(SUMMARY_WORD_TARGETS.detailed * 7 * 1.5)),
    });

    expect(parsed.success).toBe(true);
  });

  it("refuses one that overshoots it several times over", () => {
    const parsed = chapterSummarySchema.safeParse({
      briefSummary: filler(SUMMARY_WORD_TARGETS.brief * 7 * 3),
      detailedSummary: filler(SUMMARY_WORD_TARGETS.detailed * 7),
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["briefSummary"]);
  });

  // What it *is* for: a model handed a chapter and asked to compress it can
  // return the chapter. Stored, that answer becomes the memory replayed into
  // the context of every later chapter — the §5.8 failure, one layer down.
  it("refuses a chapter returned in place of a summary", () => {
    const chapter = filler(2_000 * 7);
    const parsed = chapterSummarySchema.safeParse({
      briefSummary: chapter,
      detailedSummary: chapter,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.code)).toEqual(["too_big", "too_big"]);
  });

  // The repair pass phrases its clauses from issue *codes* (CAL-052), so the
  // bound has to produce a standard one. A `.refine` would come back `custom`
  // and the targeted re-ask would have nothing to say.
  it("fails with a code the repair pass can phrase", () => {
    const parsed = partSummarySchema.safeParse({ summary: filler(SUMMARY_CHAR_CEILINGS.part + 1) });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.code).toBe("too_big");
  });

  it("refuses an empty summary and an extra field", () => {
    expect(partSummarySchema.safeParse({ summary: "   " }).success).toBe(false);
    expect(partSummarySchema.safeParse({ summary: "Résumé.", extra: 1 }).success).toBe(false);
  });

  /**
   * The load-bearing one. `composeSceneContext` refuses an item over its
   * per-kind ceiling, so a summary this schema accepts and the composer refuses
   * would be stored, unreadable, and only discovered when a later chapter fails
   * to compose. Derived from `@calepin/ai`'s own numbers, so this compares two
   * views of one source rather than two constants.
   */
  it("never accepts a summary the context composer would refuse", () => {
    for (const level of ["brief", "detailed", "part"] as const) {
      expect(SUMMARY_CHAR_CEILINGS[level], level).toBeLessThan(CONTEXT_CHAR_CEILINGS[level]);
    }
  });

  it("reads those context ceilings off the AI layer rather than restating them", () => {
    expect(CONTEXT_CHAR_CEILINGS).toEqual({
      brief: CONTEXT_ITEM_CEILINGS.briefSummary * ESTIMATED_CHARS_PER_TOKEN,
      detailed: CONTEXT_ITEM_CEILINGS.detailedSummary * ESTIMATED_CHARS_PER_TOKEN,
      part: CONTEXT_ITEM_CEILINGS.partSummary * ESTIMATED_CHARS_PER_TOKEN,
    });
  });
});
