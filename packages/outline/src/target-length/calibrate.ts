import { TARGET_LENGTH_RANGES } from "./ranges";
import type { ChapterCalibration, NovelLengthChoice, PartCalibration } from "./types";

/**
 * A contemporary novel's chapter runs roughly 2 500 to 3 500 words; this is
 * the middle of that band, not a number the specification states. CAL-103
 * lets the author move away from it per chapter — this is only the starting
 * estimate.
 */
const CHAPTER_WORD_COUNT_BASELINE = 3_000;

/**
 * Below this, a "roman" structure gets thin — CAL-103's later manual
 * adjustment can still go lower, but the starting estimate never proposes
 * fewer.
 */
const MIN_CHAPTER_COUNT = 8;

/**
 * A part is a run of chapters carrying a dramatic arc of its own — five to
 * eight chapters at `CHAPTER_WORD_COUNT_BASELINE`, so 12 000 to 25 000 words;
 * this is the middle of that band, not a number the specification states
 * (CAL-101). The ±1 latitude below is what keeps it an estimate rather than a
 * quota.
 */
const PART_WORD_COUNT_BASELINE = 18_000;

/**
 * The envelope every split stays inside whatever the target: below two parts
 * a découpage is not one, and `partStructureSchema` needs a static bound the
 * structured-output subset can carry, so the ceiling is stated here once and
 * the schema reuses it.
 */
export const PART_COUNT_RANGE = { min: 2, max: 12 } as const;

/**
 * The admissible part counts for a novel of `novelTargetWordCount` words —
 * the arithmetic behind `estimatePartCalibration`, exposed on the raw number
 * because `checkPartStructure` re-derives the range from the ask's own
 * `targetWordCount`: one function serving the estimate, the prompt and the
 * gate is what keeps the three from disagreeing (CAL-055's "one number, one
 * place", applied to a bound).
 *
 * A range of ±1 around the baseline count: wide enough that the count stays a
 * dramatic decision, narrow enough that a 37 500-word novel can never carry
 * six parts — which is what makes "the split adapts to the target length" a
 * refusal rather than a hope.
 */
export function partCalibrationForWordCount(novelTargetWordCount: number): PartCalibration {
  const count = Math.round(novelTargetWordCount / PART_WORD_COUNT_BASELINE);
  const minParts = Math.min(Math.max(count - 1, PART_COUNT_RANGE.min), PART_COUNT_RANGE.max);
  const maxParts = Math.max(Math.min(count + 1, PART_COUNT_RANGE.max), PART_COUNT_RANGE.min);

  return { novelTargetWordCount, minParts, maxParts };
}

/** A choice resolved to a single word count: a preset's midpoint, or the custom value. */
export function resolveNovelTargetWordCount(choice: NovelLengthChoice): number {
  if (choice.targetLength === "CUSTOM") return choice.targetWordCount;

  const range = TARGET_LENGTH_RANGES[choice.targetLength];

  return Math.round((range.min + range.max) / 2);
}

/**
 * The chapter count and per-chapter target length a novel-length choice
 * implies.
 *
 * The per-chapter figure is derived from the chapter count, not the other way
 * round, so the two always multiply back to within `chapterCount / 2` words of
 * `novelTargetWordCount` — comfortably inside CAL-103's later "10 % of the
 * target" acceptance bar.
 */
export function estimateChapterCalibration(choice: NovelLengthChoice): ChapterCalibration {
  const novelTargetWordCount = resolveNovelTargetWordCount(choice);
  const chapterCount = Math.max(
    MIN_CHAPTER_COUNT,
    Math.round(novelTargetWordCount / CHAPTER_WORD_COUNT_BASELINE),
  );
  const chapterTargetWordCount = Math.round(novelTargetWordCount / chapterCount);

  return { novelTargetWordCount, chapterCount, chapterTargetWordCount };
}

/** The part-count range a novel-length choice implies (CAL-101). */
export function estimatePartCalibration(choice: NovelLengthChoice): PartCalibration {
  return partCalibrationForWordCount(resolveNovelTargetWordCount(choice));
}
