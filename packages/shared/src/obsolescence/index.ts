/**
 * `@calepin/shared/obsolescence` — which stages a source-text edit puts in
 * doubt (CAL-046).
 *
 * Pure, like `@calepin/shared/project-status` next door: the chain of stages,
 * and the rule that reads a report off what the project holds. Nothing here
 * touches a database, a clock or an environment — gathering the facts is
 * `@calepin/shared/repository`'s job, and saying it in French is `apps/web`'s.
 */

export {
  assessSourceTextObsolescence,
  type DownstreamStageState,
  OBSOLESCENCE_REASONS,
  type ObsolescenceReason,
  type SourceTextDependencyState,
  type SourceTextObsolescence,
  type StageObsolescence,
} from "./assess";
export {
  DOWNSTREAM_STAGES,
  type DownstreamStage,
  downstreamStageRank,
  isDownstreamStage,
} from "./stages";
