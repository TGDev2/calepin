/**
 * The shapes the plan screen renders — repository rows plus the display-only
 * facts `page.tsx` derives from them (a chapter number, a status label, which
 * threads a chapter acts on, a running word-count total). Kept apart from
 * `@calepin/shared/repository`'s own types the way `bible/views.ts` is: those
 * describe what is stored, not what a screen shows.
 *
 * Types only — no runtime import here. `outline-tree.tsx` is a client
 * component and imports these with `import type`; the shaping itself
 * (`resolveOutline`, the word-count arithmetic) stays in `page.tsx`, which
 * runs server-side only.
 */

import type { OutlineChapterRow } from "@calepin/shared/repository";

export interface ThreadActionView {
  readonly id: string;
  readonly label: string;
}

export interface ChapterThreadActionsView {
  readonly opens: readonly ThreadActionView[];
  readonly continues: readonly ThreadActionView[];
  readonly closes: readonly ThreadActionView[];
}

export interface ChapterView {
  readonly id: string;
  readonly number: number;
  readonly status: OutlineChapterRow["status"];
  readonly statusLabel: string;
  readonly workingTitle: string | null;
  readonly targetWordCount: number | null;
  readonly focalCharacterName: string | null;
  readonly placeName: string | null;
  readonly periodLabel: string | null;
  readonly dramaticFunction: string | null;
  readonly immediateGoal: string | null;
  readonly obstacle: string | null;
  readonly decision: string | null;
  readonly revelation: string | null;
  readonly consequence: string | null;
  readonly detailedSummary: string | null;
  readonly lockedAt: Date | null;
  readonly presentCharacterNames: readonly string[];
  readonly factStatements: readonly string[];
  readonly threadActions: ChapterThreadActionsView;
}

export interface PartView {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly dramaticObjective: string | null;
  readonly initialState: string | null;
  readonly tippingPoint: string | null;
  readonly finalState: string | null;
  readonly chapters: readonly ChapterView[];
  /** Sum of this part's own chapters' `targetWordCount`, planned ones only. */
  readonly plannedWordCount: number;
  readonly unplannedChapterCount: number;
  /** Sum of `plannedWordCount` across this part and every part before it. */
  readonly cumulativeWordCount: number;
}

export interface OutlineSummaryView {
  readonly plannedWordCount: number;
  readonly unplannedChapterCount: number;
  readonly targetWordCount: number;
  readonly deviationWordCount: number;
  readonly deviationRatio: number;
  readonly withinTolerance: boolean;
  readonly writtenChapterCount: number;
  readonly totalWordCount: number;
  readonly openThreadCount: number;
  readonly totalThreadCount: number;
}
