/**
 * How a word is counted, once, for the whole product (CAL-033).
 *
 * Two columns already store one — `SourceTextVersion.wordCount` and
 * `ChapterRevision.wordCount` — and a third number is derived from them:
 * `Project.totalWordCount`, which the dashboard shows and which CAL-103 compares
 * against the novel's target length. Three call sites counting "about the same
 * way" is how a target of 80 000 words is reached twice, with two different
 * numbers, in two screens of the same application.
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
 * The number of words in a text. Whitespace-separated, punctuation-only tokens
 * excluded.
 *
 * An elision and a hyphenated name are one word each — `l'histoire`,
 * `rendez-vous` — because nothing splits inside a token. That is the reading a
 * French author expects of their word count, and it is the reading a word
 * processor gives.
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => HOLDS_A_CHARACTER.test(token)).length;
}
