import type { BibleOverview } from "@calepin/shared/repository";
import { describe, expect, it } from "vitest";

import { buildBibleVersionContent } from "./content";

/**
 * A small overview covering every row kind `getBibleOverview` produces, with
 * the bookkeeping fields (`origin`, `lockedAt`, `lockedFields`) filled in on
 * purpose — the point of the suite is proving they never survive the strip.
 * Invented, short, French — CLAUDE.md §8's "synthetic ... committed knowingly".
 */
function anOverview(overrides: Partial<BibleOverview> = {}): BibleOverview {
  return {
    bibleId: "bible-1",
    validatedAt: null,
    identity: {
      workingTitle: "Le Vallon",
      genre: "roman noir",
      subGenre: "enquête rurale",
      tone: "sec et tenu",
      narrativePromise: "une disparition qui remonte à une famille entière",
      themes: ["la dette héritée"],
      counterThemes: ["le pardon consenti"],
      centralQuestion: "que doit-on à ceux qui ont menti pour nous ?",
      endingNature: "une réparation partielle",
      origin: "GENERATED",
      lockedAt: new Date("2026-01-01T00:00:00.000Z"),
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
      origin: "GENERATED",
      lockedAt: null,
    },
    world: {
      era: "les années quatre-vingt-dix",
      socialContext: "une vallée qui se vide",
      politicalContext: null,
      technologies: ["le téléphone fixe"],
      institutions: ["la gendarmerie de canton"],
      constraints: ["une route unique, coupée en hiver"],
      origin: "GENERATED",
      lockedAt: null,
    },
    places: [
      {
        id: "place-vallon",
        name: "Le Vallon",
        description: "un hameau au fond de la vallée",
        origin: "GENERATED",
        lockedAt: null,
      },
    ],
    worldRules: [
      {
        id: "rule-road",
        name: "la route unique",
        statement: "la vallée n'a qu'un accès",
        isSupernatural: false,
        limits: [],
        costs: [],
        failureConditions: [],
        origin: "GENERATED",
        lockedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ],
    characters: [
      {
        id: "character-nora",
        name: "Nora",
        age: 34,
        role: "l'enquêtrice",
        importance: "MAIN",
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
        origin: "GENERATED",
        lockedAt: new Date("2026-01-03T00:00:00.000Z"),
        lockedFields: ["DEEP_NEED"],
      },
    ],
    relationships: [
      {
        id: "relation-nora-victor",
        fromCharacterId: "character-nora",
        toCharacterId: "character-victor",
        type: "OTHER",
        label: "une méfiance ancienne",
        description: "elle le tient pour un témoin qui s'est tu",
        origin: "GENERATED",
        lockedAt: null,
      },
    ],
    timeline: [
      {
        id: "event-fire",
        name: "l'incendie de la grange",
        summary: "le feu emporte la grange et les papiers",
        category: "BACKSTORY",
        absoluteDay: -3650,
        datePrecision: "YEAR",
        dateLabel: null,
        precedingEventId: null,
        daysAfterPreceding: null,
        durationPrecision: null,
        origin: "GENERATED",
        lockedAt: null,
        participants: [{ characterId: "character-nora", declaredAge: 24 }],
      },
    ],
    canonFacts: [
      {
        id: "fact-confirmed",
        statement: "Nora détient la clef du vallon",
        isTrue: true,
        validity: "PERMANENT",
        validFromDay: null,
        validFromPrecision: null,
        validFromLabel: null,
        validUntilDay: null,
        validUntilPrecision: null,
        validUntilLabel: null,
        invalidatedByEventId: null,
        source: "BIBLE",
        status: "CONFIRMED",
        lockedAt: new Date("2026-01-04T00:00:00.000Z"),
        beliefs: [{ characterId: "character-victor", state: "UNAWARE" }],
        subjects: [{ characterId: "character-nora", placeId: null }],
      },
      {
        id: "fact-proposed",
        statement: "Victor a vu partir la voiture",
        isTrue: true,
        validity: "PERMANENT",
        validFromDay: null,
        validFromPrecision: null,
        validFromLabel: null,
        validUntilDay: null,
        validUntilPrecision: null,
        validUntilLabel: null,
        invalidatedByEventId: null,
        source: "CHAPTER",
        status: "PROPOSED",
        lockedAt: null,
        beliefs: [],
        subjects: [{ characterId: "character-victor", placeId: null }],
      },
      {
        id: "fact-rejected",
        statement: "le père de Nora est vivant",
        isTrue: false,
        validity: "PERMANENT",
        validFromDay: null,
        validFromPrecision: null,
        validFromLabel: null,
        validUntilDay: null,
        validUntilPrecision: null,
        validUntilLabel: null,
        invalidatedByEventId: null,
        source: "SOURCE_TEXT",
        status: "REJECTED",
        lockedAt: null,
        beliefs: [],
        subjects: [{ characterId: "character-nora", placeId: null }],
      },
    ],
    ...overrides,
  };
}

describe("buildBibleVersionContent (CAL-100)", () => {
  it("keeps the narrative content of every row kind", () => {
    const content = buildBibleVersionContent(anOverview());

    expect(content.identity).toEqual({
      workingTitle: "Le Vallon",
      genre: "roman noir",
      subGenre: "enquête rurale",
      tone: "sec et tenu",
      narrativePromise: "une disparition qui remonte à une famille entière",
      themes: ["la dette héritée"],
      counterThemes: ["le pardon consenti"],
      centralQuestion: "que doit-on à ceux qui ont menti pour nous ?",
      endingNature: "une réparation partielle",
    });
    expect(content.places).toEqual([
      { id: "place-vallon", name: "Le Vallon", description: "un hameau au fond de la vallée" },
    ]);
    expect(content.characters[0]).toMatchObject({ id: "character-nora", name: "Nora", age: 34 });
    expect(content.timeline[0]).toMatchObject({ id: "event-fire", name: "l'incendie de la grange" });
  });

  it("strips origin, lockedAt and lockedFields from every row", () => {
    const content = buildBibleVersionContent(anOverview());

    for (const section of [content.identity, content.style, content.world]) {
      expect(section).not.toHaveProperty("origin");
      expect(section).not.toHaveProperty("lockedAt");
    }
    for (const rows of [
      content.places,
      content.worldRules,
      content.characters,
      content.relationships,
      content.timeline,
    ]) {
      for (const row of rows) {
        expect(row).not.toHaveProperty("origin");
        expect(row).not.toHaveProperty("lockedAt");
      }
    }
    expect(content.characters[0]).not.toHaveProperty("lockedFields");
  });

  it("narrows canon facts to CONFIRMED, and drops the now-redundant status", () => {
    const content = buildBibleVersionContent(anOverview());

    expect(content.canonFacts).toHaveLength(1);
    expect(content.canonFacts[0]?.id).toBe("fact-confirmed");
    expect(content.canonFacts[0]).not.toHaveProperty("status");
    expect(content.canonFacts[0]).not.toHaveProperty("lockedAt");
  });

  it("returns null sections as null, not an empty object", () => {
    const content = buildBibleVersionContent(
      anOverview({ identity: null, style: null, world: null }),
    );

    expect(content.identity).toBeNull();
    expect(content.style).toBeNull();
    expect(content.world).toBeNull();
  });
});
