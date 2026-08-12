/**
 * @calepin/outline — parts, chapter outlines and narrative threads
 *
 * Public surface of the domain. Everything other workspaces are allowed to use
 * is re-exported from here; nothing reaches into `src/` directly.
 *
 * Backlog: E10 — CAL-101 to CAL-111
 */

export {
  compareOrderKeys,
  isOrderKey,
  moveOrderKey,
  type NumberedChapter,
  ORDER_KEY_ALPHABET,
  type OrderedChapter,
  type OrderedPart,
  orderKeyAt,
  orderKeyBetween,
  orderKeysBetween,
  type ResolvedOutline,
  type ResolvedPart,
  resolveOutline,
} from "./order";
export {
  type ChapterCalibration,
  CUSTOM_TARGET_WORD_COUNT_RANGE,
  estimateChapterCalibration,
  estimatePartCalibration,
  getPlanGenerationContext,
  type NovelLengthChoice,
  PART_COUNT_RANGE,
  type PartCalibration,
  partCalibrationForWordCount,
  type PlanGenerationContext,
  resolveNovelTargetWordCount,
  TARGET_LENGTH_RANGES,
  TARGET_LENGTHS,
  type TargetLength,
  type TargetLengthRange,
} from "./target-length";
export { isThreadOpen, listOpenThreads, type OpenableThread, type ThreadStatus } from "./thread";
