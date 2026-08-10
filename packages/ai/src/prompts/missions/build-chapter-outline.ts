/**
 * `build-chapter-outline` — what one chapter does to the threads around it.
 *
 * Structural work, not writing: the prompt asks what changes between the
 * opening and the close of the chapter, and refuses a summary of events that
 * leaves the novel where it found it.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "build-chapter-outline",
  version: 1,
  scope: { kind: "mission", missionId: "build-chapter-outline" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "bibleIdentity",
      type: "text",
      description: "The bible sections the chapter depends on, composed by the caller.",
    },
    {
      name: "chapterBrief",
      type: "text",
      description: "Where the chapter sits in the outline and what it is expected to accomplish.",
    },
    {
      name: "precedingSummaries",
      type: "list",
      description: "Brief summaries of the chapters before this one, in order.",
    },
    {
      name: "threads",
      type: "list",
      description: "The narrative threads open at this point, one line each.",
    },
    {
      name: "freedomConstraints",
      type: "list",
      description: "The freedom-level clauses for the outline stage, one per dimension.",
    },
  ],
  system: [
    "Tu construis le plan des chapitres d'un roman en préparation.",
    "Tu écris en {{language}}.",
    "Un chapitre qui laisse le roman exactement où il l'a trouvé n'a pas de plan : dis toujours ce qui change entre son ouverture et sa fin.",
  ].join("\n"),
  instruction: [
    "Construis le plan du chapitre décrit ci-dessous.",
    "",
    "Chapitre à planifier :",
    "{{chapterBrief}}",
    "",
    "Contraintes de fidélité au texte source :",
    "{{freedomConstraints}}",
    "",
    "Fils narratifs ouverts :",
    "{{threads}}",
    "",
    "Chapitres précédents :",
    "{{precedingSummaries}}",
    "",
    "Dis ce que le chapitre fait avancer, ce qu'il laisse en suspens, et ce que le lecteur sait à la fin qu'il ne savait pas au début.",
    "Reste dans ce que la bible et les chapitres précédents ont établi ; n'introduis pas d'élément qui contredirait l'un ou l'autre.",
    "",
    "Bible :",
    "{{bibleIdentity}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const BUILD_CHAPTER_OUTLINE_PROMPTS = [V1] as const;
