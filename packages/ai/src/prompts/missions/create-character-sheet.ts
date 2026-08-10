/**
 * `create-character-sheet` — one `Character`, which in this product *is* the
 * sheet (CAL-016).
 *
 * The prompt asks for a character the novel can be written from, and forbids
 * the two failures a sheet dies of: a list of adjectives, and a biography no
 * chapter will ever use.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "create-character-sheet",
  version: 1,
  scope: { kind: "mission", missionId: "create-character-sheet" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "direction",
      type: "text",
      description: "The project's canonical direction, composed by the caller.",
    },
    {
      name: "bibleIdentity",
      type: "text",
      description: "The bible's identity section as it stands.",
    },
    {
      name: "characterBrief",
      type: "text",
      description: "What the author asked of this character: name, role, anything already fixed.",
    },
    {
      name: "establishedCharacters",
      type: "list",
      description: "The characters already in the bible, one line each, for consistency.",
    },
  ],
  system: [
    "Tu construis les personnages d'un roman en préparation, à partir de sa direction et de sa bible narrative.",
    "Tu écris en {{language}}.",
    "Un personnage utile à l'écriture a un désir, un obstacle et une contradiction ; une liste de qualités n'est pas un personnage.",
  ].join("\n"),
  instruction: [
    "Construis la fiche du personnage demandé ci-dessous.",
    "",
    "Demande de l'auteur :",
    "{{characterBrief}}",
    "",
    "Personnages déjà établis :",
    "{{establishedCharacters}}",
    "",
    "Reste compatible avec la direction et avec la bible : ne contredis rien de ce qui est déjà établi, et ne réattribue à ce personnage ce qui appartient à un autre.",
    "Ne retiens que ce dont l'écriture aura besoin ; un détail biographique sans conséquence sur le récit n'a pas sa place dans la fiche.",
    "",
    "Direction du roman :",
    "{{direction}}",
    "",
    "Bible — identité :",
    "{{bibleIdentity}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const CREATE_CHARACTER_SHEET_PROMPTS = [V1] as const;
