/**
 * `detect-cliche-risks` — the dedicated pass over the déjà-lu (CAL-075).
 *
 * The diagnostic's `CLICHE_RISKS` section names the slopes in one sentence
 * each, among sixteen other concerns; this mission hunts them and nothing
 * else, across the backlog's four fronts — situations, personnages, formules,
 * retournements — with a passage and a double argument per finding. §5.4 is
 * why it is a mission of its own; CAL-140 is the novel-side twin and reads
 * chapters, not the source text.
 *
 * V1's organising ideas, in the order the specification imposes them:
 *
 * - **Argue, never rate** (cahier des charges 1195–1199). The prompt forbids
 *   every numeric form a verdict could take, and the schema carries no field
 *   that could hold one — the same prohibition twice, once for the model and
 *   once for the contract. Even the ordering asked for is the text's own,
 *   because "worst first" would be a ranking smuggled past the rule.
 * - **What the text does, never what it resembles.** A motif the text
 *   displaces, reverses or holds at distance is material, not a cliché — the
 *   false-positive rule the singular-text trials calibrate. The trial's
 *   displaced-trope probe exists to catch this wording failing.
 * - **No passage, no finding.** The citation block is V3's
 *   (`analyze-source-text`), tightened to this contract: evidence is required
 *   here, so an unfound quotation does not demote — it deletes, and the
 *   prompt says so because a rule whose enforcement is announced is a rule a
 *   model can plan for (`verifyClicheRiskEvidence` in `@calepin/analysis`).
 * - **Empty is the honest answer.** No minimum, said out loud: inventing a
 *   convention to fill a list is this mission's own cliché.
 *
 * The word targets and the ceiling on the count arrive as variables owned by
 * `@calepin/analysis` (`CLICHE_RISK_WORD_TARGETS`, `CLICHE_RISK_COUNT`) — the
 * CAL-055 discipline, so the number the prompt asks for and the number the
 * schema bounds are one number.
 *
 * Exercised before shipping on four trial texts — two deliberately
 * conventional in different registers, one singular, one singular that evokes
 * a trope and displaces it — with findings folded into this wording between
 * passes (tasks/todo.md, CAL-075). The corpus is not committed.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "detect-cliche-risks",
  version: 1,
  scope: { kind: "mission", missionId: "detect-cliche-risks" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "targetAudience",
      type: "text",
      description: "The project's target readership, as the author declared it.",
    },
    { name: "sourceText", type: "text", description: "The current source text version, in full." },
    {
      name: "maxRisks",
      type: "number",
      description: "Findings the detection stays under — the domain's ceiling, never a quota.",
    },
    {
      name: "whyConventionalWordTarget",
      type: "number",
      description: "Words the why-it-is-conventional argument should come to.",
    },
    {
      name: "whatItPreventsWordTarget",
      type: "number",
      description: "Words the what-it-forecloses argument should come to.",
    },
    {
      name: "evidenceWordTarget",
      type: "number",
      description: "Words a supporting quotation stays under — it anchors, it does not reproduce.",
    },
  ],
  system: [
    "Tu es lecteur critique au service d'un auteur qui prépare un roman à partir d'un texte de départ. Ta mission : repérer ce que ce texte reprend au fonds commun du déjà-lu — situations, personnages, formules et retournements convenus — avant que le roman ne s'y engage.",
    "Tu écris en {{language}}. Toute citation du texte source reste exactement telle que le texte l'écrit, dans sa langue et sa graphie d'origine — jamais traduite, jamais corrigée, jamais résumée entre guillemets.",
    "Tu argumentes, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement de banalité ou d'originalité, sous aucune forme. Une remarque vaut par son argument et par le passage précis qui la porte, ou elle ne vaut rien.",
    "Tu distingues ce que le texte fait de ce à quoi il fait penser : un motif que le texte déplace, retourne ou tient à distance est un matériau, pas un cliché. Tu ne signales que ce sur quoi le texte repose réellement.",
  ].join("\n"),
  instruction: [
    "Relève dans le texte source ci-dessous les éléments convenus qui menacent le roman à venir, dans quatre catégories : situation, personnage, formule, retournement.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "Pour chaque élément relevé :",
    "- « category » : la catégorie — situation (une scène, une configuration ou un enchaînement déjà mille fois lus), character (une figure toute faite, définie par sa fonction plus que par ce que ce texte lui donne), formula (une tournure, une image ou une expression toute faite), reversal (un retournement ou une révélation que le lecteur voit venir parce qu'il les a déjà lus ailleurs).",
    "- « label » : le nom de la convention, court et reconnaissable.",
    "- « evidence » : le passage exact qui la montre — un passage continu du texte, copié caractère pour caractère, au plus {{evidenceWordTarget}} mots : ni coupe, ni crochets, ni points de suspension ajoutés, ni traduction, ni correction. Ne cite jamais de mémoire : si tu ne retrouves pas le passage exact dans le texte ci-dessous, ne signale pas l'élément. Chaque citation est relue mot pour mot contre le texte après ta réponse, et une citation introuvable supprime le signalement entier.",
    "- « whyConventional » (environ {{whyConventionalWordTarget}} mots) : pourquoi c'est convenu — nomme le fonds du déjà-lu auquel le passage appartient et montre ce que ce passage-ci en reprend sans le déplacer. Une remarque qui vaudrait pour cent textes est elle-même un cliché de la critique : appuie-la sur ce que ce texte-ci fait, au regard du lectorat visé.",
    "- « whatItPrevents » (environ {{whatItPreventsWordTarget}} mots) : ce que cette pente empêche pour le roman — la tension qu'elle désamorce, la singularité qu'elle aplatit, l'attente qu'elle fige, la question qu'elle referme d'avance.",
    "",
    "Au plus {{maxRisks}} signalements, dans l'ordre où leurs passages apparaissent dans le texte. Aucun minimum : un texte qui ne repose sur aucune convention rend une liste vide — ne signale jamais un élément pour remplir la liste.",
    "Chaque signalement porte sur un élément distinct : une même convention reprise en plusieurs passages se signale une fois, sur le passage le plus net.",
    "Aucun chiffre d'évaluation : ni note, ni score, ni pourcentage — uniquement des remarques argumentées. Un nombre que le texte lui-même écrit reste copié tel quel dans une citation.",
    "",
    "Texte source :",
    "{{sourceText}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const DETECT_CLICHE_RISKS_PROMPTS = [V1] as const;
