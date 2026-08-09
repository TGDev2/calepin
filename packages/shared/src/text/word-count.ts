/**
 * How a word is counted, once, for the whole product (CAL-033, CAL-041).
 *
 * Two columns already store one — `SourceTextVersion.wordCount` and
 * `ChapterRevision.wordCount` — and a third number is derived from them:
 * `Project.totalWordCount`, which the dashboard shows and which CAL-103 compares
 * against the novel's target length. Three call sites counting "about the same
 * way" is how a target of 80 000 words is reached twice, with two different
 * numbers, in two screens of the same application.
 *
 * CAL-041 makes that a formal acceptance criterion — the count a visitor watches
 * in the browser and the count the server stores must never disagree — so this
 * file is the *only* implementation, and both sides reach it through
 * `@calepin/shared/text`. Nothing here is duplicated for the client.
 *
 * It lives in `@calepin/shared` rather than in a domain because it is not a
 * narrative rule: nothing here knows what a chapter *is*. It is arithmetic over
 * text, needed by the manuscript (a chapter revision) and by the analysis (a
 * source text version) alike, and a domain cannot import another domain
 * (CLAUDE.md §3.2).
 *
 * Pure, and no I/O — so it is unit-tested exhaustively rather than integration
 * tested (CLAUDE.md §8).
 */

/**
 * A token counts as a word when it holds at least one letter or digit.
 *
 * The alternative — every run of non-whitespace — counts the em dash opening a
 * line of dialogue, the ellipsis ending one, and the lone bullet of a scene
 * break as words. French prose is full of all three, so the difference is not a
 * rounding error: it is a manuscript reporting a few hundred words it does not
 * contain.
 */
const HOLDS_A_CHARACTER = /[\p{L}\p{N}]/u;

/**
 * What separates two words, beyond whitespace.
 *
 * JavaScript's `\s` already covers both non-breaking spaces French typography
 * relies on — U+00A0 before `!` `?` `;` `:` and inside guillemets, U+202F the
 * narrow variant — because both are `Space_Separator`. It does *not* cover the
 * zero-width characters, which are `Format`, nor any punctuation. So the class
 * below adds exactly the characters that can never sit *inside* a French word:
 *
 * - zero-width space, non-joiner, joiner and word joiner (U+200B–U+200D,
 *   U+2060) — invisible, and routinely pasted in from a word processor;
 * - the dashes used as punctuation rather than as a hyphen: em (U+2014), en
 *   (U+2013) and horizontal bar (U+2015). `alpha—beta`, the tight incise, is
 *   two words; a spaced `— ` opening a line of dialogue was already handled by
 *   the "holds a character" rule and still is;
 * - the ellipsis, in both spellings: the character (U+2026) and a run of two or
 *   more full stops. `Mais…c'est` and `Mais...c'est` are two words each;
 * - the guillemets (« » ‹ ›) and both straight and curly double quotes, so
 *   `«alpha»` set tight is the one word it contains;
 * - the slashes and the pipe.
 *
 * Deliberately absent, and this is the half that matters most in French:
 *
 * - **the apostrophes** — typewriter `'`, typographic `’`, reversed `‛`, and
 *   the modifier letter `ʼ` some keyboards produce. `l'histoire` is one word,
 *   which is what a French author expects and what a word processor gives;
 * - **the hyphens** — hyphen-minus, the non-breaking hyphen (U+2011) and the
 *   soft hyphen (U+00AD). `rendez-vous` is one word;
 * - **a single full stop**, so `1.5` and `1,5` stay one word. That is the whole
 *   reason the ellipsis rule is `\.{2,}` rather than `\.`.
 *
 * Built from `\u` escapes rather than from the characters themselves, and so
 * from a string rather than a regex literal: four members of this class are
 * invisible, and a class holding an invisible character is a class nobody can
 * review — or notice the loss of, the next time an editor rewrites the file.
 */
const WORD_SEPARATORS = new RegExp(
  "(?:[" +
    "\\s" + // whitespace, both non-breaking spaces included
    "\\u200B-\\u200D\\u2060" + // zero-width space, non-joiner, joiner, word joiner
    "\\u2013\\u2014\\u2015" + // en dash, em dash, horizontal bar
    "\\u2026" + // horizontal ellipsis
    "\\u00AB\\u00BB\\u2039\\u203A" + // guillemets, double and single
    '"\\u201C\\u201D\\u201E\\u201F' + // straight and curly double quotes
    "/\\\\|" + // slash, backslash, pipe
    "]|\\.{2,})+",
  "u",
);

/**
 * The number of words in a text. Separated by whitespace or by the punctuation
 * that can never sit inside a word; punctuation-only tokens excluded.
 *
 * An elision and a hyphenated name are one word each — `l'histoire`,
 * `rendez-vous` — because nothing splits inside a token. That is the reading a
 * French author expects of their word count, and it is the reading a word
 * processor gives.
 */
export function countWords(text: string): number {
  return text.split(WORD_SEPARATORS).filter((token) => HOLDS_A_CHARACTER.test(token)).length;
}

/**
 * The one canonical form of a text, applied before it is counted, displayed or
 * stored.
 *
 * Without it the browser gets a vote in the arithmetic. A `<textarea>` holds
 * `\n` while the visitor types and the counter reads that, but HTML form
 * submission normalises the same field to `\r\n`, so the server parses,
 * validates and stores a string the client never counted. Composed accents are
 * the same hazard from the other direction: a paste can arrive decomposed
 * (`e` + U+0301) where the keyboard produces the precomposed `é`, and the two
 * are equal as text but not as bytes.
 *
 * Line endings collapse to `\n`, accents compose to NFC, and the surrounding
 * whitespace goes — so the string that is counted is the same string that is
 * written to the column, and re-normalising an already-normalised text is a
 * no-op.
 */
export function normalizeText(text: string): string {
  return text.replace(/\r\n?/gu, "\n").normalize("NFC").trim();
}
