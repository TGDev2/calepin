import { describe, expect, it } from "vitest";

import { countWords } from "./word-count";

/**
 * Every fixture here is synthetic and technical (CLAUDE.md §9). What is under
 * test is arithmetic over tokens, and it needs no prose to be proven.
 */
describe("countWords", () => {
  it("counts nothing in an empty or blank text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("\n\n\t")).toBe(0);
  });

  it("counts whitespace-separated tokens", () => {
    expect(countWords("alpha")).toBe(1);
    expect(countWords("alpha beta gamma")).toBe(3);
  });

  it("is unmoved by the shape of the whitespace", () => {
    expect(countWords("  alpha   beta  ")).toBe(2);
    expect(countWords("alpha\nbeta\tgamma\r\ndelta")).toBe(4);
    // A paragraph break is not a word.
    expect(countWords("alpha\n\n\nbeta")).toBe(2);
  });

  it("keeps an elision and a hyphenated token whole", () => {
    expect(countWords("l'alpha")).toBe(1);
    expect(countWords("alpha-beta")).toBe(1);
    expect(countWords("l'alpha-beta gamma")).toBe(2);
    // The typographic apostrophe reads the same as the typewriter one.
    expect(countWords("l’alpha")).toBe(1);
  });

  it("does not count a token made only of punctuation", () => {
    expect(countWords("—")).toBe(0);
    expect(countWords("...")).toBe(0);
    expect(countWords("* * *")).toBe(0);
    // The dash opening a line of dialogue is punctuation; what follows is not.
    expect(countWords("— alpha beta")).toBe(2);
  });

  it("counts a token carrying punctuation as the one word it is", () => {
    expect(countWords("alpha,")).toBe(1);
    expect(countWords("alpha ! beta ?")).toBe(2);
    expect(countWords('"alpha"')).toBe(1);
  });

  it("counts accented and non-latin tokens like any other", () => {
    expect(countWords("éléphant à côté")).toBe(3);
    expect(countWords("Ω δ")).toBe(2);
  });

  it("counts a number as a word", () => {
    expect(countWords("1789 alpha")).toBe(2);
  });
});
