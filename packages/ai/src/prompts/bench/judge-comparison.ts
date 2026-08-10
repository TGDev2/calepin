/**
 * `bench-compare-outputs` — the bench's blinded pairwise judgement (CAL-059).
 *
 * The judge is shown two outputs produced for the same task on the same
 * reference text and told nothing about where either came from — not which
 * prompt version, not which is the newer one, not that a "newer one" exists.
 * The bench runs this prompt twice per case with the positions swapped, and
 * only a preference that survives the swap counts as a preference
 * (`bench/run.ts` merges the two passes); a judgement that follows the order
 * of presentation is reported as exactly that.
 *
 * The verdict vocabulary is deliberately categorical and closed — stronger,
 * stronger, comparable, contrasted — with the two honest exits stated as
 * respectable conclusions. A judge denied "comparable" invents differences;
 * a judge denied "contrasted" flattens real trade-offs into a winner.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "bench-compare-outputs",
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
      description: "The reference text both outputs were produced from.",
    },
    {
      name: "firstOutput",
      type: "text",
      description: "The output presented as réponse 1 — the bench decides which version sits here.",
    },
    {
      name: "secondOutput",
      type: "text",
      description: "The output presented as réponse 2 — the other version.",
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
    "Tu es un critique littéraire et éditorial. Tu compares deux résultats produits pour la même tâche sur le même texte de référence, par deux traitements différents dont tu ignores tout.",
    "Tu écris en français.",
    "Tu ne sais pas lequel des deux traitements est le plus récent ni lequel est censé être meilleur : juge uniquement ce qui est sur la page.",
    "Tu ne produis jamais de note ni de score : chaque jugement est argumenté et relié à des éléments précis et cités des textes fournis. Une différence affirmée sans extrait à l'appui est une différence non établie.",
    "« Comparables » est une conclusion honnête quand les différences ne portent pas à conséquence ; « contrasté » quand chaque résultat l'emporte nettement sur des aspects différents du même critère.",
  ].join("\n"),
  instruction: [
    "Voici la tâche qui était demandée aux deux traitements :",
    "{{missionIntent}}",
    "",
    "Texte de référence :",
    "<texte-de-reference>",
    "{{referenceText}}",
    "</texte-de-reference>",
    "",
    "Réponse 1 :",
    "<reponse-1>",
    "{{firstOutput}}",
    "</reponse-1>",
    "",
    "Réponse 2 :",
    "<reponse-2>",
    "{{secondOutput}}",
    "</reponse-2>",
    "",
    "Critères de comparaison :",
    "{{criteria}}",
    "",
    "Attentes annotées pour ce texte, établies par un lecteur humain :",
    "{{expectations}}",
    "",
    "Pour chaque critère — chacun exactement une fois — rends un jugement : réponse 1 plus forte, réponse 2 plus forte, comparables, ou contrasté. Chaque jugement doit :",
    "- être argumenté en quelques phrases, en tenant compte des attentes annotées quand il y en a ;",
    "- s'appuyer sur au moins un élément de preuve : un extrait exact de la réponse concernée ou du texte de référence, l'endroit d'où il vient, et en quoi il fonde le jugement.",
    "",
    "Termine par un jugement d'ensemble de la même forme : lequel des deux résultats sert le mieux la tâche demandée, et pourquoi — ou l'aveu argumenté qu'aucun ne se distingue.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const BENCH_COMPARE_OUTPUTS_PROMPTS = [V1] as const;
