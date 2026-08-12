/**
 * `build-timeline` — the initial chronology (CAL-093).
 *
 * The sixth bible mission, and the one whose answer is checked by calculation
 * rather than by shape. `checkTimelineArithmetic` (`@calepin/bible`) reads every
 * number back against every other and refuses the whole chronology when they
 * cannot all be true; this prompt exists to make that refusal rare rather than
 * to replace it.
 *
 * Four ideas organise it.
 *
 *   1. **The axis, before anything else.** The model is not asked for dates in a
 *      calendar — a novel's calendar may not be ours, and *printemps 1892* is
 *      not a day. It is asked for a signed count of days from the day the novel
 *      opens, with the author's own wording carried beside it in `dateLabel`.
 *      The conversion is stated once, as a variable, because a target stated
 *      twice is a target that will disagree with itself (CAL-055).
 *   2. **The redundancy is deliberate and is said to be.** The contract asks for
 *      the same instant more than one way — a day, a duration since another
 *      event, an age for each character present — and a model told only *be
 *      consistent* will hedge by stating less. So the prompt says what the
 *      redundancy is for: it is the evidence the check reads, and stating less
 *      does not make a chronology more likely to pass.
 *   3. **The failure mode is named, with its own arithmetic.** *34 ans
 *      aujourd'hui, 12 ans il y a trente ans* is the backlog's own example and
 *      the thing this mission exists to prevent. Naming it, and showing the
 *      subtraction that catches it, is worth more than any number of
 *      instructions to be careful.
 *   4. **The vagueness escape hatch is offered explicitly.** An event whose date
 *      is genuinely unknown must still be placed, because an unplaced event is
 *      refused — so the prompt points at the decade precision rather than
 *      leaving the model to choose between inventing a day and omitting one.
 *
 * The two arrays are not explained as a taxonomy: the model is told what goes in
 * each, and the category is written from the array afterwards. There is no
 * `NARRATED` here and nothing to say about one — nothing has been written yet.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "build-timeline",
  version: 1,
  scope: { kind: "mission", missionId: "build-timeline" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "freedomConstraints",
      type: "list",
      description:
        "The freedom-level clauses for the bible stage: the stage rule, then one clause per dimension.",
    },
    {
      name: "citableSources",
      type: "list",
      description:
        "One entry per passage the chronology stays answerable to — its key, its French label and the passage: the canonical direction, the identity, the world section, then the validated analysis. Context, not a citation vocabulary: no basis is asked of the answer.",
    },
    {
      name: "cast",
      type: "list",
      description:
        "One entry per established character: the exact name the answer must use, one line of who they are, and their age on the day the novel opens — or the statement that the bible gives none.",
    },
    {
      name: "datePrecisions",
      type: "list",
      description:
        "The precision members the answer may use, each with its French gloss — how finely a date or a duration is known.",
    },
    {
      name: "daysPerYear",
      type: "number",
      description:
        "The days the day axis counts to a year. The one place the conversion is stated, so the prompt and the checker cannot disagree about it.",
    },
    {
      name: "summaryWordTarget",
      type: "number",
      description: "Words one event's summary should come to.",
    },
    {
      name: "dateLabelWordTarget",
      type: "number",
      description: "Words the author-facing wording of a date should come to.",
    },
    {
      name: "minBackstoryEvents",
      type: "number",
      description: "Events before the opening the chronology must at least declare.",
    },
    {
      name: "maxBackstoryEvents",
      type: "number",
      description: "Events before the opening the chronology stays under — never a quota.",
    },
    {
      name: "minPlannedEvents",
      type: "number",
      description: "Events of the novel itself the chronology must at least declare.",
    },
    {
      name: "maxPlannedEvents",
      type: "number",
      description: "Events of the novel itself the chronology stays under — never a quota.",
    },
    {
      name: "maxParticipants",
      type: "number",
      description: "Characters one event may name as present.",
    },
  ],
  system: [
    "Tu es directeur littéraire. Un auteur a retenu une direction romanesque, l'identité et le monde de son roman sont établis, et ses personnages sont fichés. Tu écris la chronologie de sa bible : ce qui a eu lieu avant que le roman commence, ce que le roman racontera, et quand.",
    "Tu écris en {{language}}. Les noms propres restent exactement tels que la bible les écrit.",
    "Tu écris une chronologie dont on peut vérifier les nombres. Une date, une durée et un âge qui se contredisent ne sont pas une imprécision de style : ce sont trois affirmations dont l'une est fausse, et la suite du roman s'appuiera dessus.",
    "Tu apprécies, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Établis la chronologie du roman à partir des éléments ci-dessous.",
    "",
    "Contraintes de fidélité au texte source — elles s'imposent à toute entrée de la bible :",
    "{{freedomConstraints}}",
    "",
    "Ce sur quoi la chronologie doit rester appuyée — la direction retenue, l'identité, le monde, puis l'analyse validée. Chaque entrée donne sa clé, ce qu'elle est, puis le passage lui-même :",
    "{{citableSources}}",
    "",
    "Les personnages déjà établis. N'emploie que ces noms, écrits exactement ainsi, et n'en invente aucun autre :",
    "{{cast}}",
    "",
    "L'AXE DU TEMPS",
    "",
    "Tu ne donnes pas de dates de calendrier. Tu places chaque événement sur un axe en jours entiers : le jour 0 est le jour où le roman s'ouvre, les nombres négatifs sont avant, les positifs après. Une année vaut {{daysPerYear}} jours sur cet axe. Trente ans avant l'ouverture s'écrit donc -10950.",
    "Cet axe ne remplace pas la manière dont le roman dira les choses : « dateLabel » porte la formulation destinée à l'auteur — « au printemps, cinq ans plus tôt » — pendant que le nombre porte la position.",
    "Quand la date n'est pas connue au jour près, écris le **milieu** de la période que le libellé désigne, et dis dans « datePrecision » à quel point elle est connue. Le printemps 1892 s'écrit au milieu du printemps, pas à son premier jour : la vérification lit la précision comme une marge de part et d'autre du nombre que tu écris.",
    "Précisions disponibles :",
    "{{datePrecisions}}",
    "",
    "TA RÉPONSE",
    "",
    "Un unique objet JSON comportant deux listes, et rien d'autre :",
    "- « backstoryEvents » — de {{minBackstoryEvents}} à {{maxBackstoryEvents}} événements antérieurs au roman, donc situés avant le jour 0.",
    "- « plannedEvents » — de {{minPlannedEvents}} à {{maxPlannedEvents}} événements que le roman racontera, donc situés au jour 0 ou après.",
    "C'est la liste qui dit ce qu'un événement est. N'ajoute aucun champ de catégorie : il serait ignoré.",
    "",
    "Chaque événement, dans l'une comme dans l'autre, comporte :",
    "- « name » : un intitulé court, distinct de tous les autres intitulés de la chronologie. C'est par lui que les autres événements s'y rattacheront.",
    "- « summary » (environ {{summaryWordTarget}} mots) : ce qui a lieu, dit pour ce que le roman en aura besoin.",
    "- « absoluteDay » et « datePrecision » : la position sur l'axe et sa précision — les deux ensemble, ou les deux à null.",
    "- « dateLabel » (environ {{dateLabelWordTarget}} mots) : la formulation destinée à l'auteur, ou null.",
    "- « precedingEventName », « daysAfterPreceding » et « durationPrecision » : l'intitulé exact d'un autre événement de la chronologie, le nombre de jours écoulés depuis lui, et la précision de cette durée. La durée et sa précision vont ensemble, ou toutes deux à null. Une durée ne peut pas être négative ; zéro signifie que les deux événements sont simultanés.",
    "- « participants » — jusqu'à {{maxParticipants}} entrées : les personnages présents, chacun avec « characterName » et « declaredAge ».",
    "",
    "PLACER UN ÉVÉNEMENT",
    "",
    "Chaque événement doit pouvoir être ramené à un jour, de l'une de ces deux façons : il porte lui-même une date, ou il porte une durée depuis un événement qui, lui, en porte une. Le premier événement d'une chaîne doit donc être daté.",
    "Un événement rattaché à un autre sans durée ne se ramène à aucun jour : la chronologie entière sera refusée. Si tu ne sais pas quand quelque chose s'est produit, ne l'omets pas et n'invente pas une date précise — donne ta meilleure estimation et déclare-la « DECADE ». C'est ce que cette précision existe pour dire.",
    "Un événement peut porter une date **et** une durée depuis un autre. C'est utile, et c'est vérifié : les deux doivent désigner le même jour, à la marge des précisions près.",
    "",
    "LES ÂGES",
    "",
    "Chaque personnage présent à un événement porte son âge à cet instant, en années révolues. Ce champ n'est pas facultatif : c'est ce que le cahier des charges demande, et c'est ce qui rend la chronologie vérifiable.",
    "Ces âges ne sont pas indépendants les uns des autres. L'âge d'un personnage à l'ouverture est donné plus haut ; un personnage qui a 34 ans au jour 0 en a 4 au jour -10950, et 35 au jour {{daysPerYear}}. Fais la soustraction pour chaque présence plutôt que d'estimer.",
    "Voici l'erreur que cette mission existe à empêcher : déclarer qu'un personnage a 34 ans à l'ouverture, puis qu'il en avait 12 lors d'un événement situé trente ans plus tôt. Trente ans se sont écoulés et le personnage n'a vieilli que de 22 ans : aucune date de naissance ne rend ces deux affirmations vraies ensemble.",
    "Un personnage dont l'âge à l'ouverture n'est pas donné est un personnage né pendant le roman, ou dont la bible ne dit pas l'âge. Ses âges déclarés doivent rester cohérents entre eux ; ne le fais pas apparaître avant sa naissance.",
    "",
    "CE QUI SERA VÉRIFIÉ",
    "",
    "Après ta réponse, un calcul reprend chaque nombre : les dates contre les durées, les durées contre l'ordre des événements, et les âges de chaque personnage les uns contre les autres. Une seule contradiction fait rejeter la chronologie entière — pas l'événement fautif, la chronologie.",
    "Écrire moins ne protège de rien : une chronologie vague ne passe pas mieux, elle est simplement moins utile au roman. Écris des nombres justes.",
    "",
    "Tout ce que tu déclares doit servir le roman que la direction retenue annonce. N'ajoute aucun événement dont aucune scène et aucun personnage n'aura l'usage.",
    "Aucun chiffre d'évaluation nulle part : ni note, ni score, ni pourcentage. Un nombre peut situer un moment, mesurer une durée ou donner un âge — jamais mesurer une qualité.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const BUILD_TIMELINE_PROMPTS = [V1] as const;
