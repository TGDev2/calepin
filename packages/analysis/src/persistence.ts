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
import { ANALYSIS_SECTION_FIELDS, ANALYSIS_SECTIONS, type AnalysisSection } from "./schema";
import type { AnalysisElementDraft } from "./section-edit";

/**
 * One section's elements, in the order the answer listed them.
 *
 * The element type is `AnalysisElementDraft`, which the manual write path
 * already declares — *one element of a section in the shape persistence takes
 * it*, `label` present and null for a paragraph section rather than absent. One
 * shape for both write paths, as one schema already serves both.
 */
export interface ResolvedAnalysisSection {
  readonly section: AnalysisSection;
  readonly elements: readonly AnalysisElementDraft[];
}

/**
 * The seventeen sections of a verified diagnostic, ready to be written.
 *
 * Order is the enum's — the order the sections are asked for and the order the
 * diagnostic screen renders them in. It is deliberately *not* the order they
 * come back in: `getAnalysis` orders by `revisionNumber`, and seventeen
 * revisions written at once all carry the same one, so nothing downstream may
 * read the snapshot's array order as meaning anything. Position **inside** a
 * section is the answer's own, and the writer turns it into
 * `AnalysisElement.position`, which is ordered and does mean something.
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
