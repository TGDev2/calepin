/**
 * A chapter as the two operations that re-cut the plan read it (CAL-106).
 *
 * Merging and splitting ask the same question of a chapter — *what does this
 * one carry?* — so they read one shape rather than two. It is **structural and
 * nullable-tolerant**, the device `checkChapterOutlineBatch` established: the
 * planning fields mirror the `ChapterOutline` columns' own nullability, so a
 * database row satisfies it as readily as a fixture, and one implementation
 * serves the screen, the repository and the tests.
 *
 * The references are ids, not names, because both operations rewrite rows: a
 * merge repoints what pointed at the absorbed chapter, and a split hands half
 * of them to a chapter that did not exist a moment ago. Names belong to the
 * mission's ask, where a model has to be able to say them (§6).
 */

import type { ChapterPeriodPrecision } from "./schema";

/**
 * The seven prose columns an operation joins or redistributes rather than
 * picks between. Named once so the merge's join, the split's redistribution
 * and their tests read one list; `workingTitle` and `periodLabel` are headings
 * and take the other connector.
 */
export const CHAPTER_PROSE_COLUMNS = [
  "dramaticFunction",
  "immediateGoal",
  "obstacle",
  "decision",
  "revelation",
  "consequence",
  "detailedSummary",
] as const;

export type ChapterProseColumn = (typeof CHAPTER_PROSE_COLUMNS)[number];

/** A chapter's plan — the `ChapterOutline` columns and its two link tables. */
export interface ChapterCutOutline {
  readonly workingTitle: string | null;
  readonly targetWordCount: number | null;
  readonly focalCharacterId: string | null;
  readonly placeId: string | null;
  readonly periodStartDay: number | null;
  readonly periodEndDay: number | null;
  readonly periodPrecision: ChapterPeriodPrecision | null;
  readonly periodLabel: string | null;
  readonly dramaticFunction: string | null;
  readonly immediateGoal: string | null;
  readonly obstacle: string | null;
  readonly decision: string | null;
  readonly revelation: string | null;
  readonly consequence: string | null;
  readonly detailedSummary: string | null;
  /** The plan's own lock (CAL-107) — set refuses both operations. */
  readonly lockedAt: Date | null;
  readonly characterIds: readonly string[];
  readonly factIds: readonly string[];
}

/** A chapter — the spine, its plan and the three thread actions it holds. */
export interface ChapterCutSource {
  readonly id: string;
  readonly partId: string;
  readonly orderKey: string;
  /**
   * How many revisions the chapter already holds. Non-zero refuses both
   * operations: deleting or re-cutting a written chapter cascades its
   * revisions, its summaries and the quality-issue passages anchored into
   * them, and merging prose is a manuscript decision, not a plan one.
   */
  readonly revisionCount: number;
  /** Null for a chapter with no plan row yet. */
  readonly outline: ChapterCutOutline | null;
  readonly opensThreadIds: readonly string[];
  readonly continuesThreadIds: readonly string[];
  readonly closesThreadIds: readonly string[];
}

/** Which thread action list a finding is about. */
export const CHAPTER_THREAD_ACTION_LISTS = ["opens", "continues", "closes"] as const;

export type ChapterThreadActionListName = (typeof CHAPTER_THREAD_ACTION_LISTS)[number];

/** The union, in the order the lists are given, with duplicates dropped. */
export function unionIds(...lists: readonly (readonly string[])[]): readonly string[] {
  const seen = new Set<string>();
  const union: string[] = [];

  for (const list of lists) {
    for (const id of list) {
      if (seen.has(id)) continue;

      seen.add(id);
      union.push(id);
    }
  }

  return union;
}
