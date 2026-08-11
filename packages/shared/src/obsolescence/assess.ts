/**
 * Which stages a source-text edit puts in doubt (CAL-046).
 *
 * **Derived, never stored.** There is no `obsoletedAt` column and there is not
 * going to be one. A stored flag has to be maintained by every write path that
 * could invalidate it, and four of the five stages have no write path yet — a
 * column nobody sets reads as "everything is fine" for exactly as long as it
 * takes someone to trust it. The same reasoning `deriveProjectStatus` records
 * for the project status, one dependency down.
 *
 * **Two ways a stage falls behind, and the second is the load-bearing one.**
 *
 *   - *Directly*: the stage was last produced before the current version of the
 *     source text existed.
 *   - *By inheritance*: something it was built on is itself obsolete.
 *
 * Both live in `./chain` since CAL-086, which asks the same question of a
 * different change — the retained direction — and reuses the walk rather than
 * writing a second one. What is left here is the source text's own half: the
 * version the stages are judged against, and the fact that the chain walked is
 * all five stages, because a source-text edit is a change at the very top of
 * the graph.
 *
 * *Potentially obsolete, and nothing stronger*: see `./chain`. Nothing here
 * writes, deletes or enqueues anything, and the report carries counts, never
 * content (CLAUDE.md §9).
 *
 * This file imports nothing but its own siblings — same constraint as
 * `../project-status`.
 */

import { assessStageChain, type DownstreamStageState, type StageChainAssessment } from "./chain";
import { DOWNSTREAM_STAGES, type DownstreamStage } from "./stages";

/** Every fact the rule reads, gathered by the repository in one statement. */
export interface SourceTextDependencyState {
  /** The version every stage is judged against — the highest one written. */
  readonly currentVersionNumber: number;
  /** How many versions the source text has had, the first one included. */
  readonly versionCount: number;
  readonly stages: Readonly<Record<DownstreamStage, DownstreamStageState>>;
}

export interface SourceTextObsolescence extends StageChainAssessment {
  readonly currentVersionNumber: number;
  readonly versionCount: number;
}

/**
 * Walks the whole chain and answers which stages the current version of the
 * source text has left behind — `assessStageChain` over all five stages, since
 * the source text is upstream of every one of them.
 */
export function assessSourceTextObsolescence(
  state: SourceTextDependencyState,
): SourceTextObsolescence {
  const assessment = assessStageChain(
    DOWNSTREAM_STAGES.map((stage) => ({ stage, ...state.stages[stage] })),
    "source-text-changed",
  );

  return {
    currentVersionNumber: state.currentVersionNumber,
    versionCount: state.versionCount,
    ...assessment,
  };
}
