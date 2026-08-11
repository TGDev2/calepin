/**
 * Fait explicite versus interprétation, enforced rather than requested
 * (CAL-071).
 *
 * The specification asks that an assertion the source text does not support be
 * **systematically** marked as an interpretation. CAL-070 asked the model for
 * that discipline in the prompt and carried the marker in the schema, which is
 * where a well-behaved answer ends. This is what happens to the other kind.
 *
 * **The rule.** An element marked `FACTUAL` must cite the passage that supports
 * it, and that passage must really be in the text. An element that cites
 * nothing, and an element whose quotation is nowhere in the text, are both
 * assertions the text does not support: they come back `INTERPRETATION`. A
 * quotation that is not in the text is dropped whatever the element's marker,
 * because a passage the author never wrote is not evidence of anything — and
 * CAL-072 puts `evidence` on the screen, so leaving it would show them an
 * invented sentence attributed to their own text.
 *
 * **Provenance, never sufficiency.** This answers one question — is the
 * quotation really there — and never whether it supports what it is attached
 * to. A model cannot be caught inventing a reading here; it can be caught
 * inventing a passage, and the acceptance criterion is about the second.
 *
 * **Only the marker the model chose is rewritten.** `ANALYSIS_FIXED_KINDS`
 * names the five sections whose marker is a property of the section's own
 * definition, and there is nothing to verify in a marker nobody asserted. It is
 * also what keeps this total: the output is the input's type, and a reclassified
 * factual summary would be a value `sourceTextAnalysisSchema` refuses.
 *
 * **Reclassification is the safe direction.** Every judgement here is made so
 * that doubt lands on `INTERPRETATION`: a quotation the matcher cannot find
 * costs the author a marker, while one it finds too easily costs them the
 * distinction the product is judged on.
 */

import { InternalError, toFieldPath } from "@calepin/shared/errors";
import { createVerbatimMatcher, type VerbatimMatcher } from "@calepin/shared/text";

import {
  ANALYSIS_FIXED_KINDS,
  ANALYSIS_SECTION_FIELDS,
  ANALYSIS_SECTIONS,
  type AnalysisElementKind,
  type AnalysisSection,
  type SourceTextAnalysis,
  sourceTextAnalysisSchema,
} from "./schema";

/**
 * `Symbol.for`, for the reason `ProjectScope` and `RenderedPrompt` use one:
 * `apps/web` compiles `packages/*` from source into more than one chunk graph,
 * so a module-local symbol would make an analysis verified on one side
 * unrecognisable on the other (CLAUDE.md §12).
 */
export const VERIFIED_ANALYSIS_BRAND: unique symbol = Symbol.for(
  "calepin.VerifiedSourceTextAnalysis",
);

/**
 * An analysis whose every quotation has been read against the source text it
 * claims to come from.
 *
 * Branded, and mintable only by `verifyAnalysisEvidence` — the discipline
 * `ProjectScope` and `AcceptedOperationEstimate` already use. That is what
 * makes *systematically* a property of the type instead of a rule someone has
 * to remember: persistence (CAL-073+) takes one of these, so an analysis that
 * skipped the check has no way of being written.
 */
export type VerifiedSourceTextAnalysis = SourceTextAnalysis & {
  readonly [VERIFIED_ANALYSIS_BRAND]: true;
};

export function isVerifiedAnalysis(value: unknown): value is VerifiedSourceTextAnalysis {
  return typeof value === "object" && value !== null && VERIFIED_ANALYSIS_BRAND in value;
}

/**
 * Why an element was corrected. Two, because they are two different failures of
 * the same rule: nothing was cited, or what was cited is not there. The second
 * is the one worth watching — it is a model quoting from memory.
 */
export const EVIDENCE_CORRECTION_REASONS = ["no-quotation", "quotation-not-found"] as const;

export type EvidenceCorrectionReason = (typeof EVIDENCE_CORRECTION_REASONS)[number];

/**
 * One element the check changed.
 *
 * Where it was and what happened to it — never the statement and never the
 * quotation. This is the record somebody will put in a log line the first time
 * a mission misbehaves, and both of those are literary content (§9).
 */
export interface EvidenceCorrection {
  readonly section: AnalysisSection;
  /** Position inside the section; always 0 in a paragraph section, which holds one element. */
  readonly index: number;
  readonly reason: EvidenceCorrectionReason;
  readonly reclassified: boolean;
  readonly quotationDropped: boolean;
}

/**
 * What the check found, in counts and identifiers — safe to log whole.
 *
 * `supported` is `quoted` minus the quotations dropped: an element that cited
 * something either kept it or lost it, and there is no third outcome.
 */
export interface AnalysisEvidenceReport {
  readonly elements: number;
  readonly quoted: number;
  readonly supported: number;
  readonly reclassified: number;
  readonly quotationsDropped: number;
  readonly corrections: readonly EvidenceCorrection[];
}

