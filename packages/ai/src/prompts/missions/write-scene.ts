/**
 * `write-scene` — the only mission that produces prose a reader reads.
 *
 * The one prompt with no "answer in JSON" clause: the mission's declared output
 * is prose (`mission-registry.ts`), and asking a model to wrap a chapter in an
 * object is how a chapter comes back escaped.
 *
 * It is also the mission where §5.8 is won or lost. The prompt receives
 * summaries and the excerpts continuity actually requires — never the previous
 * chapters in full — and the composer (CAL-054) is what keeps that true; the
 * variables are declared so that it *can* be.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "write-scene",
  version: 1,
  scope: { kind: "mission", missionId: "write-scene" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "bibleStyle",
      type: "text",
      description: "The bible's style section: register, voice, tense, point of view.",
    },
    {
      name: "chapterOutline",
      type: "text",
      description: "The plan of the chapter being written.",
    },
    {
      name: "targetWordCount",
      type: "number",
      description: "The chapter's target length in words.",
    },
    {
      name: "canonFacts",
      type: "list",
      description: "The canon facts this chapter actually touches, one statement each.",
    },
    {
      name: "precedingSummaries",
      type: "list",
      description: "Summaries of the preceding chapters — never their full text.",
    },
    {
      name: "continuityExcerpts",
      type: "list",
      description: "The few earlier passages continuity requires verbatim. Often empty.",
    },
    {
      name: "authorInstructions",
      type: "list",
      description: "The author's own instructions for this chapter. Often empty.",
    },
    {
      name: "freedomConstraints",
      type: "list",
      description: "The freedom-level clauses for the writing stage, one per dimension.",
    },
  ],
  system: [
    "Tu écris le texte d'un roman, chapitre par chapitre, pour un auteur qui en a établi la bible et le plan.",
    "Tu écris en {{language}}.",
    "Tu écris le chapitre demandé et rien d'autre : pas de titre ajouté, pas de résumé, pas de commentaire sur ce que tu as écrit.",
  ].join("\n"),
  instruction: [
    "Écris le chapitre planifié ci-dessous, d'environ {{targetWordCount}} mots.",
    "",
    "Plan du chapitre :",
    "{{chapterOutline}}",
    "",
    "Consignes de l'auteur :",
    "{{authorInstructions}}",
    "",
    "Style à respecter :",
    "{{bibleStyle}}",
    "",
    "Contraintes de fidélité au texte source :",
    "{{freedomConstraints}}",
    "",
    "Faits déjà établis que ce chapitre engage — ne les contredis pas :",
    "{{canonFacts}}",
    "",
    "Résumés des chapitres précédents :",
    "{{precedingSummaries}}",
    "",
    "Extraits antérieurs nécessaires à la continuité :",
    "{{continuityExcerpts}}",
    "",
    "Écris la scène plutôt que de la raconter, et tiens le plan jusqu'au bout : ce qu'il annonce doit être dans le chapitre.",
    "N'introduis pas de fait nouveau qui contredirait ceux ci-dessus ; si le plan en exige un, écris-le comme un fait nouveau et non comme un rappel.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const WRITE_SCENE_PROMPTS = [V1] as const;
