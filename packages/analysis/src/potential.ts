/**
 * What `assess-novel-potential` is allowed to return (CAL-076, §6).
 *
 * The argued answer to *ce texte peut-il tenir la longueur cible, et par où ?*
 * The diagnostic's `DEVELOPMENT_POTENTIAL` section says in ~200 words what the
 * text could become; this mission reads the **validated** analysis and the
 * source text and appraises the reach of that promise on four axes the backlog
 * names: which elements can carry expansion, which would run dry, what is
 * missing to sustain the length, and which fragilities the development will
 * have to treat. §5.4 is why it is a mission of its own — a per-element
 * appraisal against a word count is a different instruction, contract and
 * budget from diagnosing everything at once.
 *
 * **The acceptance criterion is the schema's own minimum.** *Au moins trois
 * éléments à développer et deux fragilités* — `expansions` has `min: 3` and
 * `fragilities` has `min: 2`, so an assessment that has not done its job does
 * not parse. Unlike CAL-075's empty-is-honest list, a minimum here does not
 * order invention: every text has a best-three worth naming, and the appraisal
 * itself says how far each carries — which may be "not far".
 *
 * **Evidence is nullable, deliberately** — CAL-071's regime, not CAL-075's. An
 * appraisal of potential is an interpretation by definition: its standing is
 * its argument, and the quotation anchors it without constituting it. Making
 * the passage required would also let `verifyNovelPotentialEvidence` break the
 * two minimums above by dropping findings whole; instead an unfound quotation
 * is **cleared to null** and the appraisal survives on its argument. `gaps`
 * carry no evidence field at all: they name absences, and an absence has no
 * passage.
 *
 * **No score, structurally** (cahier des charges 1195–1199, restated by the
 * backlog: *aucune note chiffrée présentée comme mesure de qualité*). The
 * contract carries no numeric field anywhere — not a promise rating, not a
 * viability percentage — and `potential.test.ts` pins that shape. What argues
 * is `overall` and the per-item appraisals, in words.
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
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern. One number per
 * concept: every per-item argument shares `appraisal`, and `evidence` reuses
 * the diagnostic's own target — one citation discipline, one number.
 */
export const NOVEL_POTENTIAL_WORD_TARGETS = {
  /** What the text can genuinely sustain at the target length — the synthesis. */
  overall: 150,
  /** One argued appraisal, whichever axis it sits on. */
  appraisal: 60,
  evidence: ANALYSIS_WORD_TARGETS.evidence,
} as const;

/** The character ceilings the schema enforces, derived as the diagnostic's are. */
export const NOVEL_POTENTIAL_CHAR_CEILINGS = {
  overall: ceilingFor(NOVEL_POTENTIAL_WORD_TARGETS.overall),
  appraisal: ceilingFor(NOVEL_POTENTIAL_WORD_TARGETS.appraisal),
  evidence: ANALYSIS_CHAR_CEILINGS.evidence,
} as const;

/**
 * The two minimums are the backlog's "Fini quand" clause verbatim; the
 * maximums bound the answer without ranking it — past six per axis a
 * prioritisation becomes an inventory, and prioritising is this mission's
 * whole point. `exhaustions` and `gaps` may honestly be empty: a text can lack
 * nothing and wear nothing out.
 */
export const NOVEL_POTENTIAL_COUNTS = {
  expansions: { min: 3, max: 6 },
  exhaustions: { min: 0, max: 6 },
  gaps: { min: 0, max: 6 },
  fragilities: { min: 2, max: 6 },
} as const;

/**
 * The lists whose items may cite a passage — everything except `gaps`, which
 * name absences. Closed, so a verification report can say where a correction
 * happened without carrying a word of the text (§9).
 */
export const NOVEL_POTENTIAL_EVIDENCED_LISTS = [
  "expansions",
  "exhaustions",
  "fragilities",
] as const;

export type NovelPotentialEvidencedList = (typeof NOVEL_POTENTIAL_EVIDENCED_LISTS)[number];

function argued(ceiling: number): z.ZodString {
  return z.string().trim().min(1).max(ceiling);
}

const label = z.string().trim().min(1).max(ANALYSIS_LABEL_CHAR_CEILING);

/** Nullable, never absent: "no passage carries this" is said, not elided. */
const evidence = z.string().trim().min(1).max(NOVEL_POTENTIAL_CHAR_CEILINGS.evidence).nullable();

const appraisal = () => argued(NOVEL_POTENTIAL_CHAR_CEILINGS.appraisal);

/** An element that can carry expansion toward the target length, and how far. */
const expansionSchema = z.strictObject({
  label,
  evidence,
  whyItSustains: appraisal(),
});

/** An element that would run dry if asked to carry the length. */
const exhaustionSchema = z.strictObject({
  label,
  evidence,
  whyItExhausts: appraisal(),
});

/**
 * Something the text does not have and the length will need. No evidence
 * field: an absence has no passage to quote.
 */
const gapSchema = z.strictObject({
  label,
  whyNeeded: appraisal(),
});

/** A weakness the development will have to treat before it can lean on the text. */
const fragilitySchema = z.strictObject({
  label,
  evidence,
  whyFragile: appraisal(),
});

