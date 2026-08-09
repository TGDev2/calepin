import { describe, expect, it } from "vitest";

import { countWords, normalizeText } from "./word-count";

/**
 * Every fixture here is synthetic and technical (CLAUDE.md §9). What is under
 * test is arithmetic over tokens, and it needs no prose to be proven.
 *
 * **Every character this suite is actually about is named, never typed.** Four
 * of them are invisible, three more are indistinguishable from a character
 * that must behave differently (U+2011 from a hyphen, U+02BC from an
 * apostrophe, U+2013 from U+2014), and a decomposed accent renders exactly
 * like a composed one. An assertion written with the character itself is an
 * assertion nobody can review — and one the next editor to touch the file can
 * silently break by normalising it away.
 */

/** Whitespace `\s` already covers — French typography's two non-breaking spaces. */
const NBSP = String.fromCodePoint(0x00a0);
const NARROW_NBSP = String.fromCodePoint(0x202f);

/** Zero-width: category `Format`, so `\s` does *not* cover them. */
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const ZERO_WIDTH_NON_JOINER = String.fromCodePoint(0x200c);
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);
const WORD_JOINER = String.fromCodePoint(0x2060);

/** Dashes that punctuate, as opposed to hyphens that join. */
const EN_DASH = String.fromCodePoint(0x2013);
const EM_DASH = String.fromCodePoint(0x2014);
const HORIZONTAL_BAR = String.fromCodePoint(0x2015);

/** Hyphens, which never separate two words. */
const NON_BREAKING_HYPHEN = String.fromCodePoint(0x2011);
const SOFT_HYPHEN = String.fromCodePoint(0x00ad);

/** Apostrophes, which never separate two words either. */
const TYPOGRAPHIC_APOSTROPHE = String.fromCodePoint(0x2019);
const REVERSED_APOSTROPHE = String.fromCodePoint(0x201b);
const MODIFIER_APOSTROPHE = String.fromCodePoint(0x02bc);

