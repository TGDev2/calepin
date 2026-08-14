/**
 * What a novel-length choice is worth once the plan reads it (CAL-043).
 *
 * The choice itself — `TARGET_LENGTHS`, `NovelLengthChoice`, the ranges and
 * `resolveNovelTargetWordCount` — moved to `@calepin/shared/target-length` in
 * CAL-210, once the bible and the direction missions needed the same number and
 * a domain may not import a domain (§3.2). They are re-exported below, so every
 * caller reading them from `@calepin/outline` is unaffected; what stays here is
 * the calibration this package owns.
 */

export {
  type NovelLengthChoice,
  TARGET_LENGTHS,
  type TargetLength,
  type TargetLengthRange,
} from "@calepin/shared/target-length";

/** What a novel-length choice is worth in chapters, once resolved to a number. */
export interface ChapterCalibration {
  /** The choice resolved to a single number — a preset's midpoint, or the custom value. */
  readonly novelTargetWordCount: number;
  readonly chapterCount: number;
  readonly chapterTargetWordCount: number;
}

/**
 * What a novel-length choice is worth in parts (CAL-101). A range rather than
 * `ChapterCalibration`'s single count, because how many parts a novel takes is
 * itself a dramatic decision — the mission chooses within the range, and the
 * checker refuses a split outside it.
 */
export interface PartCalibration {
  /** The choice resolved to a single number — a preset's midpoint, or the custom value. */
  readonly novelTargetWordCount: number;
  readonly minParts: number;
  readonly maxParts: number;
}

/**
 * What a part's word target is worth in chapters (CAL-102). A range for
 * `PartCalibration`'s reason — how many chapters a part takes is itself a
 * dramatic decision: the mission chooses within the range, and the checker
 * refuses a batch outside it.
 */
export interface PartChapterCalibration {
  readonly partTargetWordCount: number;
  readonly minChapters: number;
  readonly maxChapters: number;
}

/**
 * Whether a declared total of chapter target lengths stays within
 * `CHAPTER_WORD_BUDGET_TOLERANCE` of the length it is measured against
 * (CAL-103). The one arithmetic shared by the per-part AI-batch check
 * (`checkChapterOutlineBatch`) and the novel-level manual-adjustment preview,
 * so the two can never disagree about what "within 10%" means.
 */
export interface ChapterWordBudgetGap {
  readonly totalTargetWordCount: number;
  readonly novelTargetWordCount: number;
  readonly minTotal: number;
  readonly maxTotal: number;
  readonly deviationWordCount: number;
  readonly deviationRatio: number;
  readonly withinTolerance: boolean;
}
