/**
 * What the verbatim matcher has to get right (CAL-071).
 *
 * Two failure modes, and they pull in opposite directions. Too strict, and a
 * genuine quotation is refused because a word processor put a curly apostrophe
 * where a model typed a straight one — the author loses a supported fact over a
 * character they cannot see. Too loose, and an invented passage is presented to
 * the author as their own writing. Every case below is one or the other.
 *
 * Characters the eye cannot separate — the invisibles, the non-breaking spaces,
 * the three dashes, the two forms of an accent — are written as `\u` escapes,
 * for the reason `word-count.ts` builds its class that way: a test asserting
 * something about a character it renders as a space asserts nothing, and the
 * next editor to touch the file cannot see what they removed.
 *
 * The fixtures are synthetic French sentences written for this file (§8): short,
 * from no source, nothing a reader could take for part of a novel.
 */

import { describe, expect, it } from "vitest";

import { FRENCH_WORD_COUNT_FIXTURES } from "./fixtures";
import { createVerbatimMatcher } from "./verbatim";

const EM_DASH = "\u2014";
const NBSP = "\u00A0";
const NARROW_NBSP = "\u202F";
const ZERO_WIDTH_SPACE = "\u200B";
const SOFT_HYPHEN = "\u00AD";
const BYTE_ORDER_MARK = "\uFEFF";
const COMBINING_GRAVE = "\u0300";

const TEXT = [
  "Le train partait à sept heures.",
  "Elle n'avait pas emporté de valise, seulement un carnet.",
  `${EM_DASH} Tu reviendras ? demanda-t-il.`,
  "Elle ne répondit pas.",
].join("\n");

const matches = createVerbatimMatcher(TEXT);

describe("createVerbatimMatcher", () => {
  it("finds a passage copied exactly", () => {
    expect(matches("Le train partait à sept heures.")).toBe(true);
    expect(matches("seulement un carnet")).toBe(true);
  });

  it("refuses a passage the text does not contain", () => {
    expect(matches("Le train partait à huit heures.")).toBe(false);
  });

  // The failure this whole module exists for: a model rewriting a sentence in
  // its own words and presenting it between quotation marks.
  it("refuses a paraphrase, however close", () => {
    expect(matches("Elle n'avait pas pris de valise, seulement un carnet.")).toBe(false);
    expect(matches("Elle ne répondit rien.")).toBe(false);
  });

  it("reads a typographic apostrophe and a typewriter one as the same", () => {
    expect(matches("Elle n’avait pas emporté de valise")).toBe(true);

    const typographic = createVerbatimMatcher("Elle n’avait pas emporté de valise.");

    expect(typographic("Elle n'avait pas emporté de valise")).toBe(true);
  });

  it("ignores the non-breaking spaces French typography inserts", () => {
    const spaced = createVerbatimMatcher(`Tu reviendras${NBSP}? Peut-être${NARROW_NBSP}: en mars.`);

    expect(spaced("Tu reviendras ?")).toBe(true);
    expect(spaced("Peut-être : en mars.")).toBe(true);
  });

  it("lets a quotation cross a line break", () => {
    expect(matches("Elle ne répondit pas.")).toBe(true);
    expect(matches("demanda-t-il. Elle ne répondit pas.")).toBe(true);
  });

  it("accepts the quotation marks a model wraps a citation in", () => {
    expect(matches("« seulement un carnet »")).toBe(true);
    expect(matches('"seulement un carnet"')).toBe(true);
    expect(matches("“seulement un carnet”")).toBe(true);
  });

  // A model truncating mid-sentence routinely capitalises the first word it
  // keeps. That is a retyping artefact, not a different passage.
  it("folds case", () => {
    expect(matches("Seulement un carnet")).toBe(true);
    expect(matches("LE TRAIN PARTAIT")).toBe(true);
  });

  it("reads a decomposed accent and a composed one as the same", () => {
    expect(matches(`partait a${COMBINING_GRAVE} sept heures`)).toBe(true);

    const decomposed = createVerbatimMatcher(`partait a${COMBINING_GRAVE} sept heures`);

    expect(decomposed("partait à sept heures")).toBe(true);
  });

  // The other side of the accent rule: composing them is a byte-level repair,
  // not a licence to ignore them. `ou` and `où` are two words.
  it("keeps accents significant", () => {
    const accented = createVerbatimMatcher("Elle ne savait pas où aller.");

    expect(accented("où aller")).toBe(true);
    expect(accented("ou aller")).toBe(false);
  });

  it("reads an em dash typed as a hyphen, and an ellipsis spelled with dots", () => {
    const punctuated = createVerbatimMatcher(`Il hésita${EM_DASH}longtemps… puis se tut.`);

    expect(punctuated("Il hésita-longtemps... puis se tut.")).toBe(true);
  });

  it("ignores an invisible character pasted in from a word processor", () => {
    expect(matches(`seulement${ZERO_WIDTH_SPACE} un${SOFT_HYPHEN} carnet`)).toBe(true);

    const invisible = createVerbatimMatcher(`${BYTE_ORDER_MARK}seulement un carnet`);

    expect(invisible("seulement un carnet")).toBe(true);
  });

  // The deliberate limit. Stitching the fragments of an elided quotation back
  // together is how a matcher starts finding passages nobody wrote, so the
  // prompt forbids the elision and this refuses it. A refusal costs a
  // reclassification, which is the safe direction.
  it("refuses an elided quotation", () => {
    expect(matches("Elle n'avait pas emporté de valise […] un carnet.")).toBe(false);
    expect(matches("Le train partait ... un carnet.")).toBe(false);
  });

  // Everything above, at once, against the corpus CAL-041 built to hold every
  // French typographic trap in one paragraph — read here as a text a model
  // retypes plainly: straight quotes, plain spaces, three dots, a hyphen.
  it("finds a passage of the typography corpus retyped plainly", () => {
    const mixed = FRENCH_WORD_COUNT_FIXTURES.at(-1)?.text ?? "";
    const corpus = createVerbatimMatcher(mixed);

    expect(corpus(`Alpha ! s'exclama-t-il. "Beta gamma", repondit l'autre...delta.`)).toBe(true);
    expect(corpus("Beta gamma")).toBe(true);
    expect(corpus("Beta delta")).toBe(false);
  });

  // What comparing word sequences buys over comparing substrings: a quotation
  // matches whole words or not at all.
  it("matches on word boundaries", () => {
    const inside = createVerbatimMatcher("Le passage était étroit.");

    expect(inside("pas")).toBe(false);
    expect(inside("passage")).toBe(true);
  });

  it("refuses a quotation that is nothing but the marks around it", () => {
    expect(matches("« »")).toBe(false);
    expect(matches("...")).toBe(false);
    expect(matches("")).toBe(false);
    expect(matches("   ")).toBe(false);
  });

  it("supports nothing when the text is empty", () => {
    const empty = createVerbatimMatcher("");

    expect(empty("seulement un carnet")).toBe(false);
    expect(empty("")).toBe(false);
  });

  // Presence, never sufficiency: one common word is found because it is there.
  // Whether it supports anything is a question no comparison can answer, and
  // the domain rule built on this one does not pretend otherwise.
  it("answers presence, not sufficiency", () => {
    expect(matches("pas")).toBe(true);
  });

  it("answers the same question the same way twice", () => {
    expect(matches("seulement un carnet")).toBe(true);
    expect(matches("seulement un carnet")).toBe(true);
  });
});