const ELLIPSIS = String.fromCodePoint(0x2026);

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
    expect(countWords(`l${TYPOGRAPHIC_APOSTROPHE}alpha`)).toBe(1);
  });

  it("does not count a token made only of punctuation", () => {
    expect(countWords(EM_DASH)).toBe(0);
    expect(countWords("...")).toBe(0);
    expect(countWords("* * *")).toBe(0);
    // The dash opening a line of dialogue is punctuation; what follows is not.
    expect(countWords(`${EM_DASH} alpha beta`)).toBe(2);
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

  /*
   * CAL-041 — the cases a French manuscript actually produces, and the ones
   * the pre-CAL-041 tokenizer under-counted.
   */

  it("treats every apostrophe a French keyboard produces as internal to the word", () => {
    for (const apostrophe of [
      "'",
      TYPOGRAPHIC_APOSTROPHE,
      REVERSED_APOSTROPHE,
      MODIFIER_APOSTROPHE,
    ]) {
      expect(countWords(`l${apostrophe}alpha`)).toBe(1);
      // Four elided tokens, four words — the reading a word processor gives.
      expect(countWords(`qu${apostrophe}il n${apostrophe}y a qu${apostrophe}un`)).toBe(4);
    }
  });

  it("splits on a punctuating dash, spaced or tight", () => {
    // Spaced already worked: the lone dash holds no letter or digit.
    expect(countWords(`${EM_DASH} Alpha, beta.`)).toBe(2);
    expect(countWords(`alpha ${EM_DASH} beta`)).toBe(2);

    // Tight — the incise set without spaces, which used to count as one word.
    for (const dash of [EN_DASH, EM_DASH, HORIZONTAL_BAR]) {
      expect(countWords(`alpha${dash}beta`)).toBe(2);
    }
  });

  it("never splits on a hyphen, whichever hyphen it is", () => {
    expect(countWords("rendez-vous")).toBe(1);
    expect(countWords(`rendez${NON_BREAKING_HYPHEN}vous`)).toBe(1);
    expect(countWords(`al${SOFT_HYPHEN}pha`)).toBe(1);
    expect(countWords("arrière-grand-père")).toBe(1);
  });

  it("splits on guillemets, tight or spaced with either non-breaking space", () => {
    expect(countWords("«alpha»")).toBe(1);
    expect(countWords(`«${NBSP}alpha${NBSP}»`)).toBe(1);
    expect(countWords(`«${NARROW_NBSP}alpha${NARROW_NBSP}»`)).toBe(1);
    // The narrow non-breaking space French sets before a double punctuation mark.
    expect(countWords(`«alpha${NARROW_NBSP}!»`)).toBe(1);
    expect(countWords("«alpha beta» gamma")).toBe(3);
    expect(countWords("‹alpha›")).toBe(1);
    // Curly double quotes behave like the straight ones.
    expect(countWords("“alpha”")).toBe(1);
    expect(countWords("„alpha‟")).toBe(1);
  });

  it("splits on suspension points in both spellings", () => {
    expect(countWords(`alpha${ELLIPSIS}beta`)).toBe(2);
    expect(countWords("alpha...beta")).toBe(2);
    expect(countWords("alpha..beta")).toBe(2);
    expect(countWords(`alpha${ELLIPSIS} beta`)).toBe(2);
    expect(countWords(`alpha${ELLIPSIS}`)).toBe(1);
    expect(countWords(ELLIPSIS)).toBe(0);
  });

  it("keeps a decimal whole — a single full stop is not suspension points", () => {
    expect(countWords("1.5")).toBe(1);
    expect(countWords("1,5")).toBe(1);
    expect(countWords("3.14 alpha")).toBe(2);
  });

  it("splits on a zero-width character, which whitespace does not cover", () => {
    // `\s` is Space_Separator; these are Format, so nothing but the separator
    // class catches them — and a word-processor paste is full of them.
    for (const invisible of [
      ZERO_WIDTH_SPACE,
      ZERO_WIDTH_NON_JOINER,
      ZERO_WIDTH_JOINER,
      WORD_JOINER,
    ]) {
      expect(countWords(`alpha${invisible}beta`)).toBe(2);
    }
  });

  it("splits on a slash or a pipe", () => {
    expect(countWords("alpha/beta")).toBe(2);
    expect(countWords("alpha\\beta")).toBe(2);
    expect(countWords("alpha|beta")).toBe(2);
  });

  it("counts a composed and a decomposed accent identically", () => {
    // NFC from a keyboard, NFD from a paste: same text, different bytes. The
    // decomposed form is derived rather than typed, so it is provably NFD.
    const composed = "éléphant à côté";
    const decomposed = composed.normalize("NFD");

    expect(decomposed).not.toBe(composed);
    expect(countWords(decomposed)).toBe(countWords(composed));
    expect(countWords(decomposed)).toBe(3);
  });
});

describe("normalizeText", () => {
  it("collapses every line ending to a single form", () => {
    // What a form submission does to a textarea, and what it must not change.
    expect(normalizeText("alpha\r\nbeta")).toBe("alpha\nbeta");
    expect(normalizeText("alpha\rbeta")).toBe("alpha\nbeta");
    expect(normalizeText("alpha\r\n\r\nbeta")).toBe("alpha\n\nbeta");
  });

  it("composes accents to NFC", () => {
    const composed = "éléphant";

    expect(normalizeText(composed.normalize("NFD"))).toBe(composed);
    expect(normalizeText(composed)).toBe(composed);
  });

  it("trims the surrounding whitespace and nothing inside", () => {
    expect(normalizeText("  alpha  beta \n")).toBe("alpha  beta");
    expect(normalizeText("")).toBe("");
    expect(normalizeText("   ")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeText(" éléphant\r\nà côté ".normalize("NFD"));

    expect(normalizeText(once)).toBe(once);
  });
});
