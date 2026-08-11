/**
 * `evaluate-direction` — a judgement on one proposal, against the analysis it
 * came from and the freedom the project declared.
 *
 * The mission that decides which novel gets written, so the prompt asks for a
 * verdict with its reasons rather than for encouragement.
 *
 * V2 (CAL-081) serves `directionEvaluationSchema` and holds four ideas:
 *
 * **A reader, not the proposer.** The specification separates production from
 * critique (principle 6.2): the system prompt casts a critical reader who did
 * not conceive the direction, judges it as written, and whose value is what
 * the direction does not say of itself — never a rewrite, never encouragement.
 *
 * **Attached, both halves.** Every critique names in `element` the field of
 * the direction it bears on — the vocabulary arrives composed from the
 * domain's own copy (`describeDirectionElements`), never restated in prose —
 * and may quote either the source text or the direction itself, character for
 * character. The enforcement is announced (`verifyDirectionEvaluationEvidence`
 * clears an unfound quotation), because a rule a model can plan for is a rule
 * it follows.
 *
 * **A case, never a classement.** The comparative list is framed as the
 * honest case for why this direction *may* be the less interesting one —
 * instructed against the siblings the composer passes as context, referring
 * to them by working title, evaluating none of them here. The no-score clause
 * is the house sentence, `classement` included.
 *
 * **Bounds travel as variables** (CAL-055): the minimums, the per-list
 * ceiling and the word targets are `@calepin/direction`'s own numbers
 * (`DIRECTION_EVALUATION_COUNTS`, `DIRECTION_EVALUATION_WORD_TARGETS`),
 * rendered into the text and enforced by the schema — one number, one place.
 * The values — the serialised direction and siblings among them — are the
 * future composer's to resolve (the executor task's, as everywhere).
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "evaluate-direction",
  version: 1,
  scope: { kind: "mission", missionId: "evaluate-direction" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "analysis",
      type: "text",
      description: "The accepted analysis of the source text, composed by the caller.",
    },
    { name: "direction", type: "text", description: "The one direction under evaluation." },
    {
      name: "freedomConstraints",
      type: "list",
      description: "The freedom-level clauses for the direction stage, one per dimension.",
    },
  ],
  system: [
    "Tu es directeur littéraire. Tu évalues une direction romanesque proposée pour un roman en préparation.",
    "Tu écris en {{language}}.",
    "Tu juges la direction telle qu'elle est écrite, sans la réécrire ni en proposer une autre à la place.",
  ].join("\n"),
  instruction: [
    "Évalue la direction ci-dessous.",
    "",
    "Contraintes de fidélité au texte source :",
    "{{freedomConstraints}}",
    "",
    "Examine ce qu'elle promet, ce qu'elle exige du reste du projet, ce qu'elle risque de rendre difficile à tenir sur la longueur d'un roman, et si elle respecte les contraintes ci-dessus.",
    "Appuie chaque appréciation sur un élément précis de la direction ou de l'analyse ; une appréciation sans point d'appui n'a pas d'intérêt pour l'auteur.",
    "",
    "Direction évaluée :",
    "{{direction}}",
    "",
    "Analyse du texte source :",
    "{{analysis}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

const V2 = {
  id: "evaluate-direction",
  version: 2,
  scope: { kind: "mission", missionId: "evaluate-direction" },
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
      name: "direction",
      type: "text",
      description: "The one direction under evaluation, serialised field by field.",
    },
    {
      name: "otherDirections",
      type: "list",
      description:
        "The sibling directions, one compact entry each — working title, engine clause (describeNarrativeEngine), premise — context for the comparative case, never objects of this evaluation.",
    },
    {
      name: "freedomConstraints",
      type: "list",
      description:
        "The freedom-level clauses for the direction stage: the stage rule, then one clause per dimension.",
    },
    {
      name: "elementKeys",
      type: "list",
      description:
        "One line per criticisable element — its key and its French label, composed from the domain's own copy (describeDirectionElements), in declaration order.",
    },
    {
      name: "argumentWordTarget",
      type: "number",
      description: "Words one argued critique should come to, whichever list it sits on.",
    },
    {
      name: "evidenceWordTarget",
      type: "number",
      description:
        "Words a supporting quotation should stay around — it anchors, it does not reproduce.",
    },
    {
      name: "minPromises",
      type: "number",
      description: "Promises the critique must at least expose — the domain's floor.",
    },
    {
      name: "minShortfalls",
      type: "number",
      description: "Delivery risks the critique must at least expose — the domain's floor.",
    },
    {
      name: "minConventions",
      type: "number",
      description: "Conventional elements the critique must at least name — the domain's floor.",
    },
    {
      name: "minComparativeWeaknesses",
      type: "number",
      description: "Comparative weaknesses the critique must at least argue — the domain's floor.",
    },
    {
      name: "maxPerList",
      type: "number",
      description: "Entries one list stays under — the domain's ceiling, never a quota.",
    },
  ],
  system: [
    "Tu es lecteur critique. On te soumet une direction romanesque proposée pour un roman en préparation : tu ne l'as pas conçue, tu ne la réécris pas et tu n'en proposes pas une autre — tu la juges telle qu'elle est écrite, pour un auteur qui doit choisir laquelle engager.",
    "Tu écris en {{language}}. Les noms propres et les termes du texte source restent tels que le texte les écrit.",
    "Ta valeur est de dire ce que la direction ne dit pas d'elle-même : une critique qui la reformule ou l'encourage n'aide pas l'auteur à choisir. Chaque critique se rattache à un élément précis de la direction ou du texte source ; une appréciation sans point d'appui n'a pas d'intérêt pour l'auteur.",
    "Tu apprécies, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Évalue la direction ci-dessous, proposée pour un roman d'environ {{targetWordCount}} mots.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "Contraintes de fidélité au texte source — la direction a été proposée sous elles :",
    "{{freedomConstraints}}",
    "",
    "Chaque critique nomme dans « element » le champ de la direction qu'elle vise, parmi :",
    "{{elementKeys}}",
    "Elle peut porter dans « evidence » (environ {{evidenceWordTarget}} mots, sinon null) une citation d'appui copiée caractère pour caractère depuis le texte source ou depuis la prose de la direction elle-même — jamais recomposée de mémoire : une citation introuvable est retirée, et la critique reste, affaiblie de son ancrage. Les deux déclarations — « dimensionTreatments », « narrativeEngine » — se visent par « element » et s'argumentent en mots, jamais dans « evidence ». Dans le doute, nomme l'élément sans le citer.",
    "",
    "Ta réponse comporte :",
    "- « promises » — au moins {{minPromises}} entrées : ce que la direction promet à son lecteur — l'expérience que ses champs engagent, de la plus structurante à la plus locale. Chaque entrée porte un « label » court, puis « whatItCommitsTo » (environ {{argumentWordTarget}} mots) : ce que tenir cette promesse exigera du roman.",
    "- « shortfalls » — au moins {{minShortfalls}} entrées : ce qu'elle risque de ne pas tenir sur la longueur visée. « whyAtRisk » (environ {{argumentWordTarget}} mots) argumente d'où vient le risque — un dispositif qui s'épuise, un conflit qui se résout trop tôt, une promesse sans matière dans le texte source.",
    "- « conventions » — au moins {{minConventions}} entrée : ce qui y est convenu — la situation, la trajectoire ou la résolution que le lectorat visé a déjà lue ailleurs. Le genre dominant en apporte toujours ; nomme les plus coûteuses, jamais un inventaire. « whyConventional » (environ {{argumentWordTarget}} mots) dit en quoi c'est attendu et ce que cela ferme.",
    "- « comparativeWeaknesses » — au moins {{minComparativeWeaknesses}} entrée : pourquoi cette direction peut être moins intéressante que les autres proposées — un procès honnête, instruit à charge, jamais un verdict : tu n'établis aucun classement et tu n'évalues pas les autres directions ici. Réfère-toi à elles par leur titre de travail si besoin. « whyLessInteresting » (environ {{argumentWordTarget}} mots) argumente à partir d'un élément précis de cette direction, pas d'une préférence.",
    "",
    "Au plus {{maxPerList}} entrées par liste. Aucun chiffre d'évaluation nulle part : ni note, ni score, ni pourcentage. La longueur visée et un nombre que le texte lui-même écrit peuvent être nommés ; aucun nombre ne mesure une qualité.",
    "",
    "Direction évaluée :",
    "{{direction}}",
    "",
    "Les autres directions proposées — le contexte de ta critique comparative, jamais l'objet de ton évaluation :",
    "{{otherDirections}}",
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

export const EVALUATE_DIRECTION_PROMPTS = [V1, V2] as const;
