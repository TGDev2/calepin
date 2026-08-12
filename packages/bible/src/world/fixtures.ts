/**
 * Synthetic material for the world suites (CAL-092).
 *
 * Original and short, never a real author's text (§8). The corpus is the
 * character section's own passages re-labelled to this section's three kinds,
 * so the fixtures describe one bible rather than two — `relationship/fixtures`'
 * arrangement.
 *
 * The default world is deliberately not tidy. It is a realist world with
 * exactly one out-of-norm capability, which is the interesting case: a
 * capability at all, so the bounds are exercised, and only one, so a test that
 * drops it still leaves a legal world behind. `aCapability()` is bounded on
 * all three axes because an unbounded one is not a value this contract has —
 * building one for a test means widening the schema, which is exactly what the
 * unrepresentability probe does.
 */

import type {
  OutOfNormCapability,
  WorldBible,
  WorldBibleInput,
  WorldConstraint,
  WorldPlace,
  WorldRuleDeclaration,
  WorldSource,
} from "./schema";

export function worldSources(): WorldSource[] {
  return [
    {
      kind: "direction",
      key: "premise",
      label: "Prémisse de la direction canonique",
      text: "Une commune de montagne coupée du monde pendant six semaines chaque hiver.",
    },
    {
      kind: "identity",
      key: "tone",
      label: "Tonalité",
      text: "Sourde, patiente, sans emphase.",
    },
    {
      kind: "analysis",
      key: "setting",
      label: "Cadre repéré dans le texte source",
      text: "Le village n'est jamais nommé ; on n'en connaît que la route et le col.",
    },
  ];
}

export function aWorldInput(): WorldBibleInput {
  return {
    sourceTextVersionId: "stv_1",
    directionId: "dir_1",
    freedomLevel: "BALANCED",
    sources: worldSources(),
  };
}

export function aPlace(): WorldPlace {
  return {
    name: "Le col de Varène",
    description: "La seule route vers la vallée, fermée dès la première neige.",
  };
}

export function aWorldRule(): WorldRuleDeclaration {
  return {
    name: "Fermeture du col",
    statement: "Le col se ferme à la première neige et ne rouvre qu'au dégel.",
    forbids: "Nul ne quitte la vallée entre novembre et mars, quel qu'en soit le motif.",
  };
}

export function aConstraint(): WorldConstraint {
  return {
    statement: "Aucun secours médical ne monte pendant la fermeture.",
    consequence: "Une blessure sérieuse se soigne sur place ou ne se soigne pas.",
  };
}

/** The one out-of-norm capability, bounded on all three axes. */
export function aCapability(): OutOfNormCapability {
  return {
    name: "Le relevé des Fauchier",
    statement: "Un Fauchier sait où se trouve un corps enseveli sous la neige.",
    limits: [
      "Rien au-delà de la ligne des sapins.",
      "Jamais l'identité du corps, seulement l'endroit.",
    ],
    costs: ["Trois jours de fièvre après chaque relevé."],
    failureConditions: [
      "Le don ne répond pas pendant une tempête.",
      "Il ne répond jamais deux fois pour le même corps.",
    ],
  };
}

/**
 * One world over the fixtures above: two places, two ordinary rules, two
 * constraints and a single capability.
 */
export function aWorld(): WorldBible {
  return {
    era: "Les hivers d'une vallée alpine, entre les deux guerres.",
    socialContext:
      "Trois familles se partagent les terres ; on se marie entre elles et on se tait devant l'étranger.",
    politicalContext:
      "Le maire est un Fauchier depuis quarante ans, et personne ne se présente contre lui.",
    technologies: ["Le téléphone de la poste, unique dans la vallée.", "La scie à ruban du moulin."],
    institutions: ["La cure", "Le conseil des trois familles"],
    constraints: [
      aConstraint(),
      {
        statement: "Le courrier ne passe pas pendant la fermeture.",
        consequence: "Toute nouvelle arrive avec six semaines de retard, ou n'arrive pas.",
      },
    ],
    places: [
      aPlace(),
      {
        name: "Le moulin bas",
        description: "Abandonné depuis la crue, et le seul endroit où l'on peut parler sans témoin.",
      },
    ],
    worldRules: [
      aWorldRule(),
      {
        name: "Loi des trois familles",
        statement: "Une terre ne se vend jamais hors des trois familles.",
        forbids: "Un étranger ne peut acquérir de terre, même par mariage.",
      },
    ],
    outOfNormCapabilities: [aCapability()],
  };
}
