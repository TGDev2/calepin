/**
 * What `propose-directions` is allowed to return (CAL-079, §6).
 *
 * The answer to *trois directions romanesques distinctes* (specification
 * §5.5): exactly `DIRECTION_PROPOSAL_COUNT` directions, each carrying the
 * twelve attributes the specification lists — spelled as the
 * `CreativeDirection` columns CAL-015 already stores, so persistence, when its
 * task comes, is a copy and not a translation — plus the declaration the
 * `direction` stage rule of `@calepin/shared/freedom-level` demands: what the
 * direction does to each of the ten source dimensions. The rule ships and is
 * quoted to the model by the prompt; a contract without the field would quote
 * an order the schema makes impossible to obey. The declaration is ahead of
 * the `CreativeDirection` row exactly as `novelPotentialAssessmentSchema` is
 * ahead of any row that stores it: the column belongs to the persistence task.
 *
 * **Exactly three, structurally.** The MVP proposes three directions; the
 * count is the array's own `length`, rendered into the prompt as a variable —
 * one number, never stated twice (CAL-055).
 *
 * **No score, structurally** (cahier des charges: no number presented as a
 * measure of quality or originality). The twelfth attribute — *une évaluation
 * de son potentiel romanesque* — is argued prose, and the contract carries no
 * numeric field anywhere; `proposals.test.ts` pins that shape. The one place a
 * number is legal is outside the contract: `sourceDeparture` over the
 * declaration, which measures distance from the source on the freedom
 * policy's own scale and measures no quality.
 *
 * **A compliance check, not a verify-rewrite.** CAL-071/075/076 read
 * quotations back and repair provenance mechanically; a declaration past the
 * freedom ceiling has no mechanical repair — clamping it would make the
 * declaration lie about the content it describes. So the domain maps the
 * declaration to `DimensionClaim`s and hands back the shared
 * `FreedomComplianceReport`; the caller decides, and the re-ask is the
 * executor task's to wire. No brand, therefore: there is nothing this module
 * could promise about a value that a parse does not already say.
 *
 * The minimums on the five lists are prioritisation demands, never invention
 * licences: a novel-length development of a short text raises stakes, runs
 * risks, keeps and transforms something — naming the *principal* ones is the
 * mission. `charactersToIntroduce` alone may be empty: an existing cast can
 * suffice, and that absence is an answer.
 */

import {
  checkFreedomCompliance,
  DIMENSION_TREATMENTS,
  type DimensionClaim,
  type FreedomComplianceReport,
  type FreedomLevel,
  SOURCE_DIMENSIONS,
} from "@calepin/shared/freedom-level";
import { z } from "zod";

import { narrativeEngineSchema } from "./narrative-engine";

/** The specification's own number of directions to propose (§5.5). */
export const DIRECTION_PROPOSAL_COUNT = 3;

/**
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern. One number per
 * concept: every list entry, whichever list, is one to three sentences and
 * shares `item`.
 */
export const DIRECTION_WORD_TARGETS = {
  /** The developed premise — the pitch a whole novel can be read off. */
  developedPremise: 150,
  /** The protagonist's trajectory across the novel. */
  protagonistArc: 100,
  /** The main conflict — the diagnostic's own target for the same concept. */
  mainConflict: 80,
  /** The nature of the ending — its kind and cost, never its scene. */
  endingNature: 50,
  /** The argued appraisal of what this direction can sustain. */
  novelPotentialAssessment: 120,
  /** One listed entry — a stake, a risk, a kept or transformed element. */
  item: 40,
} as const;

/**
 * Roughly how many characters a French word costs, separator included — the
 * constant `@calepin/analysis` and `@calepin/manuscript` also state, restated
 * here because domains may not import each other (§3.2) and the number is a
 * linguistic observation, not a contract to share.
 */
const CHARS_PER_WORD = 7;

/**
 * How far past its target an answer may run before it stops being a proposal.
 * Twice, as everywhere: a verbose direction is worth keeping, and what this
 * refuses is the answer an order of magnitude out.
 */
const OVERRUN_FACTOR = 2;

function ceilingFor(wordTarget: number): number {
  return Math.ceil(wordTarget * CHARS_PER_WORD * OVERRUN_FACTOR);
}

/** The character ceilings the schema below enforces. */
export const DIRECTION_CHAR_CEILINGS = {
  developedPremise: ceilingFor(DIRECTION_WORD_TARGETS.developedPremise),
  protagonistArc: ceilingFor(DIRECTION_WORD_TARGETS.protagonistArc),
  mainConflict: ceilingFor(DIRECTION_WORD_TARGETS.mainConflict),
  endingNature: ceilingFor(DIRECTION_WORD_TARGETS.endingNature),
  novelPotentialAssessment: ceilingFor(DIRECTION_WORD_TARGETS.novelPotentialAssessment),
  item: ceilingFor(DIRECTION_WORD_TARGETS.item),
} as const;