/** The answer to `assess-novel-potential`. */
export const novelPotentialAssessmentSchema = z.strictObject({
  overall: argued(NOVEL_POTENTIAL_CHAR_CEILINGS.overall),
  expansions: z
    .array(expansionSchema)
    .min(NOVEL_POTENTIAL_COUNTS.expansions.min)
    .max(NOVEL_POTENTIAL_COUNTS.expansions.max),
  exhaustions: z
    .array(exhaustionSchema)
    .min(NOVEL_POTENTIAL_COUNTS.exhaustions.min)
    .max(NOVEL_POTENTIAL_COUNTS.exhaustions.max),
  gaps: z
    .array(gapSchema)
    .min(NOVEL_POTENTIAL_COUNTS.gaps.min)
    .max(NOVEL_POTENTIAL_COUNTS.gaps.max),
  fragilities: z
    .array(fragilitySchema)
    .min(NOVEL_POTENTIAL_COUNTS.fragilities.min)
    .max(NOVEL_POTENTIAL_COUNTS.fragilities.max),
});

export type NovelPotentialAssessment = z.infer<typeof novelPotentialAssessmentSchema>;

export type NovelPotentialExpansion = NovelPotentialAssessment["expansions"][number];
export type NovelPotentialExhaustion = NovelPotentialAssessment["exhaustions"][number];
export type NovelPotentialGap = NovelPotentialAssessment["gaps"][number];
export type NovelPotentialFragility = NovelPotentialAssessment["fragilities"][number];

/**
 * `Symbol.for`, for the reason `VerifiedSourceTextAnalysis` uses one: the
 * packages are compiled from source into more than one chunk graph, and an
 * assessment verified on one side must stay recognisable on the other
 * (CLAUDE.md §12).
 */
export const VERIFIED_NOVEL_POTENTIAL_BRAND: unique symbol = Symbol.for(
  "calepin.VerifiedNovelPotentialAssessment",
);

/**
 * An assessment whose every quotation has been read against the source text —
 * mintable only by `verifyNovelPotentialEvidence`, the discipline
 * `VerifiedSourceTextAnalysis` set. Persistence, when its task comes, takes
 * one of these.
 */
export type VerifiedNovelPotentialAssessment = NovelPotentialAssessment & {
  readonly [VERIFIED_NOVEL_POTENTIAL_BRAND]: true;
};

export function isVerifiedNovelPotentialAssessment(
  value: unknown,
): value is VerifiedNovelPotentialAssessment {
  return typeof value === "object" && value !== null && VERIFIED_NOVEL_POTENTIAL_BRAND in value;
}

/**
 * One quotation the check cleared: which list and which position — never the
 * label, the argument or the quotation, all three of which are literary
 * content (§9). The index is the position in the answer as received.
 */
export interface NovelPotentialEvidenceCorrection {
  readonly list: NovelPotentialEvidencedList;
  readonly index: number;
}

/** What the check found, in counts and identifiers — safe to log whole. */
export interface NovelPotentialEvidenceReport {
  /** Items across the three evidenced lists — what the check read. */
  readonly appraisals: number;
  /** How many of them carried a quotation. */
  readonly cited: number;
  /** How many quotations were not in the text and were cleared. */
  readonly cleared: number;
  readonly corrections: readonly NovelPotentialEvidenceCorrection[];
}

export interface NovelPotentialEvidenceCheck {
  readonly assessment: VerifiedNovelPotentialAssessment;
  readonly report: NovelPotentialEvidenceReport;
}

interface EvidencedItem {
  readonly evidence: string | null;
}

/**
 * Reads every quotation against the text it claims to come from, and returns
 * the assessment the author may be shown.
 *
 * CAL-071's move, not CAL-075's: evidence is nullable here, so an unfound
 * quotation is cleared to null and the appraisal survives on its argument —
 * dropping it whole could push `expansions` or `fragilities` under the
 * minimum the backlog fixes, turning a provenance check into a contract
 * failure. Provenance, never sufficiency, as always: this answers whether the
 * passage exists, not whether the potential is real.
 *
 * The input has already been parsed by `novelPotentialAssessmentSchema` (§6).
 * The output is parsed again because that parse is the mint: it proves the
 * clearing stayed inside the contract, and it hands back the type with
 * nothing cast.
 */
export function verifyNovelPotentialEvidence(
  assessment: NovelPotentialAssessment,
  sourceText: string,
): NovelPotentialEvidenceCheck {
  const quotesTheText = createVerbatimMatcher(sourceText);
  const corrections: NovelPotentialEvidenceCorrection[] = [];
  let appraisals = 0;
  let cited = 0;

  function check<Item extends EvidencedItem>(
    list: NovelPotentialEvidencedList,
    items: readonly Item[],
  ): Item[] {
    return items.map((item, index) => {
      appraisals += 1;
      if (item.evidence === null) return item;
      cited += 1;
      if (quotesTheText(item.evidence)) return item;
      corrections.push({ list, index });
      return { ...item, evidence: null };
    });
  }

  const checked = {
    overall: assessment.overall,
    expansions: check("expansions", assessment.expansions),
    exhaustions: check("exhaustions", assessment.exhaustions),
    gaps: assessment.gaps,
    fragilities: check("fragilities", assessment.fragilities),
  };

  return {
    assessment: mint(checked),
    report: {
      appraisals,
      cited,
      cleared: corrections.length,
      corrections,
    },
  };
}

/**
 * A throw rather than a `Result` (§7): clearing a nullable field cannot leave
 * the contract, so the only way here is a bug. The path travels, the value
 * never does (§9).
 */
function mint(assessment: NovelPotentialAssessment): VerifiedNovelPotentialAssessment {
  const parsed = novelPotentialAssessmentSchema.safeParse(assessment);

  if (!parsed.success) {
    throw new InternalError({
      message: "verifying a potential assessment produced a shape its own schema refuses",
      fieldPath: toFieldPath(parsed.error.issues[0]?.path ?? []),
    });
  }

  return { ...parsed.data, [VERIFIED_NOVEL_POTENTIAL_BRAND]: true };
}
