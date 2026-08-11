/**
 * `@calepin/shared/text` — arithmetic over text, shared by every domain that
 * stores a measure of one, and by `apps/web` on both sides of the wire.
 *
 * CAL-041 makes that last clause load-bearing: the count a visitor watches in
 * the browser and the count the server stores must never disagree, which they
 * cannot as long as this module is the only implementation either can reach.
 */

export {
  FRENCH_WORD_COUNT_CORPUS,
  FRENCH_WORD_COUNT_CORPUS_WORDS,
  FRENCH_WORD_COUNT_FIXTURES,
  type WordCountFixture,
} from "./fixtures";
export {
  measureSourceText,
  SOURCE_TEXT_CAUTION_WORDS,
  SOURCE_TEXT_LIMIT_LEVELS,
  SOURCE_TEXT_MAX_WORDS,
  SOURCE_TEXT_WARNING_WORDS,
  type SourceTextLimitLevel,
  sourceTextLimitMessage,
  type SourceTextMeasure,
} from "./source-text-limit";
export { createVerbatimMatcher, sameWords, type VerbatimMatcher } from "./verbatim";
export { countWords, normalizeText } from "./word-count";
