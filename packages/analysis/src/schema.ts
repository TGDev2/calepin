/**
 * What `analyze-source-text` is allowed to return (CAL-070, §6).
 *
 * The domain owns this schema and the AI layer references it (§5.5): the
 * mission registry names `analysis` as the owner, and the schema travels per
 * call through `StructuredGenerationRequest.schema`, so there is one of it and
 * nothing to drift.
 *
 * **The shape is the persistence row, not a prettier one.** CAL-014 already
 * fixed what an analysis is made of: seventeen sections (`AnalysisSection`),
 * each a list of elements carrying a FACTUAL / INTERPRETATION marker, a
 * statement, an optional supporting passage, and — for the listed sections
 * only — a short label. This schema mirrors that shape field for field, so
 * persisting a validated answer (CAL-073+) is a walk over
 * `ANALYSIS_SECTION_FIELDS`, never a transformation that could lose something
 * on the way.
 *
 * **`kind` is a literal where the section's definition decides it.** A factual
 * summary containing an interpretation is not a factual summary, and a
 * judgement about a novel that does not exist yet — an element to preserve, a
 * weakness, a cliché risk, the development potential — cannot be a fact of the
 * text. Encoding those as literals makes the marker a type error rather than a
 * discipline, and it fails with a standard issue code the repair pass can
 * phrase (CAL-052) — which is also why nothing here is a `.refine`.
 *
 * **Emptiness is legal only where absence is meaningful.** A text with no
 * relationships, no ambiguities, no open questions or no cliché risks exists;
 * a text with no characters, no themes, no point of view or nothing singular
 * is a text the mission failed to read. The prompt says the rest: an empty
 * section must be the text's truth, never the model's economy.
 *
 * **The targets and the bounds are the same numbers** (the CAL-055 pattern).
 * The prompt renders the word targets as variables owned here; the character
 * ceilings below are derived from those same targets. The ceilings are
 * generous on purpose — they exist to refuse the answer that is not a
 * diagnosis at all (the source text pasted into a field), never to enforce a
 * word count.
 */

import { z } from "zod";

/**
 * Mirrors the Prisma enum `AnalysisElementKind` (§4.2 carve-out: a union that
 * mirrors a Prisma enum spells its members as the schema spells them).
 * `prisma/schema.test.ts` pins the pair.
 */
export const ANALYSIS_ELEMENT_KINDS = ["FACTUAL", "INTERPRETATION"] as const;

export type AnalysisElementKind = (typeof ANALYSIS_ELEMENT_KINDS)[number];

/**
 * Mirrors the Prisma enum `AnalysisSection`, in the enum's own order — the
 * order the seventeen sections are asked for, produced and displayed in.
 * `prisma/schema.test.ts` pins this list against the enum too.
 */
export const ANALYSIS_SECTIONS = [
  "FACTUAL_SUMMARY",
  "PREMISE",
  "MAIN_CONFLICT",
  "NARRATIVE_PROMISE",
  "THEMES",
  "CHARACTERS",
  "RELATIONSHIPS",
  "POINT_OF_VIEW",
  "TENSE",
  "TONE",
  "SINGULAR_ELEMENTS",
  "AMBIGUITIES",
  "OPEN_QUESTIONS",
  "ELEMENTS_TO_PRESERVE",
  "WEAKNESSES",
  "CLICHE_RISKS",
  "DEVELOPMENT_POTENTIAL",
] as const;

export type AnalysisSection = (typeof ANALYSIS_SECTIONS)[number];

/**
 * The lengths the prompt asks for, in words — the specification's own scale:
 * the whole diagnostic stays under two thousand words (`README.md`), the two
 * long paragraphs carry two hundred each, and an element is one to three
 * sentences. Rendered into the prompt as variables and enforced below as
 * character ceilings, so a target is never stated twice.
 */
export const ANALYSIS_WORD_TARGETS = {
  factualSummary: 200,
  premise: 60,
  mainConflict: 80,
  narrativePromise: 80,
  tone: 100,
  developmentPotential: 200,
  /** One listed element's statement — "une à trois phrases". */
  element: 40,
  /** A supporting quotation stays short: it anchors, it does not reproduce. */
  evidence: 25,
} as const;

