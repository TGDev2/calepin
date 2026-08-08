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
  deleteProject,
  getProjectForOwner,
  listProjectDashboardRows,
  listProjectsForOwner,
  type ProjectDashboardRow,
  type ProjectStatus,
  updateProject,
  type UpdateProjectInput,
} from "./project";
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
