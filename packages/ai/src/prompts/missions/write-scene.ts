/**
 * `write-scene` — the only mission that produces prose a reader reads.
 *
 * The one prompt with no "answer in JSON" clause: the mission's declared output
 * is prose (`mission-registry.ts`), and asking a model to wrap a chapter in an
 * object is how a chapter comes back escaped.
 *
 * It is also the mission where §5.8 is won or lost. The prompt receives
 * summaries and the excerpts continuity actually requires — never the previous
 * chapters in full — and the composer (CAL-054) is what keeps that true; the
 * variables are declared so that it *can* be.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "write-scene",
  version: 1,
  scope: { kind: "mission", missionId: "write-scene" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "bibleStyle",
      type: "text",
      description: "The bible's style section: register, voice, tense, point of view.",
    },
    {
      name: "chapterOutline",
      type: "text",
      description: "The plan of the chapter being written.",
    },
    {
      name: "targetWordCount",
      type: "number",
      description: "The chapter's target length in words.",
    },
    {
      name: "canonFacts",
      type: "list",
      description: "The canon facts this chapter actually touches, one statement each.",
    },
    {
      name: "precedingSummaries",
      type: "list",
      description: "Summaries of the preceding chapters — never their full text.",
    },
    {
      name: "continuityExcerpts",
      type: "list",
      description: "The few earlier passages continuity requires verbatim. Often empty.",
    },
    {
      name: "authorInstructions",
      type: "list",
      description: "The author's own instructions for this chapter. Often empty.",
    },
    {
      name: "freedomConstraints",
      type: "list",
      description: "The freedom-level clauses for the writing stage, one per dimension.",
    },
  ],
  system: [
    "Tu écris le texte d'un roman, chapitre par chapitre, pour un auteur qui en a établi la bible et le plan.",
    "Tu écris en {{language}}.",
    "Tu écris le chapitre demandé et rien d'autre : pas de titre ajouté, pas de résumé, pas de commentaire sur ce que tu as écrit.",
  ].join("\n"),
  instruction: [
    "Écris le chapitre planifié ci-dessous, d'environ {{targetWordCount}} mots.",
    "",
    "Plan du chapitre :",
    "{{chapterOutline}}",
    "",
    "Consignes de l'auteur :",
    "{{authorInstructions}}",
    "",
    "Style à respecter :",
    "{{bibleStyle}}",
    "",
    "Contraintes de fidélité au texte source :",
    "{{freedomConstraints}}",
    "",
    "Faits déjà établis que ce chapitre engage — ne les contredis pas :",
    "{{canonFacts}}",
    "",
    "Résumés des chapitres précédents :",
    "{{precedingSummaries}}",
    "",
    "Extraits antérieurs nécessaires à la continuité :",
    "{{continuityExcerpts}}",
    "",
    "Écris la scène plutôt que de la raconter, et tiens le plan jusqu'au bout : ce qu'il annonce doit être dans le chapitre.",
    "N'introduis pas de fait nouveau qui contredirait ceux ci-dessus ; si le plan en exige un, écris-le comme un fait nouveau et non comme un rappel.",
  ].join("\n"),
} as const satisfies PromptDefinition;

/**
 * V2 (CAL-055) adds one hole: `partSummaries`.
 *
 * The chapter summaries above it are the recent past and they are degradable —
 * the composer's ladder drops the farthest ones when the budget bites. That is
 * only safe if something still covers the span they were covering, and the part
 * summary is it: one summary per part, an order of magnitude cheaper than the
 * chapters under it, which is why the composer never degrades it.
 *
 * Placed *before* the chapter summaries in the instruction, and the two are
 * labelled as different resolutions of the same past rather than as two lists
 * of the same kind: read the other way round, a model treats the coarse one as
 * a repetition of the fine one and re-narrates it.
 */
