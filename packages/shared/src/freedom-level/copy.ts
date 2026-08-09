/**
 * The French an author reads about the freedom level (CAL-044) — and, once
 * CAL-053's registry exists, the same words a mission prompt quotes.
 *
 * **Why the product's French lives in a package rather than in `apps/web`.**
 * Because it has two audiences. The wizard shows the level's explanation, and
 * `./constraints` composes the very same labels into the constraint clauses
 * that will be handed to a mission. Written twice, the promise made on screen
 * and the rule applied downstream drift the first time someone edits one of
 * them; written once, they cannot. `errors/messages.ts` already keeps its
 * French here for the same reason.
 *
 * The lists a reader sees are **derived** from `./policy`, never typed out
 * beside it — `summarizeFreedomLevel` reads the table, so a treatment changed
 * there changes the sentence in the wizard in the same commit.
 */

import { DIMENSION_TREATMENTS, type SourceDimension } from "./dimensions";
import type { FreedomLevel } from "./levels";
import { dimensionsTreatedAs } from "./policy";

/**
 * Each dimension as a noun phrase, article included and uncapitalised: the
 * clauses in `./constraints` name it mid-sentence, and the wizard lists it
 * after a heading. One form serves both.
 */
export const SOURCE_DIMENSION_LABELS: Readonly<Record<SourceDimension, string>> = {
  premise: "la prémisse",
  "main-conflict": "le conflit principal",
  "narrative-promise": "la promesse faite au lecteur",
  themes: "les thèmes",
  protagonist: "le personnage principal",
  "secondary-characters": "les personnages secondaires",
  setting: "le cadre, lieu et époque",
  tone: "la tonalité",
  "point-of-view": "le point de vue et le temps du récit",
  ending: "la nature de la fin",
};

export interface FreedomLevelCopy {
  readonly level: FreedomLevel;
  /** The word on the radio button. */
  readonly label: string;
  /** One line, enough to choose between the three at a glance. */
  readonly tagline: string;
  /**
   * The short explanation the backlog asks for, in the vocabulary an author
   * uses rather than the vocabulary the policy is written in: what the novel
   * does to the source text, not which dimensions carry which treatment.
   */
  readonly explanation: string;
}

export const FREEDOM_LEVEL_COPY: Readonly<Record<FreedomLevel, FreedomLevelCopy>> = {
  LOW: {
    level: "LOW",
    label: "Faible",
    tagline: "Développement très fidèle au texte source.",
    explanation:
      "Le roman prolonge le texte source sans le réécrire : mêmes personnages, même conflit, même fin. Tout le travail consiste à donner de l'ampleur — des scènes développées, un temps dilaté, un arrière-plan approfondi.",
  },
  BALANCED: {
    level: "BALANCED",
    label: "Équilibré",
    tagline: "Le noyau de l'histoire est conservé, avec des ajouts significatifs.",
    explanation:
      "Le noyau du texte reste intact — sa prémisse, son conflit, ses thèmes, la promesse qu'il fait au lecteur — mais le roman s'autorise de vrais ajouts : personnages, lieux, intrigues secondaires, et une fin repensée pour la longueur.",
  },
  HIGH: {
    level: "HIGH",
    label: "Élevé",
    tagline: "Réinterprétation libre, tant que les thèmes essentiels sont conservés.",
    explanation:
      "Le texte source devient un point de départ plutôt qu'un cadre : l'intrigue, les personnages, l'époque et la fin peuvent être repensés. Seuls les thèmes qui font la valeur du texte restent intouchables.",
  },
};

export function freedomLevelCopy(level: FreedomLevel): FreedomLevelCopy {
  return FREEDOM_LEVEL_COPY[level];
}

/** The heading each treatment gets when a level is summarised for a reader. */
export const DIMENSION_TREATMENT_LABELS = {
  preserve: "Conservé",
  extend: "Développé",
  reinterpret: "Réinterprétable",
} as const satisfies Readonly<Record<(typeof DIMENSION_TREATMENTS)[number], string>>;

export interface FreedomLevelSummaryGroup {
  readonly treatment: (typeof DIMENSION_TREATMENTS)[number];
  readonly heading: string;
  readonly dimensions: readonly string[];
}

/**
 * A level as three lists of French labels, in treatment order — what the
 * wizard shows under the chosen level.
 *
 * Groups with nothing in them are dropped rather than shown empty: under
 * `LOW` there is nothing to put in "Réinterprétable", and an empty heading
 * would read as an omission rather than as the point.
 */
export function summarizeFreedomLevel(level: FreedomLevel): readonly FreedomLevelSummaryGroup[] {
  return DIMENSION_TREATMENTS.map((treatment) => ({
    treatment,
    heading: DIMENSION_TREATMENT_LABELS[treatment],
    dimensions: dimensionsTreatedAs(level, treatment).map(
      (dimension) => SOURCE_DIMENSION_LABELS[dimension],
    ),
  })).filter((group) => group.dimensions.length > 0);
}
