/**
 * `summarize-chapter` — two summaries, and the cheapest mission of the ten.
 *
 * What every later chapter's context is built on (§5.8): a summary that drops
 * what carries consequence is how a novel written from summaries loses its own
 * plot, so the prompt names that as the thing to keep and the décor as the thing
 * to drop.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "summarize-chapter",
  version: 1,
  scope: { kind: "mission", missionId: "summarize-chapter" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    { name: "chapterText", type: "text", description: "The chapter revision to summarise." },
  ],
  system: [
    "Tu résumes les chapitres d'un roman pour qu'ils servent de mémoire à l'écriture des chapitres suivants.",
    "Tu écris en {{language}}.",
    "Tu gardes ce qui aura des conséquences plus loin et tu écartes le décor ; un résumé qui perd une conséquence fait écrire un chapitre faux.",
  ].join("\n"),
  instruction: [
    "Résume le chapitre ci-dessous, en deux résumés : un résumé court, et un résumé détaillé.",
    "",
    "Retiens ce qui change pour la suite : ce que les personnages apprennent, décident, obtiennent ou perdent, et ce que le chapitre laisse en suspens.",
    "N'ajoute rien que le chapitre n'établit pas, et ne commente pas le chapitre.",
    "",
    "Chapitre :",
    "{{chapterText}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const SUMMARIZE_CHAPTER_PROMPTS = [V1] as const;
