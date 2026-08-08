/**
 * `@calepin/shared/project-status` — the project lifecycle state machine
 * (CAL-034).
 *
 * Three things, and nothing else: the ten statuses, the complete table of
 * allowed transitions between them, and the derivation of a status from what a
 * project actually contains.
 *
 * It is pure. Nothing here reads a database, a clock or an environment, which is
 * what lets the whole machine be exercised by the `unit` Vitest project and lets
 * `apps/web` read it — for CAL-037's nine-step progress bar — without coming
 * near the data-access seam (CLAUDE.md §3.5). The rows behind a
 * `ProjectProgress` are gathered by `@calepin/shared/repository`, which is also
 * the only place a status is ever written.
 *
 * It lives in `@calepin/shared` rather than in a domain package for the reason
 * the project repository does: no domain owns a project, the seven of them hang
 * off one.
 */

export { deriveProjectStatus, PROJECT_STAGE_CONDITIONS, type ProjectProgress } from "./progress";
export {
  isProjectStage,
  isProjectStatus,
  PROJECT_STAGE_STATUSES,
  PROJECT_STATUSES,
  type ProjectStage,
  projectStageRank,
  type ProjectStatus,
} from "./statuses";
export {
  assertProjectStatusTransition,
  canTransition,
  PROJECT_STATUS_TRANSITIONS,
} from "./transitions";
