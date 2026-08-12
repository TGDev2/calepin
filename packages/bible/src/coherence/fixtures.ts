/**
 * A small bible that holds together, for the suites to break one way at a time
 * (CAL-099).
 *
 * The arithmetic of the baseline is worked so the checks have something real to
 * agree with: Nora is 34 at the opening, 24 at a fire ten years earlier and 35 a
 * year after — three statements whose birth-day windows intersect. Every test
 * that expects a finding mutates exactly one of these values, which is what
 * makes the failure it produces attributable.
 *
 * Invented, short, French — §8's *synthetic or public-domain, committed
 * knowingly*. Never exported from the package index.
 */

import type { BibleContradictions, BibleContradictionsInput } from "./schema";
import type { BibleCanonFactRow, BibleContentRows } from "./subject";

export const NORA = "character-nora";
export const VICTOR = "character-victor";
export const VALLON = "place-vallon";
export const FIRE = "event-fire";
export const OPENING = "event-opening";
export const DEPARTURE = "event-departure";

export function aCanonFact(overrides: Partial<BibleCanonFactRow> = {}): BibleCanonFactRow {
  return {
    id: "fact-key",
    statement: "Nora détient la clef du vallon",
    isTrue: true,
    validity: "PERMANENT",
    validFromDay: null,
    validUntilDay: null,
    invalidatedByEventId: null,
    status: "CONFIRMED",
    beliefs: [{ characterId: VICTOR, state: "UNAWARE" }],
    subjects: [{ characterId: NORA, placeId: null }],
    ...overrides,
  };
}

export function aBibleContent(overrides: Partial<BibleContentRows> = {}): BibleContentRows {
  return {
    identity: {
      genre: "roman noir",
      subGenre: "enquête rurale",
      tone: "sec et tenu",
      narrativePromise: "une disparition qui remonte à une famille entière",
      themes: ["la dette héritée"],
      counterThemes: ["le pardon consenti"],
      centralQuestion: "que doit-on à ceux qui ont menti pour nous ?",
      endingNature: "une réparation partielle",
    },
    style: {
      pointOfView: "troisième personne",
      focalization: "interne sur Nora",
      tense: "passé simple",
      languageRegister: "courant, sans argot",
      descriptiveDensity: "brève, deux détails par lieu",
      pacing: "scènes courtes",
      dialogueBalance: "un tiers de dialogue",
      recurringMotifs: ["la pluie sur la tôle"],
      elementsToAvoid: ["les résumés psychologiques"],
    },
    world: {
      era: "les années quatre-vingt-dix",
      socialContext: "une vallée qui se vide",
      politicalContext: null,
      technologies: ["le téléphone fixe"],
      institutions: ["la gendarmerie de canton"],
      constraints: ["une route unique, coupée en hiver"],
    },
    places: [{ id: VALLON, name: "Le Vallon", description: "un hameau au fond de la vallée" }],
    worldRules: [
      {
        id: "rule-road",
        name: "la route unique",
        statement: "la vallée n'a qu'un accès. Rend impossible : partir sans être vu",
        isSupernatural: false,
        limits: [],
        costs: [],
        failureConditions: [],
      },
    ],
    characters: [
      {
        id: NORA,
        name: "Nora",
        age: 34,
        role: "l'enquêtrice",
        appearance: null,
        initialSituation: "revient au vallon après dix ans",
        apparentDesire: "vendre la maison",
        deepNeed: "savoir ce que son père a couvert",
        fear: "découvrir qu'elle a été protégée",
        contradiction: "elle réclame la vérité et redoute de la tenir",
        secret: "elle a détruit une lettre",
        past: "un incendie a emporté la grange",
        plannedArc: "elle cesse de protéger la mémoire de son père",
        speechStyle: "des phrases courtes, jamais de question directe",
        heldKnowledge: ["elle sait que la lettre existait"],
        elementsToPreserve: ["son refus de mentir aux vivants"],
      },
      {
        id: VICTOR,
        name: "Victor",
        age: 41,
        role: "le voisin",
        appearance: null,
        initialSituation: "garde le hameau depuis toujours",
        apparentDesire: "qu'on le laisse tranquille",
        deepNeed: "être cru une fois",
        fear: "qu'on rouvre le dossier",
        contradiction: "il protège ce qui l'accuse",
        secret: "il a vu partir la voiture",
        past: "il a témoigné et personne ne l'a suivi",
        plannedArc: "il parle enfin",
        speechStyle: "il répond à côté",
        heldKnowledge: ["il sait qui conduisait"],
        elementsToPreserve: ["sa loyauté envers le hameau"],
      },
    ],
    relationships: [
      {
        id: "relation-nora-victor",
        fromCharacterId: NORA,
        toCharacterId: VICTOR,
        type: "OTHER",
        label: "une méfiance ancienne",
        description: "elle le tient pour un témoin qui s'est tu",
      },
      {
        id: "relation-victor-nora",
        fromCharacterId: VICTOR,
        toCharacterId: NORA,
        type: "OTHER",
        label: "une dette tue",
        description: "il lui doit ce qu'il n'a pas dit",
      },
    ],
    timeline: [
      {
        id: FIRE,
        name: "l'incendie de la grange",
        summary: "le feu emporte la grange et les papiers",
        category: "BACKSTORY",
        absoluteDay: -3650,
        datePrecision: "YEAR",
        precedingEventId: null,
        daysAfterPreceding: null,
        durationPrecision: null,
        participants: [{ characterId: NORA, declaredAge: 24 }],
      },
      {
        id: OPENING,
        name: "le retour au hameau",
        summary: "elle rouvre la maison",
        category: "NARRATED",
        absoluteDay: 0,
        datePrecision: "DAY",
        precedingEventId: null,
        daysAfterPreceding: null,
        durationPrecision: null,
        participants: [
          { characterId: NORA, declaredAge: 34 },
          { characterId: VICTOR, declaredAge: 41 },
        ],
      },
      {
        id: DEPARTURE,
        name: "le départ de la vallée",
        summary: "elle referme la maison",
        category: "PLANNED",
        absoluteDay: 365,
        datePrecision: "DAY",
        precedingEventId: OPENING,
        daysAfterPreceding: 365,
        durationPrecision: "DAY",
        participants: [{ characterId: NORA, declaredAge: 35 }],
      },
    ],
    canonFacts: [aCanonFact()],
    ...overrides,
  };
}