/** A working title or a dominant genre is a heading, not a paragraph. */
export const DIRECTION_LABEL_CHAR_CEILING = 80;

/**
 * The bounds on the five lists. Minimums where an empty list would be an
 * unfinished proposal, zero where absence is meaningful; six everywhere as
 * the ceiling, because past six a prioritisation becomes an inventory.
 */
export const DIRECTION_LIST_COUNTS = {
  newStakes: { min: 2, max: 6 },
  charactersToIntroduce: { min: 0, max: 6 },
  mainRisks: { min: 2, max: 6 },
  elementsKeptFromSource: { min: 2, max: 6 },
  elementsTransformed: { min: 1, max: 6 },
} as const;

const label = z.string().trim().min(1).max(DIRECTION_LABEL_CHAR_CEILING);

const item = z.string().trim().min(1).max(DIRECTION_CHAR_CEILINGS.item);

function prose(ceiling: number): z.ZodString {
  return z.string().trim().min(1).max(ceiling);
}

function listOf(bounds: { readonly min: number; readonly max: number }) {
  return z.array(item).min(bounds.min).max(bounds.max);
}

const treatment = z.enum(DIMENSION_TREATMENTS);

/**
 * The declaration the `direction` stage rule asks for: one treatment per
 * source dimension, all ten, none invented. The keys are written out rather
 * than derived from `SOURCE_DIMENSIONS` so nothing is cast; the test pins
 * them against the constant, the arrangement every mirrored list here uses.
 */
const dimensionTreatmentsSchema = z.strictObject({
  premise: treatment,
  "main-conflict": treatment,
  "narrative-promise": treatment,
  themes: treatment,
  protagonist: treatment,
  "secondary-characters": treatment,
  setting: treatment,
  tone: treatment,
  "point-of-view": treatment,
  ending: treatment,
});

/**
 * One direction: the specification's twelve attributes, in its order and
 * under the `CreativeDirection` spellings, then the two declarations — what
 * the direction does to each source dimension (the freedom gate's input,
 * CAL-079) and what its narrative engine is (the divergence gate's input,
 * CAL-080).
 */
const directionProposalSchema = z.strictObject({
  workingTitle: label,
  developedPremise: prose(DIRECTION_CHAR_CEILINGS.developedPremise),
  dominantGenre: label,
  mainConflict: prose(DIRECTION_CHAR_CEILINGS.mainConflict),
  protagonistArc: prose(DIRECTION_CHAR_CEILINGS.protagonistArc),
  newStakes: listOf(DIRECTION_LIST_COUNTS.newStakes),
  charactersToIntroduce: listOf(DIRECTION_LIST_COUNTS.charactersToIntroduce),
  endingNature: prose(DIRECTION_CHAR_CEILINGS.endingNature),
  mainRisks: listOf(DIRECTION_LIST_COUNTS.mainRisks),
  elementsKeptFromSource: listOf(DIRECTION_LIST_COUNTS.elementsKeptFromSource),
  elementsTransformed: listOf(DIRECTION_LIST_COUNTS.elementsTransformed),
  novelPotentialAssessment: prose(DIRECTION_CHAR_CEILINGS.novelPotentialAssessment),
  dimensionTreatments: dimensionTreatmentsSchema,
  narrativeEngine: narrativeEngineSchema,
});

/** The answer to `propose-directions`. */
export const directionProposalsSchema = z.strictObject({
  directions: z
    .array(directionProposalSchema)
    .length(DIRECTION_PROPOSAL_COUNT)
    .describe("The three proposed directions."),
});

export type DirectionProposals = z.infer<typeof directionProposalsSchema>;

export type DirectionProposal = DirectionProposals["directions"][number];

export type DirectionDimensionTreatments = DirectionProposal["dimensionTreatments"];

/**
 * The declaration as `checkFreedomCompliance` reads it: one claim per
 * dimension, in `SOURCE_DIMENSIONS` order. Total by construction — the schema
 * refuses a missing or invented key — so the report's `undeclared` is empty
 * for anything that parsed.
 */
export function directionDimensionClaims(proposal: DirectionProposal): readonly DimensionClaim[] {
  return SOURCE_DIMENSIONS.map((dimension) => ({
    dimension,
    treatment: proposal.dimensionTreatments[dimension],
  }));
}

/**
 * One direction against the project's freedom level: the shared per-dimension
 * gate, with this contract's declaration mapped into it. A report, not a
 * `Result` — three dimensions overshot is the answer, not an error — and
 * every field of it is safe to log (§9).
 */
export function checkDirectionProposalCompliance(
  level: FreedomLevel,
  proposal: DirectionProposal,
): FreedomComplianceReport {
  return checkFreedomCompliance(level, "direction", directionDimensionClaims(proposal));
}
