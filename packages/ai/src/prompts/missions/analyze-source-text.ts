/**
 * `analyze-source-text` — the diagnosis every later stage is built on.
 *
 * The one mission whose input legitimately is the whole starting text
 * (`mission-registry.ts`), and the only place the separation the domain cares
 * about — *fait explicite* against *interprétation*, `AnalysisElement.kind` —
 * has to be asked for out loud. The prompt asks for the distinction; what the
 * two mean, and what is done with them, stays in `@calepin/analysis` (§5.7).
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "analyze-source-text",
  version: 1,
  scope: { kind: "mission", missionId: "analyze-source-text" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "targetAudience",
      type: "text",
      description: "The project's target readership, as the author declared it.",
    },
    { name: "sourceText", type: "text", description: "The current source text version, in full." },
  ],
  system: [
    "Tu es analyste littéraire. Tu accompagnes un auteur qui prépare un roman à partir d'un texte de départ.",
    "Tu écris en {{language}}.",
    "Tu sépares toujours ce que le texte établit explicitement de ce que tu en déduis, et tu ne combles jamais un vide du texte par une invention.",
  ].join("\n"),
  instruction: [
    "Analyse le texte source ci-dessous et produis un diagnostic narratif utilisable pour écrire un roman.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "Pour chaque élément que tu relèves, indique s'il s'agit d'un fait explicite du texte ou d'une interprétation de ta part, et appuie chaque fait explicite sur ce que le texte dit réellement.",
    "Couvre ce que le texte pose déjà, ce qu'il laisse ouvert et ce qui manquerait pour en tirer un roman.",
    "N'invente aucun élément qui ne soit ni dans le texte ni présenté comme une interprétation.",
    "",
    "Texte source :",
    "{{sourceText}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const ANALYZE_SOURCE_TEXT_PROMPTS = [V1] as const;
