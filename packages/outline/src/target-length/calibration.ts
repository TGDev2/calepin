/**
 * The pure half of the target-length surface: the ranges, the chapter maths
 * and their types, and **nothing that reads a database**.
 *
 * It exists as its own entry point because a browser bundle needs these
 * numbers. `./context` sits next door and imports `@calepin/shared/repository`,
 * whose barrel reaches `../logging/logger` and so `node:async_hooks`; a client
 * component importing the package root therefore drags a server-only module
 * into its chunk, and Turbopack refuses the whole page rather than shaking the
 * unused branch out ("the chunking context does not support external modules").
 *
 * `./index` re-exports this file, so the two surfaces cannot list different
 * things: the root barrel is this plus the database read.
 */

export {
  CHAPTER_TARGET_WORD_COUNT_RANGE,
  chapterCalibrationForPartWordCount,
  estimateChapterCalibration,
  estimatePartCalibration,
  PART_CHAPTER_COUNT_RANGE,
  PART_COUNT_RANGE,
  partCalibrationForWordCount,
  resolveNovelTargetWordCount,
} from "./calibrate";
export { CUSTOM_TARGET_WORD_COUNT_RANGE, TARGET_LENGTH_RANGES } from "./ranges";
export {
  type ChapterCalibration,
  type NovelLengthChoice,
  type PartCalibration,
  type PartChapterCalibration,
  TARGET_LENGTHS,
  type TargetLength,
  type TargetLengthRange,
} from "./types";
