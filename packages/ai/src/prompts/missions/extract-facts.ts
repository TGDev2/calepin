/**
 * `extract-facts` — one chapter in, atomic statements out.
 *
 * Extraction, never creation: the prompt insists on one statement per fact and
 * on the affirmative wording the schema expects (`CanonFact.statement` is always
 * affirmative, its truth in the world is `isTrue` — CAL-018). What a fact *is*
 * for this product stays in `@calepin/bible`; the prompt only asks for the shape
 * the domain can store.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "extract-facts",
  version: 1,
  scope: { kind: "mission", missionId: "extract-facts" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    { name: "chapterText", type: "text", description: "The chapter revision to read." },
    {
      name: "knownFacts",
      type: "list",
      description: "The facts already recorded, so an existing one is not proposed again.",
    },
  ],
  system: [
    "Tu relèves les faits établis par un chapitre de roman, pour tenir à jour la mémoire factuelle du récit.",
    "Tu écris en {{language}}.",
    "Un fait est atomique : une seule affirmation par fait, formulée à l'affirmative, telle qu'un autre chapitre puisse la contredire ou la confirmer sans ambiguïté.",
  ].join("\n"),
  instruction: [
    "Relève les faits que le chapitre ci-dessous établit.",
    "",
    "Faits déjà connus — ne les propose pas à nouveau, et signale ceux que le chapitre contredit :",
    "{{knownFacts}}",
    "",
    "Ne relève que ce que le chapitre établit réellement : ni supposition, ni conséquence probable, ni ce qu'un personnage croit sans que le texte le confirme.",
    "Distingue ce qui est vrai dans le monde du récit de ce qu'un personnage en croit.",
    "",
    "Chapitre :",
    "{{chapterText}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const EXTRACT_FACTS_PROMPTS = [V1] as const;
