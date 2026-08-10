/**
 * `propose-directions` — divergence: several genuinely different novels out of
 * one text.
 *
 * The prompt's whole work is to prevent variations on one idea. The freedom
 * constraints arrive already worded, one clause per dimension, from
 * `@calepin/shared/freedom-level` (CAL-044): they are the business layer's
 * rule, and this layer quotes them rather than restating them (§5.5).
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "propose-directions",
  version: 1,
  scope: { kind: "mission", missionId: "propose-directions" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "targetAudience",
      type: "text",
      description: "The project's target readership, as the author declared it.",
    },
    {
      name: "analysis",
      type: "text",
      description: "The accepted analysis of the source text, composed by the caller.",
    },
    {
      name: "freedomConstraints",
      type: "list",
      description: "The freedom-level clauses for the direction stage, one per dimension.",
    },
    {
      name: "directionCount",
      type: "number",
      description: "How many distinct directions to propose.",
    },
  ],
  system: [
    "Tu es directeur littéraire. Tu proposes à un auteur des directions romanesques distinctes à partir de l'analyse de son texte de départ.",
    "Tu écris en {{language}}.",
    "Deux directions qui se distinguent seulement par un détail ne sont qu'une seule direction : chacune doit engager un roman différent.",
  ].join("\n"),
  instruction: [
    "Propose {{directionCount}} directions romanesques à partir de l'analyse ci-dessous.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "Contraintes de fidélité au texte source :",
    "{{freedomConstraints}}",
    "",
    "Chaque direction doit être défendable à partir de l'analyse, tenir dans les contraintes ci-dessus, et se distinguer des autres par ce qu'elle engage réellement : le récit, l'enjeu, la trajectoire des personnages.",
    "Pour chacune, dis ce qu'elle conserve du texte source et ce qu'elle en écarte.",
    "",
    "Analyse du texte source :",
    "{{analysis}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const PROPOSE_DIRECTIONS_PROMPTS = [V1] as const;
