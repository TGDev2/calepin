/**
 * A freedom level, resolved into the explicit constraints that hold at one
 * stage of the pipeline (CAL-044).
 *
 * **Why a rule and not a prompt.** CLAUDE.md §3.3 forbids the business layer
 * from holding prompt text, and §5.2 puts every prompt in CAL-053's registry,
 * which does not exist yet. §5.5 already settled the identical question one
 * layer over: a mission's output schema constrains what a model may answer and
 * lives in the domain, while the prompt that says "answer in this shape" lives
 * in the registry, *referencing* the schema rather than restating it. A
 * constraint clause is the same object. What lives here is the editorial rule,
 * stated in the third person as something that is true of the novel — not an
 * instruction addressed to a model. The instruction prose around it, the
 * ordering inside the prompt and the token budget belong to `@calepin/ai`.
 *
 * That is also what makes the wizard honest: `./copy`'s explanation and these
 * clauses come out of the same table, so the freedom the author is promised on
 * screen is the freedom the mission is actually held to.
 *
 * **Ids are stable across levels.** `direction-premise` names what the clause
 * is *about*; the level decides what it says. Asking the three levels for the
 * same id is how a prompt registry — or a reviewer — diffs them.
 */

import type { BusinessDomain } from "../index";
import { SOURCE_DIMENSION_LABELS } from "./copy";
import { type DimensionTreatment, SOURCE_DIMENSIONS, type SourceDimension } from "./dimensions";
import type { FreedomLevel } from "./levels";
import { dimensionsTreatedAs, treatmentFor } from "./policy";

/**
 * The four stages a freedom level constrains, spelled as the domains that own
 * them. `satisfies readonly BusinessDomain[]` is the point of the annotation: a
 * stage misspelled here, or one named after a domain that does not exist, fails
 * to compile instead of silently answering with an empty constraint set.
 *
 * The three domains left out are downstream of the choice rather than bound by
 * it — `manuscript`, `coherence` and `export` work against the bible and the
 * outline, which have already applied the level.
 */
export const FREEDOM_CONSTRAINED_STAGES = [
  "analysis",
  "direction",
  "bible",
  "outline",
] as const satisfies readonly BusinessDomain[];

export type FreedomConstrainedStage = (typeof FREEDOM_CONSTRAINED_STAGES)[number];

export function isFreedomConstrainedStage(value: unknown): value is FreedomConstrainedStage {
  return (
    typeof value === "string" && (FREEDOM_CONSTRAINED_STAGES as readonly string[]).includes(value)
  );
}

export interface FreedomConstraint {
  /** Stable across the three levels: the clause's subject, not its content. */
  readonly id: string;
  readonly stage: FreedomConstrainedStage;
  /** `null` on the stage's own rule, which is about the artefact as a whole. */
  readonly dimension: SourceDimension | null;
  /** `null` on the stage's own rule, for the same reason. */
  readonly treatment: DimensionTreatment | null;
  /** French, declarative, one sentence. Shown to the author, quoted by CAL-053. */
  readonly statement: string;
}

/**
 * The analysis stage records the source text; it does not transform it. Its
 * clauses therefore say what the analysis must *mark*, which is the only thing
 * about it a freedom level can decide — and the thing the three later stages
 * then work against.
 */
const RECORDING_STATEMENTS: Readonly<Record<DimensionTreatment, (label: string) => string>> = {
  preserve: (label) =>
    `Ce que le texte source établit pour ${label} est relevé et marqué non négociable.`,
  extend: (label) =>
    `Ce que le texte source établit pour ${label} est relevé, avec les points qui appellent un développement.`,
  reinterpret: (label) =>
    `Ce que le texte source établit pour ${label} est relevé sans être marqué non négociable.`,
};

/** The three stages that produce novel material and can depart from the source. */
const TRANSFORMING_STATEMENTS: Readonly<Record<DimensionTreatment, (label: string) => string>> = {
  preserve: (label) =>
    `Ce que le texte source établit pour ${label} est conservé : rien n'est ajouté qui le modifie, rien n'est retiré.`,
  extend: (label) =>
    `Ce que le texte source établit pour ${label} est développé, jamais contredit : les ajouts prolongent le texte au lieu de le remplacer.`,
  reinterpret: (label) =>
    `Le roman peut s'écarter du texte source pour ${label}, à condition de ne contredire aucune dimension conservée.`,
};

/**
 * Each stage's own rule — what the artefact as a whole has to satisfy, beyond
 * the per-dimension clauses. Each names a condition someone can check on a
 * finished artefact, which is what separates a constraint from an intention.
 */
const STAGE_RULES: Readonly<Record<FreedomConstrainedStage, string>> = {
  analysis:
    "L'analyse caractérise les dix dimensions telles que le texte source les établit et marque comme non négociables exactement celles qui sont conservées ; elle ne propose aucun développement à ce stade.",
  direction:
    "Chaque direction déclare, pour chacune des dix dimensions, ce qu'elle en fait — conservation, développement ou réinterprétation — et aucune déclaration ne dépasse le traitement autorisé.",
  bible:
    "Toute entrée de la bible portant sur une dimension conservée est traçable au texte source ou à la direction retenue ; une invention ne porte que sur une dimension développée ou réinterprétable.",
  outline:
    "Le plan suit, pour chaque dimension, le traitement autorisé ; un fil narratif nouveau relève de la dimension qu'il engage et hérite de son traitement.",
};

/**
 * The constraints that hold for one level at one stage: the stage's own rule
 * first, then one clause per dimension in `SOURCE_DIMENSIONS` order.
 *
 * The order is part of the contract — the rule frames the list that follows,
 * and a prompt built from a shuffled set would diff against itself.
 */
export function freedomConstraints(
  level: FreedomLevel,
  stage: FreedomConstrainedStage,
): readonly FreedomConstraint[] {
  const statements = stage === "analysis" ? RECORDING_STATEMENTS : TRANSFORMING_STATEMENTS;

  return [
    {
      id: `${stage}-rule`,
      stage,
      dimension: null,
      treatment: null,
      statement: STAGE_RULES[stage],
    },
    ...SOURCE_DIMENSIONS.map((dimension) => {
      const treatment = treatmentFor(level, dimension);

      return {
        id: `${stage}-${dimension}`,
        stage,
        dimension,
        treatment,
        statement: statements[treatment](SOURCE_DIMENSION_LABELS[dimension]),
      };
    }),
  ];
}

/**
 * Every constraint a level carries, stage by stage — what a context composer
 * (CAL-054) reaches for when it needs the whole picture rather than one
 * mission's slice.
 */
export function allFreedomConstraints(
  level: FreedomLevel,
): Readonly<Record<FreedomConstrainedStage, readonly FreedomConstraint[]>> {
  return Object.fromEntries(
    FREEDOM_CONSTRAINED_STAGES.map((stage) => [stage, freedomConstraints(level, stage)]),
  ) as Record<FreedomConstrainedStage, readonly FreedomConstraint[]>;
}

/**
 * The dimensions a level refuses to let go of, as their French labels — the
 * one list every stage needs by name rather than by clause, since "aucune
 * dimension conservée n'est contredite" is the condition each `reinterpret`
 * clause defers to.
 */
export function preservedDimensionLabels(level: FreedomLevel): readonly string[] {
  return dimensionsTreatedAs(level, "preserve").map(
    (dimension) => SOURCE_DIMENSION_LABELS[dimension],
  );
}
