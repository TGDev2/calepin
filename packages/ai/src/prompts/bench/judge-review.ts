/**
 * `bench-review-output` — the bench's review of one mission output (CAL-059).
 *
 * The judge reads the reference text, the output a mission produced from it,
 * the criteria and the human-annotated expectations, and answers with argued
 * findings. The specification's constraint is stated to the model and enforced
 * by the contract in `bench/judge.ts`: never a mark or a score, and no finding
 * without a cited piece of evidence — an unargued verdict fails validation
 * before anyone reads it.
 *
 * The criteria travel as a variable rather than being written into this text,
 * because a run may extend the default set (CAL-078 annotates per-mission
 * expectations; a later epic may add mission-specific criteria) and because
 * the contract's `criterionId` enum is built from the same list — one source,
 * rendered into the prompt and compiled into the schema.
 *
 * `missionIntent` is the bench caller's French statement of what the mission
 * was asked to produce. The judge never sees the mission prompt itself: shown
 * the wording under evaluation, it would grade obedience to that wording —
 * the comparison mode would then reward whichever version it happened to read.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "bench-review-output",
  version: 1,
  scope: { kind: "bench" },
  variables: [
    {
      name: "missionIntent",
      type: "text",
      description: "French statement of what the mission was asked to produce, from the bench run.",
    },
    {
      name: "referenceText",
      type: "text",
      description: "The reference text the evaluated output was produced from.",
    },
    {
      name: "evaluatedOutput",
      type: "text",
      description: "The output under review — prose as-is, structured output serialised as JSON.",
    },
    {
      name: "criteria",
      type: "list",
      description: "One line per criterion: its id, its French label and the question it asks.",
    },
    {
      name: "expectations",
      type: "list",
      description: "Human-annotated expectations for this text, in order; empty when none exist.",
    },
  ],
  system: [
    "Tu es un critique littéraire et éditorial. Tu évalues le résultat d'un traitement automatique appliqué à un texte de référence.",
    "Tu écris en français.",
    "Tu ne produis jamais de note ni de score : chaque constat est un jugement argumenté, relié à des éléments précis et cités des textes fournis.",
    "Une critique qui ne cite rien ne vaut rien. Une généralité qui s'appliquerait à n'importe quel texte ne vaut rien non plus : nomme ce qui est propre à ce texte-ci et à ce résultat-ci.",
  ].join("\n"),
  instruction: [
    "Voici la tâche qui était demandée au traitement évalué :",
    "{{missionIntent}}",
    "",
    "Texte de référence :",
    "<texte-de-reference>",
    "{{referenceText}}",
    "</texte-de-reference>",
    "",
    "Résultat à évaluer :",
    "<resultat>",
    "{{evaluatedOutput}}",
    "</resultat>",
    "",
    "Critères d'évaluation :",
    "{{criteria}}",
    "",
    "Attentes annotées pour ce texte, établies par un lecteur humain :",
    "{{expectations}}",
    "",
    "Évalue le résultat selon chaque critère, et uniquement selon ces critères.",
    "Pour chaque critère, formule au moins un constat — une force ou une faiblesse, jamais une appréciation neutre de remplissage. Chaque constat doit :",
    "- désigner le critère concerné par son identifiant ;",
    "- être argumenté en quelques phrases ;",
    "- s'appuyer sur au moins un élément de preuve : un extrait exact du résultat ou du texte de référence, l'endroit d'où il vient, et en quoi il fonde le constat.",
    "",
    "Puis, pour chaque attente annotée, dans l'ordre où elles sont listées, dis si elle est satisfaite, partiellement satisfaite ou non satisfaite, avec le même niveau d'argumentation et de preuve. S'il n'y a aucune attente listée (un tiret), renvoie une liste vide de vérifications.",
    "",
    "Termine par une synthèse en quelques phrases : ce que ce résultat fait de mieux, ce qu'il fait de moins bien, et ce qu'un lecteur exigeant devrait vérifier en priorité.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const BENCH_REVIEW_OUTPUT_PROMPTS = [V1] as const;
