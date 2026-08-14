import { resolveNovelTargetWordCount } from "@calepin/shared/target-length";

import type {
  ChapterCalibration,
  ChapterWordBudgetGap,
  NovelLengthChoice,
  PartCalibration,
  PartChapterCalibration,
} from "./types";

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
 * CAL-103's own bar: a declared total of chapter target lengths must stay
 * within 10% of the length it is measured against, whether that is a part's
 * target (`checkChapterOutlineBatch`, CAL-102) or the whole novel's (the
 * manual-adjustment preview below). One constant for both, so the AI-batch
 * check and the author's own adjustment cannot silently drift apart.
 */
export const CHAPTER_WORD_BUDGET_TOLERANCE = 0.1;

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

/**
 * A manual override of a starting `ChapterCalibration` (CAL-103): the author
 * may move the chapter count, the per-chapter target, or both, away from the
 * estimate. `novelTargetWordCount` is never overridden — it names the choice
 * the calibration is measured against, not something the author edits here.
 * Whether the result still fits the novel's target is `chapterWordBudgetGap`'s
 * question, not this function's — it applies the override and nothing else.
 */
export function adjustChapterCalibration(
  base: ChapterCalibration,
  overrides: { readonly chapterCount?: number; readonly chapterTargetWordCount?: number },
): ChapterCalibration {
  return {
    novelTargetWordCount: base.novelTargetWordCount,
    chapterCount: overrides.chapterCount ?? base.chapterCount,
    chapterTargetWordCount: overrides.chapterTargetWordCount ?? base.chapterTargetWordCount,
  };
}

/**
 * Whether a declared total of chapter target lengths stays within
 * `CHAPTER_WORD_BUDGET_TOLERANCE` of the length it is measured against —
 * `checkChapterOutlineBatch`'s inline arithmetic, generalized so the
 * novel-level manual-adjustment preview reads the same bar. The bound is
 * inclusive at both ends, `chapters/check.ts`'s own "boundary included" rule.
 */
export function chapterWordBudgetGap(
  totalTargetWordCount: number,
  novelTargetWordCount: number,
): ChapterWordBudgetGap {
  const minTotal = Math.floor(novelTargetWordCount * (1 - CHAPTER_WORD_BUDGET_TOLERANCE));
  const maxTotal = Math.ceil(novelTargetWordCount * (1 + CHAPTER_WORD_BUDGET_TOLERANCE));
  const deviationWordCount = totalTargetWordCount - novelTargetWordCount;

  return {
    totalTargetWordCount,
    novelTargetWordCount,
    minTotal,
    maxTotal,
    deviationWordCount,
    deviationRatio: deviationWordCount / novelTargetWordCount,
    withinTolerance: totalTargetWordCount >= minTotal && totalTargetWordCount <= maxTotal,
  };
}

/**
 * The envelope every part's chapter batch stays inside whatever the part's
 * word target (CAL-102): below two chapters a part carries no arc of its own,
 * and `chapterOutlineBatchSchema` needs a static bound the structured-output
 * subset can carry, so the ceiling is stated here once and the schema reuses
 * it — `PART_COUNT_RANGE`'s arrangement one level down.
 */
export const PART_CHAPTER_COUNT_RANGE = { min: 2, max: 20 } as const;

/**
 * The envelope a single chapter's declared target stays inside (CAL-102).
 * Below a thousand words a chapter is a scene fragment, above eight thousand
 * it is a part; CAL-103's manual adjustment can still move a chapter, but a
 * generated plan never proposes outside this band. The schema and the checker
 * both read it — the checker re-holds it for rows, because
 * `chapter_outlines_target_word_count_check` only guarantees a positive
 * number.
 */
export const CHAPTER_TARGET_WORD_COUNT_RANGE = { min: 1_000, max: 8_000 } as const;

/**
 * The admissible chapter counts for a part of `partTargetWordCount` words —
 * `partCalibrationForWordCount`'s arithmetic applied to the batch
 * `build-chapter-outline` answers (CAL-102). One function serves three
 * readers — the schema's static envelope, the prompt's
 * `{{minChapters}}`/`{{maxChapters}}` variables and the checker's gate — so
 * the ask and the refusal cannot disagree; the ask carries only the part's
 * word target, because a stored range would be a second answer able to
 * disagree with it.
 *
 * No `estimate*` wrapper: a part's word count is not a `NovelLengthChoice`,
 * so there is nothing to resolve.
 */
export function chapterCalibrationForPartWordCount(
  partTargetWordCount: number,
): PartChapterCalibration {
  const count = Math.round(partTargetWordCount / CHAPTER_WORD_COUNT_BASELINE);
  const minChapters = Math.min(
    Math.max(count - 1, PART_CHAPTER_COUNT_RANGE.min),
    PART_CHAPTER_COUNT_RANGE.max,
  );
  const maxChapters = Math.max(
    Math.min(count + 1, PART_CHAPTER_COUNT_RANGE.max),
    PART_CHAPTER_COUNT_RANGE.min,
  );

  return { partTargetWordCount, minChapters, maxChapters };
}
