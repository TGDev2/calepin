/**
 * Deriving a project's status from what the project actually contains
 * (CAL-034).
 *
 * The specification's ten statuses name nine places in the writing of a novel
 * plus one decision about the project itself. Every one of the nine is already
 * written down somewhere in the graph — a source text exists, an analysis
 * carries `validatedAt`, a direction is canonical, chapters are validated, a
 * publication is visible. Storing the status as an *opinion* beside that
 * evidence gives a column able to contradict it, and CAL-012's own recorded
 * lesson says which of the two consumers then trust: the wrong one.
 *
 * So the status is a function of the evidence, and `Project.status` is a cache
 * of that function the same way CAL-033's two counters are caches of the
 * chapters — maintained by the write, never asserted by a caller.
 *
 * **The answer is the furthest stage reached, not the first one missing.** The
 * backlog's acceptance criterion is that the status reflects *l'étape réellement
 * atteinte*, and that word decides the shape of this function. Consider a
 * finished novel whose author reopens the bible to fix a detail:
 * `Bible.validatedAt` clears, and a derivation that stopped at the first missing
 * condition would announce `BIBLE_TO_VALIDATE` for a manuscript of ninety
 * thousand words, then leap back to `COMPLETED` the moment the bible was
 * re-validated. Neither reading is true, and the round trip is a routine act.
 * Taking the highest stage whose own condition holds says what has been reached
 * and stays stable under an edit further up.
 *
 * **That is also what makes the transition table enforceable.** The product
 * produces these facts in order — a bible is validated after a direction is
 * chosen, chapters are written after a plan exists — so one legitimate write
 * moves the answer by exactly one stage. A jump of two means the facts appeared
 * out of order, which no write path in the product can do: it is a fixture, an
 * import or a bug, and `refreshProjectStatus` refuses it rather than ratifying
 * it. `progress.test.ts` proves the one-step property over the evidence states
 * the product can actually reach, and exhibits the out-of-order ones the table
 * exists to catch.
 *
 * `ARCHIVED` is outside the chain and short-circuits it. Archiving says nothing
 * about how far the novel has come — an archived project keeps every row it had
 * — so it suspends the question rather than answering it, and restoring asks the
 * graph again instead of restoring a remembered stage.
 *
 * This file imports nothing but its own siblings, for the reason `./statuses`
 * states: the machine must run under the `unit` Vitest project with no database.
 */

import { PROJECT_STAGE_STATUSES, type ProjectStage, type ProjectStatus } from "./statuses";

/**
 * What a project holds, in facts — never in prose (CLAUDE.md §9). Nothing here
 * is readable as part of the novel, which is also what makes it safe to log.
 */
export interface ProjectProgress {
  /** `Project.archivedAt` is set: the one status no evidence can produce. */
  readonly isArchived: boolean;
  /** A `SourceText` carrying at least one `SourceTextVersion`. */
  readonly hasSourceText: boolean;
  /** `Analysis.validatedAt` is set. */
  readonly isAnalysisValidated: boolean;
  /** A `CreativeDirection` of this project has `isCanonical`. */
  readonly hasCanonicalDirection: boolean;
  /** `Bible.validatedAt` is set. */
  readonly isBibleValidated: boolean;
  /** Every chapter of the plan, written or not. */
  readonly plannedChapterCount: number;
  /** Chapters carrying at least one `ChapterRevision` — CAL-033's counter. */
  readonly writtenChapterCount: number;
  /** Chapters whose own status is `VALIDATED` or `LOCKED`. */
  readonly validatedChapterCount: number;
  /** A `Publication` exists and its visibility has left `PRIVATE`. */
  readonly isPublished: boolean;
}

/**
 * Each stage, and the fact that says it has been reached.
 *
 * A table rather than a chain of `if`s: it is keyed by `ProjectStage`, so a
 * status added to the enum without a condition here is a compile error rather
 * than a silently unreachable state, and the order walked is
 * `PROJECT_STAGE_STATUSES`'s, so the two cannot drift.
 *
 * Each condition names only its own fact. The cumulative reading lives in the
 * *order*, not in the predicates — which is what lets a stage stay reached while
 * an earlier one is momentarily undone.
 */
export const PROJECT_STAGE_CONDITIONS = {
  // Where every project starts, and the only stage that asks for nothing.
  DRAFT: () => true,

  ANALYSIS_IN_PROGRESS: (progress: ProjectProgress) => progress.hasSourceText,

  DIRECTION_TO_CHOOSE: (progress: ProjectProgress) => progress.isAnalysisValidated,

  BIBLE_TO_VALIDATE: (progress: ProjectProgress) => progress.hasCanonicalDirection,

  OUTLINE_IN_PROGRESS: (progress: ProjectProgress) => progress.isBibleValidated,

  // The plan stops being *in construction* when the first chapter has text, not
  // when the plan is declared finished: nothing in the schema records such a
  // declaration, and a plan keeps growing while the writing goes on anyway.
  WRITING_IN_PROGRESS: (progress: ProjectProgress) => progress.writtenChapterCount > 0,

  // Revision begins when there is nothing left to draft. The `> 0` guard is not
  // redundant: this predicate is public and a caller may hand it a progress
  // value the repository never produced, where `0 >= 0` would otherwise report a
  // plan with no chapters as fully written.
  REVISION: (progress: ProjectProgress) =>
    progress.plannedChapterCount > 0 &&
    progress.writtenChapterCount >= progress.plannedChapterCount,

  // Finished means every chapter of the plan is validated or locked. Quality
  // issues are deliberately not read: E13 owns them, an accepted issue is not an
  // unfinished chapter, and a status that flickered on a coherence audit would
  // be saying something about the audit rather than about the novel.
  COMPLETED: (progress: ProjectProgress) =>
    progress.plannedChapterCount > 0 &&
    progress.validatedChapterCount >= progress.plannedChapterCount,

  PUBLISHED: (progress: ProjectProgress) => progress.isPublished,
} as const satisfies Record<ProjectStage, (progress: ProjectProgress) => boolean>;

/**
 * The status the project's own rows say it is in: the furthest stage whose
 * condition holds, and `DRAFT` when none does.
 *
 * Walked from the end so the answer is the last one reached rather than the
 * first one missing — see the module comment for why that word decides the
 * shape of this function.
 */
export function deriveProjectStatus(progress: ProjectProgress): ProjectStatus {
  if (progress.isArchived) return "ARCHIVED";

  for (const stage of [...PROJECT_STAGE_STATUSES].reverse()) {
    if (PROJECT_STAGE_CONDITIONS[stage](progress)) return stage;
  }

  // Unreachable: DRAFT's condition is `true`. Kept so the function is total
  // without a non-null assertion, which this repository bans (CAL-021).
  return "DRAFT";
}
