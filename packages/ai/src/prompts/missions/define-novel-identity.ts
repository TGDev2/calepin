/**
 * `define-novel-identity` — the identity section of the bible, transposed from
 * the canonical direction and the validated analysis (CAL-088).
 *
 * Every mission before this one asked a model to *produce*: a diagnosis, three
 * divergent novels, a fusion. This one asks it to **transpose**, and the whole
 * prompt is built to make that difference operative rather than stated. Its
 * organising ideas:
 *
 * - **The corpus is the vocabulary.** `citableSources` is the canonical
 *   direction field by field and the validated analysis section by section,
 *   each entry carrying its key, its French label and its passage. It is at
 *   once the context the model reads and the closed list of things it may
 *   cite: the answer names a key from that list and quotes it, and
 *   `checkNovelIdentityBasis` re-reads every quotation against the passage it
 *   named. A source rendered twice — once as context, once as a citation
 *   vocabulary — would be two lists able to disagree; there is one.
 * - **Traceability is stated as a mechanical re-read, not as a virtue.** The
 *   instruction says the answer will be checked, says what happens when a
 *   quotation is not found (the whole answer is refused and re-asked), and
 *   says the honest way out — cite the passage that genuinely motivates the
 *   field, even a weaker one, rather than retype a better one from memory.
 *   That is the same clause `combine-directions` ends its citation rule with.
 * - **Two fields are not asked for.** The readership and the target length are
 *   the author's own, and they arrive as constraints the identity must fit —
 *   never as questions. `@calepin/bible`'s contract has no field for either,
 *   so the model is not being trusted here, it is being told.
 * - **A counter-theme opposes its theme.** They arrive paired, because that is
 *   the only way *contre-thème* means anything more than *deuxième thème*.
 * - **One number, one place** (CAL-055): every word target and list bound
 *   arrives as a variable owned by `@calepin/bible`.
 *
 * The freedom clauses quoted are the **bible** stage's, and its stage rule is
 * this mission's requirement in the repository's own words: *toute entrée de
 * la bible portant sur une dimension conservée est traçable au texte source ou
 * à la direction retenue*. The rule shipped with CAL-044; this is the first
 * mission held to it.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "define-novel-identity",
  version: 1,
  scope: { kind: "mission", missionId: "define-novel-identity" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "targetAudience",
      type: "text",
      description:
        "The project's target readership, as the author declared it — a constraint the identity fits, never a field the answer carries.",
    },
    {
      name: "targetWordCount",
      type: "number",
      description:
        "The novel's target length in words, resolved from the project — a constraint, never a field the answer carries.",
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
        "The ask itself: one entry per citable passage — its key, its French label and the passage — the canonical direction field by field, then the validated analysis section by section. The only corpus the answer may quote, and the only keys it may name.",
    },
    {
      name: "minThemes",
      type: "number",
      description: "Thematic axes the identity must at least declare — the domain's floor.",
    },
    {
      name: "maxThemes",
      type: "number",
      description: "Thematic axes the identity stays under — the domain's ceiling, never a quota.",
    },
    {
      name: "toneWordTarget",
      type: "number",
      description: "Words the tone should come to.",
    },
    {
      name: "promiseWordTarget",
      type: "number",
      description: "Words the narrative promise should come to.",
    },
    {
      name: "questionWordTarget",
      type: "number",
      description: "Words the central question should come to.",
    },
    {
      name: "endingWordTarget",
      type: "number",
      description: "Words the nature of the ending should come to.",
    },
    {
      name: "themeWordTarget",
      type: "number",
      description: "Words one theme or counter-theme should come to — a phrase, not a paragraph.",
    },
    {
      name: "justificationWordTarget",
      type: "number",
      description: "Words one basis's argument should come to.",
    },
    {
      name: "quotationWordTarget",
      type: "number",
      description:
        "Words one cited passage stays under — a quotation anchors, it does not reproduce.",
    },
  ],
  system: [
    "Tu es directeur littéraire. Un auteur a retenu une direction romanesque pour son texte, et son analyse a été validée. Tu établis l'identité du roman : la première section de sa bible, celle que toutes les autres liront.",
    "Tu écris en {{language}}. Les noms propres et les termes du texte source restent tels que le texte les écrit.",
    "Ton travail n'est pas d'inventer un roman : il est de transposer celui qui a déjà été choisi. Chaque champ que tu écris doit tenir dans ce que la direction retenue et l'analyse validée contiennent réellement.",
    "Chaque champ est donc accompagné de ce sur quoi il repose : un passage précis, cité mot pour mot, et la raison pour laquelle ce passage le motive. Un champ que rien n'appuie est une invention, et une invention à ce stade se propage à tout le roman.",
    "Tu apprécies, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Établis l'identité du roman à partir des éléments ci-dessous.",
    "",
    "Deux données sont déjà fixées par l'auteur et ne sont pas de ton ressort : le roman vise environ {{targetWordCount}} mots et s'adresse à ce lectorat — {{targetAudience}}. Ne les redéclare pas : l'identité que tu écris doit leur convenir, c'est tout.",
    "",
    "Contraintes de fidélité au texte source — elles s'imposent à toute entrée de la bible :",
    "{{freedomConstraints}}",
    "",
    "Les passages que tu peux citer — la direction retenue puis l'analyse validée. Chaque entrée donne sa clé, ce qu'elle est, puis le passage lui-même :",
    "{{citableSources}}",
    "",
    "Chaque champ de ta réponse porte un objet « basis » à trois parties :",
    "- « sourceKey » : la clé de l'un des passages ci-dessus, telle qu'elle est écrite. Une clé qui n'y figure pas fait refuser toute la réponse.",
    "- « quotation » (au plus {{quotationWordTarget}} mots) : un fragment copié mot pour mot depuis ce passage-là. Il est relu mécaniquement dans ce passage précis : une citation recomposée de mémoire, raccourcie par des points de suspension, ou tirée d'un autre passage que celui que tu nommes, fait refuser toute la réponse. Quand le passage idéal ne te revient pas exactement, cite celui que tu as sous les yeux — même s'il appuie moins bien.",
    "- « justification » (environ {{justificationWordTarget}} mots) : pourquoi ce passage motive ce champ. L'argument, jamais une note.",
    "",
    "Ta réponse est un unique objet JSON comportant :",
    "- « workingTitle » : le titre provisoire — court, singulier, jamais générique. Il peut reprendre celui de la direction ou le resserrer.",
    "- « genre » : le genre dominant, nommé court.",
    "- « subGenre » : le sous-genre, plus précis que le genre et jamais sa répétition.",
    "- « tone » (environ {{toneWordTarget}} mots) : la tonalité — ce que la lecture fait éprouver, et par quels moyens. Pas une file d'adjectifs.",
    "- « narrativePromise » (environ {{promiseWordTarget}} mots) : la promesse narrative — ce que le roman s'engage à donner au lecteur qui l'ouvre, et qu'il aura tenu à la dernière page.",
    "- « thematicAxes » — de {{minThemes}} à {{maxThemes}} axes : chacun porte « theme » et « counterTheme » (environ {{themeWordTarget}} mots chacun, avec sa propre « basis »). Le contre-thème est la force qui s'oppose à ce thème-là dans ce roman-là — pas un second thème, pas sa négation abstraite. Un axe dont le contre-thème pourrait accompagner n'importe quel thème n'est pas un axe.",
    "- « centralQuestion » (environ {{questionWordTarget}} mots) : la question centrale du roman, écrite comme une question et terminée par un point d'interrogation. Une seule question, à laquelle la fin répond ou refuse de répondre.",
    "- « endingNature » (environ {{endingWordTarget}} mots) : le type de fin envisagé — sa nature, ce qu'elle résout, ce qu'elle coûte. Jamais son déroulé.",
    "",
    "Ne déclare ni public, ni longueur, ni aucun champ que cette liste ne nomme.",
    "Aucun chiffre d'évaluation nulle part : ni note, ni score, ni pourcentage. La longueur visée et un nombre que le texte lui-même écrit peuvent être nommés ; aucun nombre ne mesure une qualité.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const DEFINE_NOVEL_IDENTITY_PROMPTS = [V1] as const;
