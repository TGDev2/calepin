/**
 * `create-character-sheet` — one `Character`, which in this product *is* the
 * sheet (CAL-016).
 *
 * V1 predates the contract and stays, per the append-only rule: a recorded
 * `promptVersion` must keep pointing at fixed text. V2 is CAL-090's, written
 * against `conflictedCharacterSheetSchema` in `@calepin/bible`, whose shape
 * already carries the four quality requirements as pairs and typed entries.
 * What is left to the prompt is making the model fill those shapes honestly.
 * Its organising ideas:
 *
 * - **Each second half is the test of the first** — `define-style`'s device,
 *   three times: the divergence proves the need is not the desire restated,
 *   the dilemma proves the contradiction is active, the breach proves the
 *   voice is not interchangeable. If the test half cannot be written, the
 *   first half is fake and must be rewritten.
 * - **The enemy is named.** The specification lists the *personnage uniquement
 *   fonctionnel* among the defects to detect; the system prompt names it and
 *   makes the role the thing the sheet must exceed. The importance is the
 *   author's and scales the character's share of the novel, never the
 *   sheet's quality bar.
 * - **The cast is a closed vocabulary.** Relationships may only name
 *   established characters the ask offered, by their exact names, outgoing
 *   side only — `verifyCharacterSheet` reads the answer back against the
 *   ask, so an invented neighbour is dropped rather than believed.
 * - **Knowledge is written for the coherence engine.** One affirmative,
 *   atomic, self-contained fact per entry, plus a stance from the closed
 *   vocabulary the domain glosses — what CAL-094 derives canon facts and
 *   beliefs from, by copy.
 * - **One number, one place** (CAL-055): every word target and list bound
 *   arrives as a variable owned by `@calepin/bible`. The one number the
 *   answer may contain is the age, which counts years, never quality.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "create-character-sheet",
  version: 1,
  scope: { kind: "mission", missionId: "create-character-sheet" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "direction",
      type: "text",
      description: "The project's canonical direction, composed by the caller.",
    },
    {
      name: "bibleIdentity",
      type: "text",
      description: "The bible's identity section as it stands.",
    },
    {
      name: "characterBrief",
      type: "text",
      description: "What the author asked of this character: name, role, anything already fixed.",
    },
    {
      name: "establishedCharacters",
      type: "list",
      description: "The characters already in the bible, one line each, for consistency.",
    },
  ],
  system: [
    "Tu construis les personnages d'un roman en préparation, à partir de sa direction et de sa bible narrative.",
    "Tu écris en {{language}}.",
    "Un personnage utile à l'écriture a un désir, un obstacle et une contradiction ; une liste de qualités n'est pas un personnage.",
  ].join("\n"),
  instruction: [
    "Construis la fiche du personnage demandé ci-dessous.",
    "",
    "Demande de l'auteur :",
    "{{characterBrief}}",
    "",
    "Personnages déjà établis :",
    "{{establishedCharacters}}",
    "",
    "Reste compatible avec la direction et avec la bible : ne contredis rien de ce qui est déjà établi, et ne réattribue à ce personnage ce qui appartient à un autre.",
    "Ne retiens que ce dont l'écriture aura besoin ; un détail biographique sans conséquence sur le récit n'a pas sa place dans la fiche.",
    "",
    "Direction du roman :",
    "{{direction}}",
    "",
    "Bible — identité :",
    "{{bibleIdentity}}",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

const V2 = {
  id: "create-character-sheet",
  version: 2,
  scope: { kind: "mission", missionId: "create-character-sheet" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "importance",
      type: "text",
      description:
        "The character's importance as the author fixed it — the French label from CHARACTER_IMPORTANCE_LABELS, never the enum member.",
    },
    {
      name: "imposedName",
      type: "list",
      description:
        "The imposed name as a zero-or-one-entry list: empty when the ask leaves the model to propose one.",
    },
    {
      name: "characterBrief",
      type: "list",
      description:
        "The author's brief as a zero-or-one-entry list: empty when the ask carries none and the corpus says it all.",
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
        "One entry per passage the sheet stays answerable to — its key, its French label and the passage: the canonical direction field by field, the identity section, the style section, then the validated analysis section by section. Context, not a citation vocabulary: no basis is asked of the answer.",
    },
    {
      name: "establishedCharacters",
      type: "list",
      description:
        "The characters already in the bible, one line each: the exact name, then the summary. The only names a relationship may use.",
    },
    {
      name: "knowledgeStances",
      type: "list",
      description:
        "The closed stance vocabulary, one entry per member: the identifier, then the domain's French gloss (CHARACTER_KNOWLEDGE_STANCE_LABELS).",
    },
    {
      name: "relationshipTypes",
      type: "list",
      description:
        "The closed relationship-type vocabulary, one entry per member: the identifier, then the domain's French gloss (CHARACTER_RELATIONSHIP_TYPE_LABELS).",
    },
    {
      name: "appearanceWordTarget",
      type: "number",
      description: "Words the appearance should come to — what a scene can show, never a portrait.",
    },
    {
      name: "situationWordTarget",
      type: "number",
      description: "Words the initial situation should come to.",
    },
    {
      name: "desireWordTarget",
      type: "number",
      description: "Words the apparent desire should come to.",
    },
    {
      name: "needWordTarget",
      type: "number",
      description: "Words the deep need should come to.",
    },
    {
      name: "divergenceWordTarget",
      type: "number",
      description: "Words the divergence should come to — what pursuing the desire costs the need.",
    },
    { name: "fearWordTarget", type: "number", description: "Words the fear should come to." },
    {
      name: "tensionWordTarget",
      type: "number",
      description: "Words the contradiction's tension should come to.",
    },
    {
      name: "dilemmaWordTarget",
      type: "number",
      description: "Words the dilemma should come to — one concrete costly choice.",
    },
    { name: "secretWordTarget", type: "number", description: "Words the secret should come to." },
    {
      name: "pastWordTarget",
      type: "number",
      description: "Words the past should come to — only what the writing will use.",
    },
    {
      name: "arcWordTarget",
      type: "number",
      description: "Words the planned evolution should come to.",
    },
    {
      name: "voiceWordTarget",
      type: "number",
      description: "Words the voice should come to — register, rhythm, tics.",
    },
    {
      name: "breachWordTarget",
      type: "number",
      description: "Words the breach should come to — what this character would never say.",
    },
    {
      name: "knowledgeWordTarget",
      type: "number",
      description: "Words one knowledge statement should come to — one atomic fact.",
    },
    {
      name: "preserveWordTarget",
      type: "number",
      description: "Words one element to preserve should come to.",
    },
    {
      name: "relationDescriptionWordTarget",
      type: "number",
      description: "Words one relationship description should come to — the one-sided half.",
    },
    {
      name: "minKnowledge",
      type: "number",
      description: "Knowledge entries the sheet must at least carry — the domain's floor.",
    },
    {
      name: "maxKnowledge",
      type: "number",
      description: "Knowledge entries the sheet stays under — the domain's ceiling, never a quota.",
    },
    {
      name: "minPreserve",
      type: "number",
      description: "Elements to preserve the sheet must at least propose — the domain's floor.",
    },
    {
      name: "maxPreserve",
      type: "number",
      description: "Elements to preserve the sheet stays under — the domain's ceiling.",
    },
    {
      name: "maxRelationships",
      type: "number",
      description: "Relationships the sheet stays under — it may declare none.",
    },
  ],
  system: [
    "Tu es directeur littéraire, chargé du casting d'un roman en préparation. La direction est retenue, l'identité et le style de la bible sont établis. Tu écris la fiche d'un personnage : le document que la rédaction rouvrira à chaque scène où il paraît.",
    "Tu écris en {{language}}. Les noms propres et les termes du texte source restent tels que le texte les écrit.",
    "Le défaut que cette fiche existe à refuser est le « personnage uniquement fonctionnel » : celui qui n'est que son rôle. Un personnage tient quand ce qu'il veut, ce dont il a besoin et ce qu'il cache tirent dans des directions différentes ; une liste de qualités n'est pas un personnage.",
    "Tu apprécies, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Construis la fiche du personnage demandé ci-dessous.",
    "",
    "Nom imposé par l'auteur — si cette liste est vide, propose un nom, qui n'appartienne à aucun personnage établi :",
    "{{imposedName}}",
    "",
    "L'importance du personnage est fixée par l'auteur : {{importance}}. Tu la sers, tu ne la rediscutes pas — elle règle la part du roman qui repose sur lui, jamais l'exigence de la fiche : chaque fiche, jusqu'au personnage mineur, porte un désir, un besoin distinct et une contradiction active.",
    "",
    "Demande de l'auteur — si cette liste est vide, le corpus ci-dessous dit tout :",
    "{{characterBrief}}",
    "",
    "Contraintes de fidélité au texte source — elles s'imposent à toute entrée de la bible :",
    "{{freedomConstraints}}",
    "",
    "Ce sur quoi la fiche doit rester appuyée — la direction retenue, l'identité du roman, sa section style, puis l'analyse validée. Chaque entrée donne sa clé, ce qu'elle est, puis le passage lui-même :",
    "{{citableSources}}",
    "La section style légifère la prose du roman ; la voix de ce personnage doit pouvoir y vivre. Ne contredis rien de ce qui est déjà établi.",
    "",
    "Personnages déjà établis — le nom exact, puis une ligne :",
    "{{establishedCharacters}}",
    "Ne réattribue à ce personnage rien de ce qui appartient à un autre, et donne-lui une voix qu'aucun personnage établi ne pourrait tenir. Les relations de la fiche ne peuvent nommer que ces personnages-là, par leur nom exact.",
    "",
    "Ta réponse est un unique objet JSON comportant :",
    "- « name » : le nom du personnage — l'imposé tel quel, ou ta proposition.",
    "- « age » : l'âge en années au jour où le roman s'ouvre — un entier, ou null quand l'âge n'est pas un fait utile au récit.",
    "- « role » : la fonction narrative, nommée en une expression — ce que la fiche doit déborder, jamais tout ce qu'elle est.",
    "- « appearance » (environ {{appearanceWordTarget}} mots) : l'apparence utile au récit — ce qu'une scène peut montrer, ce que les autres remarquent ; jamais un portrait complet.",
    "- « initialSituation » (environ {{situationWordTarget}} mots) : où il en est quand le roman s'ouvre.",
    "- « apparentDesire » (environ {{desireWordTarget}} mots) : ce qu'il dit vouloir et poursuit visiblement.",
    "- « deepNeed », un objet à deux parties : « need » (environ {{needWordTarget}} mots) — ce qui le résoudrait vraiment — et « divergence » (environ {{divergenceWordTarget}} mots) — ce que la poursuite du désir coûte à ce besoin. La « divergence » est le test des deux : si tu ne peux pas l'écrire, le besoin répète le désir — creuse jusqu'à ce qu'ils divergent.",
    "- « fear » (environ {{fearWordTarget}} mots) : la peur qui gouverne ses refus.",
    "- « contradiction », un objet à deux parties : « tension » (environ {{tensionWordTarget}} mots) — les deux forces qui se partagent le personnage — et « dilemma » (environ {{dilemmaWordTarget}} mots) — une situation concrète où il doit choisir et où chaque branche coûte. Le « dilemma » est le test de la contradiction : une contradiction qui ne force aucun choix coûteux est un trait de caractère, pas une contradiction.",
    "- « secret » (environ {{secretWordTarget}} mots) : ce qu'il cache, et ce qu'il paierait pour que cela reste caché.",
    "- « past » (environ {{pastWordTarget}} mots) : le passé qui l'a produit — seulement ce dont l'écriture aura besoin ; un détail biographique sans conséquence sur le récit n'a pas sa place dans la fiche.",
    "- « plannedArc » (environ {{arcWordTarget}} mots) : l'évolution prévue sur la durée du roman — d'où il part, par où il passe, où il arrive.",
    "- « speechStyle », un objet à deux parties : « voice » (environ {{voiceWordTarget}} mots) — comment il parle : registre, rythme, tics, ce qu'il convoque, assez précisément pour qu'une réplique lui soit attribuable sans son nom devant — et « breach » (environ {{breachWordTarget}} mots) — ce qu'il ne dirait jamais, ou la manière dont il ne le dirait jamais, décidable sur une seule réplique. Le « breach » est le test de la voix : si tu ne peux pas écrire ce qui la trahirait, la voix est interchangeable — réécris-la.",
    "- « heldKnowledge » — de {{minKnowledge}} à {{maxKnowledge}} entrées : ce que le personnage tient en tête, écrit pour le contrôle de cohérence. Chaque entrée est un objet : « statement » (environ {{knowledgeWordTarget}} mots) — un seul fait, affirmatif, autonome : il nomme ce qu'il concerne et se comprend hors de la fiche ; jamais une négation, jamais l'état lui-même — et « stance », l'un de :",
    "{{knowledgeStances}}",
    "Privilégie les connaissances asymétriques : ce que ce personnage sait, croit ou ignore que d'autres non.",
    "- « elementsToPreserve » — de {{minPreserve}} à {{maxPreserve}} éléments (environ {{preserveWordTarget}} mots chacun) : ce que le roman ne doit pas modifier de ce personnage — une proposition, que l'auteur validera ou verrouillera.",
    "- « relationships » — au plus {{maxRelationships}} relations, éventuellement aucune : les liens de ce personnage vers les personnages établis, de son côté seulement. Chaque relation est un objet : « characterName » — le nom exact d'un personnage établi, aucun autre ; « type » — l'un de :",
    "{{relationshipTypes}}",
    "« label » — le lien depuis ce personnage (« père de », « ancienne associée de ») ; « description » (environ {{relationDescriptionWordTarget}} mots, ou null) — ce que lui seul sait, croit ou ressent de l'autre, qui n'est pas forcément réciproque.",
    "",
    "Aucun chiffre d'évaluation nulle part : ni note, ni score, ni pourcentage. Le seul nombre de la fiche est l'âge, et il compte des années.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const CREATE_CHARACTER_SHEET_PROMPTS = [V1, V2] as const;
