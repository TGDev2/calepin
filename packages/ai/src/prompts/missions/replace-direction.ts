/**
 * `replace-direction` — one proposal written off, one written in its place
 * (CAL-083).
 *
 * `propose-directions` argues three directions against **each other** and
 * answers with exactly three. This one answers with **one**, and argues it
 * against three engines it may not reproduce: the discarded direction's and
 * the two kept ones'. Different count, different constraint, different reader
 * — the author has already read three proposals and rejected one of them, and
 * may have said why. §5.4's case, `regenerate-analysis-section` against
 * `analyze-source-text` one epic later.
 *
 * What CAL-080 predicted held where it mattered: the exclusion **contract** is
 * reused verbatim, not restated. `excludedEngines` carries the domain's own
 * clauses (`describeNarrativeEngine`), `engineAxes` its glossed vocabulary
 * (`describeNarrativeEngineAxes`) and `minEngineDifferences` the gate's own
 * number (`NARRATIVE_ENGINE_DIVERGENCE_MINIMUM`) — one declaration, quoted
 * where a model can read it and enforced where a caller can act on it
 * (`checkDirectionReplacement` in `@calepin/direction`).
 *
 * Its organising ideas:
 *
 * - **The engine is the exclusion, and the author's reason is not.** The three
 *   excluded engines are checked mechanically after the answer; the reason is
 *   read, and cannot be. So they are stated at different strengths: the
 *   engines as a hard refusal the answer is measured against, the reason as
 *   the angle the replacement is asked to take.
 * - **The reason governs the angle and never the source text.** The clause
 *   `regenerate-analysis-section` establishes, for the same hazard: *ce
 *   protagoniste ne m'intéresse pas* is a legitimate ground for another
 *   direction and is not a licence to manufacture what the text does not
 *   carry. Without it, an optional free-text field is an invitation to invent.
 * - **A replacement is not a variation on what was rejected.** The discarded
 *   direction is quoted so the answer can differ from it deliberately rather
 *   than by accident — the failure mode of every "try again" prompt is
 *   returning the same thing reworded, and here that failure has a name and a
 *   check.
 * - **Not a compromise between the two that were kept, either.** The second
 *   failure mode is the safe middle: a replacement built to sit between the
 *   two survivors reproduces neither engine and interests nobody. Said out
 *   loud, because the exclusion check cannot see it.
 * - **One number, one place** (CAL-055): every count, word target and list
 *   bound arrives as a variable owned by `@calepin/direction`; the target
 *   length is the project's own.
 *
 * `discardReason` is declared a `list` rather than a `text`: every variable of
 * a `PromptDefinition` is required, and a genuinely-sometimes-absent one is a
 * list that renders as a dash — CAL-077's device, whose empty case the
 * instruction reads out loud so an absent reason is an open ask rather than a
 * silence the model fills.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "replace-direction",
  version: 1,
  scope: { kind: "mission", missionId: "replace-direction" },
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
      name: "engineAxes",
      type: "list",
      description:
        "One line per engine axis — its declaration key, its French label and its glossed members, composed from the domain's own copy (describeNarrativeEngineAxes), in axis order.",
    },
    {
      name: "minEngineDifferences",
      type: "number",
      description:
        "Axes on which two distinct engines differ at least — the domain's own gate (NARRATIVE_ENGINE_DIVERGENCE_MINIMUM).",
    },
    {
      name: "excludedEngines",
      type: "list",
      description:
        "The engines the replacement may not reproduce, one clause per engine (describeNarrativeEngine): the discarded direction's first, then the two kept ones'. Never empty on this mission.",
    },
    {
      name: "discardedDirection",
      type: "text",
      description: "The direction the author wrote off, as it was proposed to them.",
    },
    {
      name: "discardReason",
      type: "list",
      description:
        "The author's reason for writing it off, or empty when they gave none — a list because the registry has no optional variable.",
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
      description: "New stakes the direction must at least name — the domain's floor.",
    },
    {
      name: "minMainRisks",
      type: "number",
      description: "Risks the direction must at least name against itself — the domain's floor.",
    },
    {
      name: "minElementsKept",
      type: "number",
      description: "Kept source elements the direction must at least name — the domain's floor.",
    },
    {
      name: "minElementsTransformed",
      type: "number",
      description: "Transformed elements the direction must at least name — the domain's floor.",
    },
    {
      name: "maxPerList",
      type: "number",
      description: "Entries one list stays under — the domain's ceiling, never a quota.",
    },
  ],
  system: [
    "Tu es directeur littéraire. Un auteur a lu trois directions romanesques proposées pour son texte, en a écarté une, et t'en demande une autre à la place.",
    "Tu écris en {{language}}. Les noms propres et les termes du texte source restent tels que le texte les écrit.",
    "Tu proposes une seule direction, complète : elle engage un roman entier, défendable devant l'auteur à partir de ce que son texte contient réellement.",
    "Une direction est définie par son moteur narratif — la nature du conflit, la source de la tension, ce que le protagoniste risque, ce qui provoque le basculement, la nature de la résolution. Deux directions qui partagent ce moteur ne sont qu'une seule direction, quel que soit le décor.",
    "Ta valeur est de proposer ce que l'auteur n'aurait pas nécessairement trouvé seul. Écarte la première idée venue et le prolongement le plus attendu du genre : une direction surprenante se défend par des éléments précis du texte, une direction convenue ne se défend pas.",
    "Quelle que soit la liberté accordée, la promesse émotionnelle et thématique du texte source n'est jamais trahie : l'auteur doit reconnaître dans cette direction ce qui l'a fait écrire son texte.",
    "Tu apprécies, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Propose une direction romanesque de remplacement pour un roman d'environ {{targetWordCount}} mots.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "Contraintes de fidélité au texte source — elles s'imposent à la direction proposée :",
    "{{freedomConstraints}}",
    "",
    "La direction écartée par l'auteur :",
    "{{discardedDirection}}",
    "",
    "Ce que l'auteur en dit :",
    "{{discardReason}}",
    "",
    "Comment lire ce refus :",
    "- Ce que dit l'auteur commande l'angle de la direction que tu proposes : c'est lui qui a lu son texte et les trois propositions, et ce qu'il refuse passe avant ce que tu aurais spontanément reproposé.",
    "- Cela ne commande pas le texte source. Si ce qu'il demande ne s'y trouve pas, ne l'invente pas : propose la direction la plus juste que le texte permet, et dis dans « mainRisks » ce que cette direction ne pourra pas tenir. Un refus sans commentaire — la liste ci-dessus vide — se lit comme une demande ouverte : propose autre chose, au fond.",
    "- La direction écartée t'est montrée pour que tu t'en éloignes délibérément, jamais pour que tu la reformules. Une direction écartée reformulée est la même direction.",
    "",
    "Moteurs narratifs exclus — la direction proposée diffère de chacun d'eux sur au moins {{minEngineDifferences}} des cinq axes :",
    "{{excludedEngines}}",
    "",
    "Le premier de ces moteurs est celui de la direction écartée ; les autres sont ceux des directions que l'auteur a conservées et qui restent devant lui. Un changement de lieu, d'époque ou de milieu ne distingue rien : ce sont les cinq axes ci-dessous, et eux seuls, qui décident.",
    "{{engineAxes}}",
    "Ta réponse est relue mécaniquement contre ces moteurs exclus : une direction qui en reproduit un est refusée, puis redemandée. Ne cherche pas non plus le compromis prudent entre les directions conservées — un moteur situé entre deux autres n'en reproduit aucun et n'intéresse personne. Les contraintes priment toujours : quand elles verrouillent le conflit, le protagoniste ou la fin du texte, les axes correspondants peuvent légitimement coïncider avec ceux d'un moteur exclu, et l'écart se joue alors sur la source de la tension et sur le basculement — jamais contre les contraintes.",
    "",
    "La direction comporte :",
    "- « workingTitle » : un titre de travail court et singulier — jamais générique.",
    "- « developedPremise » (environ {{premiseWordTarget}} mots) : la prémisse développée — la situation, le mouvement du récit sur toute sa longueur, ce que ce roman ferait éprouver que le texte court ne fait que promettre.",
    "- « dominantGenre » : le genre dominant, nommé court.",
    "- « mainConflict » (environ {{conflictWordTarget}} mots) : le conflit principal — qui veut quoi, ce qui s'y oppose, pourquoi il ne peut pas se résoudre vite.",
    "- « protagonistArc » (environ {{arcWordTarget}} mots) : la trajectoire du protagoniste, de son état au début à ce que la fin fait de lui — ce qu'il traverse, ce qu'il y perd ou y gagne.",
    "- « newStakes » — au moins {{minNewStakes}} entrées : les enjeux que le roman ajoute à ceux du texte court, par ordre d'importance.",
    "- « charactersToIntroduce » : les personnages à introduire, chacun nommé avec sa fonction dans le récit. Liste vide si la distribution du texte suffit : n'introduis jamais un personnage pour remplir la liste.",
    "- « endingNature » (environ {{endingWordTarget}} mots) : la nature de la fin — son type, ce qu'elle résout, ce qu'elle coûte — jamais son déroulé.",
    "- « mainRisks » — au moins {{minMainRisks}} entrées : les principaux risques de cette direction, nommés contre elle, honnêtement — ce qui peut la faire échouer en écriture, ce qu'elle a de plus fragile ou de plus attendu.",
    "- « elementsKeptFromSource » — au moins {{minElementsKept}} entrées : les éléments du texte source conservés. Chacun existe réellement dans le texte ou dans l'analyse ; n'attribue jamais au texte ce qu'il ne contient pas. Partout dans ta réponse, une citation entre guillemets est copiée caractère pour caractère depuis le texte source ou depuis une citation de l'analyse — jamais recomposée de mémoire ; dans le doute, nomme l'élément sans le citer.",
    "- « elementsTransformed » — au moins {{minElementsTransformed}} entrées : les éléments du texte transformés, chacun disant de quoi il part et ce qu'il devient.",
    "- « novelPotentialAssessment » (environ {{assessmentWordTarget}} mots) : l'évaluation argumentée du potentiel romanesque de cette direction — ce qu'elle peut soutenir sur la longueur visée, par quoi elle tient, où elle demandera le plus de travail — appuyée sur des éléments précis du texte ou de l'analyse.",
    "- « dimensionTreatments » : pour chacune des dix dimensions ci-dessous, ce que la direction fait réellement de ce que le texte source établit — « preserve » (conservé tel quel), « extend » (développé sans être contredit) ou « reinterpret » (réinterprété). La déclaration décrit la direction telle qu'elle est : elle ne dépasse jamais le traitement autorisé par les contraintes, et minimiser un écart réel est une faute plus grave que le déclarer.",
    "{{dimensionKeys}}",
    "- « narrativeEngine » : le moteur déclaré — pour chacun des cinq axes listés plus haut, le membre choisi. La déclaration décrit la direction telle qu'elle est ; elle est comparée mécaniquement aux moteurs exclus, et minimiser une ressemblance réelle est une faute plus grave que la déclarer.",
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
    "Réponds uniquement par l'objet JSON demandé — une seule direction, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const REPLACE_DIRECTION_PROMPTS = [V1] as const;
