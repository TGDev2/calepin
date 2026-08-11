/**
 * `define-style` — the style section of the bible, legislated as operational
 * constraints (CAL-089).
 *
 * The backlog's central requirement is worded of the *answer* — every element
 * an operational constraint verifiable during drafting, never a decorative
 * adjective — and the contract (`operationalStyleSchema` in `@calepin/bible`)
 * already carries it as a shape: a rule paired with its observable breach.
 * What is left to the prompt is making the model fill that shape honestly
 * rather than decoratively. Its organising ideas:
 *
 * - **The violation is the test of the rule.** The instruction defines a rule
 *   by its breach: if no observable breach can be written, the rule is an
 *   adjective and must be rewritten. That inverts the failure mode — instead
 *   of asking for "operational" wording and hoping, it makes the second half
 *   of the pair the proof of the first, decidable on one passage alone.
 * - **The corpus is context, not a citation vocabulary.** `citableSources`
 *   carries the canonical direction, the identity section and the validated
 *   analysis; the style must stay answerable to them, but no basis is asked
 *   for — CAL-088's citation obligation answered traceability, and a style
 *   rule under an `extend` or `reinterpret` treatment has no verbatim
 *   antecedent to quote. The freedom clauses carry the fidelity rule instead.
 * - **The register is derived, never re-decided.** The author's declared
 *   readership arrives as a constraint `languageRegister` is declined from
 *   (CAL-045) — the same *told, not trusted* position the identity prompt
 *   gives the audience and the length.
 * - **The avoid-list names patterns, not qualities.** The specification's own
 *   recurring defects of generated prose are quoted as candidates, kept only
 *   where they threaten *this* text — an instruction, not a checklist to echo.
 * - **One number, one place** (CAL-055): every word target and list bound
 *   arrives as a variable owned by `@calepin/bible`.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "define-style",
  version: 1,
  scope: { kind: "mission", missionId: "define-style" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "targetAudience",
      type: "text",
      description:
        "The project's target readership, as the author declared it — the constraint the register is derived from, never a field the answer carries.",
    },
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
        "One entry per passage the style stays answerable to — its key, its French label and the passage: the canonical direction field by field, the identity section, then the validated analysis section by section. Context, not a citation vocabulary: no basis is asked of the answer.",
    },
    {
      name: "ruleWordTarget",
      type: "number",
      description: "Words one rule should come to — a clause, not a paragraph.",
    },
    {
      name: "violationWordTarget",
      type: "number",
      description: "Words one violation should come to — it names one observable, nothing more.",
    },
    {
      name: "minMotifs",
      type: "number",
      description: "Recurring motifs the section must at least declare — the domain's floor.",
    },
    {
      name: "maxMotifs",
      type: "number",
      description:
        "Recurring motifs the section stays under — the domain's ceiling, never a quota.",
    },
    {
      name: "minAvoid",
      type: "number",
      description: "Elements to avoid the section must at least declare — the domain's floor.",
    },
    {
      name: "maxAvoid",
      type: "number",
      description:
        "Elements to avoid the section stays under — the domain's ceiling, never a quota.",
    },
  ],
  system: [
    "Tu es directeur littéraire. Un auteur a retenu une direction romanesque et l'identité de son roman est établie. Tu écris la section style de sa bible : la loi que chaque page devra suivre, et la section que la rédaction relira le plus souvent.",
    "Tu écris en {{language}}. Les noms propres et les termes du texte source restent tels que le texte les écrit.",
    "Tu n'écris pas une description du style : tu écris des contraintes. Une contrainte est une phrase qu'un rédacteur peut respecter ou enfreindre, et dont l'infraction se voit dans un passage précis. « Une prose élégante et fluide » ne contraint rien : personne ne peut l'enfreindre, donc personne ne peut s'y tenir.",
    "Tu apprécies, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Établis la section style du roman à partir des éléments ci-dessous.",
    "",
    "Le lectorat visé est fixé par l'auteur : {{targetAudience}}. Le niveau de langue en découle — tu le déclines, tu ne le rediscutes pas.",
    "",
    "Contraintes de fidélité au texte source — elles s'imposent à toute entrée de la bible :",
    "{{freedomConstraints}}",
    "",
    "Ce sur quoi le style doit rester appuyé — la direction retenue, l'identité du roman, puis l'analyse validée. Chaque entrée donne sa clé, ce qu'elle est, puis le passage lui-même :",
    "{{citableSources}}",
    "",
    "Chaque élément de ta réponse est un objet à deux parties :",
    "- « rule » (environ {{ruleWordTarget}} mots) : la contrainte elle-même — déclarative, à l'indicatif, portant sur la prose du roman. Elle prescrit un comportement observable : ce que la narration fait, ce qu'elle ne fait pas, dans quelles limites.",
    "- « violation » (environ {{violationWordTarget}} mots) : ce qu'un relecteur observe dans un seul passage quand la règle est enfreinte — décidable en lisant ce passage seul, sans autre chapitre, sans total, sans moyenne.",
    "La « violation » est le test de la règle : si tu ne peux pas l'écrire, ta règle est un adjectif décoratif — réécris la règle jusqu'à ce que son infraction soit observable. Une règle que personne ne pourrait enfreindre n'est pas une règle.",
    "",
    "Ta réponse est un unique objet JSON comportant :",
    "- « pointOfView » : qui raconte, à quelle personne, à quelle distance — et ce que ce choix interdit.",
    "- « focalization » : ce que la narration sait, et ce qu'elle n'a pas le droit de savoir ou de rapporter.",
    "- « tense » : le temps de la narration, et où les autres temps sont admis.",
    "- « languageRegister » : le registre, décliné du lectorat déclaré ci-dessus — et ce qui en est exclu, où, pour qui.",
    "- « descriptiveDensity » : la part et la place de la description — quand on décrit, combien, à quel moment on s'arrête.",
    "- « pacing » : le rythme — longueur des phrases ou des scènes, alternances, ce qui accélère et ce qui retient.",
    "- « dialogueBalance » : la place du dialogue — sa part, ce qu'il porte, ce qu'il ne porte pas.",
    "- « recurringMotifs » — de {{minMotifs}} à {{maxMotifs}} motifs : chacun assez concret pour être reconnu sur la page, sa règle disant où et quand il revient, sa « violation » l'absence ou le mésusage observable.",
    "- « elementsToAvoid » — de {{minAvoid}} à {{maxAvoid}} éléments : des patrons concrets à proscrire, jamais des qualités à fuir. Parmi eux, retiens ceux des défauts récurrents de la prose générée qui menacent ce texte-ci : répétitions lexicales, tics d'écriture, dialogues interchangeables, sur-explication, descriptions génériques, métaphores répétitives, variations injustifiées du temps verbal. N'en recopie aucun qui ne menace pas ce texte ; ajoute ce que ce texte, lui, risque.",
    "",
    "Chaque contrainte doit pouvoir être tenue par un rédacteur qui n'aurait que cette section sous les yeux, et vérifiée par un relecteur qui n'aurait qu'un passage.",
    "Aucun chiffre d'évaluation nulle part : ni note, ni score, ni pourcentage. Un nombre peut borner la prose elle-même — une longueur de phrase, un nombre d'adjectifs — jamais en mesurer la qualité.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const DEFINE_STYLE_PROMPTS = [V1] as const;