/** The specification's ceiling on the whole diagnostic, in words. */
export const ANALYSIS_TOTAL_WORD_BUDGET = 2_000;

/**
 * Roughly how many characters a French word costs, separator included — the
 * same constant `@calepin/manuscript` uses, restated here because the two
 * domains may not import each other (§3.2) and the number is a linguistic
 * observation, not a contract to share.
 */
const CHARS_PER_WORD = 7;

/**
 * How far past its target an answer may run before it stops being a
 * diagnostic. Twice, as for the summaries: a verbose element is worth keeping,
 * and what this refuses is the answer an order of magnitude out — a page of
 * the source text where a statement belongs.
 */
const OVERRUN_FACTOR = 2;

function ceilingFor(wordTarget: number): number {
  return Math.ceil(wordTarget * CHARS_PER_WORD * OVERRUN_FACTOR);
}

/** The character ceilings the schema below enforces. */
export const ANALYSIS_CHAR_CEILINGS = {
  factualSummary: ceilingFor(ANALYSIS_WORD_TARGETS.factualSummary),
  premise: ceilingFor(ANALYSIS_WORD_TARGETS.premise),
  mainConflict: ceilingFor(ANALYSIS_WORD_TARGETS.mainConflict),
  narrativePromise: ceilingFor(ANALYSIS_WORD_TARGETS.narrativePromise),
  tone: ceilingFor(ANALYSIS_WORD_TARGETS.tone),
  developmentPotential: ceilingFor(ANALYSIS_WORD_TARGETS.developmentPotential),
  element: ceilingFor(ANALYSIS_WORD_TARGETS.element),
  evidence: ceilingFor(ANALYSIS_WORD_TARGETS.evidence),
} as const;

/** A label is a heading — a theme's name, a character's name, a tense. */
export const ANALYSIS_LABEL_CHAR_CEILING = 80;

/**
 * How many elements each listed section may carry. A minimum of zero is a
 * statement that absence is meaningful there; a minimum of one is a statement
 * that the mission has not read the text until the section has something.
 */
export const ANALYSIS_ELEMENT_COUNTS = {
  themes: { min: 1, max: 6 },
  characters: { min: 1, max: 10 },
  relationships: { min: 0, max: 10 },
  pointOfView: { min: 1, max: 2 },
  tense: { min: 1, max: 2 },
  singularElements: { min: 1, max: 8 },
  ambiguities: { min: 0, max: 8 },
  openQuestions: { min: 0, max: 8 },
  elementsToPreserve: { min: 1, max: 8 },
  weaknesses: { min: 1, max: 8 },
  clicheRisks: { min: 0, max: 8 },
} as const;

const kindSchema = z.enum(ANALYSIS_ELEMENT_KINDS);

const labelSchema = z.string().trim().min(1).max(ANALYSIS_LABEL_CHAR_CEILING);

/**
 * The passage of the source text that supports the element, verbatim — or
 * null when no single passage does. Required-but-nullable rather than
 * optional: the model must decide, never merely omit. CAL-071 owns checking
 * the quotation against the text; this schema only carries it.
 */
const evidenceSchema = z.string().trim().min(1).max(ANALYSIS_CHAR_CEILINGS.evidence).nullable();

function statementSchema(ceiling: number): z.ZodString {
  return z.string().trim().min(1).max(ceiling);
}

/** A paragraph section: one element, no label (CAL-014's own distinction). */
function paragraphSchema(ceiling: number, kind?: AnalysisElementKind) {
  return z.strictObject({
    kind: kind === undefined ? kindSchema : z.literal(kind),
    statement: statementSchema(ceiling),
    evidence: evidenceSchema,
  });
}

function listedElementSchema(kind?: AnalysisElementKind) {
  return z.strictObject({
    kind: kind === undefined ? kindSchema : z.literal(kind),
    label: labelSchema,
    statement: statementSchema(ANALYSIS_CHAR_CEILINGS.element),
    evidence: evidenceSchema,
  });
}

