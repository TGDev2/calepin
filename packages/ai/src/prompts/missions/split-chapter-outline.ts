/**
 * `split-chapter-outline` — one chapter plan cut in two, with an account of
 * where every attribute went (CAL-106).
 *
 * The design problem is not *write two chapters*: `build-chapter-outline`
 * already does that, better, with a whole part in view. It is **do not lose
 * anything on the way**. A model handed a chapter and asked for two will
 * produce two plausible chapters and silently drop the thread it could not
 * place, the secondary character it forgot and the fact nobody needed — and
 * each half will read perfectly well.
 *
 * Three ideas organise the instruction against that.
 *
 * 1. **The cut is named before the halves are.** `cutPoint` asks for the
 *    concrete moment the chapter breaks at and the argument for that moment
 *    rather than another. A split with no defensible seam is the one that ends
 *    up redistributing by convenience.
 * 2. **Every element is accounted for, one by one.** The `placements` list
 *    carries an entry per character, per fact, per thread action and per prose
 *    column, each with where it went and why. The prompt states the totality
 *    demand plainly and the checker enforces it, so *aucune information perdue*
 *    is arithmetic rather than goodwill.
 * 3. **The vocabulary is closed and numbered.** Characters, places, facts and
 *    threads arrive as lists the answer cites by name or by position; the
 *    chapter's own attributes arrive spelled exactly as it holds them, so a
 *    placement claiming a column was *kept* can be read back against the text
 *    the ask showed.
 *
 * Every bound and word target arrives as a variable from the domain's own
 * constants (the CAL-055 discipline), so the ask and the refusal cannot
 * disagree.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "split-chapter-outline",
  version: 1,
  scope: { kind: "mission", missionId: "split-chapter-outline" },
  variables: [
    {
      name: "language",
      type: "text",
      description: "The project's language — the language every field is written in.",
    },
    {
      name: "partTitle",
      type: "text",
      description: "The part the chapter belongs to.",
    },
    {
      name: "partDramaticObjective",
      type: "text",
      description: "What the part is for — the frame both halves still have to serve.",
    },
    {
      name: "chapterAttributes",
      type: "list",
      description:
        "The chapter as it stands, one attribute per line, spelled exactly as the plan holds it.",
    },
    {
      name: "precedingChapters",
      type: "list",
      description: "The chapter before this one, or nothing when it opens the part.",
    },
    {
      name: "followingChapters",
      type: "list",
      description: "The chapter after this one, or nothing when it closes the part.",
    },
    {
      name: "cast",
      type: "list",
      description:
        "The characters the chapter may name, numbered from zero, with their planned arc.",
    },
    {
      name: "places",
      type: "list",
      description: "The places the chapter may be set in, numbered from zero.",
    },
    {
      name: "canonFacts",
      type: "list",
      description: "The canon facts the chapter concerns, numbered from zero.",
    },
    {
      name: "threads",
      type: "list",
      description:
        "The narrative threads the chapter acts on, numbered from zero, with what it does to each.",
    },
    {
      name: "periodPrecisions",
      type: "list",
      description: "The admissible period precisions, identifier and gloss.",
    },
    {
      name: "freedomConstraints",
      type: "list",
      description:
        "The freedom clauses for the outline stage, resolved from the project's level — they outrank everything else.",
    },
    {
      name: "sourceTargetWordCount",
      type: "number",
      description: "The chapter's own target length — the two halves sum back to it.",
    },
    {
      name: "chapterMinWords",
      type: "number",
      description: "The fewest words one chapter may aim at.",
    },
    {
      name: "chapterMaxWords",
      type: "number",
      description: "The most words one chapter may aim at.",
    },
    {
      name: "wordBudgetTolerancePercent",
      type: "number",
      description: "How far the two declared targets may stray from the chapter's own, percent.",
    },
    {
      name: "maxPresentCharacters",
      type: "number",
      description: "The most present characters one half may carry.",
    },
    {
      name: "maxFactsPerChapter",
      type: "number",
      description: "The most canon facts one half may concern.",
    },
    {
      name: "cutMomentWordTarget",
      type: "number",
      description: "Words for the moment the chapter is cut at.",
    },
    {
      name: "cutRationaleWordTarget",
      type: "number",
      description: "Words for the argument that the cut belongs there.",
    },
    {
      name: "placementReasonWordTarget",
      type: "number",
      description: "Words for one element's placement reason.",
    },
    {
      name: "dramaticFunctionWordTarget",
      type: "number",
      description: "Words for a half's dramatic function.",
    },
    {
      name: "immediateGoalWordTarget",
      type: "number",
      description: "Words for a half's immediate objective.",
    },
    {
      name: "obstacleWordTarget",
      type: "number",
      description: "Words for a half's obstacle.",
    },
    {
      name: "decisionWordTarget",
      type: "number",
      description: "Words for a half's decision.",
    },
    {
      name: "revelationWordTarget",
      type: "number",
      description: "Words for a half's revelation.",
    },
    {
      name: "revelationPreparationWordTarget",
      type: "number",
      description: "Words for what plants a half's revelation.",
    },
    {
      name: "consequenceWordTarget",
      type: "number",
      description: "Words for a half's consequence.",
    },
    {
      name: "detailedSummaryWordTarget",
      type: "number",
      description: "Words for a half's detailed summary.",
    },
    {
      name: "proseColumns",
      type: "list",
      description:
        "The prose attributes a placement must account for, by their field names in the answer.",
    },
  ],
  system: [
    "Tu es architecte dramatique. On te confie le plan d'un chapitre déjà écrit dans le plan d'un roman, et tu le coupes en deux chapitres.",
    "Tu écris en {{language}}. Les noms propres restent exactement tels que les listes les écrivent.",
    "Ta règle absolue : rien de ce que le chapitre portait ne disparaît. Chaque personnage, chaque fait, chaque action sur un fil et chaque attribut de texte se retrouve dans au moins une des deux moitiés, et tu dis pour chacun où il est allé et pourquoi.",
    "Tu ne redistribues que ce qui est là : tu n'ajoutes ni personnage, ni lieu, ni fait, ni fil que le chapitre ne portait pas déjà.",
    "Tu argumentes, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Coupe ce chapitre de la partie « {{partTitle}} » en deux chapitres consécutifs. La partie vise : {{partDramaticObjective}}",
    "",
    "Le chapitre tel qu'il est planifié aujourd'hui :",
    "{{chapterAttributes}}",
    "",
    "Le chapitre qui le précède :",
    "{{precedingChapters}}",
    "",
    "Le chapitre qui le suit :",
    "{{followingChapters}}",
    "",
    "Les personnages, numérotés à partir de zéro :",
    "{{cast}}",
    "",
    "Les lieux :",
    "{{places}}",
    "",
    "Les faits canoniques, numérotés à partir de zéro :",
    "{{canonFacts}}",
    "",
    "Les fils narratifs, numérotés à partir de zéro, avec ce que le chapitre en fait :",
    "{{threads}}",
    "",
    "Les précisions de période admises :",
    "{{periodPrecisions}}",
    "",
    "Les contraintes du degré de liberté, qui priment sur tout le reste :",
    "{{freedomConstraints}}",
    "",
    "Commence par la coupure : à quel moment précis le chapitre se casse en deux, et pourquoi là plutôt qu'ailleurs. Une scission qui n'a pas de couture défendable finit par répartir au hasard.",
    "",
    "Ce que les deux moitiés doivent tenir :",
    "- Chacune est un chapitre entier : un objectif immédiat, l'obstacle qui s'y oppose, la décision prise sous cet obstacle, la conséquence qui change l'état du roman.",
    "- Les deux enjeux diffèrent : deux moitiés qui poursuivent le même objectif ne sont pas deux chapitres, c'est un chapitre coupé en deux au milieu d'une phrase.",
    "- Les deux périodes découpent celle du chapitre : la première commence quand il commençait, la seconde finit quand il finissait, et elles ne se chevauchent pas.",
    "- Chaque longueur cible tient entre {{chapterMinWords}} et {{chapterMaxWords}} mots, et les deux additionnées restent à {{wordBudgetTolerancePercent}} % près de {{sourceTargetWordCount}} mots.",
    "- Un fil qui s'ouvrait dans le chapitre s'ouvre dans une seule des deux moitiés ; de même pour un fil qui s'y fermait. Si le chapitre ouvrait et fermait le même fil, il s'ouvre dans la première moitié et se ferme dans la seconde, jamais l'inverse. Un fil seulement poursuivi peut l'être par les deux.",
    "",
    "Puis rends compte, élément par élément, de la redistribution : un poste pour chaque personnage présent, pour chaque fait concerné, pour chaque action sur un fil, et pour chacun de ces attributs de texte que le chapitre renseigne :",
    "{{proseColumns}}",
    "",
    "Chaque poste dit où l'élément est allé et pourquoi, en environ {{placementReasonWordTarget}} mots :",
    "- « first » : la première moitié le porte, la seconde non.",
    "- « second » : l'inverse.",
    "- « both » : les deux le portent — pour un texte, cela veut dire le même texte des deux côtés.",
    "- « divided » : réservé aux attributs de texte — chaque moitié en garde un passage différent, mot pour mot celui du chapitre.",
    "- « rewritten » : réservé aux attributs de texte — les moitiés sont écrites à neuf, sans reprendre les mots du chapitre.",
    "",
    "« first », « second », « both » et « divided » affirment que les mots du chapitre sont conservés : ils seront relus contre le texte ci-dessus. N'annonce une conservation que si elle est vraie ; « rewritten » ne coûte rien à annoncer.",
    "",
    "Ne produis pas :",
    "- une moitié sans conséquence, ou purement décorative ;",
    "- le même enjeu des deux côtés de la coupure ;",
    "- un personnage, un lieu, un fait ou un fil que les listes ci-dessus n'offrent pas ;",
    "- un élément du chapitre qu'aucun poste ne mentionne, ou que ni l'une ni l'autre moitié ne porte ;",
    "- un fil ouvert et fermé dans la même moitié ;",
    "- un numéro de chapitre : l'ordre est la première moitié puis la seconde.",
    "",
    "Ta réponse est un unique objet JSON :",
    "- « cutPoint » : un objet — « moment » (environ {{cutMomentWordTarget}} mots) : le moment précis de la coupure ; « rationale » (environ {{cutRationaleWordTarget}} mots) : pourquoi là.",
    "- « first » et « second » : les deux chapitres, dans l'ordre de lecture. Chacun est un objet :",
    "  - « workingTitle » : le titre provisoire.",
    "  - « targetWordCount » : la longueur cible, en mots.",
    "  - « focalCharacterName » : le personnage focal — un nom de la liste, repris parmi les présents.",
    "  - « presentCharacterNames » : les personnages présents — au plus {{maxPresentCharacters}}, uniquement des noms de la liste, orthographiés comme elle.",
    "  - « placeName » : le lieu — un nom de la liste, ou null si aucun ne convient.",
    "  - « period » : un objet — « startDay » et « endDay » : les jours où la moitié commence et finit ; « precision » : l'un des identifiants de la liste des précisions ; « label » : la période en toutes lettres.",
    "  - « dramaticFunction » (environ {{dramaticFunctionWordTarget}} mots) : ce que la moitié fait au roman.",
    "  - « immediateGoal » (environ {{immediateGoalWordTarget}} mots) : ce que le personnage focal y cherche.",
    "  - « obstacle » (environ {{obstacleWordTarget}} mots) : ce qui s'y oppose.",
    "  - « decision » (environ {{decisionWordTarget}} mots) : ce qui est décidé sous cet obstacle.",
    "  - « revelation » : null si rien n'est révélé, sinon un objet — « content » (environ {{revelationWordTarget}} mots) ; « preparation » (environ {{revelationPreparationWordTarget}} mots) ; « preparedByBatchChapterIndex » : 0 quand la première moitié la prépare, sinon null ; « preparedByPrecedingChapterIndex » : le numéro d'un chapitre de la liste des chapitres précédents, sinon null — exactement l'un des deux est renseigné.",
    "  - « consequence » (environ {{consequenceWordTarget}} mots) : ce qui a changé quand la moitié se ferme.",
    "  - « detailedSummary » (environ {{detailedSummaryWordTarget}} mots) : le résumé détaillé.",
    "  - « opensThreadIndexes », « continuesThreadIndexes », « closesThreadIndexes » : les numéros des fils que la moitié ouvre, poursuit et ferme — jamais le même fil deux fois dans une même moitié.",
    "  - « factIndexes » : les numéros des faits concernés — au plus {{maxFactsPerChapter}}.",
    "- « placements » : la liste des postes. Chaque poste est un objet — « kind » : « character », « fact », « thread-action » ou « prose » ; « index » : le numéro dans la liste correspondante, null pour « prose » ; « list » : « opens », « continues » ou « closes » pour « thread-action », null sinon ; « column » : le nom de l'attribut de texte pour « prose », null sinon ; « placement » : l'une des cinq valeurs ci-dessus ; « reason » : pourquoi.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const SPLIT_CHAPTER_OUTLINE_PROMPTS = [V1] as const;
