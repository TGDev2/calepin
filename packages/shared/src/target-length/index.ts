/**
 * `Project.targetLength` read as a number of words (CAL-043, moved here by
 * CAL-210).
 *
 * A stored project choice on one side, its interpretation on the other — the
 * layout `@calepin/shared/freedom-level` already has for `Project.freedomLevel`.
 * Pure: no database read, no provider, nothing a browser bundle would refuse.
 */

export { CUSTOM_TARGET_WORD_COUNT_RANGE, TARGET_LENGTH_RANGES } from "./ranges";
export { resolveNovelTargetWordCount } from "./resolve";
export {
  type NovelLengthChoice,
  TARGET_LENGTHS,
  type TargetLength,
  type TargetLengthRange,
} from "./types";
