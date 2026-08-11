/**
 * What `evaluate-direction` is allowed to return (CAL-081, §6).
 *
 * The critique the specification separates from production (principle 6.2):
 * a mission that judges **one** proposed direction and owes the author the
 * four exposures the backlog names — what the direction promises, what it
 * risks not delivering, what is conventional in it, and why it may be less
 * interesting than the others. The direction's own `novelPotentialAssessment`
 * is the proposer arguing *for* its proposal; this contract is an outside
 * reading arguing *about* it, which is why it is a mission of its own rather
 * than a thirteenth field (§5.4, as `detect-cliche-risks` against the
 * diagnostic's own cliché section).
 *
 * **Four lists and no synthesis field.** CAL-076's `overall` is legitimate
 * because the synthesis *is* that mission's deliverable; here the ban's target
 * is a global judgement, and a free synthesis field is the one place a
 * verdict-in-words could live unattached to any element — the double
 * violation at once. Every field of this contract belongs to a list item that
 * carries a required anchor, so *toute critique est rattachée à un élément
 * précis* is a property of the shape, exactly as *no score* is.
 *
 * **The anchor is the proposal contract's own keys.** Each item names in
 * `element` the field of the direction it bears on — the twelve attributes
 * plus the two declarations, pinned by test against
 * `directionProposalsSchema`'s own shape. CAL-082 renders the critique beside
 * the direction, so naming the field is more precise than re-quoting it, and
 * a parse checks it where no matcher could.
 *
 * **Evidence is nullable, verified against two corpora.** The backlog's
 * *rattachée à un élément précis de la direction ou du texte source* has two
 * halves: `element` answers the first structurally, and `evidence` may quote
 * either the source text or the direction's own prose, field by field —
 * per-field matchers, so a quotation cannot match across a field boundary.
 * A quotation found in neither is **cleared to null** and the critique
 * survives on its argument (CAL-076's regime: a drop could push a list under
 * its minimum, turning a provenance check into a contract failure).
 *
 * **No score, structurally** (cahier des charges 1195–1199: no number
 * presented as a measure of quality or originality). No numeric field
 * anywhere, and `comparativeWeaknesses` is the argued case for why this
 * direction *may* be the less interesting one — never a ranking, never a
 * verdict, and never a reference a model chooses: the siblings enter the
 * prompt as composed context, not the schema as an index.
 *
 * **Conventions has a minimum of one, deliberately.** `detect-cliche-risks`
 * screened the *source text*, where emptiness is honest; a generated
 * direction's conventions are new material, and an evaluator allowed to
 * answer "rien de convenu" is being invited to flatter the sibling mission's
 * output — the exact failure this mission exists to prevent. A dominant genre
 * is a bundle of conventions, so a most-conventional element always exists to
 * name: the minimum demands a prioritisation, not an invention.
 */

import { InternalError, toFieldPath } from "@calepin/shared/errors";
import { createVerbatimMatcher } from "@calepin/shared/text";
import { z } from "zod";

import { ceilingFor, DIRECTION_LABEL_CHAR_CEILING, type DirectionProposal } from "./proposals";

/**
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern. One number per
 * concept: every argued critique, whichever list, shares `argument`, and
 * `evidence` restates the shared citation discipline's target — a quotation
 * anchors, it does not reproduce.
 */
export const DIRECTION_EVALUATION_WORD_TARGETS = {
  /** One argued critique, whichever list it sits on. */
  argument: 60,
  /** A supporting quotation — the same number every citing mission states. */
  evidence: 25,
} as const;

/** The character ceilings the schema below enforces. */
export const DIRECTION_EVALUATION_CHAR_CEILINGS = {
  argument: ceilingFor(DIRECTION_EVALUATION_WORD_TARGETS.argument),
  evidence: ceilingFor(DIRECTION_EVALUATION_WORD_TARGETS.evidence),
} as const;

/**
 * The bounds on the four lists. Two promises and two shortfalls because a
 * direction with one of each has not been read; one convention because "rien
 * de convenu" is flattery, not a finding (header); one comparative weakness
 * because the case always exists — but forcing two would order invention
 * against a direction that is genuinely the strongest of the three. Six
 * everywhere as the ceiling, because past six a prioritisation becomes an
 * inventory.
 */
export const DIRECTION_EVALUATION_COUNTS = {
  promises: { min: 2, max: 6 },
  shortfalls: { min: 2, max: 6 },
  conventions: { min: 1, max: 6 },
  comparativeWeaknesses: { min: 1, max: 6 },
} as const;

/**
 * The four lists, in the contract's order — closed, so a verification report
 * can say where a correction happened without carrying a word of the critique
 * (§9).
 */
export const DIRECTION_EVALUATION_LISTS = [
  "promises",
  "shortfalls",
  "conventions",
  "comparativeWeaknesses",
] as const;

export type DirectionEvaluationList = (typeof DIRECTION_EVALUATION_LISTS)[number];

/**
 * The elements a critique may attach to: the per-direction proposal schema's
 * own keys — the twelve attributes and the two declarations. Written out
 * rather than derived so nothing is cast; the test pins them against
 * `directionProposalsSchema`, the arrangement every mirrored list here uses.
 */
