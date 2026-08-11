/**
 * `relate-characters` — the directed graph of one bible's cast (CAL-091).
 *
 * Written against `characterRelationsSchema` in `@calepin/bible`, whose shape
 * already carries the acceptance criterion: an edge is one direction, and an
 * asymmetry is a statement plus two stances that the contract refuses unless
 * they decide one world and two different beliefs. What is left to the prompt
 * is making the model use those shapes for what they are for. Its organising
 * ideas:
 *
 * - **The pair is the unit of thought, the edge is the unit of answer.** The
 *   model is told to consider two characters at once and then to write each
 *   side separately, because the interesting cases are the ones where the two
 *   sides disagree — and a model asked for "the relationship between A and B"
 *   answers with one reconciled tie every time.
 * - **The missing side is a legitimate answer.** The prompt says outright that
 *   a tie declared in one direction only is wanted, not an oversight to fix.
 *   Without that sentence a model completes every pair, and the product loses
 *   the state CAL-099 exists to detect.
 * - **An asymmetry is written for the coherence engine**, `create-character-sheet`'s
 *   device one scope up: the statement is affirmative, atomic and **true in
 *   the world**, and the drama lives in the two stances, never in a negation.
 *   That is what the contract's two checks enforce, and the prompt states them
 *   in the same words so a refusal is never a surprise.
 * - **The cast is a closed vocabulary** (CAL-084/088's device): both ends of
 *   every edge name a character the ask offered, by their exact name, never an
 *   id. `verifyCharacterRelations` reads the answer back, so an invented
 *   neighbour is dropped rather than believed.
 * - **One number, one place** (CAL-055): every word target and list bound
 *   arrives as a variable owned by `@calepin/bible`.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "relate-characters",
  version: 1,
  scope: { kind: "mission", missionId: "relate-characters" },
  variables: [
    {
      name: "language",
      type: "text",
      description: "The project's language — the language every field is written in.",
    },
    {
      name: "freedomConstraints",
      type: "list",
      description: "The bible-stage clauses of the project's freedom level.",
    },
    {
      name: "citableSources",
      type: "list",
      description:
        "The corpus the graph answers to: the canonical direction, the bible's identity and style, the validated analysis. Key, label, passage.",
    },
    {
      name: "cast",
      type: "list",
      description:
        "The characters of the bible: exact name, then one line. The only names an edge may use, at either end.",
    },
    {
      name: "relationshipTypes",
      type: "list",
      description: "The closed tie vocabulary — identifier and French gloss.",
    },
    {
      name: "knowledgeStances",
      type: "list",
      description: "The closed stance vocabulary — identifier and French gloss.",
    },
    {
      name: "descriptionWordTarget",
      type: "number",
      description: "Words for what holds from one side of a tie only.",
    },
    {
      name: "asymmetryWordTarget",
      type: "number",
      description: "Words for one asymmetry's statement.",
    },
    {
      name: "maxRelations",
      type: "number",
      description: "The most directed edges one answer may declare.",
    },
    {
      name: "maxAsymmetries",
      type: "number",
      description: "The most asymmetries one edge may carry.",
    },
  ],
  system: [
    "Tu es directeur littéraire, chargé du réseau de personnages d'un roman en préparation. La direction est retenue, l'identité, le style et les fiches de personnages sont établis. Tu écris ce qui lie ces personnages entre eux.",
    "Tu écris en {{language}}. Les noms propres restent exactement tels que la liste des personnages les écrit.",
    "Un lien se déclare d'un côté à la fois. Ce que A pense de B n'est pas ce que B pense de A, et c'est de cet écart que vit un roman : le lecteur sait ce qu'un personnage ignore. Tu réfléchis par paires, tu réponds par côtés.",
    "Tu décris, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme, et aucun chiffre nulle part.",
  ].join("\n"),
  instruction: [
    "Établis le réseau des liens entre les personnages ci-dessous.",
    "",
    "Contraintes de fidélité au texte source — elles s'imposent à toute entrée de la bible :",
    "{{freedomConstraints}}",
    "",
    "Ce sur quoi le réseau doit rester appuyé — la direction retenue, l'identité du roman, sa section style, puis l'analyse validée. Chaque entrée donne sa clé, ce qu'elle est, puis le passage lui-même :",
    "{{citableSources}}",
    "Ne contredis rien de ce qui est déjà établi.",
    "",
    "Les personnages — le nom exact, puis une ligne. Les deux extrémités de chaque lien ne peuvent nommer que ces personnages-là, par leur nom exact :",
    "{{cast}}",
    "",
    "Procède paire par paire. Pour chaque paire que le roman fait exister, demande-toi séparément ce que le premier tient du second, puis ce que le second tient du premier. Trois réponses sont légitimes, et la deuxième autant que les autres :",
    "- les deux côtés déclarent le même lien ;",
    "- un seul côté déclare quelque chose — l'autre ne sait rien, ne reconnaît rien, ou n'y attache aucune importance. C'est un état recherché, jamais un oubli à réparer : ne complète pas un lien pour le rendre symétrique ;",
    "- les deux côtés déclarent un lien, mais pas le même : l'un parle d'alliance là où l'autre parle de rivalité.",
    "Ne relie pas toutes les paires. Un réseau où chacun tient à chacun ne dit rien.",
    "",
    "Ta réponse est un unique objet JSON comportant « relations » : au plus {{maxRelations}} liens orientés. Chaque lien est un objet :",
    "- « fromCharacterName » : le nom exact du personnage depuis lequel le lien est écrit.",
    "- « toCharacterName » : le nom exact du personnage vers lequel il va — jamais le même que le précédent.",
    "- « type » : l'un de :",
    "{{relationshipTypes}}",
    "- « label » : le lien depuis le premier personnage, en une expression (« demi-frère de », « ancienne associée de »).",
    "- « description » (environ {{descriptionWordTarget}} mots, ou null) : ce que ce personnage-là seul sait, croit ou ressent de l'autre. Écris-la de son côté uniquement ; si le lien se suffit du libellé, mets null.",
    "- « asymmetries » : au plus {{maxAsymmetries}} entrées, et le plus souvent aucune. N'en déclare que lorsque le roman en dépend vraiment ; un secret inventé pour remplir une case coûte plus qu'il ne rapporte.",
    "",
    "Une asymétrie est ce que l'un tient du sujet du lien et que l'autre ne tient pas. C'est un objet :",
    "- « statement » (environ {{asymmetryWordTarget}} mots) : un seul fait, affirmatif, autonome, et **vrai dans le monde du roman**. Il nomme ce qu'il concerne et se comprend hors de cette fiche. Jamais une négation, jamais une croyance formulée comme telle : n'écris pas « A croit à tort que B l'a trahi », écris le fait vrai — « B est resté loyal envers A » — et laisse les postures dire le reste.",
    "- « holderStance » : la posture du personnage d'où part le lien, face à cet énoncé.",
    "- « subjectStance » : la posture du personnage vers lequel il va, face au même énoncé.",
    "Les postures sont l'une de :",
    "{{knowledgeStances}}",
    "Les deux postures doivent différer — deux personnages qui se tiennent pareil devant un énoncé ne forment aucune asymétrie — et toutes deux doivent tenir l'énoncé pour vrai dans le monde, ce qui est déjà acquis si tu l'as écrit affirmatif et vrai. Le cas type : l'un sait, l'autre ignore.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const RELATE_CHARACTERS_PROMPTS = [V1] as const;
