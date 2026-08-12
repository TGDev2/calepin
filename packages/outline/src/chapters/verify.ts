/**
 * The gate between a parsed batch and anything that acts on it (CAL-102).
 *
 * **One regime, and it is refusal** — `verifyPartStructure`'s, on the same
 * grounds one level down: the chapters of a batch are mutually load-bearing
 * (the choreography walks them in order, a revelation's reference points at
 * a sibling, the budget is a sum), so there is nothing to drop and nothing
 * to clear, and the batch stands or falls whole. Advisories ride along in
 * the report either way — they are a person's to weigh.
 *
 * The result is branded (`VerifiedChapterOutlineBatch`), minted only here
 * and never serialised, so whatever later persists the chapter plans takes
 * a checked batch instead of remembering to check one.
 */

import { type ChapterBatchReport, checkChapterOutlineBatch } from "./check";
import {
  type ChapterOutlineBatch,
  type ChapterOutlineBatchInput,
  chapterOutlineBatchSchema,
} from "./schema";

/**
 * The brand on `globalThis`'s shared symbol registry via `Symbol.for`, for
 * the reason every Calepin brand is: the packages are compiled from source
 * into more than one chunk graph (§12), and a `unique symbol` per chunk
 * would be several brands pretending to be one.
 */
export const VERIFIED_CHAPTER_OUTLINE_BATCH_BRAND: unique symbol = Symbol.for(
  "calepin.VerifiedChapterOutlineBatch",
);

export type VerifiedChapterOutlineBatch = ChapterOutlineBatch & {
  readonly [VERIFIED_CHAPTER_OUTLINE_BATCH_BRAND]: true;
};

export function isVerifiedChapterOutlineBatch(
  value: unknown,
): value is VerifiedChapterOutlineBatch {
  return (
    typeof value === "object" && value !== null && VERIFIED_CHAPTER_OUTLINE_BATCH_BRAND in value
  );
}

export type ChapterOutlineBatchVerification =
  | { readonly outcome: "refused"; readonly report: ChapterBatchReport }
  | {
      readonly outcome: "verified";
      readonly batch: VerifiedChapterOutlineBatch;
      readonly report: ChapterBatchReport;
    };

/**
 * Runs the calculable checks over the answer, against the ask's own part
 * target, thread assignment plan and offered vocabularies — the projection
 * derives nothing the ask does not state, so the refusal and the ask agree
 * about what was admissible.
 */
export function verifyChapterOutlineBatch(
  answer: ChapterOutlineBatch,
  input: ChapterOutlineBatchInput,
): ChapterOutlineBatchVerification {
  const report = checkChapterOutlineBatch({
    partTargetWordCount: input.partTargetWordCount,
    partIndex: input.partIndex,
    partCount: input.partCount,
    threads: input.threads.map((thread) => ({
      state: thread.state,
      assignedPartIndexes: thread.assignedPartIndexes,
    })),
    castNames: input.cast.map((member) => member.name),
    placeNames: input.places.map((place) => place.name),
    factCount: input.canonFacts.length,
    precedingChapters: input.precedingChapters.map((digest) => ({
      immediateGoal: digest.immediateGoal,
    })),
    chapters: answer.chapters.map((chapter) => ({
      workingTitle: chapter.workingTitle,
      targetWordCount: chapter.targetWordCount,
      focalCharacterName: chapter.focalCharacterName,
      presentCharacterNames: chapter.presentCharacterNames,
      placeName: chapter.placeName,
      immediateGoal: chapter.immediateGoal,
      revelationPreparation:
        chapter.revelation === null
          ? null
          : {
              preparedByBatchChapterIndex: chapter.revelation.preparedByBatchChapterIndex,
              preparedByPrecedingChapterIndex: chapter.revelation.preparedByPrecedingChapterIndex,
            },
      opensThreadIndexes: chapter.opensThreadIndexes,
      continuesThreadIndexes: chapter.continuesThreadIndexes,
      closesThreadIndexes: chapter.closesThreadIndexes,
      factIndexes: chapter.factIndexes,
    })),
  });

  if (!report.acceptable) return { outcome: "refused", report };

  return { outcome: "verified", batch: mint(answer), report };
}

/**
 * Re-parsed before the brand goes on, `verifyAnalysisEvidence`'s discipline:
 * the schema is the only authority on whether what is being certified is
 * still a chapter batch.
 */
function mint(batch: ChapterOutlineBatch): VerifiedChapterOutlineBatch {
  const parsed = chapterOutlineBatchSchema.safeParse(batch);

  if (!parsed.success) {
    throw new Error("a verified chapter batch no longer parses", { cause: parsed.error });
  }

  return { ...parsed.data, [VERIFIED_CHAPTER_OUTLINE_BATCH_BRAND]: true };
}
