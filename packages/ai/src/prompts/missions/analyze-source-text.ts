/**
 * `analyze-source-text` — the diagnosis every later stage is built on.
 *
 * The one mission whose input legitimately is the whole starting text
 * (`mission-registry.ts`), and the only place the separation the domain cares
 * about — *fait explicite* against *interprétation*, `AnalysisElement.kind` —
 * has to be asked for out loud. The prompt asks for the distinction; what the
 * two mean, and what is done with them, stays in `@calepin/analysis` (§5.7).
 *
 * V2 (CAL-070) is the version that ships against the real output schema. Its
 * one organising idea: **hunt for what makes the text singular, never for what
 * makes it classable** — a label may situate, it may not conclude, and an
 * observation that would hold of a hundred other texts is not an observation
 * about this one. Three consequences in the wording. Each section's ask names
 * what would disqualify an entry (a genre adjective for the tone, a theme
 * nobody can see the text treating, the type-conflict a text merely resembles),
 * because the failure mode of a diagnosis is not wrongness but genericity.
 * Quotations stay verbatim in the text's own language and spelling — the
 * analysis is written in the project's language, the text is cited in its own.
 * And the word targets arrive as variables owned by `@calepin/analysis`
 * (`ANALYSIS_WORD_TARGETS`), the CAL-055 pattern, so the target and the
 * schema's bound are one number.
 *
 * V1 stays beside it, unmodified: a `GenerationAttempt` that recorded version
 * 1 must still resolve to the text that produced it.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "analyze-source-text",
  version: 1,
  scope: { kind: "mission", missionId: "analyze-source-text" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "targetAudience",
      type: "text",
      description: "The project's target readership, as the author declared it.",
    },
    { name: "sourceText", type: "text", description: "The current source text version, in full." },
  ],
  system: [
    "Tu es analyste littéraire. Tu accompagnes un auteur qui prépare un roman à partir d'un texte de départ.",
    "Tu écris en {{language}}.",
    "Tu sépares toujours ce que le texte établit explicitement de ce que tu en déduis, et tu ne combles jamais un vide du texte par une invention.",
  ].join("\n"),
  instruction: [
    "Analyse le texte source ci-dessous et produis un diagnostic narratif utilisable pour écrire un roman.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "Pour chaque élément que tu relèves, indique s'il s'agit d'un fait explicite du texte ou d'une interprétation de ta part, et appuie chaque fait explicite sur ce que le texte dit réellement.",
    "Couvre ce que le texte pose déjà, ce qu'il laisse ouvert et ce qui manquerait pour en tirer un roman.",
    "N'invente aucun élément qui ne soit ni dans le texte ni présenté comme une interprétation.",
    "",
    "Texte source :",
    "{{sourceText}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

const V2 = {
  id: "analyze-source-text",
  version: 2,
  scope: { kind: "mission", missionId: "analyze-source-text" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "targetAudience",
      type: "text",
      description: "The project's target readership, as the author declared it.",
    },
    { name: "sourceText", type: "text", description: "The current source text version, in full." },
    {
      name: "summaryWordTarget",
      type: "number",
      description: "Words the factual summary should come to — the domain's target, not a cap.",
    },
    {
      name: "potentialWordTarget",
      type: "number",
      description: "Words the development-potential assessment should come to.",
    },
    {
      name: "totalWordBudget",
      type: "number",
      description: "Words the whole diagnostic must stay under.",
    },
  ],
  system: [
    "Tu es analyste littéraire. Tu accompagnes un auteur qui prépare un roman à partir d'un texte de départ, et ton diagnostic est le socle de tout ce qui suivra : les directions, la bible, le plan et les chapitres se construiront dessus.",
    "Tu écris en {{language}}. Toute citation du texte source reste exactement telle que le texte l'écrit, dans sa langue et sa graphie d'origine — jamais traduite, jamais corrigée, jamais résumée entre guillemets.",
    "Tu cherches ce qui rend ce texte singulier, jamais ce qui le rend classable. Une étiquette situe, elle ne conclut pas ; une observation qui vaudrait pour cent autres textes n'est pas une observation sur celui-ci ; ce que le texte fait compte plus que ce à quoi il ressemble.",
    "Tu sépares ce que le texte établit — FACTUAL — de ce que tu en déduis — INTERPRETATION — et tu ne combles jamais un vide du texte par une invention : ce que le texte tait est une ambiguïté ou une question ouverte, pas un blanc à remplir.",
  ].join("\n"),
  instruction: [
    "Analyse le texte source ci-dessous et produis le diagnostic narratif en dix-sept sections que le schéma demande, dans son ordre.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "Ce que chaque section attend :",
    "- Résumé factuel (environ {{summaryWordTarget}} mots) : ce qui arrive, dans l'ordre où le texte le donne — aucune lecture, aucun jugement, aucun mobile que le texte n'énonce pas.",
    "- Prémisse : la situation qui met le récit en marche, en une ou deux phrases.",
    "- Conflit principal : qui veut quoi, et ce qui s'y oppose — tel que ce texte le construit, pas le conflit type auquel il fait penser.",
    "- Promesse du récit : ce que l'ouverture engage envers le lecteur, ce qu'il serait trahi de ne pas retrouver à la fin.",
    "- Thèmes : l'étiquette nomme le thème, la phrase dit ce que ce texte en fait ; un thème dont tu ne peux pas montrer le traitement dans ce texte n'a pas sa place.",
    "- Personnages : chacun désigné comme le texte le désigne, avec ce que le texte établit de lui et ce qui le distingue.",
    "- Relations : entre entrées de la section personnages uniquement, reprises par leur étiquette exacte et orientées (« A → B ») — qui est quoi pour qui, et ce que le texte montre de ce lien.",
    "- Point de vue : en étiquette la désignation technique, en phrase la conduite réelle de la narration — distance, accès aux pensées, fiabilité, écarts.",
    "- Temps verbal : en étiquette le temps dominant, en phrase les bascules s'il y en a.",
    "- Tonalité : ce que la voix fait, et ce qu'elle s'interdit — jamais un simple adjectif de genre.",
    "- Éléments singuliers : ce que ce texte fait qu'un autre ne ferait pas — un dispositif, une image, un silence, une construction. Chaque entrée s'appuie sur un passage précis.",
    "- Ambiguïtés : ce que le texte laisse volontairement double, avec les lectures qu'il maintient ensemble.",
    "- Questions non résolues : ce que le texte pose et ne referme pas.",
    "- Éléments à préserver : ce qui doit survivre au passage au roman — ce qui serait perdu si on le normalisait.",
    "- Fragilités : ce qui, en l'état, ne tiendrait pas la longueur d'un roman — dit précisément, jamais adouci.",
    "- Risques de clichés : les pentes du déjà-lu vers lesquelles un développement de ce texte-ci glisserait.",
    "- Potentiel de développement (environ {{potentialWordTarget}} mots) : ce que la matière peut porter à l'échelle d'un roman — où elle est dense, où elle est mince, ce que l'allongement coûterait.",
    "",
    "Tiens chaque élément en une à trois phrases ; le diagnostic entier tient sous {{totalWordBudget}} mots.",
    "Marque FACTUAL ce que le texte établit, et cite alors dans « evidence » le passage qui l'appuie, tel quel ; marque INTERPRETATION ce que tu déduis. Dans le doute, INTERPRETATION. Le résumé factuel, appuyé par le texte entier, garde « evidence » à null.",
    "Une section-liste ne reste vide que si le texte n'offre réellement rien pour elle ; ne remplis jamais une section pour la forme.",
    "Une même observation ne sert qu'une fois : chaque section ajoute, aucune ne répète.",
    "",
    "Texte source :",
    "{{sourceText}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const ANALYZE_SOURCE_TEXT_PROMPTS = [V1, V2] as const;
