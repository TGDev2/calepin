/**
 * `fix-issue` — a correction to one identified passage, and nothing else.
 *
 * The narrowest mission of the twelve by construction: the prompt is written to
 * stop a model rewriting a chapter it was asked to mend. A correction that
 * changes the surrounding prose is a new draft, and a new draft is what the
 * author did not ask for.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "fix-issue",
  version: 1,
  scope: { kind: "mission", missionId: "fix-issue" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    { name: "passage", type: "text", description: "The passage to correct, verbatim." },
    {
      name: "issue",
      type: "text",
      description: "The problem to fix, as the coherence audit stated it.",
    },
    {
      name: "bibleStyle",
      type: "text",
      description: "The bible's style section, so the correction keeps the novel's voice.",
    },
    {
      name: "canonFacts",
      type: "list",
      description: "The established facts the corrected passage must respect.",
    },
  ],
  system: [
    "Tu corriges un passage précis d'un roman, signalé par un contrôle de cohérence.",
    "Tu écris en {{language}}.",
    "Tu corriges le problème signalé et rien d'autre : tu ne réécris pas ce qui n'est pas en cause, et tu ne changes ni la voix, ni le rythme, ni les intentions du passage.",
  ].join("\n"),
  instruction: [
    "Corrige le passage ci-dessous.",
    "",
    "Problème à corriger :",
    "{{issue}}",
    "",
    "Faits établis que la correction doit respecter :",
    "{{canonFacts}}",
    "",
    "Style à conserver :",
    "{{bibleStyle}}",
    "",
    "Modifie le strict nécessaire pour que le problème disparaisse, et dis en une phrase ce que ta correction change.",
    "",
    "Passage :",
    "{{passage}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const FIX_ISSUE_PROMPTS = [V1] as const;