export interface AnalysisEvidenceCheck {
  readonly analysis: VerifiedSourceTextAnalysis;
  readonly report: AnalysisEvidenceReport;
}

/**
 * The shape every element of the seventeen sections shares — the label is the
 * only thing a paragraph section does not have. Structural on purpose: the
 * check reads the same three fields everywhere, and writing it against the
 * seventeen concrete field types would be seventeen copies of one rule.
 */
export interface CheckedElement {
  readonly kind: AnalysisElementKind;
  readonly statement: string;
  readonly evidence: string | null;
  readonly label?: string | null;
}

/**
 * Reads every quotation of an analysis against the text it was produced from,
 * and returns the analysis the author may be shown.
 *
 * The input is an answer that has already been parsed by
 * `sourceTextAnalysisSchema` (§6: parse first, then use). The output is parsed
 * again — not out of suspicion, but because that parse *is* the mint: it proves
 * the correction stayed inside the contract instead of claiming it, and it
 * hands back the type with nothing cast.
 */
export function verifyAnalysisEvidence(
  analysis: SourceTextAnalysis,
  sourceText: string,
): AnalysisEvidenceCheck {
  const quotesTheText = createVerbatimMatcher(sourceText);
  const corrections: EvidenceCorrection[] = [];
  const corrected: Record<string, unknown> = {};

  let elements = 0;
  let quoted = 0;

  for (const section of ANALYSIS_SECTIONS) {
    const field = ANALYSIS_SECTION_FIELDS[section];
    const value = analysis[field];
    const listed = Array.isArray(value);
    const checked = (listed ? value : [value]).map((element: CheckedElement, index: number) => {
      elements += 1;

      if (element.evidence !== null) {
        quoted += 1;
      }

      const outcome = checkElementEvidence(element, section, index, quotesTheText);

      if (outcome.correction !== undefined) {
        corrections.push(outcome.correction);
      }

      return outcome.element;
    });

    corrected[field] = listed ? checked : checked[0];
  }

  const quotationsDropped = corrections.filter((entry) => entry.quotationDropped).length;

  return {
    analysis: mint(corrected),
    report: {
      elements,
      quoted,
      supported: quoted - quotationsDropped,
      reclassified: corrections.filter((entry) => entry.reclassified).length,
      quotationsDropped,
      corrections,
    },
  };
}

/**
 * The rule itself, for one element — package-internal (not on `index.ts`), like
 * `ceilingFor`.
 *
 * `section-regeneration.ts` runs the *same function* over a single section
 * (CAL-077) instead of a second copy of these fifteen lines. A rule stated
 * twice is a rule that will be relaxed once, and this one is the
 * specification's own acceptance criterion.
 */
export function checkElementEvidence(
  element: CheckedElement,
  section: AnalysisSection,
  index: number,
  quotesTheText: VerbatimMatcher,
): { readonly element: CheckedElement; readonly correction?: EvidenceCorrection } {
  const rewritable = !(section in ANALYSIS_FIXED_KINDS);
  const quotation = element.evidence;

  if (quotation === null) {
    // Marked as a fact and citing nothing: the one case the specification
    // states outright. A section that fixes its own marker is left alone, and
    // an interpretation was never claiming a passage in the first place.
    if (element.kind !== "FACTUAL" || !rewritable) {
      return { element };
    }

    return {
      element: { ...element, kind: "INTERPRETATION" },
      correction: {
        section,
        index,
        reason: "no-quotation",
        reclassified: true,
        quotationDropped: false,
      },
    };
  }

  if (quotesTheText(quotation)) {
    return { element };
  }

  const reclassified = element.kind === "FACTUAL" && rewritable;

  return {
    element: {
      ...element,
      kind: reclassified ? "INTERPRETATION" : element.kind,
      evidence: null,
    },
    correction: {
      section,
      index,
      reason: "quotation-not-found",
      reclassified,
      quotationDropped: true,
    },
  };
}

/**
 * A throw rather than a `Result` (§7): the only way here is a bug in the walk
 * above — the corrections it makes are dropping a quotation, which every
 * section allows, and relaxing a marker in a section that does not fix one. The
 * path travels, the value never does (§9).
 */
function mint(corrected: Record<string, unknown>): VerifiedSourceTextAnalysis {
  const parsed = sourceTextAnalysisSchema.safeParse(corrected);

  if (!parsed.success) {
    throw new InternalError({
      message: "verifying an analysis produced a shape its own schema refuses",
      fieldPath: toFieldPath(parsed.error.issues[0]?.path ?? []),
    });
  }

  return { ...parsed.data, [VERIFIED_ANALYSIS_BRAND]: true };
}
