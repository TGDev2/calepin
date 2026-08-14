import { CUSTOM_TARGET_WORD_COUNT_RANGE, TARGET_LENGTH_RANGES } from "./ranges";
import type { NovelLengthChoice, TargetLength } from "./types";

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

/**
 * The two `Project` columns read as the choice they encode.
 *
 * The database carries a nullable pair that
 * `projects_custom_target_word_count_check` already constrains; the union above
 * is that same invariant expressed so nothing downstream has to re-check it.
 * This is the one place the two meet, so a `CUSTOM` row whose word count is
 * missing — which the constraint makes unwritable — resolves to the preset's own
 * floor rather than to a number invented further down.
 */
export function novelLengthChoiceOf(project: {
  readonly targetLength: TargetLength;
  readonly targetWordCount: number | null;
}): NovelLengthChoice {
  if (project.targetLength !== "CUSTOM") return { targetLength: project.targetLength };

  return {
    targetLength: "CUSTOM",
    targetWordCount: project.targetWordCount ?? CUSTOM_TARGET_WORD_COUNT_RANGE.min,
  };
}
