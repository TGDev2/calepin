import type { OutlineChapterRow } from "@calepin/shared/repository";

type ChapterStatus = OutlineChapterRow["status"];

/**
 * The French label for a chapter's status (CAL-104) — order matches
 * `ChapterStatus` in `prisma/schema.prisma`, `project-status-label.ts`'s own
 * shape.
 *
 * Presentation only: the transitions between these statuses belong to the
 * business layer, not here.
 */
const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  PLANNED: "Planifié",
  TO_WRITE: "À rédiger",
  GENERATING: "Génération en cours",
  FIRST_DRAFT: "Premier jet",
  TO_REVISE: "À corriger",
  VALIDATED: "Validé",
  LOCKED: "Verrouillé",
};

export function chapterStatusLabel(status: ChapterStatus): string {
  return CHAPTER_STATUS_LABELS[status];
}