export const DIRECTION_ELEMENTS = [
  "workingTitle",
  "developedPremise",
  "dominantGenre",
  "mainConflict",
  "protagonistArc",
  "newStakes",
  "charactersToIntroduce",
  "endingNature",
  "mainRisks",
  "elementsKeptFromSource",
  "elementsTransformed",
  "novelPotentialAssessment",
  "dimensionTreatments",
  "narrativeEngine",
] as const;

export type DirectionElement = (typeof DIRECTION_ELEMENTS)[number];

/**
 * The French noun phrase for each element — in the domain rather than in
 * `@calepin/ai` for `FreedomConstraint`'s reason: the author reads the same
 * words the prompt quotes, and CAL-082's screen names the anchored field with
 * the same label. Totality is the type's: an element added without a label
 * stops compiling.
 */
export const DIRECTION_ELEMENT_LABELS: Readonly<Record<DirectionElement, string>> = {
  workingTitle: "le titre de travail",
  developedPremise: "la prémisse développée",
  dominantGenre: "le genre dominant",
  mainConflict: "le conflit principal",
  protagonistArc: "la trajectoire du protagoniste",
  newStakes: "les nouveaux enjeux",
  charactersToIntroduce: "les personnages à introduire",
  endingNature: "la nature de la fin",
  mainRisks: "les risques principaux",
  elementsKeptFromSource: "les éléments conservés du texte source",
  elementsTransformed: "les éléments transformés",
  novelPotentialAssessment: "l'évaluation du potentiel romanesque",
  dimensionTreatments: "la déclaration des dix dimensions",
  narrativeEngine: "le moteur narratif déclaré",
};

/**
 * One line per element — its key and its French label, in declaration order —
 * for the prompt's `elementKeys` variable, so the vocabulary is never
 * restated in prose (the `dimensionKeys`/`engineAxes` arrangement).
 */
export function describeDirectionElements(): readonly string[] {
  return DIRECTION_ELEMENTS.map(
    (element) => `« ${element} » — ${DIRECTION_ELEMENT_LABELS[element]}`,
  );
}

const label = z.string().trim().min(1).max(DIRECTION_LABEL_CHAR_CEILING);

const element = z.enum(DIRECTION_ELEMENTS);

/** Nullable, never absent: "no passage carries this" is said, not elided. */
const evidence = z
  .string()
  .trim()
  .min(1)
  .max(DIRECTION_EVALUATION_CHAR_CEILINGS.evidence)
  .nullable();

const argued = () => z.string().trim().min(1).max(DIRECTION_EVALUATION_CHAR_CEILINGS.argument);

/** A promise the direction makes its reader, and what honouring it will demand. */
const promiseSchema = z.strictObject({
  label,
  element,
  evidence,
  whatItCommitsTo: argued(),
});

/** A promise the direction risks not keeping over the novel's length. */
const shortfallSchema = z.strictObject({
  label,
  element,
  evidence,
  whyAtRisk: argued(),
});

/** What is conventional in the direction — the déjà-lu it settles into. */
const conventionSchema = z.strictObject({
  label,
  element,
  evidence,
  whyConventional: argued(),
});

/** The argued case for why this direction may be the less interesting one. */
const comparativeWeaknessSchema = z.strictObject({
  label,
  element,
  evidence,
  whyLessInteresting: argued(),
});

/** The answer to `evaluate-direction`. */
export const directionEvaluationSchema = z.strictObject({
  promises: z
    .array(promiseSchema)
    .min(DIRECTION_EVALUATION_COUNTS.promises.min)
    .max(DIRECTION_EVALUATION_COUNTS.promises.max),
  shortfalls: z
    .array(shortfallSchema)
    .min(DIRECTION_EVALUATION_COUNTS.shortfalls.min)
    .max(DIRECTION_EVALUATION_COUNTS.shortfalls.max),
  conventions: z
    .array(conventionSchema)
    .min(DIRECTION_EVALUATION_COUNTS.conventions.min)
    .max(DIRECTION_EVALUATION_COUNTS.conventions.max),
  comparativeWeaknesses: z
    .array(comparativeWeaknessSchema)
    .min(DIRECTION_EVALUATION_COUNTS.comparativeWeaknesses.min)
    .max(DIRECTION_EVALUATION_COUNTS.comparativeWeaknesses.max),
});

export type DirectionEvaluation = z.infer<typeof directionEvaluationSchema>;

export type DirectionEvaluationPromise = DirectionEvaluation["promises"][number];
export type DirectionEvaluationShortfall = DirectionEvaluation["shortfalls"][number];
export type DirectionEvaluationConvention = DirectionEvaluation["conventions"][number];
export type DirectionEvaluationComparativeWeakness =
  DirectionEvaluation["comparativeWeaknesses"][number];

/**
 * `Symbol.for`, for the reason `VerifiedNovelPotentialAssessment` uses one:
 * the packages are compiled from source into more than one chunk graph, and
 * an evaluation verified on one side must stay recognisable on the other
 * (CLAUDE.md §12).
 */
