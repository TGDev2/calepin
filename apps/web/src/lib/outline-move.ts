/**
 * The French the plan screen speaks when a chapter moves (CAL-105).
 *
 * Beside `actions.ts` rather than inside it: a `"use server"` module may export
 * only async functions, so a message table and a form-state type cannot live
 * there — the constraint `lib/analysis-edit.ts` and `lib/canon-fact-edit.ts`
 * each already record.
 *
 * The division is the one `lib/project-action-error.ts` draws: `@calepin/outline`
 * decides *what happened* — the plan is stale, the chapter is not there — and
 * this file decides the words. Every sentence says what did not happen, that
 * nothing was lost, and what to do next.
 */

/** The path a move revalidates, and the one an unauthenticated visitor returns to. */
export function outlinePath(projectId: string): string {
  return `/projects/${projectId}/outline`;
}

export const CHAPTER_MOVE_MISSING_MESSAGE =
  "Ce chapitre n'existe plus, ou il ne vous appartient pas.";

export const CHAPTER_MOVE_UNAVAILABLE_MESSAGE =
  "Le chapitre n'a pas pu être déplacé. Le plan est inchangé ; réessayez dans un instant.";

/**
 * What the tree announces once the move has landed.
 *
 * The number and the part are exactly what a reader loses when the screen
 * redraws under them, and they are what every gesture — drag or keyboard — has
 * to report back. Both are read from the server's own re-rendered plan rather
 * than predicted, so the sentence says where the chapter *is* and not where it
 * was sent. Numbers only, no title: a working title is literary content (§9)
 * and an announcement is the string a log line is most tempted to copy.
 */
export function chapterMovedAnnouncement(chapterNumber: number, partNumber: number): string {
  return `Chapitre déplacé en position ${String(chapterNumber)}, partie ${String(partNumber)}.`;
}

/** The state a move hands back to the tree. */
export type ChapterMoveState =
  { readonly status: "idle" } | { readonly status: "error"; readonly message: string };
