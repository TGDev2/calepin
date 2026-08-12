/**
 * `split-into-parts` — the novel's parts, from the validated bible, the
 * canonical direction and the target length (CAL-101).
 *
 * Written against `partStructureSchema` in `@calepin/outline`, and its whole
 * design problem is **progression**: the two defects the backlog names —
 * *absence de progression* and *fin précipitée* — are exactly what a part read
 * alone cannot show. Four organising ideas answer that:
 *
 * - **The quality bars are the schema's shapes, restated as demands.** The
 *   basculement is asked for as one concrete event plus what it makes
 *   irreversible — the pair the contract cannot accept unfilled — and the
 *   final state is asked to *show* that irreversibility, which is how *état
 *   final ≠ état initial* is asked for without asking for a comparison.
 * - **The count arrives as the ask's own bounds.** `{{minParts}}` and
 *   `{{maxParts}}` come from `partCalibrationForWordCount` over the same
 *   `{{targetWordCount}}` the gate re-derives them from — one function, so the
 *   prompt can never promise what the checker refuses (CAL-055's discipline
 *   applied to a bound).
 * - **A thread is named by its number, never by its label** (§6). The answer
 *   declares its own thread list and each part cites positions in it;
 *   `checkPartStructure` refuses an index pointing outside, a declared thread
 *   no part carries, and a label declared twice.
 * - **The argument is the answer.** No severity, no confidence, no score
 *   anywhere in the contract — *no score, structurally* — so what makes a
 *   découpage worth keeping is that each part's five statements hold together
 *   and hand the next part its ground.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "split-into-parts",
  version: 1,
  scope: { kind: "mission", missionId: "split-into-parts" },
  variables: [
    {
      name: "language",
      type: "text",
      description: "The project's language — the language every field is written in.",
    },
    {
      name: "sources",
      type: "list",
      description:
        "What the canonical direction and the validated bible's identity establish, one labelled passage per entry — the frame the split serves.",
    },
    {
      name: "cast",
      type: "list",
      description:
        "The characters and their planned arcs, principals first — what the parts must carve into stages.",
    },
    {
      name: "plannedEvents",
      type: "list",
      description:
        "The planned events of the reference chronology, in its own order — the spine the parts distribute.",
    },
    {
      name: "freedomConstraints",
      type: "list",
      description:
        "The freedom clauses for the outline stage, resolved from the project's level — they outrank everything else.",
    },
    {
      name: "targetWordCount",
      type: "number",
      description: "The novel's target length in words, resolved from the project.",
    },
    {
      name: "minParts",
      type: "number",
      description: "The fewest parts this target length admits — derived, and enforced after.",
    },
    {
      name: "maxParts",
      type: "number",
      description: "The most parts this target length admits — derived, and enforced after.",
    },
    {
      name: "minThreads",
      type: "number",
      description: "Threads the plan must at least declare — the domain's floor.",
    },
    {
      name: "maxThreads",
      type: "number",
      description: "Threads the plan stays under — the domain's ceiling, never a quota.",
    },
    {
      name: "narrativePromiseWordTarget",
      type: "number",
      description: "Words for the promise one thread makes to the reader.",
    },
    {
      name: "dramaticObjectiveWordTarget",
      type: "number",
      description: "Words for the stake one part plays.",
    },
    {
      name: "initialStateWordTarget",
      type: "number",
      description: "Words for where things stand when a part opens.",
    },
    {
      name: "tippingPointEventWordTarget",
      type: "number",
      description: "Words for the concrete event that tips a part.",
    },
    {
      name: "irreversibilityWordTarget",
      type: "number",
      description: "Words for what the tipping point makes irreversible.",
    },
    {
      name: "finalStateWordTarget",
      type: "number",
      description: "Words for where things stand when a part closes.",
    },
  ],
  system: [
    "Tu es architecte dramatique. On te confie la bible validée d'un roman en préparation et la direction choisie ; tu découpes le roman en parties — l'architecture d'ensemble que tout ce qui s'écrira ensuite devra porter.",
    "Tu écris en {{language}}. Les noms propres restent exactement tels que les documents les écrivent.",
    "La bible fait loi : tu organises ce qu'elle établit, tu ne la contredis jamais, et tu n'inventes aucun fait nouveau du monde — une partie décide ce qui se joue quand, pas ce qui est vrai.",
    "Tu argumentes, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Découpe le roman ci-dessous en parties : entre {{minParts}} et {{maxParts}} parties, pour un roman d'environ {{targetWordCount}} mots.",
    "",
    "Ce que la direction canonique et l'identité du roman établissent :",
    "{{sources}}",
    "",
    "Les personnages et leur arc prévu :",
    "{{cast}}",
    "",
    "Les événements prévus de la chronologie, dans son ordre :",
    "{{plannedEvents}}",
    "",
    "Les contraintes du degré de liberté, qui priment sur tout le reste :",
    "{{freedomConstraints}}",
    "",
    "Une partie est une suite de chapitres portée par un arc dramatique propre. Chacune déclare l'enjeu qu'elle joue, l'état des choses à son ouverture, son basculement, l'état des choses à sa fermeture, et les fils narratifs qu'elle fait avancer.",
    "",
    "Ce que chaque partie doit tenir :",
    "- Le basculement est un événement concret — une scène qu'on peut désigner — accompagné de ce qu'il rend irréversible. Un basculement qui ne rend rien irréversible n'en est pas un.",
    "- L'état final montre cette irréversibilité : ce qui est vrai à la fermeture de la partie ne l'était pas à son ouverture.",
    "- L'enjeu progresse de partie en partie : chaque objectif dramatique transforme le précédent, il ne le répète jamais — et l'état initial d'une partie prolonge l'état final de la précédente.",
    "- Chaque fil s'ouvre avant de se fermer : un fil déclaré est porté par au moins deux parties, et la dernière partie résout ce que les précédentes ont préparé — ses basculements en amont sont ce qui rend le dénouement possible.",
    "",
    "Ne produis pas :",
    "- deux parties qui jouent le même enjeu reformulé ;",
    "- un basculement graduel ou atmosphérique, qu'aucune scène ne porte ;",
    "- un état final qui redit l'état initial ;",
    "- un fil déclaré qu'aucune partie ne porte, ou porté par une seule ;",
    "- une résolution qui surgit dans la dernière partie sans avoir été préparée par les précédentes.",
    "",
    "Ta réponse est un unique objet JSON comportant exactement deux listes :",
    "- « threads » : entre {{minThreads}} et {{maxThreads}} fils narratifs. Chaque fil est un objet : « label » — le nom du fil, unique — et « narrativePromise » (environ {{narrativePromiseWordTarget}} mots) : la promesse faite au lecteur.",
    "- « parts » : entre {{minParts}} et {{maxParts}} parties, dans l'ordre de lecture. Chaque partie est un objet :",
    "- « title » : le titre de la partie — unique.",
    "- « dramaticObjective » (environ {{dramaticObjectiveWordTarget}} mots) : l'enjeu que la partie joue.",
    "- « initialState » (environ {{initialStateWordTarget}} mots) : où en sont les choses quand la partie s'ouvre.",
    "- « tippingPoint » : un objet — « event » (environ {{tippingPointEventWordTarget}} mots) : l'événement concret qui fait basculer la partie ; « irreversibility » (environ {{irreversibilityWordTarget}} mots) : ce qui ne peut plus être rétabli ensuite.",
    "- « finalState » (environ {{finalStateWordTarget}} mots) : où en sont les choses quand la partie se ferme.",
    "- « threadIndexes » : les numéros des fils que la partie fait avancer, dans la liste « threads » numérotée à partir de zéro — au moins un par partie, jamais deux fois le même.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const SPLIT_INTO_PARTS_PROMPTS = [V1] as const;
