import type { ProjectStatus } from "@calepin/shared/repository";

/**
 * The French label for a project's status (CAL-032) — the dashboard's
 * "statut" and "étape actuelle du processus" alike, since the schema carries
 * one field for both. Order matches `ProjectStatus` in `prisma/schema.prisma`
 * and the wording the specification itself uses (CAL-001, CAL-034).
 *
 * Presentation only: the transition rules between these statuses belong to
 * the state machine CAL-034 builds in the business layer, not here.
 */
const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: "Brouillon",
  ANALYSIS_IN_PROGRESS: "Analyse en cours",
  DIRECTION_TO_CHOOSE: "Direction à choisir",
  BIBLE_TO_VALIDATE: "Bible à valider",
  OUTLINE_IN_PROGRESS: "Plan en construction",
  WRITING_IN_PROGRESS: "Rédaction en cours",
  REVISION: "Révision",
  COMPLETED: "Terminé",
  PUBLISHED: "Publié",
  ARCHIVED: "Archivé",
};

export function projectStatusLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status];
}