/**
 * An ask holding two facts that oppose each other only in their wording, and
 * two rules that cannot both govern — the case no key can reach, which is what
 * the mission exists for.
 */
export function aContradictionsInput(
  overrides: Partial<BibleContradictionsInput> = {},
): BibleContradictionsInput {
  return {
    facts: [
      {
        statement: "le père de Nora est vivant",
        isTrue: true,
        validity: "PERMANENT",
        validityLabel: null,
        subjects: ["Nora"],
      },
      {
        statement: "le père de Nora repose au cimetière du hameau",
        isTrue: true,
        validity: "PERMANENT",
        validityLabel: null,
        subjects: ["Nora"],
      },
      {
        statement: "Victor garde le hameau depuis vingt ans",
        isTrue: true,
        validity: "DURING_PERIOD",
        validityLabel: "depuis vingt ans",
        subjects: ["Victor"],
      },
    ],
    worldRules: [
      {
        name: "la route unique",
        statement: "la vallée n'a qu'un accès",
        isSupernatural: false,
        bounds: [],
      },
      {
        name: "le sentier du col",
        statement: "on quitte la vallée par le col en été",
        isSupernatural: false,
        bounds: [],
      },
    ],
    ...overrides,
  };
}

export function aContradictionsAnswer(
  overrides: Partial<BibleContradictions> = {},
): BibleContradictions {
  return {
    opposedFacts: [
      {
        firstIndex: 0,
        secondIndex: 1,
        explanation: "un homme enterré ne peut pas être vivant au même moment du récit",
        proposedFix: "écarter l'un des deux faits, ou dater la mort après le récit",
      },
    ],
    contradictoryRules: [
      {
        firstIndex: 0,
        secondIndex: 1,
        explanation: "une vallée qui n'a qu'un accès ne peut pas avoir un second passage en été",
        proposedFix: "faire du col une exception saisonnière de la première règle",
      },
    ],
    ...overrides,
  };
}
