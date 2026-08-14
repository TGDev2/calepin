import type { $Enums } from "@prisma/client";

import { ANALYSIS_ELEMENT_KIND_LABELS, ANALYSIS_SECTION_LABELS } from "./labels";

/**
 * One element of the diagnostic, as anything holding one can offer it.
 *
 * **Structural, so a database row satisfies it as readily as a model answer** —
 * `checkTimelineArithmetic`'s device. `AnalysisSnapshot`'s own elements carry
 * more than this (a lineage, an origin, a provenance, the author's notes) and
 * are assignable as they stand, which is what lets the one function `getAnalysis`
 * feeds also serve a fixture and a screen.
 */
export interface AnalysisElementForPrompt {
  readonly kind: $Enums.AnalysisElementKind;
  readonly label: string | null;
  readonly statement: string;
  readonly evidence: string | null;
}

export interface AnalysisSectionForPrompt {
  readonly section: $Enums.AnalysisSection;
  readonly elements: readonly AnalysisElementForPrompt[];
}

/** The enum's order, read off the one table that names every section. */
const SECTION_ORDER: readonly string[] = Object.keys(ANALYSIS_SECTION_LABELS);

function elementLine(element: AnalysisElementForPrompt): string {
  const heading = element.label === null ? "" : `${element.label} — `;
  const marker = ANALYSIS_ELEMENT_KIND_LABELS[element.kind];
  const quotation = element.evidence === null ? "" : ` (« ${element.evidence} »)`;

  return `- [${marker}] ${heading}${element.statement}${quotation}`;
}

/**
 * The diagnostic as a mission downstream of it reads it — one heading per
 * section it holds, one line per element, each carrying its fact/interpretation
 * marker and, when it has one, the passage it rests on verbatim.
 *
 * **The order is the enum's, never the snapshot's.** `getAnalysis` orders by
 * revision number and folds last-seen-wins per section, so seventeen revisions
 * written in one statement all carry 1 and the array's order is whatever the
 * rows came back in. A prompt whose sections shuffle between two calls is a
 * prompt whose cache never hits and whose answers cannot be compared.
 *
 * **A section the analysis does not hold is absent, never blank.** Four sections
 * may legitimately be empty (`ANALYSIS_ELEMENT_COUNTS`), and an empty heading
 * would read to a model as a section the analysis found nothing to say about —
 * which is exactly what an empty section means, so an empty one is kept and a
 * missing one is not invented.
 *
 * The result carries the analysis's own wording: prompt and screen material,
 * never a log line (§9). What is safe to log is the number of sections.
 */
export function describeAnalysis(sections: readonly AnalysisSectionForPrompt[]): string {
  return [...sections]
    .sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section))
    .map((section) =>
      [
        `## ${ANALYSIS_SECTION_LABELS[section.section]}`,
        ...(section.elements.length === 0
          ? ["- (aucun élément dans cette section)"]
          : section.elements.map(elementLine)),
      ].join("\n"),
    )
    .join("\n\n");
}
