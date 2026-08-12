/**
 * `define-world` — the world section of the bible, and the bounds on what it
 * permits (CAL-092).
 *
 * The contract (`worldBibleSchema` in `@calepin/bible`) already makes the
 * forbidden answer unrepresentable: an out-of-norm capability has three
 * non-empty bound lists and no `isSupernatural` flag to lower, so *declared
 * without limits* is not a value a model can produce. What is left to the
 * prompt is the one thing a shape cannot decide — **which array an element
 * belongs in** — and making the bounds real rather than decorative. Its
 * organising ideas:
 *
 * - **The classification is the prompt's whole job.** A model can satisfy the
 *   schema and still evade it by writing a power up as an ordinary rule, since
 *   that shape asks for no bounds. So the instruction defines the boundary by
 *   what a thing *does*, not by whether it feels magical: anything a person or
 *   an object can do that ordinary reality does not allow is a capability,
 *   whatever its dressing — a technology, an institution's reach, a talent no
 *   training explains. That is the backlog's own *élément surnaturel ou
 *   capacité hors norme*, and it closes the one gap the shape leaves.
 * - **What a rule forbids is the test of the rule** — `define-style`'s device,
 *   one section over. A rule whose prohibition cannot be written is decor, and
 *   the instruction says to rewrite it rather than to keep it. It is also the
 *   second guard on the classification: a power smuggled in as a rule must
 *   still state what it cannot do, which is where a reader sees the misfiling.
 * - **The three bounds answer three different questions**, and the instruction
 *   keeps them apart: what it cannot do at any price, what it takes from
 *   whoever uses it, and when it fails outright. A model that pads one from
 *   another is caught mechanically (`verifyWorldBible`), so the prompt spends
 *   its words on making them distinct rather than on demanding quantity.
 * - **The reason is named, not implied.** The instruction says plainly why the
 *   bounds are asked for: so that a later resolution leaning on the power can
 *   be recognised as a convenience. A constraint whose purpose is stated is
 *   answered better than one that arrives as a form to fill.
 * - **An empty world is a legitimate answer.** Most novels have no out-of-norm
 *   capability, and the instruction says so — otherwise the floor of zero in
 *   the contract is read as an invitation to invent magic in a realist novel.
 * - **One number, one place** (CAL-055): every word target and list bound
 *   arrives as a variable owned by `@calepin/bible`.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "define-world",
  version: 1,
  scope: { kind: "mission", missionId: "define-world" },
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
        "One entry per passage the world stays answerable to — its key, its French label and the passage: the canonical direction field by field, the identity section, then the validated analysis section by section. Context, not a citation vocabulary: no basis is asked of the answer.",
    },
    {
      name: "eraWordTarget",
      type: "number",
      description: "Words the era should come to — when the novel is set, and against what.",
    },
    {
      name: "contextWordTarget",
      type: "number",
      description: "Words each of the social and political contexts should come to.",
    },
    {
      name: "placeWordTarget",
      type: "number",
      description: "Words one place's description should come to.",
    },
    {
      name: "ruleWordTarget",
      type: "number",
      description: "Words one rule of the world should come to — a clause, not a paragraph.",
    },
    {
      name: "forbidsWordTarget",
      type: "number",
      description: "Words the prohibition attached to a rule should come to.",
    },
    {
      name: "capabilityWordTarget",
      type: "number",
      description: "Words one out-of-norm capability's statement should come to.",
    },
    {
      name: "boundWordTarget",
      type: "number",
      description: "Words one limit, one cost or one failure condition should come to.",
    },
    {
      name: "constraintWordTarget",
      type: "number",
      description: "Words one constraint of the world should come to.",
    },
    {
      name: "consequenceWordTarget",
      type: "number",
      description: "Words the price of ignoring a constraint should come to.",
    },
    {
      name: "minPlaces",
      type: "number",
      description: "Places the world must at least declare — the domain's floor.",
    },
    {
      name: "maxPlaces",
      type: "number",
      description: "Places the world stays under — the domain's ceiling, never a quota.",
    },
    {
      name: "minRules",
      type: "number",
      description: "Rules the world must at least declare — the domain's floor.",
    },
    {
      name: "maxRules",
      type: "number",
      description: "Rules the world stays under — the domain's ceiling, never a quota.",
    },
    {
      name: "minConstraints",
      type: "number",
      description: "Constraints the world must at least declare — the domain's floor.",
    },
    {
      name: "maxConstraints",
      type: "number",
      description: "Constraints the world stays under — the domain's ceiling.",
    },
    {
      name: "maxTechnologies",
      type: "number",
      description: "Technologies the world stays under — the domain's ceiling.",
    },
    {
      name: "maxInstitutions",
      type: "number",
      description: "Institutions the world stays under — the domain's ceiling.",
    },
    {
      name: "maxCapabilities",
      type: "number",
      description:
        "Out-of-norm capabilities the world stays under — the domain's ceiling. The floor is zero, deliberately.",
    },
    {
      name: "maxBounds",
      type: "number",
      description: "Entries each of a capability's three bound lists stays under.",
    },
  ],
  system: [
    "Tu es directeur littéraire. Un auteur a retenu une direction romanesque et l'identité de son roman est établie. Tu écris la section monde de sa bible : l'époque, les lieux, ce qui organise la vie des personnages, et ce que ce monde permet ou refuse.",
    "Tu écris en {{language}}. Les noms propres et les termes du texte source restent tels que le texte les écrit.",
    "Tu n'écris pas une encyclopédie : tu écris ce dont le roman a besoin. Un monde utile n'est pas un monde complet, c'est un monde dont on sait ce qu'il interdit.",
    "Tu apprécies, tu ne notes jamais : aucun score, aucune note, aucun pourcentage, aucun classement, sous aucune forme.",
  ].join("\n"),
  instruction: [
    "Établis la section monde du roman à partir des éléments ci-dessous.",
    "",
    "Contraintes de fidélité au texte source — elles s'imposent à toute entrée de la bible :",
    "{{freedomConstraints}}",
    "",
    "Ce sur quoi le monde doit rester appuyé — la direction retenue, l'identité du roman, puis l'analyse validée. Chaque entrée donne sa clé, ce qu'elle est, puis le passage lui-même :",
    "{{citableSources}}",
    "",
    "Ta réponse est un unique objet JSON comportant :",
    "- « era » (environ {{eraWordTarget}} mots) : quand le roman se passe, et ce qui date ce moment plutôt qu'un autre.",
    "- « socialContext » (environ {{contextWordTarget}} mots) : comment on vit ensemble — le travail, les rangs, les croyances, ce qui est ordinaire et ce qui ne l'est pas.",
    "- « politicalContext » (environ {{contextWordTarget}} mots) : qui détient le pouvoir et comment il se conteste. Écris null, et rien d'autre, si le roman ne s'y joue pas : un contexte politique inventé pour remplir la case est une fausse piste que la suite prendra au sérieux.",
    "- « technologies » — jusqu'à {{maxTechnologies}} entrées : ce dont on dispose, nommé pour ce que cela change à ce qui est possible.",
    "- « institutions » — jusqu'à {{maxInstitutions}} entrées : ce qui a prise sur les personnages, nommé pour la prise que cela a.",
    "- « constraints » — de {{minConstraints}} à {{maxConstraints}} entrées, chacune à deux parties : « statement » (environ {{constraintWordTarget}} mots), ce que le monde rend difficile ou impossible, et « consequence » (environ {{consequenceWordTarget}} mots), ce qu'il en coûte au personnage qui passe outre. Une contrainte sans conséquence ne contraint rien : le récit la traversera sans la voir.",
    "- « places » — de {{minPlaces}} à {{maxPlaces}} lieux, chacun avec « name », le nom que les chapitres citeront, et « description » (environ {{placeWordTarget}} mots), ce que le récit a besoin de savoir de ce lieu.",
    "- « worldRules » — de {{minRules}} à {{maxRules}} règles, chacune avec « name », un intitulé court, « statement » (environ {{ruleWordTarget}} mots), la règle à l'indicatif, portant sur le monde, et « forbids » (environ {{forbidsWordTarget}} mots), ce que cette règle rend impossible.",
    "- « outOfNormCapabilities » — de 0 à {{maxCapabilities}} éléments. Voir plus bas.",
    "",
    "« forbids » est le test de la règle : si tu ne peux pas l'écrire, ta règle décrit le décor et ne règle rien — réécris-la jusqu'à ce qu'elle interdise quelque chose d'observable dans une scène.",
    "",
    "Ce qui va dans « outOfNormCapabilities », et ce qui n'y va pas. Y va tout ce qu'une personne ou un objet peut faire et que la réalité ordinaire n'autorise pas : une magie, un don, une technologie qui dépasse ce que son époque permet, une institution dont la portée n'a pas d'équivalent réel. La question n'est pas de savoir si cela se présente comme surnaturel, mais si cela permet quelque chose d'impossible autrement.",
    "Si le roman se tient entièrement dans le monde ordinaire, réponds par une liste vide. C'est le cas le plus fréquent, et c'est une bonne réponse : n'invente pas d'élément hors norme pour remplir la liste.",
    "",
    "Chaque élément hors norme comporte :",
    "- « name » : un intitulé court, distinct de tous les autres noms de règles et d'éléments.",
    "- « statement » (environ {{capabilityWordTarget}} mots) : ce qu'il permet, dit franchement, sans atténuer.",
    "- « limits » — jusqu'à {{maxBounds}} entrées d'environ {{boundWordTarget}} mots : ce qu'il ne peut pas faire, quel qu'en soit le prix payé.",
    "- « costs » — jusqu'à {{maxBounds}} entrées : ce que son usage prend à celui qui s'en sert, et qu'il ne récupère pas aussitôt.",
    "- « failureConditions » — jusqu'à {{maxBounds}} entrées : les circonstances dans lesquelles il ne fonctionne pas du tout.",
    "Ces trois listes répondent à trois questions différentes et ne doivent pas se recopier : un plafond n'est pas un prix, et un prix n'est pas une panne. Chacune doit contenir au moins une entrée réelle.",
    "",
    "Pourquoi ces bornes sont exigées : plus tard, un chapitre pourra dénouer une situation en se servant de cet élément. Il faudra alors pouvoir dire si le dénouement était gagné ou s'il est arrivé par commodité. Cela n'est possible que si l'on sait à l'avance ce que l'élément ne peut pas faire, ce qu'il coûte et quand il échoue. Une puissance sans bornes rend toute résolution acceptable, donc aucune vérifiable.",
    "Écris donc des bornes dont un lecteur pourrait se servir contre toi : une limite qui gêne réellement, un coût qui pèse, une défaillance qui peut survenir au pire moment.",
    "",
    "Tout ce que tu déclares doit servir le roman que la direction retenue annonce. N'ajoute ni lieu, ni règle, ni institution dont aucune scène n'aura l'usage.",
    "Aucun chiffre d'évaluation nulle part : ni note, ni score, ni pourcentage. Un nombre peut décrire le monde — une date, une distance, un nombre d'habitants — jamais en mesurer la qualité.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const DEFINE_WORLD_PROMPTS = [V1] as const;
