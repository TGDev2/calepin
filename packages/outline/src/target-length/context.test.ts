import { describe, expect, it } from "vitest";

import { toNovelLengthChoice } from "./context";

describe("toNovelLengthChoice", () => {
  it("carries a preset through with no word count", () => {
    expect(toNovelLengthChoice({ targetLength: "SHORT", targetWordCount: null })).toEqual({
      targetLength: "SHORT",
    });
    expect(toNovelLengthChoice({ targetLength: "STANDARD", targetWordCount: null })).toEqual({
      targetLength: "STANDARD",
    });
    expect(toNovelLengthChoice({ targetLength: "LONG", targetWordCount: null })).toEqual({
      targetLength: "LONG",
    });
  });

  it("carries a custom choice through with its word count", () => {
    expect(toNovelLengthChoice({ targetLength: "CUSTOM", targetWordCount: 72_000 })).toEqual({
      targetLength: "CUSTOM",
      targetWordCount: 72_000,
    });
  });

  // The database CHECK (`projects_custom_target_word_count_check`) makes this
  // state unreachable through the repository; this only proves the one place
  // that would have to notice if it ever were.
  it("refuses a CUSTOM length read with no word count", () => {
    expect(() => toNovelLengthChoice({ targetLength: "CUSTOM", targetWordCount: null })).toThrow(
      /no word count/,
    );
  });
});
