/**
 * `@calepin/shared/obsolescence` — which stages a change puts in doubt
 * (CAL-046 for a source-text edit, CAL-086 for the retained direction).
 *
 * Pure, like `@calepin/shared/project-status` next door: the chain of stages,
 * the walk that propagates doubt down it, and the two rules that read a report
 * off what the project holds. Nothing here touches a database, a clock or an
 * environment — gathering the facts is `@calepin/shared/repository`'s job, and
 * saying it in French is `apps/web`'s.
 */

export {
  assessSourceTextObsolescence,
  type SourceTextDependencyState,
  type SourceTextObsolescence,
} from "./assess";
export {
  assessCanonicalDirectionObsolescence,
  type CanonicalDirectionDependencyState,
  type CanonicalDirectionObsolescence,
  DIRECTION_DEPENDENT_STAGES,
  type DirectionDependentStage,
} from "./canonical-direction";
export {
  assessStageChain,
  type DirectObsolescenceReason,
  type DownstreamStageState,
  OBSOLESCENCE_REASONS,
  type ObsolescenceReason,
  type StageChainAssessment,
  type StageChainEntry,
  type StageObsolescence,
} from "./chain";
export {
  DOWNSTREAM_STAGES,
  type DownstreamStage,
  downstreamStageRank,
  isDownstreamStage,
} from "./stages";
