/**
 * `detect-bible-contradictions` — the half of the bible's coherence check no
 * calculation reaches (CAL-099).
 *
 * Written against `bibleContradictionsSchema` in `@calepin/bible`, and its
 * whole design problem is **silence**. The four calculable checks already hold
 * the ages, the dates, the missing symmetric relations and two facts recorded
 * with opposite truth values; what is left for a model is the pair that opposes
 * itself only in its wording. That is a narrow ask, and a model given a narrow
 * ask and two open lists fills them. Four organising ideas answer that:
 *
 * - **Two empty lists are the good answer, and the prompt says so twice.** The
 *   contract's floors are zero for the reason `outOfNormCapabilities`' is, and
 *   a prompt that did not repeat it would undo the contract.
 * - **What is not a contradiction is enumerated before what is.** Three cases
 *   account for nearly every false positive here, and all three are legitimate
 *   states of a good bible: two facts holding over periods that do not meet, a
 *   character believing something false — which is `CanonFactBelief`'s entire
 *   reason for existing — and a rule with an explicit exception. Naming them is
 *   cheaper than hoping.
 * - **A pair is named by its number, never by its text** (§6). The ask numbers
 *   both lists from zero and the answer gives two numbers; nothing in the
 *   contract lets a model choose an identifier, and `verifyBibleContradictions`
 *   drops a pair pointing outside the ask.
 * - **The argument is the answer.** There is no severity, no confidence and no
 *   score anywhere in the contract — *no score, structurally* — so what makes a
 *   finding worth acting on is `explanation`, and the prompt asks for the
 *   reason the two cannot both hold rather than for a verdict that they do not.
 *
 * The findings this produces **block a validation** until the author rules on
 * them, which is why the prompt is asked for certainty rather than for
 * suspicion: *dans le doute, ne signale pas*.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "detect-bible-contradictions",
  version: 1,
  scope: { kind: "mission", missionId: "detect-bible-contradictions" },
  variables: [
    {
      name: "language",
      type: "text",
      description: "The project's language — the language every field is written in.",
    },
    {
      name: "facts",
      type: "list",
      description:
        "The confirmed canon, numbered from zero: the statement, whether the world holds it true or false, and the period it covers. The only facts a pair may name.",
    },
    {
      name: "worldRules",
      type: "list",
      description:
        "The rules of the world, numbered from zero: name, statement and declared bounds. The only rules a pair may name.",
    },
    {
      name: "explanationWordTarget",
      type: "number",
      description: "Words for why the two cannot both hold.",
    },
    {
      name: "proposedFixWordTarget",
      type: "number",
      description: "Words for the one act that would resolve it.",
    },
    {
      name: "maxOpposedFacts",
      type: "number",
      description: "The most opposed pairs of facts one answer may declare.",
    },
    {
      name: "maxContradictoryRules",
      type: "number",
      description: "The most contradictory pairs of rules one answer may declare.",
    },
  ],
  system: [
    "Tu es lecteur de cohérence. On te confie la bible d'un roman en préparation — ce que le monde tient pour vrai, et les règles qui le gouvernent — avant qu'un seul chapitre soit écrit. Tu cherches ce qui ne peut pas tenir ensemble.",
    "Tu écris en {{language}}. Les noms propres restent exactement tels que les énoncés les écrivent.",
    "Tu ne signales qu'une impossibilité, jamais une tension, une redondance ou une maladresse. Dans le doute, tu ne signales pas : ce que tu signales empêche l'auteur de valider sa bible tant qu'il ne s'est pas prononcé.",
    "Tu argumentes, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Cherche les contradictions internes de la bible ci-dessous.",
    "",
    "Les faits canoniques, numérotés à partir de zéro. Chaque entrée donne son numéro, son énoncé, ce que le monde en tient — vrai ou faux — et la période qu'il couvre :",
    "{{facts}}",
    "",
    "Les règles du monde, numérotées à partir de zéro. Chaque entrée donne son numéro, son nom, ce qu'elle établit et ses bornes déclarées :",
    "{{worldRules}}",
    "",
    "Deux faits se contredisent quand ils ne peuvent pas être vrais ensemble du même monde au même moment, alors même qu'ils sont écrits différemment : un homme enterré et le même homme vivant, une maison détruite et la même maison habitée, un personnage parti sans retour et le même personnage revenu.",
    "",
    "Ne signale pas, ce sont des états normaux d'une bible qui tient :",
    "- deux faits dont les périodes ne se recouvrent pas : ce qui était vrai avant et ne l'est plus n'est pas une contradiction ;",
    "- un personnage qui croit quelque chose de faux, ou qui ignore un fait vrai : c'est le ressort même du roman, et la bible est faite pour le porter ;",
    "- deux énoncés qui disent la même chose autrement, sans s'opposer ;",
    "- une règle assortie d'une exception explicite, quand l'exception est déclarée dans l'une des deux.",
    "",
    "Deux règles se contredisent quand elles ne peuvent pas gouverner le même monde : ce que l'une rend impossible, l'autre le rend courant, et rien dans leurs bornes ne réconcilie les deux.",
    "",
    "Ta réponse est un unique objet JSON comportant exactement deux listes :",
    "- « opposedFacts » : au plus {{maxOpposedFacts}} paires de faits qui ne peuvent pas être vrais ensemble.",
    "- « contradictoryRules » : au plus {{maxContradictoryRules}} paires de règles qui ne peuvent pas gouverner ensemble.",
    "",
    "Chaque paire est un objet :",
    "- « firstIndex » : le numéro du premier élément, tel qu'il est écrit dans la liste correspondante.",
    "- « secondIndex » : le numéro du second — jamais le même que le premier.",
    "- « explanation » (environ {{explanationWordTarget}} mots) : pourquoi les deux ne peuvent pas tenir ensemble. Explique l'impossibilité, ne te contente pas de la déclarer.",
    "- « proposedFix » (environ {{proposedFixWordTarget}} mots) : un seul geste que l'auteur peut faire — écarter l'un des deux, restreindre une période, poser une exception.",
    "",
    "Si la bible ne se contredit pas, réponds avec les deux listes vides. C'est une réponse complète et c'est la bonne : n'invente jamais une paire pour remplir une liste.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const DETECT_BIBLE_CONTRADICTIONS_PROMPTS = [V1] as const;
