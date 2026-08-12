/**
 * The `ChapterOutline` column values, the fact ids and the thread actions by
 * label, from a **verified** batch only (CAL-102).
 *
 * `ChapterOutline` stores the revelation as one free text; this is where the
 * pair becomes that text — the content, then what plants it, joined by one
 * fixed French connector — flattening without erasing, `resolveBibleStyle`'s
 * role. **The preparing reference is deliberately not stored**: a position is
 * rewritten by every insertion and every move (the `orderKey` doctrine), so
 * it serves the check and stops there; the preparation's prose says where the
 * planting lives, in words a reorder cannot orphan.
 *
 * Names come back in the **ask's** spelling — the model's typography variants
 * are resolved through the same reduction the checker compared with (CAL-090's
 * device) — and the fact indexes come back as the ask's own `factId`s, so
 * persistence receives ids the model never chose (§6). The thread actions
 * come back as labels in three lists, because which list an action came out
 * of is what writes `Thread.openingChapterId`, `ThreadContinuation` and
 * `closingChapterId` + status when the persistence task comes.
 *
 * Order is the answer's own; the fractional order keys are minted at
 * persistence (`orderKeysBetween`), never here. Matching a label to a
 * `Thread` row and a name to a `Character.id` or `Place.id` is business
 * code's, with a live scope in hand (§6).
 */

import { sameWords } from "@calepin/shared/text";

import type { ChapterOutlineBatchInput, ChapterPeriodPrecision } from "./schema";
import type { VerifiedChapterOutlineBatch } from "./verify";

/**
 * What separates the revelation from its preparation in the stored text. A
 * clause, not a bare colon, so the resolved sentence still says what the
 * second half *is* — `STYLE_VIOLATION_CONNECTOR`'s reason, and the same
 * domain-owned French copy: the author reads the words the writing context
 * will quote.
 */
export const CHAPTER_REVELATION_CONNECTOR = "Préparée par :";

/** One chapter plan's column values, plus its references resolved. */
export interface ResolvedChapterOutlineRow {
  readonly workingTitle: string;
  readonly targetWordCount: number;
  /** The ask's spelling, never the model's echo. */
  readonly focalCharacterName: string;
  readonly presentCharacterNames: readonly string[];
  readonly placeName: string | null;
  readonly periodStartDay: number;
  readonly periodEndDay: number;
  readonly periodPrecision: ChapterPeriodPrecision;
  readonly periodLabel: string;
  readonly dramaticFunction: string;
  readonly immediateGoal: string;
  readonly obstacle: string;
  readonly decision: string;
  /** The pair flattened behind `CHAPTER_REVELATION_CONNECTOR`, or null. */
  readonly revelation: string | null;
  readonly consequence: string;
  readonly detailedSummary: string;
  /** The ask's own fact ids, in the chapter's citation order. */
  readonly factIds: readonly string[];
  readonly opensThreadLabels: readonly string[];
  readonly continuesThreadLabels: readonly string[];
  readonly closesThreadLabels: readonly string[];
}

export interface ResolvedChapterOutlineBatch {
  /** In the answer's own reading order. */
  readonly chapters: readonly ResolvedChapterOutlineRow[];
}

/**
 * The row values, entry for entry and in the answer's own order. Takes the
 * ask beside the brand — unlike `resolvePartStructure`, the vocabulary lives
 * in the ask, not the answer — and the brand promises the pair was checked
 * together: a reference that does not resolve is a programming error, not a
 * condition to handle (§7).
 */
export function resolveChapterOutlineBatch(
  batch: VerifiedChapterOutlineBatch,
  input: ChapterOutlineBatchInput,
): ResolvedChapterOutlineBatch {
  const castNames = input.cast.map((member) => member.name);
  const placeNames = input.places.map((place) => place.name);

  const resolveName = (name: string, offered: readonly string[], what: string): string => {
    const match = offered.find((candidate) => sameWords(candidate, name));

    if (match === undefined) {
      throw new Error(`a verified chapter batch names a ${what} the ask does not offer`);
    }

    return match;
  };

  const resolveThreadLabels = (indexes: readonly number[]): readonly string[] =>
    indexes.map((threadIndex) => {
      const thread = input.threads[threadIndex];

      if (thread === undefined) {
        throw new Error("a verified chapter batch names a thread the ask does not offer");
      }

      return thread.label;
    });

  return {
    chapters: batch.chapters.map((chapter) => ({
      workingTitle: chapter.workingTitle,
      targetWordCount: chapter.targetWordCount,
      focalCharacterName: resolveName(chapter.focalCharacterName, castNames, "character"),
      presentCharacterNames: chapter.presentCharacterNames.map((name) =>
        resolveName(name, castNames, "character"),
      ),
      placeName:
        chapter.placeName === null ? null : resolveName(chapter.placeName, placeNames, "place"),
      periodStartDay: chapter.period.startDay,
      periodEndDay: chapter.period.endDay,
      periodPrecision: chapter.period.precision,
      periodLabel: chapter.period.label,
      dramaticFunction: chapter.dramaticFunction,
      immediateGoal: chapter.immediateGoal,
      obstacle: chapter.obstacle,
      decision: chapter.decision,
      revelation:
        chapter.revelation === null
          ? null
          : `${chapter.revelation.content} ${CHAPTER_REVELATION_CONNECTOR} ${chapter.revelation.preparation}`,
      consequence: chapter.consequence,
      detailedSummary: chapter.detailedSummary,
      factIds: chapter.factIndexes.map((factIndex) => {
        const fact = input.canonFacts[factIndex];

        if (fact === undefined) {
          throw new Error("a verified chapter batch names a fact the ask does not offer");
        }

        return fact.factId;
      }),
      opensThreadLabels: resolveThreadLabels(chapter.opensThreadIndexes),
      continuesThreadLabels: resolveThreadLabels(chapter.continuesThreadIndexes),
      closesThreadLabels: resolveThreadLabels(chapter.closesThreadIndexes),
    })),
  };
}
