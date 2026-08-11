/**
 * `@calepin/shared/repository` — the owner access policy (CAL-023).
 *
 * Every read and write of project data goes through here, and every entry point
 * takes the owner explicitly: an owner id to open a scope, a `ProjectScope`
 * afterwards. Nothing in this surface hands out a database client — that is
 * `@calepin/shared/database`, which only a process shell may import
 * (CLAUDE.md §3.5).
 */

export {
  computeProjectAggregates,
  type ProjectAggregates,
  reconcileProjectAggregates,
  type TransactionClient,
  withProjectAggregates,
} from "./aggregates";
export {
  addAnalysisAnnotation,
  type AddAnalysisAnnotationInput,
  ANALYSIS_ANNOTATION_CHAR_CEILING,
  type AnalysisAnnotationSnapshot,
  type AnalysisAnnotationWritten,
  type AnalysisElementSnapshot,
  type AnalysisElementSubmission,
  type AnalysisSectionEdit,
  type AnalysisSectionRegeneration,
  type AnalysisSectionSnapshot,
  type AnalysisSnapshot,
  type AnalysisValidation,
  deleteAnalysisAnnotation,
  editAnalysisSection,
  type EditAnalysisSectionInput,
  getAnalysis,
  regenerateAnalysisSection,
  type RegenerateAnalysisSectionInput,
  type RegeneratedAnalysisElement,
  updateAnalysisAnnotation,
  type UpdateAnalysisAnnotationInput,
  validateAnalysis,
} from "./analysis";
export {
  type DuplicatedProject,
  duplicateProject,
  type DuplicateProjectInput,
} from "./duplication";
export {
  DUPLICATED_MODEL_NAMES,
  type DuplicatedModelName,
  DUPLICATION_PLAN,
  type DuplicationStep,
  type DuplicationTarget,
  isUnduplicatedModel,
  NEVER_COPIED_COLUMNS,
  UNDUPLICATED_MODELS,
  type UnduplicatedModelName,
} from "./duplication-plan";
export {
  type FailedGeneration,
  type GenerationContext,
  type GenerationExecutionStatus,
  type GenerationMission,
  getGenerationContextForProject,
  listFailedGenerations,
  listRecentGenerations,
  listRunningGenerations,
  type RecentGeneration,
  type RunningGeneration,
  type RunningGenerationStatus,
} from "./generation";
export {
  type ProjectCostByDay,
  type ProjectCostByMission,
  type ProjectCostSummary,
  readProjectCostSummary,
} from "./generation-cost";
export {
  type DeliverableGeneration,
  type DeliverableGenerationQuery,
  exhaustSpentGenerations,
  type GenerationRunTarget,
  listDeliverableGenerations,
  readGenerationForRun,
  reclaimExpiredAttempts,
  requeueOrphanedGenerations,
} from "./generation-delivery";
export { type MissionMeasurement, readMissionMeasurements } from "./generation-measurements";
export {
  type AttemptLeaseRenewal,
  cancelGeneration,
  claimGenerationAttempt,
  type ClaimGenerationAttemptInput,
  completeGenerationAttempt,
  createGenerationPersistence,
  DEFAULT_ATTEMPT_LEASE_MS,
  type GenerationCancellation,
  type GenerationPersistenceOptions,
  renewGenerationAttemptLease,
  type RenewGenerationAttemptLeaseInput,
  replayGeneration,
  type ReservedGeneration,
  reserveGeneration,
  type ReserveGenerationInput,
  updateGenerationProgress,
  type UpdateGenerationProgressInput,
} from "./generation-run";
export {
  delegateName,
  isProjectOwnedModel,
  PROJECT_OWNED_MODEL_NAMES,
  PROJECT_OWNED_MODELS,
  PROJECT_OWNER_FIELD,
  type ProjectOwnedModel,
  type ProjectOwnedModelName,
  UNOWNED_MODELS,
} from "./owned-models";
export {
  createProject,
  type CreateProjectInput,
  createProjectWithSourceText,
  type CreateProjectWithSourceTextInput,
  deleteProject,
  getProjectForOwner,
  getProjectTargetLength,
  listProjectDashboardRows,
  listProjectsForOwner,
  type ProjectDashboardQuery,
  type ProjectDashboardRow,
  type ProjectStatus,
  type ProjectTargetLength,
  updateProject,
  type UpdateProjectInput,
} from "./project";
export {
  archiveProject,
  readProjectProgress,
  reconcileProjectStatus,
  refreshProjectStatus,
  restoreProject,
  withProjectStatus,
} from "./project-status";
export {
  assertProjectScope,
  isProjectScope,
  openProjectScope,
  type ProjectOwnedFilter,
  projectOwnedFilter,
  type ProjectOwnerFilter,
  type ProjectScope,
  type ProjectScopeInput,
  requireOwnedRow,
  type ScopedFilter,
  scopedWhere,
} from "./scope";
export {
  getSourceText,
  listSourceTextVersions,
  readSourceTextObsolescence,
  type SourceTextEdit,
  type SourceTextSnapshot,
  type SourceTextVersionSummary,
  updateSourceText,
  type UpdateSourceTextInput,
} from "./source-text";
export { withProjectTransaction } from "./transaction";
