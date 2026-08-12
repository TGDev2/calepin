export {
  adjustChapterCalibration,
  CHAPTER_TARGET_WORD_COUNT_RANGE,
  CHAPTER_WORD_BUDGET_TOLERANCE,
  type ChapterCalibration,
  chapterCalibrationForPartWordCount,
  type ChapterWordBudgetGap,
  chapterWordBudgetGap,
  CUSTOM_TARGET_WORD_COUNT_RANGE,
  estimateChapterCalibration,
  estimatePartCalibration,
  type NovelLengthChoice,
  PART_CHAPTER_COUNT_RANGE,
  PART_COUNT_RANGE,
  type PartCalibration,
  partCalibrationForWordCount,
  type PartChapterCalibration,
  resolveNovelTargetWordCount,
  TARGET_LENGTH_RANGES,
  TARGET_LENGTHS,
  type TargetLength,
  type TargetLengthRange,
} from "./calibration";
// `./context` is deliberately absent: it opens a database read, so it belongs
// behind `@calepin/outline/repository` and nowhere near the root barrel
// (CAL-106). Keeping it here made the root barrel impure, which is why two
// client components had to reach for `@calepin/outline/calibration` and why
// the first *value* import of the root barrel from a client component broke
// `pnpm build` with `node:async_hooks`.