const V2 = {
  id: "write-scene",
  version: 2,
  scope: { kind: "mission", missionId: "write-scene" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "bibleStyle",
      type: "text",
      description: "The bible's style section: register, voice, tense, point of view.",
    },
    {
      name: "chapterOutline",
      type: "text",
      description: "The plan of the chapter being written.",
    },
    {
      name: "targetWordCount",
      type: "number",
      description: "The chapter's target length in words.",
    },
    {
      name: "canonFacts",
      type: "list",
      description: "The canon facts this chapter actually touches, one statement each.",
    },
    {
      name: "partSummaries",
      type: "list",
      description:
        "The summaries of the completed preceding parts, in reading order — the coarse level of the memory.",
    },
    {
      name: "precedingSummaries",
      type: "list",
      description: "Summaries of the preceding chapters — never their full text.",
    },
    {
      name: "continuityExcerpts",
      type: "list",
      description: "The few earlier passages continuity requires verbatim. Often empty.",
    },
    {
      name: "authorInstructions",
      type: "list",
      description: "The author's own instructions for this chapter. Often empty.",
    },
    {
      name: "freedomConstraints",
      type: "list",
      description: "The freedom-level clauses for the writing stage, one per dimension.",
    },
  ],
  system: [
    "Tu écris le texte d'un roman, chapitre par chapitre, pour un auteur qui en a établi la bible et le plan.",
    "Tu écris en {{language}}.",
    "Tu écris le chapitre demandé et rien d'autre : pas de titre ajouté, pas de résumé, pas de commentaire sur ce que tu as écrit.",
  ].join("\n"),
  instruction: [
    "Écris le chapitre planifié ci-dessous, d'environ {{targetWordCount}} mots.",
    "",
    "Plan du chapitre :",
    "{{chapterOutline}}",
    "",
    "Consignes de l'auteur :",
    "{{authorInstructions}}",
    "",
    "Style à respecter :",
    "{{bibleStyle}}",
    "",
    "Contraintes de fidélité au texte source :",
    "{{freedomConstraints}}",
    "",
    "Faits déjà établis que ce chapitre engage — ne les contredis pas :",
    "{{canonFacts}}",
    "",
    "Ce que le roman a parcouru jusqu'ici, partie par partie :",
    "{{partSummaries}}",
    "",
    "Résumés des chapitres précédents, du plus ancien au plus récent :",
    "{{precedingSummaries}}",
    "",
    "Extraits antérieurs nécessaires à la continuité :",
    "{{continuityExcerpts}}",
    "",
    "Écris la scène plutôt que de la raconter, et tiens le plan jusqu'au bout : ce qu'il annonce doit être dans le chapitre.",
    "N'introduis pas de fait nouveau qui contredirait ceux ci-dessus ; si le plan en exige un, écris-le comme un fait nouveau et non comme un rappel.",
  ].join("\n"),
} as const satisfies PromptDefinition;

/**
 * V3 (CAL-091) adds the relationship graph, and the addition is one section
 * and one sentence.
 *
 * The section carries the graph as `describeRelationshipGraph` phrases it —
 * directed edges, then the lines naming what a pair left unanswered. The
 * sentence is what makes it load-bearing: without an instruction saying that a
 * character may only act on what their own side of a tie holds, a model reads
 * two directed edges as one relationship and freely has B act on what only A
 * knows, which is the defect the whole asymmetric model exists to prevent.
 *
 * Placed immediately after the canon facts, and for the same reason the part
 * summaries sit before the chapter summaries: the two sections are of one kind
 * — what the world already holds and must not be contradicted — and reading
 * them apart invites treating the ties as decoration.
 */
const V3 = {
  id: "write-scene",
  version: 3,
  scope: { kind: "mission", missionId: "write-scene" },
  variables: [
    ...V2.variables,
    {
      name: "characterRelations",
      type: "list",
      description:
        "The bible's relationship graph, one directed tie per line, plus the lines naming a tie only one side declared.",
    },
  ],
  system: V2.system,
  instruction: [
    "Écris le chapitre planifié ci-dessous, d'environ {{targetWordCount}} mots.",
    "",
    "Plan du chapitre :",
    "{{chapterOutline}}",
    "",
    "Consignes de l'auteur :",
    "{{authorInstructions}}",
    "",
    "Style à respecter :",
    "{{bibleStyle}}",
    "",
    "Contraintes de fidélité au texte source :",
    "{{freedomConstraints}}",
    "",
    "Faits déjà établis que ce chapitre engage — ne les contredis pas :",
    "{{canonFacts}}",
    "",
    "Liens entre les personnages. Chaque ligne est orientée : elle dit ce que le premier personnage tient du second, et rien de ce que le second tient du premier. Une ligne d'asymétrie signale un lien qu'un seul côté déclare, ou que les deux déclarent différemment :",
    "{{characterRelations}}",
    "Un personnage n'agit que sur ce que son propre côté du lien porte. Si l'un sait ce que l'autre ignore, l'autre continue de l'ignorer dans cette scène, quoi que le lecteur en sache — c'est précisément là que la scène a quelque chose à jouer.",
    "",
    "Ce que le roman a parcouru jusqu'ici, partie par partie :",
    "{{partSummaries}}",
    "",
    "Résumés des chapitres précédents, du plus ancien au plus récent :",
    "{{precedingSummaries}}",
    "",
    "Extraits antérieurs nécessaires à la continuité :",
    "{{continuityExcerpts}}",
    "",
    "Écris la scène plutôt que de la raconter, et tiens le plan jusqu'au bout : ce qu'il annonce doit être dans le chapitre.",
    "N'introduis pas de fait nouveau qui contredirait ceux ci-dessus ; si le plan en exige un, écris-le comme un fait nouveau et non comme un rappel.",
  ].join("\n"),
} as const satisfies PromptDefinition;

