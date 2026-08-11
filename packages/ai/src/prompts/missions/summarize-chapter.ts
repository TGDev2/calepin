/**
 * `summarize-chapter` — two summaries, and the cheapest mission of the twelve.
 *
 * What every later chapter's context is built on (§5.8): a summary that drops
 * what carries consequence is how a novel written from summaries loses its own
 * plot, so the prompt names that as the thing to keep and the décor as the thing
 * to drop.
 *
 * V2 (CAL-055) is the version that actually ships against a stored summary. It
 * changes two things and keeps the rest. It **names the five kinds of material
 * that carry consequence** — conséquences, décisions, révélations, changements
 * d'état, changements de relation — instead of leaving "ce qui change pour la
 * suite" to be interpreted, because the interpretation is exactly what a low
 * effort setting will not do reliably. And it takes the two lengths as
 * variables rather than stating them, so the target and the schema's own bound
 * are one number owned by the domain (`SUMMARY_WORD_TARGETS` in
 * `@calepin/manuscript`) instead of two that drift.
 *
 * V1 stays beside it, unmodified: a `GenerationAttempt` that recorded version 1
 * must still resolve to the text that produced it.
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

const V2 = {
  id: "summarize-chapter",
  version: 2,
  scope: { kind: "mission", missionId: "summarize-chapter" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    { name: "chapterText", type: "text", description: "The chapter revision to summarise." },
    {
      name: "briefWordTarget",
      type: "number",
      description: "Words the brief summary should come to — the domain's target, not a hard cap.",
    },
    {
      name: "detailedWordTarget",
      type: "number",
      description: "Words the detailed summary should come to.",
    },
  ],
  system: [
    "Tu résumes les chapitres d'un roman pour qu'ils servent de mémoire à l'écriture des chapitres suivants.",
    "Tu écris en {{language}}.",
    "Tu gardes ce qui porte des conséquences et tu écartes le décor ; un résumé qui perd une conséquence fait écrire un chapitre faux.",
  ].join("\n"),
  instruction: [
    "Résume le chapitre ci-dessous en deux résumés : un résumé court d'environ {{briefWordTarget}} mots, et un résumé détaillé d'environ {{detailedWordTarget}} mots.",
    "",
    "Garde en priorité, dans les deux :",
    "- ce qui a des conséquences pour la suite du roman ;",
    "- les décisions prises par les personnages ;",
    "- les révélations, et ce qui est appris par qui ;",
    "- les changements d'état : un lieu, un objet, une blessure, un pouvoir, une situation ;",
    "- les changements de relation entre personnages ;",
    "- ce que le chapitre laisse en suspens.",
    "",
    "Écarte le décor sans effet narratif : une description, une ambiance, un détail de mise en scène qui ne change rien à ce qui suivra n'a pas sa place dans un résumé.",
    "Le résumé court ne garde que ce dont un chapitre lointain aura encore besoin ; le résumé détaillé garde l'enchaînement.",
    "",
    "N'ajoute rien que le chapitre n'établit pas, n'interprète pas, et ne commente ni le chapitre ni ta réponse.",
    "",
    "Chapitre :",
    "{{chapterText}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const SUMMARIZE_CHAPTER_PROMPTS = [V1, V2] as const;