export const VERIFIED_DIRECTION_EVALUATION_BRAND: unique symbol = Symbol.for(
  "calepin.VerifiedDirectionEvaluation",
);

/**
 * An evaluation whose every quotation has been read against what it claims to
 * quote — mintable only by `verifyDirectionEvaluationEvidence`. Persistence,
 * when its task comes, takes one of these.
 */
export type VerifiedDirectionEvaluation = DirectionEvaluation & {
  readonly [VERIFIED_DIRECTION_EVALUATION_BRAND]: true;
};

export function isVerifiedDirectionEvaluation(
  value: unknown,
): value is VerifiedDirectionEvaluation {
  return (
    typeof value === "object" && value !== null && VERIFIED_DIRECTION_EVALUATION_BRAND in value
  );
}

/**
 * One quotation the check cleared: which list and which position — never the
 * label, the argument or the quotation, all three of which are literary
 * content (§9). The index is the position in the answer as received.
 */
export interface DirectionEvaluationEvidenceCorrection {
  readonly list: DirectionEvaluationList;
  readonly index: number;
}

/** What the check found, in counts and identifiers — safe to log whole. */
export interface DirectionEvaluationEvidenceReport {
  /** Items across the four lists — what the check read. */
  readonly critiques: number;
  /** How many of them carried a quotation. */
  readonly cited: number;
  /** How many quotations were found in neither corpus and were cleared. */
  readonly cleared: number;
  readonly corrections: readonly DirectionEvaluationEvidenceCorrection[];
}

export interface DirectionEvaluationEvidenceCheck {
  readonly evaluation: VerifiedDirectionEvaluation;
  readonly report: DirectionEvaluationEvidenceReport;
}

/**
 * The direction fields a quotation may come from: every prose field and every
 * list item — not the two declarations, whose members are identifiers, not
 * sentences. One matcher per field, so a quotation cannot match across a
 * field boundary.
 */
const QUOTABLE_PROSE_FIELDS = [
  "workingTitle",
  "developedPremise",
  "dominantGenre",
  "mainConflict",
  "protagonistArc",
  "endingNature",
  "novelPotentialAssessment",
] as const;

const QUOTABLE_LIST_FIELDS = [
  "newStakes",
  "charactersToIntroduce",
  "mainRisks",
  "elementsKeptFromSource",
  "elementsTransformed",
] as const;

interface EvidencedItem {
  readonly evidence: string | null;
}

/**
 * Reads every quotation against the two corpora it may claim to come from —
 * the source text, and the direction under evaluation, field by field — and
 * returns the evaluation the author may be shown.
 *
 * CAL-076's move, not CAL-075's: evidence is nullable here, so an unfound
 * quotation is cleared to null and the critique survives on its argument —
 * dropping it whole could push a list under the minimum the contract fixes,
 * turning a provenance check into a contract failure. Provenance, never
 * sufficiency, as always: this answers whether the passage exists, not
 * whether the critique is right.
 *
 * The input has already been parsed by `directionEvaluationSchema` (§6). The
 * output is parsed again because that parse is the mint: it proves the
 * clearing stayed inside the contract, and it hands back the type with
 * nothing cast.
 */
export function verifyDirectionEvaluationEvidence(
  evaluation: DirectionEvaluation,
  sourceText: string,
  direction: DirectionProposal,
): DirectionEvaluationEvidenceCheck {
  const matchers = [
    createVerbatimMatcher(sourceText),
    ...QUOTABLE_PROSE_FIELDS.map((field) => createVerbatimMatcher(direction[field])),
    ...QUOTABLE_LIST_FIELDS.flatMap((field) => direction[field].map(createVerbatimMatcher)),
  ];
  const isQuoted = (quotation: string) => matchers.some((matches) => matches(quotation));

  const corrections: DirectionEvaluationEvidenceCorrection[] = [];
  let critiques = 0;
  let cited = 0;

  function check<Item extends EvidencedItem>(
    list: DirectionEvaluationList,
    items: readonly Item[],
  ): Item[] {
    return items.map((item, index) => {
      critiques += 1;
      if (item.evidence === null) return item;
      cited += 1;
      if (isQuoted(item.evidence)) return item;
      corrections.push({ list, index });
      return { ...item, evidence: null };
    });
  }

  const checked = {
    promises: check("promises", evaluation.promises),
    shortfalls: check("shortfalls", evaluation.shortfalls),
    conventions: check("conventions", evaluation.conventions),
    comparativeWeaknesses: check("comparativeWeaknesses", evaluation.comparativeWeaknesses),
  };

  return {
    evaluation: mint(checked),
    report: {
      critiques,
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
function mint(evaluation: DirectionEvaluation): VerifiedDirectionEvaluation {
  const parsed = directionEvaluationSchema.safeParse(evaluation);

  if (!parsed.success) {
    throw new InternalError({
      message: "verifying a direction evaluation produced a shape its own schema refuses",
      fieldPath: toFieldPath(parsed.error.issues[0]?.path ?? []),
    });
  }

  return { ...parsed.data, [VERIFIED_DIRECTION_EVALUATION_BRAND]: true };
}
