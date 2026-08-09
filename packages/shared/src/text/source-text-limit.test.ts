import { describe, expect, it } from "vitest";

import {
  measureSourceText,
  SOURCE_TEXT_CAUTION_WORDS,
  SOURCE_TEXT_MAX_WORDS,
  SOURCE_TEXT_WARNING_WORDS,
  sourceTextLimitMessage,
} from "./source-text-limit";

/** A text of exactly `count` words, synthetic and technical (CLAUDE.md §9). */
function wordsOfLength(count: number): string {
  return Array.from({ length: count }, (_unused, index) => `mot${index}`).join(" ");
}

describe("measureSourceText", () => {
  it("agrees with the schema's own ceiling", () => {
    // `source_text_versions_word_count_check` is `<= 2000`. If this ever
    // disagrees, the UI accepts a text the database refuses.
    expect(SOURCE_TEXT_MAX_WORDS).toBe(2000);
    expect(SOURCE_TEXT_CAUTION_WORDS).toBe(1500);
    expect(SOURCE_TEXT_WARNING_WORDS).toBe(1800);
  });

  it.each([
    { wordCount: 0, level: "ok" },
    { wordCount: 1, level: "ok" },
    { wordCount: SOURCE_TEXT_CAUTION_WORDS - 1, level: "ok" },
    { wordCount: SOURCE_TEXT_CAUTION_WORDS, level: "caution" },
    { wordCount: SOURCE_TEXT_WARNING_WORDS - 1, level: "caution" },
    { wordCount: SOURCE_TEXT_WARNING_WORDS, level: "warning" },
    { wordCount: SOURCE_TEXT_MAX_WORDS - 1, level: "warning" },
    { wordCount: SOURCE_TEXT_MAX_WORDS, level: "warning" },
    { wordCount: SOURCE_TEXT_MAX_WORDS + 1, level: "over" },
  ])("ranks $wordCount words as $level", ({ wordCount, level }) => {
    const measure = measureSourceText(wordsOfLength(wordCount));

    expect(measure.wordCount).toBe(wordCount);
    expect(measure.level).toBe(level);
  });

  it("accepts the limit itself and refuses one word past it", () => {
    expect(measureSourceText(wordsOfLength(SOURCE_TEXT_MAX_WORDS)).isOverLimit).toBe(false);
    expect(measureSourceText(wordsOfLength(SOURCE_TEXT_MAX_WORDS + 1)).isOverLimit).toBe(true);
  });

  it("reports what is left, and by how much a text overflows", () => {
    expect(measureSourceText(wordsOfLength(1_200)).remaining).toBe(800);
    expect(measureSourceText(wordsOfLength(SOURCE_TEXT_MAX_WORDS)).remaining).toBe(0);
    expect(measureSourceText(wordsOfLength(SOURCE_TEXT_MAX_WORDS + 7)).remaining).toBe(-7);
  });

  it("normalizes before counting, so the browser's line endings do not vote", () => {
    // The client counts a textarea holding `\n`; the server parses the same
    // field submitted as `\r\n`. One number, or the acceptance criterion fails.
    const asTyped = "alpha\nbeta\ngamma";
    const asSubmitted = "alpha\r\nbeta\r\ngamma";

    expect(measureSourceText(asSubmitted)).toEqual(measureSourceText(asTyped));
  });

  it("ignores the whitespace around a text", () => {
    expect(measureSourceText("  alpha beta \n\n").wordCount).toBe(2);
    expect(measureSourceText("").wordCount).toBe(0);
    expect(measureSourceText("   ").wordCount).toBe(0);
  });
});

describe("sourceTextLimitMessage", () => {
  it("says nothing at or below the limit", () => {
    expect(sourceTextLimitMessage(0)).toBeNull();
    expect(sourceTextLimitMessage(SOURCE_TEXT_MAX_WORDS - 1)).toBeNull();
    expect(sourceTextLimitMessage(SOURCE_TEXT_MAX_WORDS)).toBeNull();
  });

  it("states both the ceiling and the actual count past it", () => {
    // Without the actual count, "too long" leaves someone deleting sentences
    // at random to find out how much too long.
    const message = sourceTextLimitMessage(SOURCE_TEXT_MAX_WORDS + 1);

    expect(message).toContain("2000");
    expect(message).toContain("2001");
    expect(message).toBe("Le texte source dépasse la limite de 2000 mots (actuellement 2001).");
  });
});