function listedSectionSchema(
  field: keyof typeof ANALYSIS_ELEMENT_COUNTS,
  kind?: AnalysisElementKind,
) {
  const { min, max } = ANALYSIS_ELEMENT_COUNTS[field];

  return z.array(listedElementSchema(kind)).min(min).max(max);
}

/** The answer to `analyze-source-text` — the seventeen-section diagnostic. */
export const sourceTextAnalysisSchema = z.strictObject({
  factualSummary: paragraphSchema(ANALYSIS_CHAR_CEILINGS.factualSummary, "FACTUAL"),
  premise: paragraphSchema(ANALYSIS_CHAR_CEILINGS.premise),
  mainConflict: paragraphSchema(ANALYSIS_CHAR_CEILINGS.mainConflict),
  narrativePromise: paragraphSchema(ANALYSIS_CHAR_CEILINGS.narrativePromise),
  themes: listedSectionSchema("themes"),
  characters: listedSectionSchema("characters"),
  relationships: listedSectionSchema("relationships"),
  pointOfView: listedSectionSchema("pointOfView"),
  tense: listedSectionSchema("tense"),
  tone: paragraphSchema(ANALYSIS_CHAR_CEILINGS.tone),
  singularElements: listedSectionSchema("singularElements"),
  ambiguities: listedSectionSchema("ambiguities"),
  openQuestions: listedSectionSchema("openQuestions"),
  elementsToPreserve: listedSectionSchema("elementsToPreserve", "INTERPRETATION"),
  weaknesses: listedSectionSchema("weaknesses", "INTERPRETATION"),
  clicheRisks: listedSectionSchema("clicheRisks", "INTERPRETATION"),
  developmentPotential: paragraphSchema(
    ANALYSIS_CHAR_CEILINGS.developmentPotential,
    "INTERPRETATION",
  ),
});

export type SourceTextAnalysis = z.infer<typeof sourceTextAnalysisSchema>;

/**
 * The five sections whose marker the section's own definition decides, and what
 * it decides — the literals above, gathered where code can read them.
 *
 * CAL-071 is what makes the list worth stating rather than leaving implicit in
 * the schema. Verification rewrites the marker of an element the source text
 * turns out not to support; these five markers are not claims a model made, so
 * there is nothing there to verify. The factual summary is not one assertion
 * among others — it is the text restated, supported by the whole of it rather
 * than by a passage — and the four judgements are about a novel that does not
 * exist yet, which no passage could support either. Rewriting one would also
 * produce a value this very schema refuses.
 *
 * `schema.test.ts` pins the list against the schema in both directions, so a
 * literal added, moved or relaxed later cannot leave this behind.
 */
export const ANALYSIS_FIXED_KINDS = {
  FACTUAL_SUMMARY: "FACTUAL",
  ELEMENTS_TO_PRESERVE: "INTERPRETATION",
  WEAKNESSES: "INTERPRETATION",
  CLICHE_RISKS: "INTERPRETATION",
  DEVELOPMENT_POTENTIAL: "INTERPRETATION",
} as const satisfies Partial<Record<AnalysisSection, AnalysisElementKind>>;

/**
 * Which output field carries each `AnalysisSection` — what CAL-073+'s
 * persistence walks. `satisfies` makes it total over the enum mirror at
 * compile time; `schema.test.ts` asserts it is onto the fields too.
 */
export const ANALYSIS_SECTION_FIELDS = {
  FACTUAL_SUMMARY: "factualSummary",
  PREMISE: "premise",
  MAIN_CONFLICT: "mainConflict",
  NARRATIVE_PROMISE: "narrativePromise",
  THEMES: "themes",
  CHARACTERS: "characters",
  RELATIONSHIPS: "relationships",
  POINT_OF_VIEW: "pointOfView",
  TENSE: "tense",
  TONE: "tone",
  SINGULAR_ELEMENTS: "singularElements",
  AMBIGUITIES: "ambiguities",
  OPEN_QUESTIONS: "openQuestions",
  ELEMENTS_TO_PRESERVE: "elementsToPreserve",
  WEAKNESSES: "weaknesses",
  CLICHE_RISKS: "clicheRisks",
  DEVELOPMENT_POTENTIAL: "developmentPotential",
} as const satisfies Record<AnalysisSection, keyof SourceTextAnalysis>;
