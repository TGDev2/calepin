/**
 * `build-chapter-outline` — one part's chapter plans, as a batch (CAL-102).
 *
 * V1 predates the batch contract: it asked for one chapter's plan in prose
 * guidance, before `chapterOutlineBatchSchema` existed. V2 is written against
 * that schema in `@calepin/outline`, and its whole design problem is the four
 * imperatives the backlog sets — a dramatic function and a consequence on
 * every chapter, no stake repeated, every revelation prepared, no thread left
 * open without a planned closing chapter — which are properties of a
 * *sequence*, and the reason the mission answers a part rather than a
 * chapter. Four organising ideas answer that:
 *
 * - **The quality bars are the schema's shapes, restated as demands.** The
 *   function and the consequence are required fields; a revelation is asked
 *   for as content plus what plants it plus the number of the planting
 *   chapter — the reference `checkChapterOutlineBatch` verifies as
 *   arithmetic.
 * - **The count and the budget arrive as the ask's own bounds.**
 *   `{{minChapters}}`/`{{maxChapters}}` come from
 *   `chapterCalibrationForPartWordCount` over the same
 *   `{{partTargetWordCount}}` the gate re-derives them from — one function,
 *   so the prompt can never promise what the checker refuses (CAL-055's
 *   discipline applied to a bound).
 * - **Everything is named by number or by the list's own spelling** (§6). The
 *   threads and the canon facts are cited as positions in the ask's numbered
 *   lists; the characters and the places as names the lists offer, spelled
 *   as they spell them. The checker refuses a reference outside the lists.
 * - **The choreography is the assignment plan's.** Each thread arrives with
 *   its state and the parts it is assigned to; a chapter acts only on the
 *   part's own threads, opens before it continues or closes, never touches a
 *   closed thread, and closes a thread exactly in its last assigned part —
 *   the last part of the novel closing everything still open.
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

const V2 = {
  id: "build-chapter-outline",
  version: 2,
  scope: { kind: "mission", missionId: "build-chapter-outline" },
  variables: [
    {
      name: "language",
      type: "text",
      description: "The project's language — the language every field is written in.",
    },
    {
      name: "partNumber",
      type: "number",
      description: "The part's position in reading order, from one — partIndex + 1.",
    },
    { name: "partCount", type: "number", description: "How many parts the plan holds." },
    { name: "partTitle", type: "text", description: "The part's title, as the plan spells it." },
    {
      name: "partDramaticObjective",
      type: "text",
      description: "The stake the part plays — the frame's first clause.",
    },
    {
      name: "partInitialState",
      type: "text",
      description: "Where things stand when the part opens — what chapter one continues from.",
    },
    {
      name: "partTippingPoint",
      type: "text",
      description: "The part's tipping point, event and irreversibility flattened.",
    },
    {
      name: "partFinalState",
      type: "text",
      description: "Where things stand when the part closes — what the batch must land on.",
    },
    {
      name: "partTargetWordCount",
      type: "number",
      description: "The part's share of the novel in words — the budget the targets sum to.",
    },
    {
      name: "minChapters",
      type: "number",
      description: "The fewest chapters this part's target admits — derived, and enforced after.",
    },
    {
      name: "maxChapters",
      type: "number",
      description: "The most chapters this part's target admits — derived, and enforced after.",
    },
    {
      name: "chapterMinWords",
      type: "number",
      description: "The shortest admissible chapter target, in words.",
    },
    {
      name: "chapterMaxWords",
      type: "number",
      description: "The longest admissible chapter target, in words.",
    },
    {
      name: "wordBudgetTolerancePercent",
      type: "number",
      description: "How far the batch's declared sum may stray from the part's target, percent.",
    },
    {
      name: "threads",
      type: "list",
      description:
        "The novel's threads, numbered from zero: label, promise, state at this part's opening, and the parts each is assigned to.",
    },
    {
      name: "partThreads",
      type: "list",
      description:
        "This part's own duties — which threads to open, carry or close here, by number and label.",
    },
    {
      name: "cast",
      type: "list",
      description:
        "The characters and their planned arcs, principals first — the only names a chapter may seat.",
    },
    {
      name: "places",
      type: "list",
      description: "The bible's places — the only places a chapter may be set in.",
    },
    {
      name: "canonFacts",
      type: "list",
      description: "The canon facts, numbered from zero — what a chapter may declare it concerns.",
    },
    {
      name: "precedingChapters",
      type: "list",
      description:
        "The already-planned chapters of earlier parts, numbered from zero: title, function, stake, consequence, digest.",
    },
    {
      name: "freedomConstraints",
      type: "list",
      description:
        "The freedom clauses for the outline stage, resolved from the project's level — they outrank everything else.",
    },
    {
      name: "maxPresentCharacters",
      type: "number",
      description: "The most characters one chapter seats.",
    },
    {
      name: "maxFactsPerChapter",
      type: "number",
      description: "The most canon facts one chapter cites.",
    },
    {
      name: "periodPrecisions",
      type: "list",
      description: "The admissible period precisions — identifier and French gloss, one per line.",
    },
    {
      name: "dramaticFunctionWordTarget",
      type: "number",
      description: "Words for what the chapter does to the novel.",
    },
    {
      name: "immediateGoalWordTarget",
      type: "number",
      description: "Words for what the focal character is after.",
    },
    {
      name: "obstacleWordTarget",
      type: "number",
      description: "Words for what stands in the way.",
    },
    {
      name: "decisionWordTarget",
      type: "number",
      description: "Words for what is decided under the obstacle.",
    },
    {
      name: "revelationWordTarget",
      type: "number",
      description: "Words for what the reader learns, when something is revealed.",
    },
    {
      name: "revelationPreparationWordTarget",
      type: "number",
      description: "Words for what plants a revelation.",
    },
    {
      name: "consequenceWordTarget",
      type: "number",
      description: "Words for what is different after the chapter.",
    },
    {
      name: "detailedSummaryWordTarget",
      type: "number",
      description: "Words for the chapter's detailed summary.",
    },
  ],
  system: [
    "Tu es architecte dramatique. On te confie une partie déjà cadrée d'un roman en préparation ; tu construis les plans de tous ses chapitres — le lot qui conduit la partie de son état initial à son état final.",
    "Tu écris en {{language}}. Les noms propres restent exactement tels que les listes les écrivent.",
    "La bible et le cadre de la partie font loi : un plan de chapitre décide ce qui arrive et ce que cela change, il n'invente aucun fait nouveau du monde et n'écrit pas la prose.",
    "Tu argumentes, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Planifie les chapitres de la partie « {{partTitle}} » — la partie {{partNumber}} sur {{partCount}} : entre {{minChapters}} et {{maxChapters}} chapitres, pour environ {{partTargetWordCount}} mots en tout.",
    "",
    "Le cadre de la partie, que les chapitres doivent servir :",
    "- Enjeu de la partie : {{partDramaticObjective}}",
    "- État initial : {{partInitialState}}",
    "- Basculement : {{partTippingPoint}}",
    "- État final : {{partFinalState}}",
    "",
    "Les fils narratifs du roman, numérotés à partir de zéro, avec leur état à l'ouverture de cette partie et les parties qui les portent :",
    "{{threads}}",
    "",
    "Ce que cette partie doit faire de ses fils :",
    "{{partThreads}}",
    "",
    "Les chapitres déjà planifiés des parties précédentes, numérotés à partir de zéro :",
    "{{precedingChapters}}",
    "",
    "Les personnages et leur arc prévu :",
    "{{cast}}",
    "",
    "Les lieux établis :",
    "{{places}}",
    "",
    "Les faits canoniques, numérotés à partir de zéro :",
    "{{canonFacts}}",
    "",
    "Les précisions de période admises :",
    "{{periodPrecisions}}",
    "",
    "Les contraintes du degré de liberté, qui priment sur tout le reste :",
    "{{freedomConstraints}}",
    "",
    "Un chapitre est une unité dramatique : un objectif immédiat, l'obstacle qui s'y oppose, la décision prise sous cet obstacle, la conséquence qui change l'état du roman.",
    "",
    "Ce que chaque chapitre doit tenir :",
    "- Une fonction dramatique et une conséquence, toujours : un chapitre qui laisse le roman où il l'a trouvé n'a pas de plan.",
    "- L'enjeu se transforme de chapitre en chapitre : jamais le même enjeu répété — ni entre les chapitres du lot, ni avec les chapitres précédents listés.",
    "- Toute révélation désigne le chapitre qui la plante, dans ce lot ou parmi les chapitres précédents : ce que rien ne prépare ne se révèle pas.",
    "- Les fils : n'agis que sur les fils confiés à cette partie ; un fil s'ouvre avant d'être poursuivi ou fermé ; un fil fermé ne se touche plus ; un fil se ferme exactement dans la dernière partie qui le porte — et si cette partie est la dernière du roman ({{partNumber}} sur {{partCount}}), chaque fil encore ouvert se ferme ici.",
    "- Le lot conduit de l'état initial à l'état final de la partie, en passant par son basculement.",
    "- Chaque longueur cible tient entre {{chapterMinWords}} et {{chapterMaxWords}} mots, et la somme du lot reste à {{wordBudgetTolerancePercent}} % près de la cible de la partie.",
    "- La période se pose sur l'axe des jours de la chronologie (le jour 0 en est l'origine) ; l'ordre de lecture est dramatique, un retour en arrière est permis.",
    "",
    "Ne produis pas :",
    "- un chapitre sans conséquence, ou purement décoratif ;",
    "- le même enjeu reformulé d'un chapitre à l'autre ;",
    "- une révélation que rien ne prépare ;",
    "- un fil ouvert et fermé dans le même chapitre ;",
    "- une action sur un fil fermé, ou sur un fil qui n'est pas confié à cette partie ;",
    "- un personnage, un lieu ou un fait que les listes ci-dessus n'offrent pas ;",
    "- un numéro de chapitre : l'ordre de la liste est l'ordre de lecture.",
    "",
    "Ta réponse est un unique objet JSON comportant une liste « chapters » : entre {{minChapters}} et {{maxChapters}} chapitres, dans l'ordre de lecture. Chaque chapitre est un objet :",
    "- « workingTitle » : le titre provisoire — unique dans le lot.",
    "- « targetWordCount » : la longueur cible, en mots.",
    "- « focalCharacterName » : le personnage focal — un nom de la liste des personnages, repris parmi les présents.",
    "- « presentCharacterNames » : les personnages présents — au plus {{maxPresentCharacters}}, uniquement des noms de la liste, orthographiés comme elle.",
    "- « placeName » : le lieu — un nom de la liste des lieux, ou null si aucun ne convient.",
    "- « period » : un objet — « startDay » et « endDay » : les jours où le chapitre commence et finit ; « precision » : l'un des identifiants de la liste des précisions ; « label » : la période en toutes lettres, telle que le lecteur la lira.",
    "- « dramaticFunction » (environ {{dramaticFunctionWordTarget}} mots) : ce que le chapitre fait au roman.",
    "- « immediateGoal » (environ {{immediateGoalWordTarget}} mots) : ce que le personnage focal cherche dans ce chapitre.",
    "- « obstacle » (environ {{obstacleWordTarget}} mots) : ce qui s'y oppose.",
    "- « decision » (environ {{decisionWordTarget}} mots) : ce qui est décidé sous cet obstacle.",
    "- « revelation » : null si rien n'est révélé, sinon un objet — « content » (environ {{revelationWordTarget}} mots) : ce que le lecteur apprend ; « preparation » (environ {{revelationPreparationWordTarget}} mots) : ce qui la plante ; « preparedByBatchChapterIndex » : le numéro d'un chapitre antérieur de ce lot, ou null ; « preparedByPrecedingChapterIndex » : le numéro d'un chapitre de la liste des chapitres précédents, ou null — exactement l'un des deux est renseigné.",
    "- « consequence » (environ {{consequenceWordTarget}} mots) : ce qui a changé quand le chapitre se ferme.",
    "- « detailedSummary » (environ {{detailedSummaryWordTarget}} mots) : le résumé détaillé du chapitre.",
    "- « opensThreadIndexes », « continuesThreadIndexes », « closesThreadIndexes » : les numéros des fils que le chapitre ouvre, poursuit et ferme, dans la liste des fils — jamais le même fil deux fois dans un même chapitre.",
    "- « factIndexes » : les numéros des faits canoniques concernés — au plus {{maxFactsPerChapter}}, jamais deux fois le même.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const BUILD_CHAPTER_OUTLINE_PROMPTS = [V1, V2] as const;
