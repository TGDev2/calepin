import { TARGET_LENGTH_RANGES } from "./ranges";
import type { NovelLengthChoice } from "./types";

/**
 * A choice resolved to a single word count: a preset's midpoint, or the custom
 * value.
 *
 * The one arithmetic behind every "how long is this novel" question in the
 * product — the plan's part and chapter calibration, the bible's identity, and
 * the two missions that state the length to a model. One function, so a prompt
 * and a checker can never disagree about what `STANDARD` is worth (CAL-055's
 * "one number, one place").
 */
export function resolveNovelTargetWordCount(choice: NovelLengthChoice): number {
  if (choice.targetLength === "CUSTOM") return choice.targetWordCount;

  const range = TARGET_LENGTH_RANGES[choice.targetLength];

  return Math.round((range.min + range.max) / 2);
}
