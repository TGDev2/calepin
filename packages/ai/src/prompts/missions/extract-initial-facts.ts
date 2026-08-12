/**
 * `extract-initial-facts` — the validated bible and the source text in, the
 * canon out (CAL-094).
 *
 * Extraction, never invention, and the prompt has one thing to obtain that no
 * checker can supply: **one assertion per fact**. `@calepin/bible` can refuse a
 * composite statement afterwards, and it does; what it cannot do is write the
 * elementary facts the composite should have been broken into. So the
 * instruction spends its length on the decomposition and on the three lists that
 * carry the temporal scope out of the prose, and leaves what a fact *means* to
 * the domain — the boundary §5.5 draws.
 *
 * Everything closed travels as a variable rather than as prose: the corpus, the
 * cast, the places, the chronology, the belief states, the constructions a
 * statement may not carry. The domain owns those lists, and a prompt that
 * retyped them would be the second copy able to drift (CAL-055's discipline).
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "extract-initial-facts",
  version: 1,
  scope: { kind: "mission", missionId: "extract-initial-facts" },
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
        "One entry per passage a fact may be drawn from — its key, its French label and the passage itself: the source text, then the identity, the character sheets, the relationships, the world and the chronology. A citation vocabulary, not context: every fact names one of these keys and quotes it.",
    },
    {
      name: "cast",
      type: "list",
      description:
        "One entry per established character: the exact name the answer must use, and one line of who they are.",
    },
    {
      name: "places",
      type: "list",
      description: "One entry per established place: the exact name, and what it is.",
    },
    {
      name: "events",
      type: "list",
      description:
        "One entry per event of the chronology: its exact name, what happens, its day on the axis and the author-facing wording of that date.",
    },
    {
      name: "knownFacts",
      type: "list",
      description:
        "The facts the bible already holds — confirmed or refused by the author — so none is proposed again.",
    },
    {
      name: "beliefStates",
      type: "list",
      description:
        "The stances a character may hold on a statement, each with its French gloss. There is no 'knows': knowing is a belief that agrees with the world.",
    },
    {
      name: "compositionMarkers",
      type: "list",
      description:
        "The constructions a statement may not carry, one line per family with its French explanation and its own words. A statement carrying one of them is dropped.",
    },
    {
      name: "datePrecisions",
      type: "list",
      description:
        "The precision members a bound may use, each with its French gloss — how finely a date is known.",
    },
    {
      name: "daysPerYear",
      type: "number",
      description:
        "The days the day axis counts to a year. The one place the conversion is stated, so the prompt and the chronology cannot disagree about it.",
    },
    {
      name: "statementWordTarget",
      type: "number",
      description: "Words one fact's statement should stay under.",
    },
    {
      name: "quotationWordTarget",
      type: "number",
      description: "Words one quotation should stay under.",
    },
    {
      name: "boundLabelWordTarget",
      type: "number",
      description: "Words the author-facing wording of a bound should come to.",
    },
    {
      name: "minFacts",
      type: "number",
      description: "Facts the canon must at least hold, across the three lists together.",
    },
    {
      name: "maxFacts",
      type: "number",
      description: "Facts the canon stays under, across the three lists together — never a quota.",
    },
    {
      name: "maxSubjects",
      type: "number",
      description: "Characters and places one fact may name as its subjects.",
    },
  ],
  system: [
    "Tu es directeur littéraire. La bible d'un roman est établie — son identité, son style, ses personnages, leurs liens, son monde et sa chronologie — et le texte source dont elle est tirée est disponible. Tu en tires la mémoire factuelle du récit : la liste des faits que tout chapitre à venir devra respecter.",
    "Tu écris en {{language}}. Les noms propres restent exactement tels que la bible les écrit.",
    "Un fait est atomique : une seule affirmation, formulée à l'affirmative, compréhensible seule, telle qu'un chapitre puisse la contredire ou la confirmer sans ambiguïté. C'est la seule exigence qui compte ici, et c'est celle dont tout le contrôle de cohérence dépend : un fait composé ne peut être contredit qu'à moitié, donc il ne peut pas l'être.",
    "Tu n'inventes rien. Chaque fait est tiré d'un passage précis qui t'est donné, et tu cites ce passage mot pour mot.",
    "Tu apprécies, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Relève les faits canoniques du roman à partir des éléments ci-dessous.",
    "",
    "Contraintes de fidélité au texte source — elles s'imposent à toute entrée de la bible :",
    "{{freedomConstraints}}",
    "",
    "Les passages dont un fait peut être tiré. Chaque entrée donne sa clé, ce qu'elle est, puis le passage lui-même. Tu ne peux tirer un fait de rien d'autre :",
    "{{citableSources}}",
    "",
    "Les personnages établis. N'emploie que ces noms, écrits exactement ainsi :",
    "{{cast}}",
    "",
    "Les lieux établis, mêmes règles :",
    "{{places}}",
    "",
    "La chronologie. Un fait qui cesse d'être vrai se rattache à l'un de ces événements, par son intitulé exact :",
    "{{events}}",
    "",
    "Les faits déjà enregistrés — retenus ou écartés par l'auteur. Ne les propose pas à nouveau, sous aucune formulation :",
    "{{knownFacts}}",
    "",
    "UN FAIT ATOMIQUE",
    "",
    "Une seule affirmation par fait, d'environ {{statementWordTarget}} mots au plus.",
    "Écris toujours à l'affirmative, et porte la polarité dans « isTrue ». Ce qui est faux dans le monde du roman s'écrit affirmativement avec « isTrue » à false : c'est ce qui permet de rapprocher deux faits contraires, et c'est ce qui permet à une rumeur d'entrer dans la mémoire du récit sans entrer dans sa vérité.",
    "Un énoncé qui porte l'une des constructions suivantes n'est pas un fait : il en contient plusieurs, et il sera écarté.",
    "{{compositionMarkers}}",
    "",
    "DÉCOMPOSER",
    "",
    "Quand un passage énonce plusieurs choses à la fois, ne choisis pas laquelle garder et ne résume pas : décompose.",
    "Un énoncé qui dit à la fois ce qui est vrai et depuis quand se décompose en un fait, dont la portée temporelle est portée par la liste où tu le ranges et par ses bornes — jamais par sa phrase.",
    "Un énoncé qui dit deux choses d'un même personnage se décompose en deux faits, chacun avec sa propre citation.",
    "Déclare chaque décomposition dans « decompositions » : « composite » reprend l'énoncé composé dont tu es parti, « factIndexes » donne la position, dans l'ordre ci-dessous, des faits élémentaires que tu en as tirés — au moins deux. Ne déclare une décomposition que si l'énoncé de départ était réellement composé.",
    "",
    "TA RÉPONSE",
    "",
    "Un unique objet JSON comportant quatre listes, et rien d'autre. Les trois premières portent, ensemble, de {{minFacts}} à {{maxFacts}} faits, et l'ordre des positions est celui-ci :",
    "- « permanentFacts » — ce qui est vrai pour toute la durée du roman. Ces faits ne portent aucune borne : ils n'en ont pas le champ.",
    "- « periodFacts » — ce qui n'est vrai que pendant une période. Chacun porte « validFrom », « validUntil », ou les deux, l'autre à null.",
    "- « endedFacts » — ce qui cesse d'être vrai à partir d'un événement. Chacun porte « endedByEventName », l'intitulé exact d'un événement de la chronologie, et aucune borne.",
    "- « decompositions » — les décompositions déclarées ci-dessus, ou une liste vide.",
    "",
    "C'est la liste qui dit quelle est la portée temporelle d'un fait. N'ajoute aucun champ de portée : il serait ignoré.",
    "",
    "Chaque fait, dans l'une comme dans l'autre des trois listes, comporte :",
    "- « statement » : l'affirmation, atomique et affirmative.",
    "- « isTrue » : sa valeur de vérité dans le monde du roman — pas dans la tête d'un personnage.",
    "- « basis » : « sourceKey », la clé exacte de l'un des passages ci-dessus, et « quotation », un extrait de **ce** passage, recopié mot pour mot, d'un seul tenant, d'environ {{quotationWordTarget}} mots au plus. Une citation recousue à partir de deux endroits du passage sera rejetée, et le fait avec elle.",
    "- « subjects » — jusqu'à {{maxSubjects}} entrées, ou aucune : ce que le fait concerne, chacune avec « kind » (« character » ou « place ») et « name », l'un des noms donnés plus haut. Un fait qui ne concerne ni personne ni lieu n'en porte aucun.",
    "- « knownBy » : qui prend position sur cet énoncé, et laquelle. Une entrée par personnage, avec « characterName » et « state ».",
    "",
    "CE QUE LES PERSONNAGES SAVENT",
    "",
    "Les positions possibles :",
    "{{beliefStates}}",
    "",
    "Ne déclare une position que là où la bible la donne ou l'implique clairement. Ne pas citer un personnage n'est pas la même chose que le déclarer ignorant : le premier veut dire que l'auteur n'a pas tranché, le second est une contrainte que les chapitres devront respecter.",
    "Souviens-toi que la valeur de vérité du fait et la position d'un personnage sont indépendantes. Un personnage qui ignore un fait vrai, un personnage qui tient pour vrai un fait faux : ce sont les deux cas qui rendent une révélation possible, et ils s'écrivent ici.",
    "",
    "LES BORNES D'UNE PÉRIODE",
    "",
    "Une borne se place sur le même axe que la chronologie : le jour 0 est le jour où le roman s'ouvre, les nombres négatifs sont avant, les positifs après, et une année vaut {{daysPerYear}} jours.",
    "Chaque borne porte les trois champs ensemble : « day », le nombre ; « precision », à quel point ce jour est connu ; « label » (environ {{boundLabelWordTarget}} mots), la formulation destinée à l'auteur. Une borne sans nombre ne peut être comparée à rien.",
    "Précisions disponibles :",
    "{{datePrecisions}}",
    "",
    "CE QUI SERA VÉRIFIÉ",
    "",
    "Chaque citation est relue dans le passage dont tu as donné la clé. Une citation introuvable écarte le fait, quelle que soit sa justesse apparente.",
    "Chaque énoncé est relu à la recherche des constructions listées plus haut. Un énoncé composé écarte le fait.",
    "Deux faits qui disent la même chose du même sujet sur la même portée n'en font qu'un.",
    "Un nom qui ne figure pas dans les listes ci-dessus n'est rattaché à rien.",
    "",
    "Écrire moins ne protège de rien : un fait vague passe aussi mal qu'un fait faux, et il est inutile au roman. Écris des faits courts, nets, et tirés du texte.",
    "Aucun chiffre d'évaluation nulle part : ni note, ni score, ni pourcentage. Un nombre peut situer un jour — jamais mesurer une qualité.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const EXTRACT_INITIAL_FACTS_PROMPTS = [V1] as const;
