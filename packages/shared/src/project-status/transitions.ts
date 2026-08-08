/**
 * The complete table of allowed project status transitions (CAL-034).
 *
 * **Why a table at all, when the status is derived.** The derivation in
 * `./progress` answers *what the project is*; the table answers *what the
 * project may become*. They are separate questions because the derivation reads
 * a snapshot and cannot see where the row came from — and a status that lands
 * two steps forward of the stored one is not progress, it is a graph that was
 * written behind the machine's back (a fixture, an import, a bug). The table is
 * what turns that into a refusal instead of a silent write.
 *
 * **The rule the sixty-two edges encode.**
 *
 * - *Forward, exactly one step.* The product produces the evidence in order — a
 *   bible is validated after a direction is chosen, chapters are written after a
 *   plan exists — so one legitimate write moves the derivation by exactly one
 *   stage. A jump of two means the facts appeared out of order, which no write
 *   path in the product can do: it is a fixture, an import or a bug. Admitting
 *   it would only ever admit a defect, and refusing it is the whole reason this
 *   table sits between the derivation and the column.
 * - *Backward, to any earlier stage.* Evidence is removable, and one deletion
 *   removes several stages at once: deleting a bible takes the outline and every
 *   chapter with it, and the project falls from `WRITING_IN_PROGRESS` back to
 *   `DIRECTION_TO_CHOOSE` in a single statement. Refusing that would leave the
 *   column claiming a manuscript that no longer exists.
 * - *To `ARCHIVED` from anywhere, and out of it to anywhere.* Archiving does not
 *   care how far the novel has come, and restoring recomputes from the graph
 *   rather than restoring a remembered stage — the graph is the only thing that
 *   was still true while the project sat archived.
 * - *No self-transition.* A refresh that changes nothing is not a transition,
 *   and writing one would be a way for a caller to "confirm" a status the
 *   machine never granted.
 *
 * The table is written out rather than computed, so that reviewing it is reading
 * it. `transitions.test.ts` restates the rule independently and compares the two
 * over all one hundred ordered pairs, which is what catches a typo in either.
 */

import { ConflictError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import type { ProjectStatus } from "./statuses";

export const PROJECT_STATUS_TRANSITIONS = {
  DRAFT: ["ANALYSIS_IN_PROGRESS", "ARCHIVED"],

  ANALYSIS_IN_PROGRESS: ["DRAFT", "DIRECTION_TO_CHOOSE", "ARCHIVED"],

  DIRECTION_TO_CHOOSE: ["DRAFT", "ANALYSIS_IN_PROGRESS", "BIBLE_TO_VALIDATE", "ARCHIVED"],

  BIBLE_TO_VALIDATE: [
    "DRAFT",
    "ANALYSIS_IN_PROGRESS",
    "DIRECTION_TO_CHOOSE",
    "OUTLINE_IN_PROGRESS",
    "ARCHIVED",
  ],

  OUTLINE_IN_PROGRESS: [
    "DRAFT",
    "ANALYSIS_IN_PROGRESS",
    "DIRECTION_TO_CHOOSE",
    "BIBLE_TO_VALIDATE",
    "WRITING_IN_PROGRESS",
    "ARCHIVED",
  ],

  WRITING_IN_PROGRESS: [
    "DRAFT",
    "ANALYSIS_IN_PROGRESS",
    "DIRECTION_TO_CHOOSE",
    "BIBLE_TO_VALIDATE",
    "OUTLINE_IN_PROGRESS",
    "REVISION",
    "ARCHIVED",
  ],

  REVISION: [
    "DRAFT",
    "ANALYSIS_IN_PROGRESS",
    "DIRECTION_TO_CHOOSE",
    "BIBLE_TO_VALIDATE",
    "OUTLINE_IN_PROGRESS",
    "WRITING_IN_PROGRESS",
    "COMPLETED",
    "ARCHIVED",
  ],

  COMPLETED: [
    "DRAFT",
    "ANALYSIS_IN_PROGRESS",
    "DIRECTION_TO_CHOOSE",
    "BIBLE_TO_VALIDATE",
    "OUTLINE_IN_PROGRESS",
    "WRITING_IN_PROGRESS",
    "REVISION",
    "PUBLISHED",
    "ARCHIVED",
  ],

  // No forward edge but archiving: publication is the last stage of the chain.
  // Every edge below it is a regression — a published novel whose chapters are
  // edited again genuinely stops being finished, and the column has to say so.
  PUBLISHED: [
    "DRAFT",
    "ANALYSIS_IN_PROGRESS",
    "DIRECTION_TO_CHOOSE",
    "BIBLE_TO_VALIDATE",
    "OUTLINE_IN_PROGRESS",
    "WRITING_IN_PROGRESS",
    "REVISION",
    "COMPLETED",
    "ARCHIVED",
  ],

  // Restoring lands wherever the graph says, which is why every stage is here
  // and why none of them is privileged.
  ARCHIVED: [
    "DRAFT",
    "ANALYSIS_IN_PROGRESS",
    "DIRECTION_TO_CHOOSE",
    "BIBLE_TO_VALIDATE",
    "OUTLINE_IN_PROGRESS",
    "WRITING_IN_PROGRESS",
    "REVISION",
    "COMPLETED",
    "PUBLISHED",
  ],
} as const satisfies Record<ProjectStatus, readonly ProjectStatus[]>;

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return (PROJECT_STATUS_TRANSITIONS[from] as readonly ProjectStatus[]).includes(to);
}

/**
 * The refusal, as a value rather than a throw.
 *
 * An illegal transition is a failure the caller has to handle — it is the
 * signal that the project's rows and its status column disagree by more than
 * one step, and the repair (`reconcileProjectStatus`) is a decision, not
 * something this function may take on its behalf. `conflict` rather than
 * `validation`: nothing about the request is malformed, the current state is
 * what refuses it, which is also the category whose French message already tells
 * the reader to reload and try again.
 *
 * The message names no status. It is developer-authored English that ends up in
 * `error.stack` and therefore in every log line carrying it (CLAUDE.md §7); the
 * pair that was refused belongs in the caller's own log fields, not interpolated
 * here.
 */
export function assertProjectStatusTransition(
  from: ProjectStatus,
  to: ProjectStatus,
): Result<void> {
  if (canTransition(from, to)) return succeed();

  return fail(
    new ConflictError({
      code: "ILLEGAL_STATUS_TRANSITION",
      message: "the project status cannot move between these two states",
    }),
  );
}
