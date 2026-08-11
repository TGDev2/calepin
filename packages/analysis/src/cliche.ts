/**
 * What `detect-cliche-risks` is allowed to return (CAL-075, §6).
 *
 * The dedicated pass over the déjà-lu. The seventeen-section diagnostic keeps
 * a `CLICHE_RISKS` section — one sentence per slope, among sixteen other
 * concerns — and §5.4 is why this is a second mission rather than a bigger
 * section: hunting convention across four fronts, with a passage and a double
 * argument per finding, is a different instruction, a different contract and a
 * different budget from diagnosing everything at once. CAL-140 is the
 * novel-side twin and owns `QualityIssue`; this one reads the source text.
 *
 * **A finding without a passage is not a finding.** The acceptance criterion —
 * *chaque cliché signalé cite le passage concerné* — makes `evidence` required
 * where the diagnostic's is nullable: there is no whole-text fallback here,
 * because "this text leans on convention somewhere" is exactly the unanchored
 * remark the specification refuses. `verifyClicheRiskEvidence` below holds the
 * schema to it: a quotation the text does not contain costs the whole finding,
 * not just the quotation, since without its passage the finding has nothing
 * left to stand on.
 *
 * **No score, structurally** (cahier des charges 1195–1199: no arbitrary
 * number presented as proof of banality or singularity). The contract carries
 * no numeric field anywhere — not a severity, not a confidence, not a count
 * presented as a measure — and `cliche.test.ts` pins that shape, so the
 * prohibition survives the next person's helpful rating column. What argues is
 * `whyConventional` and `whatItPrevents`, in words.
 *
 * **No `kind` field either.** A cliché judgement is an interpretation by
 * definition — `ANALYSIS_FIXED_KINDS` already fixes the sibling section's
 * marker — and a literal that can hold one value is a field that carries
 * nothing. What is factual here is the passage, and the passage is checked.
 *
 * **Emptiness is the honest answer.** A singular text yields an empty list,
 * and the prompt says so out loud; a minimum above zero would order the model
 * to invent the convention it could not find, which is this mission's own
 * cliché.
 */

import { InternalError, toFieldPath } from "@calepin/shared/errors";
import { createVerbatimMatcher } from "@calepin/shared/text";
import { z } from "zod";

import {
  ANALYSIS_CHAR_CEILINGS,
  ANALYSIS_LABEL_CHAR_CEILING,
  ANALYSIS_WORD_TARGETS,
  ceilingFor,
} from "./schema";

/**
 * The four fronts the backlog names: situations, personnages, formules,
 * retournements. Closed, so a screen can label them and a report can name one
 * without carrying a word of the text (§9).
 */
export const CLICHE_RISK_CATEGORIES = ["situation", "character", "formula", "reversal"] as const;

export type ClicheRiskCategory = (typeof CLICHE_RISK_CATEGORIES)[number];

/**
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern. `evidence` reuses
 * the diagnostic's own target: one citation discipline, one number.
 */
export const CLICHE_RISK_WORD_TARGETS = {
  /** Why this passage is conventional — the argued part, never a verdict. */
  whyConventional: 60,
  /** What leaning on it would foreclose for the novel. */
  whatItPrevents: 40,
  evidence: ANALYSIS_WORD_TARGETS.evidence,
} as const;

/** The character ceilings the schema enforces, derived as the diagnostic's are. */
export const CLICHE_RISK_CHAR_CEILINGS = {
  whyConventional: ceilingFor(CLICHE_RISK_WORD_TARGETS.whyConventional),
  whatItPrevents: ceilingFor(CLICHE_RISK_WORD_TARGETS.whatItPrevents),
  evidence: ANALYSIS_CHAR_CEILINGS.evidence,
} as const;

/**
 * A minimum of zero is the design statement above; the maximum bounds the
 * answer without ranking it — twelve is room for a text conventional on every
 * front, and past it a list stops being findings and becomes a catalogue.
 */
export const CLICHE_RISK_COUNT = { min: 0, max: 12 } as const;

function argued(ceiling: number): z.ZodString {
  return z.string().trim().min(1).max(ceiling);
}

/**
 * One conventional element: where it sits (`category`), what convention it is
 * (`label`), the passage that shows it (`evidence`, verbatim and required),
 * why it is conventional and what it prevents. Five fields, all words.
 */
