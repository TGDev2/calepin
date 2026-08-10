import type { GenerationExecutionStatus } from "@calepin/shared/repository";

/**
 * The French label for a generation's execution status (CAL-068) — the
 * five-value `Generation.status`, same shape as `project-status-label.ts`.
 *
 * Presentation only: what each status permits (a replay, a cancel) is decided
 * by the repository writes themselves, not here.
 */
export const GENERATION_EXECUTION_STATUSES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const satisfies readonly GenerationExecutionStatus[];

const GENERATION_STATUS_LABELS: Record<GenerationExecutionStatus, string> = {
  QUEUED: "En attente",
  RUNNING: "En cours",
  SUCCEEDED: "Réussie",
  FAILED: "Échouée",
  CANCELLED: "Annulée",
};

export function generationStatusLabel(status: GenerationExecutionStatus): string {
  return GENERATION_STATUS_LABELS[status];
}
