import type { $Enums } from "@prisma/client";

/**
 * The seventeen sections of the diagnostic, named in French (CAL-210).
 *
 * **The wording is the schema's own.** `prisma/schema.prisma`'s `AnalysisSection`
 * carries a French gloss beside every member, which is where the specification's
 * vocabulary was first written down; `apps/web`'s `SECTION_META` already quotes
 * it rather than inventing a second one, and so does this table.
 *
 * **In `@calepin/shared` rather than in `@calepin/analysis`.** The diagnostic is
 * quoted to a model by missions that live in other domains — `propose-directions`
 * reads it section by section, and `define-novel-identity` will cite it — and a
 * domain may not import a domain (§3.2). Same reason `createVerbatimMatcher` and
 * `assessStageChain` are here.
 *
 * Total and onto by its own type: a section added to the Prisma enum without a
 * label here is a compile error, and `prisma/schema.test.ts` pins the keys and
 * their order against the enum so neither list can move alone.
 *
 * The **labels** are this repository's closed vocabulary and are safe anywhere.
 * What `describeAnalysis` builds out of them is not: it carries the analysis's
 * own wording, so it is prompt and screen material and never a log line (§9).
 */
export const ANALYSIS_SECTION_LABELS = {
  FACTUAL_SUMMARY: "Résumé factuel",
  PREMISE: "Prémisse",
  MAIN_CONFLICT: "Conflit principal",
  NARRATIVE_PROMISE: "Promesse du récit",
  THEMES: "Thèmes",
  CHARACTERS: "Personnages identifiés",
  RELATIONSHIPS: "Relations",
  POINT_OF_VIEW: "Point de vue",
  TENSE: "Temps verbal",
  TONE: "Tonalité",
  SINGULAR_ELEMENTS: "Éléments singuliers",
  AMBIGUITIES: "Ambiguïtés",
  OPEN_QUESTIONS: "Questions non résolues",
  ELEMENTS_TO_PRESERVE: "Éléments à préserver",
  WEAKNESSES: "Fragilités",
  CLICHE_RISKS: "Risques de clichés",
  DEVELOPMENT_POTENTIAL: "Potentiel de développement",
} as const satisfies Record<$Enums.AnalysisSection, string>;

/**
 * How an element's marker reads to a model (CAL-071's `AnalysisElement.kind`).
 *
 * Carried into the rendering because it is what stops the next stage treating a
 * reading as something the text says: `propose-directions` is told never to
 * attribute to the source text what it does not contain, and the marker is the
 * only thing in the diagnostic that answers which is which.
 */
export const ANALYSIS_ELEMENT_KIND_LABELS = {
  FACTUAL: "fait",
  INTERPRETATION: "interprétation",
} as const satisfies Record<$Enums.AnalysisElementKind, string>;
