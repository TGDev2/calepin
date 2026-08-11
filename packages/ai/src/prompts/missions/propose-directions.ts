/**
 * `propose-directions` — divergence: several genuinely different novels out of
 * one text.
 *
 * The prompt's whole work is to prevent variations on one idea. The freedom
 * constraints arrive already worded, one clause per dimension, from
 * `@calepin/shared/freedom-level` (CAL-044): they are the business layer's
 * rule, and this layer quotes them rather than restating them (§5.5).
 *
 * V2 (CAL-079) is the version the domain contract exists for
 * (`directionProposalsSchema` in `@calepin/direction`). Its organising ideas:
 *
 * - **The engine, not the setting.** The specification accepts three
 *   directions only when they are incompatible on their narrative engine; the
 *   prompt names what must change from one to the next — nature of the
 *   conflict, source of the tension, what the protagonist risks, nature of
 *   the resolution — and calls three moods on one mechanism a failed answer.
 *   The operational check and the relaunch are CAL-080's, not this text's.
 * - **Not found alone, never betrayed.** The product's own success criterion:
 *   the first idea and the expected genre-reflex are refused out loud, and
 *   the emotional/thematic promise of the source is a floor at every freedom
 *   level — which the freedom policy itself guarantees structurally (themes
 *   `preserve`, narrative-promise at most `extend`).
 * - **The declaration is part of the answer.** The `direction` stage rule
 *   already orders each direction to declare all ten dimension treatments;
 *   V2 gives that order its keys (composed from `SOURCE_DIMENSIONS` and its
 *   French labels, never restated in prose) and tells the model that
 *   understating a real departure is worse than declaring it — the
 *   declaration feeds `checkDirectionProposalCompliance`, and the safe
 *   reading of a lie is the widest.
 * - **Appraise, never rate.** The twelfth attribute is argued prose; every
 *   numeric form of a verdict is forbidden twice, here and by the schema.
 * - **One number, one place** (CAL-055): every count and word target the
 *   text states arrives as a variable owned by `@calepin/direction`
 *   (`DIRECTION_PROPOSAL_COUNT`, `DIRECTION_WORD_TARGETS`,
 *   `DIRECTION_LIST_COUNTS`); the target word count is the project's own
 *   (`resolveNovelTargetWordCount`, `@calepin/outline`), resolved by the
 *   future composer.
 *
 * Exercised before shipping on three reference-corpus texts of contrasting
 * registers, one freedom level each, through the real renderer and the real
 * schema, with findings folded into this wording between passes
 * (tasks/todo.md, CAL-079).
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "propose-directions",
  version: 1,
  scope: { kind: "mission", missionId: "propose-directions" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "targetAudience",
      type: "text",
      description: "The project's target readership, as the author declared it.",
    },
    {
      name: "analysis",
      type: "text",
      description: "The accepted analysis of the source text, composed by the caller.",
    },
    {
      name: "freedomConstraints",
      type: "list",
      description: "The freedom-level clauses for the direction stage, one per dimension.",
    },
    {
      name: "directionCount",
      type: "number",
      description: "How many distinct directions to propose.",
    },
  ],
  system: [
    "Tu es directeur littéraire. Tu proposes à un auteur des directions romanesques distinctes à partir de l'analyse de son texte de départ.",
    "Tu écris en {{language}}.",
    "Deux directions qui se distinguent seulement par un détail ne sont qu'une seule direction : chacune doit engager un roman différent.",
  ].join("\n"),
  instruction: [
    "Propose {{directionCount}} directions romanesques à partir de l'analyse ci-dessous.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "Contraintes de fidélité au texte source :",
    "{{freedomConstraints}}",
    "",
    "Chaque direction doit être défendable à partir de l'analyse, tenir dans les contraintes ci-dessus, et se distinguer des autres par ce qu'elle engage réellement : le récit, l'enjeu, la trajectoire des personnages.",
    "Pour chacune, dis ce qu'elle conserve du texte source et ce qu'elle en écarte.",
    "",
    "Analyse du texte source :",
    "{{analysis}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

const V2 = {
  id: "propose-directions",
  version: 2,
  scope: { kind: "mission", missionId: "propose-directions" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "targetAudience",
      type: "text",
      description: "The project's target readership, as the author declared it.",
    },
    {
      name: "targetWordCount",
      type: "number",
      description: "The novel's target length in words, resolved from the project.",
    },
    {
      name: "validatedAnalysis",
      type: "text",
      description: "The validated diagnostic of the source text, section by section.",
    },
    { name: "sourceText", type: "text", description: "The current source text version, in full." },
    {
      name: "freedomConstraints",
      type: "list",
      description:
        "The freedom-level clauses for the direction stage: the stage rule, then one clause per dimension.",
    },
    {
      name: "dimensionKeys",
      type: "list",
      description:
        "One line per source dimension — its declaration key and its French label, in declaration order.",
    },
    {
      name: "directionCount",
      type: "number",
      description: "How many directions to propose — the schema's own exact count.",
    },
    {
      name: "premiseWordTarget",
      type: "number",
      description: "Words the developed premise should come to.",
    },
    {
      name: "conflictWordTarget",
      type: "number",
      description: "Words the main conflict should come to.",
    },
    {
      name: "arcWordTarget",
      type: "number",
      description: "Words the protagonist's trajectory should come to.",
    },
    {
      name: "endingWordTarget",
      type: "number",
      description: "Words the nature of the ending should come to.",
    },
    {
      name: "assessmentWordTarget",
      type: "number",
      description: "Words the argued potential appraisal should come to.",
    },
    {
      name: "itemWordTarget",
      type: "number",
      description: "Words one list entry should come to — one to three sentences.",
    },
    {
      name: "minNewStakes",
      type: "number",
      description: "New stakes a direction must at least name — the domain's floor.",
    },
    {
      name: "minMainRisks",
      type: "number",
      description: "Risks a direction must at least name against itself — the domain's floor.",
    },
    {
      name: "minElementsKept",
      type: "number",
      description: "Kept source elements a direction must at least name — the domain's floor.",
    },
    {
      name: "minElementsTransformed",
      type: "number",
      description: "Transformed elements a direction must at least name — the domain's floor.",
    },
    {
      name: "maxPerList",
      type: "number",
      description: "Entries one list stays under — the domain's ceiling, never a quota.",
    },
  ],
  system: [
    "Tu es directeur littéraire. À partir du diagnostic validé d'un texte court et du texte lui-même, tu proposes à son auteur des directions romanesques complètes : chacune engage un roman entier, défendable devant l'auteur à partir de ce que son texte contient réellement.",
    "Tu écris en {{language}}. Les noms propres et les termes du texte source restent tels que le texte les écrit.",
    "Deux directions qui partagent le même moteur narratif ne sont qu'une seule direction, quel que soit le décor : d'une direction à l'autre doivent changer la nature du conflit, la source de la tension, ce que le protagoniste risque et la nature de la résolution.",
    "Ta valeur est de proposer ce que l'auteur n'aurait pas nécessairement trouvé seul. Écarte la première idée venue et le prolongement le plus attendu du genre : une direction surprenante se défend par des éléments précis du texte, une direction convenue ne se défend pas.",
    "Quelle que soit la liberté accordée, la promesse émotionnelle et thématique du texte source n'est jamais trahie : l'auteur doit reconnaître dans chaque direction ce qui l'a fait écrire son texte.",
    "Tu apprécies, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "À partir de l'analyse validée et du texte source ci-dessous, propose {{directionCount}} directions romanesques pour un roman d'environ {{targetWordCount}} mots.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "Contraintes de fidélité au texte source — elles s'imposent à chaque direction :",
    "{{freedomConstraints}}",
    "",
    "Les {{directionCount}} directions sont incompatibles sur leur moteur narratif, pas seulement sur leur décor : trois variations d'ambiance sur une même mécanique sont une réponse ratée. L'analyse nomme des risques de clichés : aucun ne devient le cœur d'une direction, et une direction qui frôle un motif convenu dit dans « mainRisks » comment elle s'en écarte.",
    "",
    "Chaque direction comporte :",
    "- « workingTitle » : un titre de travail court et singulier — jamais générique.",
    "- « developedPremise » (environ {{premiseWordTarget}} mots) : la prémisse développée — la situation, le mouvement du récit sur toute sa longueur, ce que ce roman ferait éprouver que le texte court ne fait que promettre.",
    "- « dominantGenre » : le genre dominant, nommé court.",
    "- « mainConflict » (environ {{conflictWordTarget}} mots) : le conflit principal — qui veut quoi, ce qui s'y oppose, pourquoi il ne peut pas se résoudre vite.",
    "- « protagonistArc » (environ {{arcWordTarget}} mots) : la trajectoire du protagoniste, de son état au début à ce que la fin fait de lui — ce qu'il traverse, ce qu'il y perd ou y gagne.",
    "- « newStakes » — au moins {{minNewStakes}} entrées : les enjeux que le roman ajoute à ceux du texte court, par ordre d'importance.",
    "- « charactersToIntroduce » : les personnages à introduire, chacun nommé avec sa fonction dans le récit. Liste vide si la distribution du texte suffit : n'introduis jamais un personnage pour remplir la liste.",
    "- « endingNature » (environ {{endingWordTarget}} mots) : la nature de la fin — son type, ce qu'elle résout, ce qu'elle coûte — jamais son déroulé.",
    "- « mainRisks » — au moins {{minMainRisks}} entrées : les principaux risques de cette direction, nommés contre elle, honnêtement — ce qui peut la faire échouer en écriture, ce qu'elle a de plus fragile ou de plus attendu.",
    "- « elementsKeptFromSource » — au moins {{minElementsKept}} entrées : les éléments du texte source conservés. Chacun existe réellement dans le texte ou dans l'analyse ; n'attribue jamais au texte ce qu'il ne contient pas.",
    "- « elementsTransformed » — au moins {{minElementsTransformed}} entrées : les éléments du texte transformés, chacun disant de quoi il part et ce qu'il devient.",
    "- « novelPotentialAssessment » (environ {{assessmentWordTarget}} mots) : l'évaluation argumentée du potentiel romanesque de cette direction — ce qu'elle peut soutenir sur la longueur visée, par quoi elle tient, où elle demandera le plus de travail — appuyée sur des éléments précis du texte ou de l'analyse.",
    "- « dimensionTreatments » : pour chacune des dix dimensions ci-dessous, ce que la direction fait réellement de ce que le texte source établit — « preserve » (conservé tel quel), « extend » (développé sans être contredit) ou « reinterpret » (réinterprété). La déclaration décrit la direction telle qu'elle est : elle ne dépasse jamais le traitement autorisé par les contraintes, et minimiser un écart réel est une faute plus grave que le déclarer.",
    "{{dimensionKeys}}",
    "",
    "Chaque entrée de liste tient en une à trois phrases, environ {{itemWordTarget}} mots ; au plus {{maxPerList}} entrées par liste.",
    "Aucun chiffre d'évaluation nulle part : ni note, ni score, ni pourcentage. La longueur visée et un nombre que le texte lui-même écrit peuvent être nommés ; aucun nombre ne mesure une qualité.",
    "",
    "Analyse validée :",
    "{{validatedAnalysis}}",
    "",
    "Texte source :",
    "{{sourceText}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const PROPOSE_DIRECTIONS_PROMPTS = [V1, V2] as const;
