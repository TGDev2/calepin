/**
 * `combine-directions` — elements of several directions fused into one, or
 * the argued answer that they cannot be (CAL-084).
 *
 * `propose-directions` answers with three directions argued against each
 * other; `replace-direction` with one argued against three excluded engines.
 * This one answers with one direction **or with a refusal** — the selected
 * elements exclude each other, named pair by pair — which is a different
 * answer *kind*, not just a different count: no proposing prompt has a hole
 * for « je ne peux pas », and grafting one on would teach both missions to
 * hedge. §5.4's case, a third time in this stage.
 *
 * The exclusion **contract** is the domain's, reused verbatim as CAL-083
 * reused it: `engineAxes` quotes the glossed vocabulary
 * (`describeNarrativeEngineAxes`), `minEngineDifferences` the gate's own
 * number (`NARRATIVE_ENGINE_DIVERGENCE_MINIMUM`), `slotKeys` and
 * `selectedElements` the combination vocabulary (`DIRECTION_COMBINATION_SLOTS`
 * and its labels, `DIRECTION_ELEMENT_LABELS`) — one declaration, quoted where
 * a model can read it and enforced where a caller can act on it
 * (`checkDirectionCombinationSelection` and `checkDirectionCombinationAnswer`
 * in `@calepin/direction`).
 *
 * Its organising ideas:
 *
 * - **One dominant engine, and the blend is the named failure.** The fusion
 *   serves the engine of one source direction; an engine within one axis of
 *   two sources at once is the *compromis mou* — mechanically detectable, and
 *   said out loud so the model aims away from it instead of being caught by
 *   it. When the author selected a `narrativeEngine`, the choice is already
 *   made and the prompt says so.
 * - **Every selected element is accounted for.** Kept — as it stands or
 *   subordinated to the dominant engine — or named in a conflict that says
 *   why it cannot be. An element dropped in silence is the incoherent fusion
 *   the acceptance criterion refuses.
 * - **Irreducibility is a service, not a failure — and it is verifiable.** A
 *   conflict names only selected elements, by slot key and element key; the
 *   mechanical re-read refuses an invented one. The counterweight is stated
 *   too: a demanding fusion is not an impossible one, and a lazy refusal is
 *   as useless as a mushy merge.
 * - **The constraints outrank the selection.** The freedom clauses bind the
 *   fusion exactly as they bind a proposal; a selection cannot buy a
 *   departure the level refuses.
 * - **One number, one place** (CAL-055): every count, word target and list
 *   bound arrives as a variable owned by `@calepin/direction`.
 *
 * `engineSelections` is declared a `list` rather than a `text`: every
 * variable of a `PromptDefinition` is required, and a
 * genuinely-sometimes-absent one is a list that renders as a dash — CAL-077's
 * device, whose empty case the instruction reads out loud so an absent
 * selection is an open choice rather than a silence the model fills.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "combine-directions",
  version: 1,
  scope: { kind: "mission", missionId: "combine-directions" },
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
      name: "slotKeys",
      type: "list",
      description:
        "One line per source direction in the ask — its slot key and its French label (DIRECTION_COMBINATION_SLOTS, DIRECTION_COMBINATION_SLOT_LABELS), in slot order. How the answer names a direction.",
    },
    {
      name: "sourceDirections",
      type: "list",
      description:
        "The two or three source directions rendered whole, each headed by its slot label, in slot order — an element cannot be judged coherent out of its direction's context.",
    },
    {
      name: "selectedElements",
      type: "list",
      description:
        "The ask itself: one line per selected element — its slot label, its element key and French label (DIRECTION_ELEMENT_LABELS), and the element's content quoted from the source direction.",
    },
    {
      name: "engineSelections",
      type: "list",
      description:
        "The engine clauses of the slots whose narrativeEngine the author selected, each prefixed by its slot label (describeNarrativeEngine) — or empty when the author imposed none, a list because the registry has no optional variable.",
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
    {
      name: "whyIrreducibleWordTarget",
      type: "number",
      description: "Words one conflict's argued case should come to.",
    },
    {
      name: "maxConflicts",
      type: "number",
      description: "Conflicts an irreducible answer stays under — the domain's ceiling.",
    },
    {
      name: "minConflictElements",
      type: "number",
      description: "Elements one conflict must at least name — exclusion is mutual.",
    },
    {
      name: "maxConflictElements",
      type: "number",
      description: "Elements one conflict stays under — the domain's ceiling.",
    },
  ],
  system: [
    "Tu es directeur littéraire. Un auteur a lu deux ou trois directions romanesques proposées pour son texte et a sélectionné, dans chacune, les éléments qu'il veut réunir en une seule direction.",
    "Tu écris en {{language}}. Les noms propres et les termes du texte source restent tels que le texte les écrit.",
    "Ta réponse est l'une de deux choses, jamais les deux : une direction fusionnée complète, dramatiquement cohérente, défendable devant l'auteur à partir de ce que son texte contient réellement — ou la déclaration argumentée que la combinaison demandée est irréductible, en nommant les éléments qui s'excluent.",
    "Une direction est définie par son moteur narratif — la nature du conflit, la source de la tension, ce que le protagoniste risque, ce qui provoque le basculement, la nature de la résolution. Deux directions qui partagent ce moteur ne sont qu'une seule direction, quel que soit le décor.",
    "Une fusion sert un seul moteur dominant, celui d'une des directions sources, et lui subordonne tout ce qu'elle reprend des autres. Le mélange qui emprunte un axe à un moteur et un axe à un autre n'est pas une fusion : c'est le compromis mou, et il est refusé.",
    "Déclarer la combinaison irréductible, quand elle l'est, est un service rendu à l'auteur — jamais un échec. Une irréductibilité invoquée par paresse est aussi inutile qu'une fusion molle.",
    "Quelle que soit la liberté accordée, la promesse émotionnelle et thématique du texte source n'est jamais trahie : l'auteur doit reconnaître dans la fusion ce qui l'a fait écrire son texte.",
    "Tu apprécies, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Combine les éléments sélectionnés ci-dessous en une seule direction romanesque pour un roman d'environ {{targetWordCount}} mots — ou établis que la combinaison est irréductible.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "Contraintes de fidélité au texte source — elles s'imposent à la direction fusionnée et priment sur la sélection elle-même :",
    "{{freedomConstraints}}",
    "",
    "Ta réponse désigne chaque direction source par sa position :",
    "{{slotKeys}}",
    "",
    "Les directions sources, dans l'ordre de ces positions :",
    "{{sourceDirections}}",
    "",
    "Les éléments sélectionnés — la demande elle-même :",
    "{{selectedElements}}",
    "",
    "Chaque élément sélectionné est pris en compte : repris dans la fusion — tel quel, ou subordonné au moteur dominant — ou nommé dans un conflit qui dit pourquoi il ne peut pas l'être. Un élément écarté en silence est une fusion incohérente.",
    "",
    "Le moteur que l'auteur impose :",
    "{{engineSelections}}",
    "",
    "Si cette liste nomme un moteur, il domine la fusion — ce choix est fait, ne le rediscute pas. Si elle est vide, l'auteur n'impose rien : choisis le moteur dominant parmi ceux des directions sources, et un seul.",
    "",
    "Les cinq axes qui définissent un moteur :",
    "{{engineAxes}}",
    "Ta réponse est relue mécaniquement : le moteur déclaré de la fusion coïncide avec exactement un moteur source — au plus un axe d'écart sur les cinq — et diffère de chacun des autres sur au moins {{minEngineDifferences}} axes. Un moteur à un axe de deux moteurs sources à la fois est le compromis mou : il est refusé, puis redemandé. Un moteur qui ne coïncide avec aucun moteur source est une direction que personne n'a demandée : il est refusé de même. Les contraintes priment toujours : quand elles verrouillent le conflit, le protagoniste ou la fin du texte, les axes correspondants coïncident légitimement entre les moteurs sources, et la dominance se joue alors sur la source de la tension et sur le basculement — jamais contre les contraintes.",
    "",
    "Si les éléments sélectionnés ne peuvent pas tenir ensemble sous un seul moteur dominant — deux fins qui s'excluent, un conflit qui exige ce qu'une trajectoire interdit — réponds « irreducible » et nomme chaque incompatibilité dans « conflicts » :",
    "- « elements » — de {{minConflictElements}} à {{maxConflictElements}} éléments qui s'excluent, chacun désigné par sa position (« direction ») et sa clé (« element »), choisis uniquement parmi les éléments sélectionnés ci-dessus. Un conflit citant un élément que l'auteur n'a pas sélectionné est refusé.",
    "- « whyIrreducible » (environ {{whyIrreducibleWordTarget}} mots) : pourquoi ces éléments précis ne peuvent pas coexister dans un même roman — l'argument, jamais une note.",
    "Au plus {{maxConflicts}} conflits. N'invoque l'irréductibilité que quand elle est réelle : une fusion exigeante n'est pas une fusion impossible.",
    "",
    "Ta réponse est un unique objet JSON à trois champs, dans cet ordre : « outcome », « direction », « conflicts ».",
    "- « outcome » : « merged » ou « irreducible ».",
    "- Si « merged » : « direction » porte la direction fusionnée complète et « conflicts » vaut null — écrit, jamais omis.",
    "- Si « irreducible » : « conflicts » porte les incompatibilités et « direction » vaut null — écrit, jamais omis.",
    "",
    "La direction fusionnée comporte :",
    "- « workingTitle » : un titre de travail court et singulier — jamais générique, jamais la juxtaposition des titres sources.",
    "- « developedPremise » (environ {{premiseWordTarget}} mots) : la prémisse développée — la situation, le mouvement du récit sur toute sa longueur, ce que cette fusion ferait éprouver que ni l'une ni l'autre des directions sources ne promettait seule.",
    "- « dominantGenre » : le genre dominant, nommé court.",
    "- « mainConflict » (environ {{conflictWordTarget}} mots) : le conflit principal — qui veut quoi, ce qui s'y oppose, pourquoi il ne peut pas se résoudre vite.",
    "- « protagonistArc » (environ {{arcWordTarget}} mots) : la trajectoire du protagoniste, de son état au début à ce que la fin fait de lui.",
    "- « newStakes » — au moins {{minNewStakes}} entrées : les enjeux que le roman ajoute à ceux du texte court, par ordre d'importance.",
    "- « charactersToIntroduce » : les personnages à introduire, chacun nommé avec sa fonction dans le récit. Liste vide si la distribution du texte suffit : n'introduis jamais un personnage pour remplir la liste.",
    "- « endingNature » (environ {{endingWordTarget}} mots) : la nature de la fin — son type, ce qu'elle résout, ce qu'elle coûte — jamais son déroulé.",
    "- « mainRisks » — au moins {{minMainRisks}} entrées : les principaux risques de cette fusion, nommés contre elle, honnêtement — ce qui peut la faire échouer en écriture, ce que la réunion d'éléments d'origines différentes a de plus fragile.",
    "- « elementsKeptFromSource » — au moins {{minElementsKept}} entrées : les éléments du texte source conservés. Chacun existe réellement dans le texte ou dans l'analyse ; n'attribue jamais au texte ce qu'il ne contient pas. Partout dans ta réponse, une citation entre guillemets est copiée caractère pour caractère depuis le texte source ou depuis une citation de l'analyse — jamais recomposée de mémoire ; dans le doute, nomme l'élément sans le citer.",
    "- « elementsTransformed » — au moins {{minElementsTransformed}} entrées : les éléments du texte transformés, chacun disant de quoi il part et ce qu'il devient.",
    "- « novelPotentialAssessment » (environ {{assessmentWordTarget}} mots) : l'évaluation argumentée du potentiel romanesque de cette fusion — ce qu'elle peut soutenir sur la longueur visée, par quoi elle tient, où elle demandera le plus de travail — appuyée sur des éléments précis du texte ou de l'analyse.",
    "- « dimensionTreatments » : pour chacune des dix dimensions ci-dessous, ce que la fusion fait réellement de ce que le texte source établit — « preserve » (conservé tel quel), « extend » (développé sans être contredit) ou « reinterpret » (réinterprété). La déclaration décrit la fusion telle qu'elle est : elle ne dépasse jamais le traitement autorisé par les contraintes, et minimiser un écart réel est une faute plus grave que le déclarer.",
    "{{dimensionKeys}}",
    "- « narrativeEngine » : le moteur déclaré — pour chacun des cinq axes listés plus haut, le membre choisi. La déclaration décrit la fusion telle qu'elle est ; elle est comparée mécaniquement aux moteurs sources, et minimiser une ressemblance réelle est une faute plus grave que la déclarer.",
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

export const COMBINE_DIRECTIONS_PROMPTS = [V1] as const;
