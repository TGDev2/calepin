/**
 * `regenerate-analysis-section` — one section redone, with the author looking
 * over the model's shoulder (CAL-077).
 *
 * The diagnostic's own mission produces seventeen sections cold. This one is
 * asked after the author has read the answer and found one section wanting: it
 * sees what that section currently says, it may be given a word about what to
 * do differently, and it answers with that section alone.
 *
 * V1's organising ideas:
 *
 * - **One section, and the refusal to touch the others.** The system message
 *   says it and the schema enforces it — the answer is the section's own
 *   contract, so there is nowhere for a sixteenth opinion to go. Stated to the
 *   model anyway, because a model that believes it is improving the diagnostic
 *   will offer the improvement somewhere.
 * - **The author's instruction governs, and is not a licence.** It arrives as
 *   `authorInstruction`, and the prompt gives it authority over the *angle* of
 *   the section while leaving the source text sovereign over its content: a
 *   request to find more themes cannot manufacture a theme the text does not
 *   carry, and saying so is the honest answer. Without that clause a
 *   complementary instruction is an invitation to invent, which is the one
 *   thing this product must not do with somebody's own text.
 * - **A regeneration is not a paraphrase.** The current section is shown so
 *   the answer can differ from it deliberately rather than by accident —
 *   returning it reworded is the failure mode of every "try again" prompt.
 *   Keeping what still holds is allowed and said out loud, so the model is not
 *   pushed into changing a correct reading for the sake of changing it.
 * - **The citation regime is unchanged.** It is V3's, quoted rather than
 *   loosened: the marker rule, the verbatim rule, and the announced
 *   consequence — every quotation is read back against the text afterwards
 *   (`verifyAnalysisSectionEvidence` in `@calepin/analysis`), an unfound one
 *   is dropped and its element falls back to an interpretation. A regenerated
 *   section is not a second-class one.
 *
 * **`authorInstruction` and `currentSection` are `list` variables**, which is
 * how this registry expresses something genuinely sometimes absent
 * (`PromptDefinition.variables`): every variable is required, and an empty list
 * renders as a dash. An author who added nothing, and a section that has never
 * been produced, both render legibly instead of leaving a hole in the text.
 *
 * The section's own title and the line saying what it expects arrive as
 * variables. They are not restated here: the seventeen definitions live in
 * `analyze-source-text` V3, and a second copy is the copy that drifts. What
 * fills them is the composer's, as the mission's other inputs are.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "regenerate-analysis-section",
  version: 1,
  scope: { kind: "mission", missionId: "regenerate-analysis-section" },
  variables: [
    { name: "language", type: "text", description: "The project's writing language." },
    {
      name: "targetAudience",
      type: "text",
      description: "The project's target readership, as the author declared it.",
    },
    {
      name: "sectionTitle",
      type: "text",
      description: "The name of the one section being redone, as the author sees it.",
    },
    {
      name: "sectionRequirement",
      type: "text",
      description:
        "What this section expects — the diagnostic's own definition of it, never a second one.",
    },
    {
      name: "currentSection",
      type: "list",
      description:
        "The section as it stands, one entry per element; empty when it has never been produced.",
    },
    {
      name: "authorInstruction",
      type: "list",
      description:
        "The author's complementary instruction, or empty when they gave none — a list because the registry has no optional variable.",
    },
    {
      name: "maxElements",
      type: "number",
      description: "Elements the section may hold — the domain's ceiling, never a quota.",
    },
    {
      name: "elementWordTarget",
      type: "number",
      description: "Words one element's statement should come to.",
    },
    {
      name: "evidenceWordTarget",
      type: "number",
      description: "Words a supporting quotation stays under — it anchors, it does not reproduce.",
    },
    { name: "sourceText", type: "text", description: "The current source text version, in full." },
  ],
  system: [
    "Tu es analyste littéraire. Tu accompagnes un auteur qui prépare un roman à partir d'un texte de départ, et son diagnostic narratif est déjà écrit : il te demande de reprendre une seule de ses sections.",
    "Tu écris en {{language}}. Toute citation du texte source reste exactement telle que le texte l'écrit, dans sa langue et sa graphie d'origine — jamais traduite, jamais corrigée, jamais résumée entre guillemets.",
    "Tu ne produis que la section demandée. Les autres sections du diagnostic ne te sont pas soumises, elles ne changent pas, et une remarque qui relèverait de l'une d'elles n'a pas sa place dans ta réponse.",
    "Tu sépares ce que le texte établit — FACTUAL — de ce que tu en déduis — INTERPRETATION. Un élément n'est FACTUAL que si tu peux le poser sur un passage précis du texte et le citer ; sans ce passage, il est INTERPRETATION, quelle que soit ta certitude.",
    "Tu ne combles jamais un vide du texte par une invention : ce que le texte tait est une ambiguïté ou une question ouverte, pas un blanc à remplir.",
  ].join("\n"),
  instruction: [
    "Reprends la section « {{sectionTitle}} » du diagnostic, et elle seule.",
    "",
    "Lectorat visé : {{targetAudience}}",
    "",
    "Ce que cette section attend :",
    "{{sectionRequirement}}",
    "",
    "Ce que cette section dit aujourd'hui :",
    "{{currentSection}}",
    "",
    "Consigne complémentaire de l'auteur :",
    "{{authorInstruction}}",
    "",
    "Comment la reprendre :",
    "- La consigne de l'auteur commande l'angle de la reprise : c'est lui qui a lu le texte et le diagnostic, et ce qu'il demande passe avant ce que tu aurais spontanément retenu.",
    "- Elle ne commande pas le texte source. Si ce qu'elle demande ne s'y trouve pas, ne l'invente pas : rends la section la plus juste que le texte permet et dis dans les énoncés ce que le texte donne réellement. Une consigne sans consigne — la liste ci-dessus vide — se lit comme une reprise ouverte : reprends la section au fond.",
    "- Une reprise n'est pas une reformulation. Ce qui était juste et que tu gardes, garde-le tel quel ; ne change pas une lecture correcte pour qu'elle paraisse neuve. Ce que tu changes, change-le parce que le texte ou la consigne le demandent.",
    "- Au plus {{maxElements}} éléments, chacun tenu en une à trois phrases, environ {{elementWordTarget}} mots. Ne remplis jamais la section pour la forme.",
    "",
    "Marqueur et citation, la règle la plus stricte de ce diagnostic :",
    "- FACTUAL exige une citation. « evidence » porte alors un passage continu du texte, copié caractère pour caractère, au plus {{evidenceWordTarget}} mots : ni coupe, ni crochets, ni points de suspension ajoutés, ni traduction, ni correction d'une graphie qui te semblerait fautive.",
    "- INTERPRETATION couvre tout le reste : ce que tu déduis, ce que tu supposes, ce que le texte suggère sans le dire. Dans le doute, INTERPRETATION.",
    "- Une interprétation peut citer le passage dont elle part ; la citation obéit alors aux mêmes règles, sinon « evidence » reste à null.",
    "- Ne cite jamais de mémoire. Si tu ne retrouves pas le passage exact dans le texte ci-dessous, mets « evidence » à null et marque INTERPRETATION.",
    "- Chaque citation est relue mot pour mot contre le texte après ta réponse : une citation introuvable est supprimée, et l'élément qui s'en réclamait retombe en INTERPRETATION. Une citation reprise de la version actuelle de la section n'échappe pas à cette relecture.",
    "",
    "Texte source :",
    "{{sourceText}}",
    "",
    "Réponds uniquement par l'objet JSON demandé — la seule section demandée, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const REGENERATE_ANALYSIS_SECTION_PROMPTS = [V1] as const;
