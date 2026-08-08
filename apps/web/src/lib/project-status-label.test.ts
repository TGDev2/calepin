import { describe, expect, it } from "vitest";

import { projectStatusLabel } from "./project-status-label";

// The ten statuses of `ProjectStatus` (`prisma/schema.prisma`), spelled out
// rather than imported: apps/web may never import `@prisma/client`
// (CLAUDE.md §3.5), and `projectStatusLabel`'s own `Record` type already
// forces every status to have a label at compile time — this list is what
// proves each one reads sensibly in French, not what proves the set is
// complete.
const STATUSES_AND_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["DRAFT", "Brouillon"],
  ["ANALYSIS_IN_PROGRESS", "Analyse en cours"],
  ["DIRECTION_TO_CHOOSE", "Direction à choisir"],
  ["BIBLE_TO_VALIDATE", "Bible à valider"],
  ["OUTLINE_IN_PROGRESS", "Plan en construction"],
  ["WRITING_IN_PROGRESS", "Rédaction en cours"],
  ["REVISION", "Révision"],
  ["COMPLETED", "Terminé"],
  ["PUBLISHED", "Publié"],
  ["ARCHIVED", "Archivé"],
];

describe("projectStatusLabel", () => {
  it.each(STATUSES_AND_LABELS)("labels %s as %s", (status, label) => {
    expect(projectStatusLabel(status as Parameters<typeof projectStatusLabel>[0])).toBe(label);
  });
});
