/**
 * A verified diagnostic, as the rows that store it (CAL-209).
 *
 * The first half of the first write path for a generated result, and the split
 * it sits on is forced rather than chosen. `@calepin/shared` may not import a
 * domain (§3.2), so the writer — `writeGeneratedAnalysisWithin` in
 * `@calepin/shared/repository` — can never see a `VerifiedSourceTextAnalysis`
 * and could never inspect its brand; `section-regeneration.ts` already wrote
 * that sentence down for its own path. So the domain resolves and `shared`
 * writes, the division `parseAnalysisSectionEdit` and `regenerateAnalysisSection`
 * already draw one section at a time.
 *
 * **It takes a verified analysis and nothing else.** The brand is minted only by
 * `verifyAnalysisEvidence`, so an answer whose quotations were never read back
 * against the source text has no way of reaching a row — CAL-071's check stops
 * being a step a caller remembers and becomes a shape the write path requires.
 *
 * **Nothing is decided here.** The walk is `ANALYSIS_SECTIONS` ×
 * `ANALYSIS_SECTION_FIELDS`, exactly as `verifyAnalysisEvidence`'s is: seventeen
 * groups, in the enum's own order — which is the order the sections are asked
 * for, produced and displayed in. A paragraph section holds one element and no
 * label; a listed section holds its array. Total by construction, so a section
 * the answer left empty comes back as an empty group rather than as no group at
 * all: the writer records it, because a section that *became* empty must not
 * leave the previous revision on screen.
 *
 * Pure, and therefore on the root barrel: it reaches no database, no queue and
 * no clock, so a `"use client"` component importing `@calepin/analysis` is no
 * worse off for it (§12).
 */

import type { CheckedElement, VerifiedSourceTextAnalysis } from "./evidence";
import {
  ANALYSIS_SECTION_FIELDS,
  ANALYSIS_SECTIONS,
  type AnalysisElementKind,
  type AnalysisSection,
} from "./schema";

/**
 * One element as a row will hold it.
 *
 * Structurally `RegeneratedAnalysisElement`, the writer's own input type, and
 * deliberately not an import of it: a domain declaring what it produces, rather
 * than restating what `shared` accepts, is what keeps the dependency running one
 * way. The label is `null` rather than absent for a paragraph section, because
 * the column is nullable and *this section has no heading* is an answer.
 */
export interface ResolvedAnalysisElement {
  readonly kind: AnalysisElementKind;
  readonly label: string | null;
  readonly statement: string;
  readonly evidence: string | null;
}

/** One section's elements, in the order the answer listed them. */
export interface ResolvedAnalysisSection {
  readonly section: AnalysisSection;
  readonly elements: readonly ResolvedAnalysisElement[];
}

/**
 * The seventeen sections of a verified diagnostic, ready to be written.
 *
 * Order is the enum's, and it is load-bearing twice: it is the order
 * `getAnalysis` folds the revisions back in, and it is the order the diagnostic
 * screen renders. Position inside a section is the answer's own, and the writer
 * turns it into `AnalysisElement.position`.
 */
export function resolveSourceTextAnalysis(
  analysis: VerifiedSourceTextAnalysis,
): readonly ResolvedAnalysisSection[] {
  return ANALYSIS_SECTIONS.map((section) => {
    const value = analysis[ANALYSIS_SECTION_FIELDS[section]];
    const listed = Array.isArray(value);

    return {
      section,
      elements: (listed ? value : [value]).map((element: CheckedElement) => ({
        kind: element.kind,
        label: element.label ?? null,
        statement: element.statement,
        evidence: element.evidence,
      })),
    };
  });
}
