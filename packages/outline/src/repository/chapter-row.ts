/**
 * The one projection the two re-cutting writes read a chapter through
 * (CAL-106).
 *
 * A merge and a split ask the same question of a chapter — *what does this one
 * carry?* — so they select the same columns and map them the same way. One
 * projection rather than two is what keeps a column added later from reaching
 * the merge and not the split, which is exactly the kind of asymmetry a
 * conservation rule cannot survive.
 */

import type { ChapterCutSource } from "../chapters/cut";

export const CHAPTER_SELECT = {
  id: true,
  partId: true,
  orderKey: true,
  bibleId: true,
  outlineId: true,
  chapterOutline: {
    select: {
      id: true,
      workingTitle: true,
      targetWordCount: true,
      focalCharacterId: true,
      placeId: true,
      periodStartDay: true,
      periodEndDay: true,
      periodPrecision: true,
      periodLabel: true,
      dramaticFunction: true,
      immediateGoal: true,
      obstacle: true,
      decision: true,
      revelation: true,
      consequence: true,
      detailedSummary: true,
      lockedAt: true,
      characters: { select: { characterId: true } },
      facts: { select: { factId: true } },
    },
  },
  /** Non-zero refuses both operations — see `chapters/cut.ts`. */
  _count: { select: { revisions: true } },
  threadOpenings: { select: { id: true } },
  threadClosings: { select: { id: true } },
  threadContinuations: { select: { threadId: true } },
} as const;

export interface ChapterRow {
  readonly id: string;
  readonly partId: string;
  readonly orderKey: string;
  readonly bibleId: string;
  readonly outlineId: string;
  readonly chapterOutline: {
    readonly id: string;
    readonly workingTitle: string | null;
    readonly targetWordCount: number | null;
    readonly focalCharacterId: string | null;
    readonly placeId: string | null;
    readonly periodStartDay: number | null;
    readonly periodEndDay: number | null;
    readonly periodPrecision: "DAY" | "MONTH" | "SEASON" | "YEAR" | "DECADE" | null;
    readonly periodLabel: string | null;
    readonly dramaticFunction: string | null;
    readonly immediateGoal: string | null;
    readonly obstacle: string | null;
    readonly decision: string | null;
    readonly revelation: string | null;
    readonly consequence: string | null;
    readonly detailedSummary: string | null;
    readonly lockedAt: Date | null;
    readonly characters: readonly { readonly characterId: string }[];
    readonly facts: readonly { readonly factId: string }[];
  } | null;
  readonly _count: { readonly revisions: number };
  readonly threadOpenings: readonly { readonly id: string }[];
  readonly threadClosings: readonly { readonly id: string }[];
  readonly threadContinuations: readonly { readonly threadId: string }[];
}

/** The row as the domain reads it — a projection, and nothing derived. */
export function toCutSource(row: ChapterRow): ChapterCutSource {
  const outline = row.chapterOutline;

  return {
    id: row.id,
    partId: row.partId,
    orderKey: row.orderKey,
    revisionCount: row._count.revisions,
    outline:
      outline === null
        ? null
        : {
            workingTitle: outline.workingTitle,
            targetWordCount: outline.targetWordCount,
            focalCharacterId: outline.focalCharacterId,
            placeId: outline.placeId,
            periodStartDay: outline.periodStartDay,
            periodEndDay: outline.periodEndDay,
            periodPrecision: outline.periodPrecision,
            periodLabel: outline.periodLabel,
            dramaticFunction: outline.dramaticFunction,
            immediateGoal: outline.immediateGoal,
            obstacle: outline.obstacle,
            decision: outline.decision,
            revelation: outline.revelation,
            consequence: outline.consequence,
            detailedSummary: outline.detailedSummary,
            lockedAt: outline.lockedAt,
            characterIds: outline.characters.map((link) => link.characterId),
            factIds: outline.facts.map((link) => link.factId),
          },
    opensThreadIds: row.threadOpenings.map((thread) => thread.id),
    closesThreadIds: row.threadClosings.map((thread) => thread.id),
    continuesThreadIds: row.threadContinuations.map((link) => link.threadId),
  };
}
