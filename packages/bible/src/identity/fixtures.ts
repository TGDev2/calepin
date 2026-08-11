/**
 * The corpus the identity contract is proven against (CAL-088).
 *
 * Synthetic and short, per CLAUDE.md §8: five citable passages and one identity
 * built on them. None of it came from a user, and none of it is prose anybody
 * would read for pleasure — what is under test is whether a quotation is found
 * where it claims to come from, which needs a corpus, not literature.
 *
 * A module rather than a copy in each test file, for `@calepin/shared/text`'s
 * own reason: `schema.test.ts`, `basis.test.ts` and `resolve.test.ts` must
 * exercise the same passages, and a corpus copied three times is a corpus that
 * drifts. It stays off `index.ts` — it is test material, not public surface.
 */

import type { IdentitySource, NovelIdentityInput, TracedNovelIdentity } from "./schema";

const DIRECTION_TITLE: IdentitySource = {
  kind: "direction",
  key: "direction.workingTitle",
  label: "le titre de travail de la direction",
  text: "Le serment de Pietranera",
};

const DIRECTION_CONFLICT: IdentitySource = {
  kind: "direction",
  key: "direction.mainConflict",
  label: "le conflit principal",
  text: "Le conflit oppose la fidélité à un serment ancien et la survie du village qui l'a prêté.",
};

const DIRECTION_ENDING: IdentitySource = {
  kind: "direction",
  key: "direction.endingNature",
  label: "la nature de la fin",
  text: "Une fin de renoncement : le serment tient, et le village se disperse.",
};

const ANALYSIS_THEMES: IdentitySource = {
  kind: "analysis",
  key: "analysis.themes",
  label: "les thèmes relevés par l'analyse",
  text: "La loyauté due à un mort. Le poids d'une promesse faite sans témoin.",
};

const ANALYSIS_TONE: IdentitySource = {
  kind: "analysis",
  key: "analysis.tone",
  label: "la tonalité relevée par l'analyse",
  text: "Un ton sec, presque administratif, que la dernière page fissure.",
};

/** The five passages one ask offers, direction first then analysis. */
export function identitySources(): IdentitySource[] {
  return [DIRECTION_TITLE, DIRECTION_CONFLICT, DIRECTION_ENDING, ANALYSIS_THEMES, ANALYSIS_TONE];
}

/** One source, for the cases that need a concrete entry rather than the set. */
export function aSource(): IdentitySource {
  return DIRECTION_CONFLICT;
}

/** A complete, canonical ask. */
export function anIdentityInput(): NovelIdentityInput {
  return {
    sourceTextVersionId: "stv_1",
    directionId: "dir_1",
    targetAudience: "Adultes, lecteurs de récits sombres",
    targetWordCount: 70_000,
    freedomLevel: "BALANCED",
    sources: identitySources(),
  };
}

/**
 * A complete identity, every basis quoting a passage `identitySources()`
 * actually carries — word for word, as `createVerbatimMatcher` reads it.
 */
export function anIdentity(): TracedNovelIdentity {
  return {
    workingTitle: {
      value: "Le serment de Pietranera",
      basis: {
        sourceKey: DIRECTION_TITLE.key,
        quotation: "Le serment de Pietranera",
        justification: "La direction retenue nomme déjà le roman par son serment.",
      },
    },
    genre: {
      value: "Drame rural",
      basis: {
        sourceKey: DIRECTION_CONFLICT.key,
        quotation: "la survie du village",
        justification: "Le conflit se joue à l'échelle d'une communauté, pas d'un individu.",
      },
    },
    subGenre: {
      value: "Chronique villageoise",
      basis: {
        sourceKey: DIRECTION_CONFLICT.key,
        quotation: "du village qui l'a prêté",
        justification: "Le village est partie au serment, ce qui en fait le sujet.",
      },
    },
    tone: {
      value: "Sec et retenu, jusqu'à une dernière page qui cède.",
      basis: {
        sourceKey: ANALYSIS_TONE.key,
        quotation: "Un ton sec, presque administratif",
        justification: "L'analyse relève ce ton comme la manière propre du texte.",
      },
    },
    narrativePromise: {
      value: "Le lecteur saura ce qu'une promesse tenue coûte à ceux qui restent.",
      basis: {
        sourceKey: DIRECTION_ENDING.key,
        quotation: "le serment tient, et le village se disperse",
        justification: "La fin déclarée par la direction est exactement ce prix.",
      },
    },
    thematicAxes: [
      {
        theme: {
          value: "La loyauté due à un mort",
          basis: {
            sourceKey: ANALYSIS_THEMES.key,
            quotation: "La loyauté due à un mort",
            justification: "L'analyse le relève comme premier thème du texte.",
          },
        },
        counterTheme: {
          value: "Le devoir envers les vivants",
          basis: {
            sourceKey: DIRECTION_CONFLICT.key,
            quotation: "la survie du village",
            justification: "Ce que la direction oppose à la loyauté au mort.",
          },
        },
      },
      {
        theme: {
          value: "Le poids d'une promesse sans témoin",
          basis: {
            sourceKey: ANALYSIS_THEMES.key,
            quotation: "promesse faite sans témoin",
            justification: "L'analyse relève l'absence de témoin comme le nœud.",
          },
        },
        counterTheme: {
          value: "Ce qu'une communauté peut exiger qu'on renie",
          basis: {
            sourceKey: DIRECTION_CONFLICT.key,
            quotation: "du village qui l'a prêté",
            justification: "Le village a prêté le serment, il peut donc en délier.",
          },
        },
      },
    ],
    centralQuestion: {
      value: "Une promesse qu'aucun vivant n'a entendue engage-t-elle encore ?",
      basis: {
        sourceKey: ANALYSIS_THEMES.key,
        quotation: "promesse faite sans témoin",
        justification: "La question centrale est ce thème posé comme question.",
      },
    },
    endingNature: {
      value: "Un renoncement assumé, payé par la dispersion du village.",
      basis: {
        sourceKey: DIRECTION_ENDING.key,
        quotation: "Une fin de renoncement",
        justification: "La direction déclare cette nature de fin sans ambiguïté.",
      },
    },
  };
}

/** The first thematic axis, for cases that need one without indexing. */
export function anAxis(): TracedNovelIdentity["thematicAxes"][number] {
  const [axis] = anIdentity().thematicAxes;

  if (axis === undefined) {
    throw new Error("the identity fixture carries no thematic axis");
  }

  return axis;
}
