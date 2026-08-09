import { flatMapResult, InternalError, type Result, succeed } from "@calepin/shared/errors";
import {
  type GenerationContext,
  getGenerationContextForProject,
  getProjectTargetLength,
  type ProjectScope,
  type ProjectTargetLength,
} from "@calepin/shared/repository";

import { estimateChapterCalibration } from "./calibrate";
import type { ChapterCalibration, NovelLengthChoice } from "./types";

/**
 * The context the plan-generation missions must see (CAL-043), on top of
 * `GenerationContext`'s own fields (CAL-042) — the same "grow the shared
 * shape ahead of `@calepin/ai`'s real composer" the language field already
 * established.
 */
export interface PlanGenerationContext extends GenerationContext {
  readonly chapterCalibration: ChapterCalibration;
}

/**
 * `Project`'s raw nullable pair, resolved to the discriminated union the
 * calibration reads. Throws only if `projects_custom_target_word_count_check`
 * were somehow violated — a data/programming error, not a caller's mistake
 * (CLAUDE.md §7).
 */
export function toNovelLengthChoice(raw: ProjectTargetLength): NovelLengthChoice {
  if (raw.targetLength !== "CUSTOM") return { targetLength: raw.targetLength };

  if (raw.targetWordCount === null) {
    throw new InternalError({
      message: "a CUSTOM target length was read with no word count",
      fieldPath: "targetWordCount",
    });
  }

  return { targetLength: "CUSTOM", targetWordCount: raw.targetWordCount };
}

/**
 * The plan's own generation context, read ahead of its producer the same way
 * `getGenerationContextForProject` is: no mission calls this yet (CAL-048,
 * CAL-060 still to come), but it is the one place a `build-chapter-outline`
 * call will get its calibration from once one does.
 */
export async function getPlanGenerationContext(
  scope: ProjectScope,
): Promise<Result<PlanGenerationContext>> {
  const [base, targetLength] = await Promise.all([
    getGenerationContextForProject(scope),
    getProjectTargetLength(scope),
  ]);

  return flatMapResult(base, (context) =>
    flatMapResult(targetLength, (raw) =>
      succeed({
        ...context,
        chapterCalibration: estimateChapterCalibration(toNovelLengthChoice(raw)),
      }),
    ),
  );
}
