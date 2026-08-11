/**
 * `assess-novel-potential` — what the text can sustain at length (CAL-076).
 *
 * The diagnostic's `DEVELOPMENT_POTENTIAL` section says in ~200 words what the
 * text could become; this mission reads the **validated** analysis and the
 * source text and appraises the reach of that promise against the project's
 * target word count, on the backlog's four axes: what carries expansion, what
 * runs dry, what is missing, what must be treated. §5.4 is why it is a
 * mission of its own — a per-element judgement against a length is a
 * different instruction, contract and budget from diagnosing everything at
 * once.
 *
 * V1's organising ideas, in the order the specification imposes them:
 *
 * - **Appraise, never rate** (cahier des charges 1195–1199, restated by the
 *   backlog: no number presented as a measure of quality). The prompt forbids
 *   every numeric form a verdict could take, and the schema carries no field
 *   that could hold one — the same prohibition twice. The target length and a
 *   number the text itself writes may be named; no number measures a quality.
 * - **The minimums are a prioritisation demand, not an invention licence.**
 *   Three carriers and two fragilities are owed because naming the *best*
 *   ones is the mission — and the appraisal itself says how far each carries,
 *   which may be "not far". The honest answer to a thin text is a modest
 *   appraisal, never an invented promise.
 * - **The text that is there, not the novel one could dream onto it.** An
 *   element carries only what the text gives it; potential the assessor would
 *   have to supply belongs in `gaps`, as an absence.
 * - **A gap cites nothing.** It names what is missing, and an absence has no
 *   passage — which is why the contract gives `gaps` no evidence field.
 * - **Citations anchor, they do not constitute.** The citation block is
 *   CAL-075's, softened to CAL-071's consequence: evidence is nullable here,
 *   so an unfound quotation is removed and the appraisal stands on its
 *   argument (`verifyNovelPotentialEvidence` in `@calepin/analysis`) — said
 *   out loud, because a rule whose enforcement is announced is a rule a model
 *   can plan for.
 *
 * The word targets, the minimums and the per-axis ceiling arrive as variables
 * owned by `@calepin/analysis` (`NOVEL_POTENTIAL_WORD_TARGETS`,
 * `NOVEL_POTENTIAL_COUNTS`) — the CAL-055 discipline; the target word count
 * is the project's own (`resolveNovelTargetWordCount`, `@calepin/outline`),
 * resolved by the future composer.
 *
 * Exercised before shipping on three trial texts — one dense enough to carry
 * a novel, one thin anecdote, one strong-voice/thin-story probe — with
 * findings folded into this wording between passes (tasks/todo.md, CAL-076).
 * The corpus is not committed.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "assess-novel-potential",
  version: 1,
  scope: { kind: "mission", missionId: "assess-novel-potential" },
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
      name: "minExpansions",
      type: "number",
      description: "Elements to develop the assessment must at least name — the backlog's floor.",
    },
    {
      name: "minFragilities",
      type: "number",
      description: "Fragilities the assessment must at least name — the backlog's floor.",
    },
    {
      name: "maxPerAxis",
      type: "number",
      description: "Entries one axis stays under — the domain's ceiling, never a quota.",
    },
    {
      name: "overallWordTarget",
      type: "number",
      description: "Words the overall appraisal should come to.",
    },
    {
      name: "appraisalWordTarget",
      type: "number",
      description: "Words one per-element appraisal should come to.",
    },
    {
      name: "evidenceWordTarget",
      type: "number",
      description: "Words a supporting quotation stays under — it anchors, it does not reproduce.",
    },
  ],
  system: [
    "Tu es lecteur éditorial au service d'un auteur qui prépare un roman à partir d'un texte de départ. Ta mission : apprécier ce que ce texte peut réellement soutenir sur la longueur visée — ce qui porte une expansion, ce qui s'épuiserait, ce qui manque, ce qui devra être consolidé.",
    "Tu écris en {{language}}. Toute citation du texte source reste exactement telle que le texte l'écrit, dans sa langue et sa graphie d'origine — jamais traduite, jamais corrigée, jamais résumée entre guillemets.",
    "Tu apprécies, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement de potentiel ou de viabilité, sous aucune forme. Une appréciation vaut par son argument et par l'élément précis du texte qui la porte, ou elle ne vaut rien.",
    "Tu juges le texte qui est là, pas le roman qu'on pourrait rêver à sa place : un élément ne porte que ce que le texte lui donne, et le potentiel qu'il faudrait apporter de l'extérieur est un manque, pas une promesse. Dire qu'un élément porte peu est une appréciation honnête.",
  ].join("\n"),
  instruction: [
    "À partir de l'analyse validée et du texte source ci-dessous, apprécie ce que ce texte peut soutenir dans un roman d'environ {{targetWordCount}} mots.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "« overall » (environ {{overallWordTarget}} mots) : ce que le texte peut réellement soutenir sur cette longueur — la synthèse argumentée, appuyée sur les éléments que les listes détaillent, jamais un verdict global détaché d'eux. Dire que le texte, en l'état, ne peut pas soutenir cette longueur est une réponse recevable, à condition de l'argumenter par les listes.",
    "",
    "« expansions » — au moins {{minExpansions}} entrées : les éléments capables de porter le développement. Ce minimum exige un tri, pas une invention : nomme les meilleurs porteurs du texte, même si leur portée est modeste, et dis dans l'appréciation jusqu'où chacun porte. Pour chaque entrée :",
    "- « label » : l'élément, nommé court et reconnaissable.",
    "- « evidence » : le passage du texte qui porte le mieux cette appréciation — un passage continu du texte, copié caractère pour caractère, au plus {{evidenceWordTarget}} mots : ni coupe, ni crochets, ni points de suspension ajoutés, ni traduction, ni correction. Ne cite jamais de mémoire : si aucun passage précis ne porte l'appréciation, mets null plutôt qu'une citation approximative. Chaque citation est relue mot pour mot contre le texte après ta réponse, et une citation introuvable est retirée — l'appréciation reste, mais affaiblie de son ancrage.",
    "- « whyItSustains » (environ {{appraisalWordTarget}} mots) : pourquoi cet élément peut porter une expansion et jusqu'où — ce que le texte lui donne déjà, ce que la longueur lui permettrait de déployer.",
    "",
    "« exhaustions » : les éléments qui s'épuiseraient si on leur demandait de tenir la longueur. Mêmes règles de « label » et « evidence » ; « whyItExhausts » (environ {{appraisalWordTarget}} mots) dit pourquoi l'élément tourne court — ce qu'il a déjà entièrement donné, ce qu'il répéterait. Liste vide si rien ne s'épuise : ne signale jamais un élément pour remplir la liste.",
    "",
    "« gaps » : ce qui manque au texte pour tenir la durée. Un manque est une absence : il ne cite rien. « label » nomme ce qui manque ; « whyNeeded » (environ {{appraisalWordTarget}} mots) dit pourquoi la longueur visée l'exigera. Liste vide si rien ne manque.",
    "",
    "« fragilities » — au moins {{minFragilities}} entrées : les fragilités que le développement devra traiter avant de s'appuyer sur le texte. Mêmes règles de « label » et « evidence » ; « whyFragile » (environ {{appraisalWordTarget}} mots) dit en quoi c'est fragile et ce que la longueur coûterait si rien n'est fait — sans prescrire la solution, qui appartient aux étapes suivantes.",
    "",
    "Au plus {{maxPerAxis}} entrées par liste. Chaque entrée porte sur un élément distinct de sa liste ; un même élément peut paraître sur deux axes quand les deux jugements sont vrais, chacun argumenté dans ses propres termes.",
    "Aucun chiffre d'évaluation : ni note, ni score, ni pourcentage — uniquement des appréciations argumentées. La longueur visée et un nombre que le texte lui-même écrit peuvent être nommés ; aucun nombre ne mesure une qualité.",
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

export const ASSESS_NOVEL_POTENTIAL_PROMPTS = [V1] as const;
