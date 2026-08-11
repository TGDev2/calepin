/**
 * What retaining another novelistic direction puts in doubt (CAL-086).
 *
 * The second consumer of `./chain`, and the reason that walk was extracted. A
 * source-text edit is a change at the top of the graph; retaining a different
 * direction — or rewriting the retained one — is a change one rung down, so
 * the chain walked is exactly the stages *after* `direction`: the bible, the
 * plan and the chapters, in that order. Nothing above moves, because nothing
 * above was built on the direction.
 *
 * **Two answers from one set of facts, and the product needs both.**
 *
 *   - `current` — what stands in doubt *today*, judged against the moment the
 *     retained direction last moved. It is the standing notice the author sees
 *     for as long as it holds, and it clears stage by stage as they work their
 *     way back down the chain, exactly as CAL-046's does.
 *   - `onChange` — what changing the direction *now* would put in doubt: every
 *     downstream stage the project holds, because at the instant of a change
 *     all of them predate it. It is the explicit warning the backlog asks for,
 *     and computing it from the same facts is what keeps the sentence shown
 *     before a change and the report shown after it from disagreeing.
 *
 * **Nothing is deleted and nothing is regenerated.** The backlog says so of
 * this change in the same words it used of a source-text edit, and the rule is
 * the same one: provenance is the only claim that can be made without reading
 * the prose, and whether a bible written from another direction is worth
 * keeping is the author's judgement, not this module's.
 *
 * Counts and stage names only (CLAUDE.md §9). This file imports nothing but its
 * own siblings.
 */

import { assessStageChain, type DownstreamStageState, type StageChainAssessment } from "./chain";
import { DOWNSTREAM_STAGES, type DownstreamStage, downstreamStageRank } from "./stages";

/**
 * The stages built on the retained direction — everything strictly after
 * `direction` in the chain.
 *
 * The type states which ones by exclusion because TypeScript cannot compare
 * ranks; the *list* is computed from `DOWNSTREAM_STAGES` rather than written
 * out, because the array order **is** the dependency graph (`./stages`) and a
 * hand-written `["bible", "outline", "chapters"]` would be the second table
 * that file exists to avoid. `canonical-direction.test.ts` pins the computed
 * list against the chain, so a stage inserted below `direction` joins it with
 * nothing here edited, and one inserted above it that the `Exclude` failed to
 * account for fails at the `Record` the repository has to fill.
 */
export type DirectionDependentStage = Exclude<DownstreamStage, "analysis" | "direction">;

export const DIRECTION_DEPENDENT_STAGES: readonly DirectionDependentStage[] =
  DOWNSTREAM_STAGES.filter(
    (stage): stage is DirectionDependentStage =>
      downstreamStageRank(stage) > downstreamStageRank("direction"),
  );

/** Every fact the rule reads, gathered by the repository in one statement. */
export interface CanonicalDirectionDependencyState {
  /** Whether the project has retained a direction at all. */
  readonly hasCanonicalDirection: boolean;
  readonly stages: Readonly<Record<DirectionDependentStage, DownstreamStageState>>;
}

export interface CanonicalDirectionObsolescence {
  readonly hasCanonicalDirection: boolean;
  /** What the retained direction has already left behind. */
  readonly current: StageChainAssessment;
  /** What changing it now would leave behind. */
  readonly onChange: StageChainAssessment;
}

/**
 * Reads both answers off one set of facts.
 *
 * `onChange` is the same walk with `precedingCount` raised to `presentCount`:
 * *everything this project holds downstream was produced before a change made
 * now*, which is true by construction and needs no second query to establish.
 * A project holding nothing downstream therefore reports nothing on either
 * side, which is what makes the first choice of a direction a silent, ordinary
 * act rather than one preceded by a warning about work that does not exist.
 *
 * With no direction retained, `current` is empty by the same arithmetic the
 * repository's statement produces: nothing can descend from a direction that
 * was never chosen.
 */
export function assessCanonicalDirectionObsolescence(
  state: CanonicalDirectionDependencyState,
): CanonicalDirectionObsolescence {
  const entries = DIRECTION_DEPENDENT_STAGES.map((stage) => ({ stage, ...state.stages[stage] }));

  return {
    hasCanonicalDirection: state.hasCanonicalDirection,
    current: assessStageChain(entries, "canonical-direction-changed"),
    onChange: assessStageChain(
      entries.map((entry) => ({ ...entry, precedingCount: entry.presentCount })),
      "canonical-direction-changed",
    ),
  };
}
