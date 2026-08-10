/**
 * `summarize-part` — the level above the chapter (CAL-055).
 *
 * Its input is already compressed: the brief summaries of the part's chapters,
 * in reading order, beside what the plan said the part was for. It never reads
 * a line of prose, which is what makes it cheap enough to rerun after every
 * validated chapter.
 *
 * A separate mission rather than a second call to `summarize-chapter` (§5.4).
 * The two answer different questions: a chapter summary preserves the chain of
 * events, a part summary preserves the arc — where the part started, what
 * turned, where it left the novel — and asking one prompt to do both is how a
 * part summary ends up being a list of its chapters, which compresses nothing
 * and would make the whole hierarchy pointless.
 *
 * The plan's own four attributes travel as a list rather than as four
 * variables: a part the author added by hand has none of them, and §5's
 * rendering turns an empty list into a dash instead of a hole.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "summarize-part",
  version: 1,
  scope: { kind: "mission", missionId: "summarize-part" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    { name: "partTitle", type: "text", description: "The part's title." },
    {
      name: "wordTarget",
      type: "number",
      description: "Words the part summary should come to — the domain's target, not a hard cap.",
    },
    {
      name: "plannedArc",
      type: "list",
      description:
        "What the plan said the part was for — objective, initial state, tipping point, final state — already phrased by the domain; empty for a part with none.",
    },
    {
      name: "chapterSummaries",
      type: "list",
      description: "The summaries of the part's written chapters, in reading order.",
    },
  ],
  system: [
    "Tu résumes une partie d'un roman à partir des résumés de ses chapitres, pour qu'elle serve de mémoire à l'écriture des parties suivantes.",
    "Tu écris en {{language}}.",
    "Une partie se retient par son arc, pas par la liste de ce qui s'y produit.",
  ].join("\n"),
  instruction: [
    "Écris un résumé d'environ {{wordTarget}} mots de la partie « {{partTitle}} ».",
    "",
    "Le résumé doit dire où la partie prend le roman, ce qui y bascule, et où elle le laisse.",
    "Garde en priorité ce qui porte des conséquences au-delà de la partie : les décisions, les révélations, les changements d'état et les changements de relation dont les parties suivantes devront tenir compte, et ce qui reste ouvert.",
    "Écarte ce qui a été réglé à l'intérieur de la partie et le décor sans effet narratif.",
    "",
    "N'énumère pas les chapitres et ne les numérote pas : le lecteur de ce résumé a besoin de l'arc, pas du sommaire.",
    "N'ajoute rien que les résumés ci-dessous n'établissent pas.",
    "",
    "Ce que le plan prévoyait pour cette partie :",
    "{{plannedArc}}",
    "",
    "Résumés des chapitres, dans l'ordre :",
    "{{chapterSummaries}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const SUMMARIZE_PART_PROMPTS = [V1] as const;
