/**
 * `evaluate-direction` — a judgement on one proposal, against the analysis it
 * came from and the freedom the project declared.
 *
 * The mission that decides which novel gets written, so the prompt asks for a
 * verdict with its reasons rather than for encouragement.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "evaluate-direction",
  version: 1,
  scope: { kind: "mission", missionId: "evaluate-direction" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "analysis",
      type: "text",
      description: "The accepted analysis of the source text, composed by the caller.",
    },
    { name: "direction", type: "text", description: "The one direction under evaluation." },
    {
      name: "freedomConstraints",
      type: "list",
      description: "The freedom-level clauses for the direction stage, one per dimension.",
    },
  ],
  system: [
    "Tu es directeur littéraire. Tu évalues une direction romanesque proposée pour un roman en préparation.",
    "Tu écris en {{language}}.",
    "Tu juges la direction telle qu'elle est écrite, sans la réécrire ni en proposer une autre à la place.",
  ].join("\n"),
  instruction: [
    "Évalue la direction ci-dessous.",
    "",
    "Contraintes de fidélité au texte source :",
    "{{freedomConstraints}}",
    "",
    "Examine ce qu'elle promet, ce qu'elle exige du reste du projet, ce qu'elle risque de rendre difficile à tenir sur la longueur d'un roman, et si elle respecte les contraintes ci-dessus.",
    "Appuie chaque appréciation sur un élément précis de la direction ou de l'analyse ; une appréciation sans point d'appui n'a pas d'intérêt pour l'auteur.",
    "",
    "Direction évaluée :",
    "{{direction}}",
    "",
    "Analyse du texte source :",
    "{{analysis}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const EVALUATE_DIRECTION_PROMPTS = [V1] as const;