const clicheRiskSchema = z.strictObject({
  category: z.enum(CLICHE_RISK_CATEGORIES),
  label: z.string().trim().min(1).max(ANALYSIS_LABEL_CHAR_CEILING),
  evidence: z.string().trim().min(1).max(CLICHE_RISK_CHAR_CEILINGS.evidence),
  whyConventional: argued(CLICHE_RISK_CHAR_CEILINGS.whyConventional),
  whatItPrevents: argued(CLICHE_RISK_CHAR_CEILINGS.whatItPrevents),
});

/** The answer to `detect-cliche-risks`. */
export const clicheRiskDetectionSchema = z.strictObject({
  risks: z.array(clicheRiskSchema).min(CLICHE_RISK_COUNT.min).max(CLICHE_RISK_COUNT.max),
});

export type ClicheRiskDetection = z.infer<typeof clicheRiskDetectionSchema>;

export type ClicheRisk = ClicheRiskDetection["risks"][number];

/**
 * `Symbol.for`, for the reason `VerifiedSourceTextAnalysis` uses one: the
 * packages are compiled from source into more than one chunk graph, and a
 * detection verified on one side must stay recognisable on the other
 * (CLAUDE.md §12).
 */
export const VERIFIED_CLICHE_DETECTION_BRAND: unique symbol = Symbol.for(
  "calepin.VerifiedClicheRiskDetection",
);

/**
 * A detection whose every quotation has been read against the source text —
 * mintable only by `verifyClicheRiskEvidence`, the discipline
 * `VerifiedSourceTextAnalysis` set. Persistence, when its task comes, takes
 * one of these.
 */
export type VerifiedClicheRiskDetection = ClicheRiskDetection & {
  readonly [VERIFIED_CLICHE_DETECTION_BRAND]: true;
};

export function isVerifiedClicheRiskDetection(
  value: unknown,
): value is VerifiedClicheRiskDetection {
  return typeof value === "object" && value !== null && VERIFIED_CLICHE_DETECTION_BRAND in value;
}

/**
 * One finding the check removed: where it stood and on which front — never its
 * label, its argument or its quotation, all three of which are literary
 * content (§9). The index is the position in the answer as received.
 */
export interface ClicheRiskDrop {
  readonly index: number;
  readonly category: ClicheRiskCategory;
}

/** What the check found, in counts and identifiers — safe to log whole. */
export interface ClicheRiskEvidenceReport {
  readonly risks: number;
  readonly kept: number;
  readonly dropped: number;
  readonly drops: readonly ClicheRiskDrop[];
}

export interface ClicheRiskEvidenceCheck {
  readonly detection: VerifiedClicheRiskDetection;
  readonly report: ClicheRiskEvidenceReport;
}

/**
 * Reads every finding's quotation against the text it claims to come from, and
 * returns the detection the author may be shown.
 *
 * CAL-071's rule with one deliberate difference: the diagnostic could demote
 * an unsupported element to `INTERPRETATION` and keep it, because its evidence
 * is optional; here the passage *is* the finding's standing, so a quotation
 * the matcher cannot find removes the finding whole. Provenance, never
 * sufficiency, as before — this answers whether the passage exists, not
 * whether it is conventional.
 *
 * The input has already been parsed by `clicheRiskDetectionSchema` (§6). The
 * output is parsed again because that parse is the mint: it proves the
 * filtering stayed inside the contract, and it hands back the type with
 * nothing cast.
 */
export function verifyClicheRiskEvidence(
  detection: ClicheRiskDetection,
  sourceText: string,
): ClicheRiskEvidenceCheck {
  const quotesTheText = createVerbatimMatcher(sourceText);
  const drops: ClicheRiskDrop[] = [];
  const kept: ClicheRisk[] = [];

  detection.risks.forEach((risk, index) => {
    if (quotesTheText(risk.evidence)) {
      kept.push(risk);
    } else {
      drops.push({ index, category: risk.category });
    }
  });

  return {
    detection: mint(kept),
    report: {
      risks: detection.risks.length,
      kept: kept.length,
      dropped: drops.length,
      drops,
    },
  };
}

/**
 * A throw rather than a `Result` (§7): removing entries from a list whose
 * minimum is zero cannot leave the contract, so the only way here is a bug.
 * The path travels, the value never does (§9).
 */
function mint(risks: readonly ClicheRisk[]): VerifiedClicheRiskDetection {
  const parsed = clicheRiskDetectionSchema.safeParse({ risks });

  if (!parsed.success) {
    throw new InternalError({
      message: "verifying a cliché detection produced a shape its own schema refuses",
      fieldPath: toFieldPath(parsed.error.issues[0]?.path ?? []),
    });
  }

  return { ...parsed.data, [VERIFIED_CLICHE_DETECTION_BRAND]: true };
}
