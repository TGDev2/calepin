import { TARGET_LENGTH_RANGES } from "./ranges";
import type { ChapterCalibration, NovelLengthChoice } from "./types";

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
