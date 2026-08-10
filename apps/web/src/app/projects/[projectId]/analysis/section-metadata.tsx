import type { AnalysisSection } from "@calepin/analysis";
import type { ReactNode } from "react";

import { TermHint } from "./term-hint";

export interface SectionMeta {
  readonly title: ReactNode;
  readonly subtitle: ReactNode;
  /** Shown in place of the elements when the section is legitimately empty. */
  readonly emptyNote: string;
}

const DEFAULT_EMPTY_NOTE = "Aucun élément identifié dans cette section.";

/**
 * One entry per `AnalysisSection`, in plain, accessible French — the wording
 * the schema's own inline comments already chose
 * (`prisma/schema.prisma`'s `AnalysisSection` enum), not a second vocabulary
 * invented for the screen.
 *
 * Exactly four notions carry a `<TermHint>`, matching what CAL-072 names:
 * point de vue, focalisation (`POINT_OF_VIEW`), promesse narrative
 * (`NARRATIVE_PROMISE`) and arc dramatique (`MAIN_CONFLICT`). No broader
 * glossary is built here — the backlog's own "fini quand" only asks that an
 * uninitiated reader understand "point de vue" and "focalisation" without
 * leaving the page.
 */
export const SECTION_META: Record<AnalysisSection, SectionMeta> = {
  FACTUAL_SUMMARY: {
    title: "Résumé factuel",
    subtitle: "Ce que le texte raconte, sans interprétation : qui, quoi, où, quand.",
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  PREMISE: {
    title: "Prémisse",
    subtitle: "L'idée de départ, en une phrase : la situation qui met l'histoire en mouvement.",
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  MAIN_CONFLICT: {
    title: "Conflit principal",
    subtitle: (
      <>
        Ce qui oppose le personnage principal à ce qu&apos;il veut, et comment cette tension évolue
        — son{" "}
        <TermHint
          id="arc-dramatique"
          definition="La trajectoire d'une histoire ou d'un personnage : comment la tension monte, atteint un sommet, puis se résout."
        >
          arc dramatique
        </TermHint>
        .
      </>
    ),
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  NARRATIVE_PROMISE: {
    title: (
      <TermHint
        id="promesse-narrative"
        definition="Ce que les premières pages laissent attendre au lecteur, et que la suite du texte doit tenir."
      >
        Promesse narrative
      </TermHint>
    ),
    subtitle: "Ce que le début du texte laisse espérer au lecteur pour la suite.",
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  THEMES: {
    title: "Thèmes",
    subtitle: "Les grandes idées que le texte explore, au-delà de l'intrigue elle-même.",
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  CHARACTERS: {
    title: "Personnages",
    subtitle: "Les personnages identifiés dans le texte.",
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  RELATIONSHIPS: {
    title: "Relations entre personnages",
    subtitle: "Les liens entre les personnages, quand le texte en établit.",
    emptyNote: "Le texte n'établit pas de relation entre personnages.",
  },
  POINT_OF_VIEW: {
    title: (
      <TermHint
        id="point-de-vue"
        definition="Qui raconte l'histoire : un personnage à la première personne, un narrateur extérieur qui suit un personnage, ou un narrateur qui sait tout."
      >
        Point de vue
      </TermHint>
    ),
    subtitle: (
      <>
        Qui raconte, et à travers le regard de qui le lecteur perçoit la scène — sa{" "}
        <TermHint
          id="focalisation"
          definition="Ce que le lecteur peut savoir dans une scène : uniquement ce que perçoit un personnage, un regard extérieur neutre, ou une vision qui sait tout."
        >
          focalisation
        </TermHint>
        .
      </>
    ),
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  TENSE: {
    title: "Temps verbal",
    subtitle: "Le temps de conjugaison principal utilisé pour raconter l'histoire.",
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  TONE: {
    title: "Ton",
    subtitle: "L'atmosphère générale du texte : grave, légère, ironique, contemplative…",
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  SINGULAR_ELEMENTS: {
    title: "Éléments singuliers",
    subtitle: "Ce qui distingue ce texte des autres : une idée, une image, un choix inhabituel.",
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  AMBIGUITIES: {
    title: "Ambiguïtés",
    subtitle: "Ce que le texte laisse volontairement, ou involontairement, incertain.",
    emptyNote: "Le texte ne laisse rien d'ambigu.",
  },
  OPEN_QUESTIONS: {
    title: "Questions ouvertes",
    subtitle: "Ce que le texte soulève sans y répondre.",
    emptyNote: "Le texte ne laisse pas de question ouverte.",
  },
  ELEMENTS_TO_PRESERVE: {
    title: "Éléments à préserver",
    subtitle: "Ce que la suite du travail devrait conserver tel quel.",
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  WEAKNESSES: {
    title: "Fragilités",
    subtitle: "Ce qui, dans le texte, mériterait d'être renforcé.",
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
  CLICHE_RISKS: {
    title: "Risques de clichés",
    subtitle: "Des situations ou des figures déjà largement vues ailleurs.",
    emptyNote: "Aucun risque de cliché identifié.",
  },
  DEVELOPMENT_POTENTIAL: {
    title: "Potentiel de développement",
    subtitle: "Dans quelle direction ce texte pourrait être prolongé ou approfondi.",
    emptyNote: DEFAULT_EMPTY_NOTE,
  },
};
