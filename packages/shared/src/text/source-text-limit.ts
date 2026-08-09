/**
 * The 2 000-word ceiling on a source text, and how close a text is to it
 * (CAL-041).
 *
 * The number is a formal MVP acceptance criterion, and it is asserted in four
 * places: the counter under the wizard's textarea, the validation the wizard
 * gates each step with, the same validation re-run by the server action, and
 * the repository write itself — with `source_text_versions_word_count_check`
 * behind all four as the database's own last line. Four assertions of one
 * number is exactly how a limit ends up being 2 000 in one screen and 2 048 in
 * another, so the number, the thresholds and the sentence a visitor reads all
 * live here and nowhere else.
 *
 * It sits in `@calepin/shared/text` beside `countWords` for the same reason
 * that function does: it is a measure of text, not a narrative rule, and both
 * the interface layer and the repository need it. The French sentence is here
 * rather than in `apps/web` because the repository raises it too, and
 * `@calepin/shared/errors` already establishes that a user-facing French
 * message can live in this package (CLAUDE.md §7).
 */

import { countWords, normalizeText } from "./word-count";

/** The ceiling. Mirrored by `source_text_versions_word_count_check` in the schema. */
export const SOURCE_TEXT_MAX_WORDS = 2000;

/**
 * How close a text is to the ceiling.
 *
 * A rank, not a score — the same choice `QualityIssueSeverity` makes. The UI
 * turns it into a colour and a sentence; nothing arithmetic is derived from it.
 */
export const SOURCE_TEXT_LIMIT_LEVELS = ["ok", "caution", "warning", "over"] as const;

export type SourceTextLimitLevel = (typeof SOURCE_TEXT_LIMIT_LEVELS)[number];

/**
 * Where each level begins, as a share of the ceiling.
 *
 * 75 % is where a 2 000-word budget starts being worth mentioning at all, and
 * 90 % is where a visitor still has room to finish a paragraph but should stop
 * planning another one. Below `caution` the counter says nothing but the
 * count — a warning shown from the first word is a warning nobody reads.
 */
export const SOURCE_TEXT_CAUTION_WORDS = Math.floor(SOURCE_TEXT_MAX_WORDS * 0.75);
export const SOURCE_TEXT_WARNING_WORDS = Math.floor(SOURCE_TEXT_MAX_WORDS * 0.9);

export interface SourceTextMeasure {
  /** Counted by `countWords` over the normalized text, never supplied. */
  readonly wordCount: number;
  /** Words still available. Negative past the ceiling, by exactly the overflow. */
  readonly remaining: number;
  readonly level: SourceTextLimitLevel;
  readonly isOverLimit: boolean;
}

function levelFor(wordCount: number): SourceTextLimitLevel {
  if (wordCount > SOURCE_TEXT_MAX_WORDS) return "over";
  if (wordCount >= SOURCE_TEXT_WARNING_WORDS) return "warning";
  if (wordCount >= SOURCE_TEXT_CAUTION_WORDS) return "caution";
  return "ok";
}

/**
 * Everything the counter, the validator and the repository each need to know
 * about one text, computed once from one string.
 *
 * It normalizes before counting rather than trusting the caller to have done
 * it, so the browser's `\n` and the form submission's `\r\n` cannot produce two
 * different answers for what the visitor sees as one text.
 */
export function measureSourceText(text: string): SourceTextMeasure {
  const wordCount = countWords(normalizeText(text));

  return {
    wordCount,
    remaining: SOURCE_TEXT_MAX_WORDS - wordCount,
    level: levelFor(wordCount),
    isOverLimit: wordCount > SOURCE_TEXT_MAX_WORDS,
  };
}

/**
 * The one sentence a visitor reads when a text is refused, or `null` when it is
 * not refused.
 *
 * It states both the ceiling and the actual count, because "too long" without a
 * number leaves someone deleting sentences at random to find out how much too
 * long. Takes a count rather than a text so every layer that has already
 * counted — the counter, the validator, the repository — raises the identical
 * string instead of counting a second time.
 */
export function sourceTextLimitMessage(wordCount: number): string | null {
  if (wordCount <= SOURCE_TEXT_MAX_WORDS) return null;

  return `Le texte source dépasse la limite de ${SOURCE_TEXT_MAX_WORDS} mots (actuellement ${wordCount}).`;
}