/**
 * V4 (CAL-092) adds what the world permits and what bounds it, and the
 * addition is again one section and one sentence.
 *
 * The section carries the world as `describeWorldBounds` phrases it — the
 * ordinary rules first, then each out-of-norm capability followed by what it
 * cannot do, what it costs and when it fails. The sentence is what makes it
 * load-bearing, and it is aimed at one failure specifically: a scene that
 * needs an exit reaches for the most capable thing in the context, and a power
 * quoted without its bounds is an open offer. Naming the bounds as *the* place
 * the scene's difficulty comes from turns the same lines from a restriction
 * into material.
 *
 * Placed with the canon facts and the ties, for V3's own reason: the three
 * sections are of one kind — what the world already holds and must not be
 * contradicted — and the world's rules belong before the ties, since who may
 * do what precedes who holds what about whom.
 */
const V4 = {
  id: "write-scene",
  version: 4,
  scope: { kind: "mission", missionId: "write-scene" },
  variables: [
    ...V3.variables,
    {
      name: "worldBounds",
      type: "list",
      description:
        "The world's rules and, for each out-of-norm capability, what it cannot do, what it costs and when it fails.",
    },
  ],
  system: V3.system,
  instruction: [
    "Écris le chapitre planifié ci-dessous, d'environ {{targetWordCount}} mots.",
    "",
    "Plan du chapitre :",
    "{{chapterOutline}}",
    "",
    "Consignes de l'auteur :",
    "{{authorInstructions}}",
    "",
    "Style à respecter :",
    "{{bibleStyle}}",
    "",
    "Contraintes de fidélité au texte source :",
    "{{freedomConstraints}}",
    "",
    "Ce que ce monde permet et ce qui l'en empêche. Les règles d'abord, puis, pour chaque élément hors norme, ce qu'il ne peut pas faire, ce qu'il coûte et quand il échoue :",
    "{{worldBounds}}",
    "Ces bornes ne sont pas des interdits à contourner : elles sont la matière de la scène. Si un personnage s'en sort grâce à un élément hors norme, il doit en payer le coût déclaré, et cela ne doit pas fonctionner dans les circonstances déclarées comme le faisant échouer. Une difficulté qui se dénoue parce que le pouvoir se trouvait disponible au bon moment n'est pas dénouée.",
    "",
    "Faits déjà établis que ce chapitre engage — ne les contredis pas :",
    "{{canonFacts}}",
    "",
    "Liens entre les personnages. Chaque ligne est orientée : elle dit ce que le premier personnage tient du second, et rien de ce que le second tient du premier. Une ligne d'asymétrie signale un lien qu'un seul côté déclare, ou que les deux déclarent différemment :",
    "{{characterRelations}}",
    "Un personnage n'agit que sur ce que son propre côté du lien porte. Si l'un sait ce que l'autre ignore, l'autre continue de l'ignorer dans cette scène, quoi que le lecteur en sache — c'est précisément là que la scène a quelque chose à jouer.",
    "",
    "Ce que le roman a parcouru jusqu'ici, partie par partie :",
    "{{partSummaries}}",
    "",
    "Résumés des chapitres précédents, du plus ancien au plus récent :",
    "{{precedingSummaries}}",
    "",
    "Extraits antérieurs nécessaires à la continuité :",
    "{{continuityExcerpts}}",
    "",
    "Écris la scène plutôt que de la raconter, et tiens le plan jusqu'au bout : ce qu'il annonce doit être dans le chapitre.",
    "N'introduis pas de fait nouveau qui contredirait ceux ci-dessus ; si le plan en exige un, écris-le comme un fait nouveau et non comme un rappel.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const WRITE_SCENE_PROMPTS = [V1, V2, V3, V4] as const;
