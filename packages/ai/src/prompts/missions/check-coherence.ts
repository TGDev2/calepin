/**
 * `check-coherence` — the mission the product is judged on.
 *
 * The prompt asks for contradictions with evidence: a chapter passage and the
 * established fact it collides with. Which families of check exist and how
 * severe each is are the coherence domain's decisions (CAL-135), not this
 * layer's — the prompt asks for the contradiction, the domain classifies it.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "check-coherence",
  version: 1,
  scope: { kind: "mission", missionId: "check-coherence" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    { name: "chapterText", type: "text", description: "The chapter revision under audit." },
    { name: "chapterOutline", type: "text", description: "The plan the chapter was written from." },
    {
      name: "bibleIdentity",
      type: "text",
      description: "The bible sections the chapter engages, composed by the caller.",
    },
    {
      name: "canonFacts",
      type: "list",
      description: "The established facts this chapter could contradict, one statement each.",
    },
    {
      name: "precedingSummaries",
      type: "list",
      description: "Summaries of the preceding chapters, in order.",
    },
  ],
  system: [
    "Tu contrôles la cohérence d'un chapitre de roman avec tout ce que le récit a établi avant lui.",
    "Tu écris en {{language}}.",
    "Tu ne juges ni la qualité littéraire ni les choix de l'auteur : tu cherches les contradictions, et rien d'autre.",
  ].join("\n"),
  instruction: [
    "Cherche dans le chapitre ci-dessous ce qui contredit ce qui a été établi avant lui.",
    "",
    "Faits établis :",
    "{{canonFacts}}",
    "",
    "Chapitres précédents :",
    "{{precedingSummaries}}",
    "",
    "Plan du chapitre :",
    "{{chapterOutline}}",
    "",
    "Bible :",
    "{{bibleIdentity}}",
    "",
    "Pour chaque problème, cite le passage du chapitre concerné et l'élément établi avec lequel il entre en contradiction. Un problème sans passage cité n'est pas exploitable.",
    "Signale aussi ce que le chapitre annonçait dans son plan et n'a pas tenu, et ce qu'un personnage sait sans que rien ne le lui ait appris.",
    "Ne signale pas ce qui est seulement inhabituel, incomplet ou perfectible : seulement ce qui est contradictoire.",
    "",
    "Chapitre :",
    "{{chapterText}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const CHECK_COHERENCE_PROMPTS = [V1] as const;
