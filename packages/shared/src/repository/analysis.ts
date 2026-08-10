/**
 * The narrative diagnostic, read back — what the screen of CAL-072 shows.
 *
 * No write path lives here yet: CAL-073 owns editing and annotation, and
 * nothing today produces an `Analysis` row except a hand-seeded fixture (no
 * executor is registered for `analyze-source-text`, CLAUDE.md §13). A project
 * without one is a legitimate, expected state rather than a failure, which is
 * why this reads as a bare nullable rather than a `Result` — the same choice
 * `readGenerationForRun` already makes for "no such row", not `getSourceText`'s
 * (every project is guaranteed a source text at creation; no such guarantee
 * exists for an analysis).
 */

import type { $Enums } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";

/** One assertion the diagnostic makes about the source text. */
export interface AnalysisElementSnapshot {
  readonly kind: $Enums.AnalysisElementKind;
  readonly label: string | null;
  readonly statement: string;
  readonly evidence: string | null;
}

/** A section's current content — the revision with the highest number. */
export interface AnalysisSectionSnapshot {
  readonly section: $Enums.AnalysisSection;
  readonly revisionNumber: number;
  readonly elements: readonly AnalysisElementSnapshot[];
}

/** The diagnostic as it stands: only the sections that have been written. */
export interface AnalysisSnapshot {
  readonly validatedAt: Date | null;
  readonly sections: readonly AnalysisSectionSnapshot[];
}

/**
 * The project's analysis, or `null` when it has not been produced yet.
 *
 * **The current revision of a section is the one with the highest
 * `revisionNumber`.** `AnalysisSectionRevision` carries no `isCurrent` flag on
 * purpose (its own doc comment: a flag could point at revision 2 while
 * revision 3 exists, and no constraint can forbid it) — so this reads every
 * revision ordered ascending and keeps the last one seen per section, which is
 * that same rule written as a fold instead of left implicit.
 */
export async function getAnalysis(scope: ProjectScope): Promise<AnalysisSnapshot | null> {
  assertProjectScope(scope);

  const analysis = await getDatabaseClient().analysis.findFirst({
    where: scopedWhere("Analysis", scope),
    select: {
      validatedAt: true,
      sectionRevisions: {
        orderBy: { revisionNumber: "asc" },
        select: {
          section: true,
          revisionNumber: true,
          elements: {
            orderBy: { position: "asc" },
            select: { kind: true, label: true, statement: true, evidence: true },
          },
        },
      },
    },
  });

  if (analysis === null) return null;

  const currentBySection = new Map<$Enums.AnalysisSection, AnalysisSectionSnapshot>();
  for (const revision of analysis.sectionRevisions) {
    currentBySection.set(revision.section, revision);
  }

  return { validatedAt: analysis.validatedAt, sections: [...currentBySection.values()] };
}
