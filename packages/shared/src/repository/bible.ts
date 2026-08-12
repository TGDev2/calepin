/**
 * The whole bible of a project, read at once (CAL-096).
 *
 * `getRelationshipGraph`'s shape one level wider: a bible is small enough — a
 * few dozen scalar fields and a cast measured in dozens, never the manuscript
 * itself — that the consultation screen reads it whole rather than section by
 * section, the way `getAnalysis` already does for the diagnostic. `null` when
 * the project has no bible yet, `getAnalysis`'s and `getRelationshipGraph`'s
 * own convention: nothing in the product creates a `Bible` row yet
 * (CLAUDE.md §13), so a project with none is an expected state, not a fault.
 *
 * Every row carries what the screen needs to decide its two badges without a
 * second read: `lockedAt` (`lockedFields` too, for `Character`) and either
 * `origin` — the eight models CAL-096's migration added it to — or, for
 * `CanonFact`, the `source`/`status` pair it already had. Resolving either
 * into a `ProvenanceState` is `apps/web`'s job (`@calepin/shared` may not
 * import a domain, §3.2), and so is any narrative reading of the rows —
 * `resolveTimeline`, `describeWorldBounds`, `resolveRelationshipGraph` and the
 * rest of `@calepin/bible`'s pure functions. This file only selects columns.
 */

import type { $Enums } from "@prisma/client";

import { getDatabaseClient, type TransactionClient } from "../database/client";
import type { BibleRelationship } from "./relationship";
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";

export interface BibleIdentityRow {
  readonly workingTitle: string;
  readonly genre: string;
  readonly subGenre: string;
  readonly tone: string;
  readonly narrativePromise: string;
  readonly themes: readonly string[];
  readonly counterThemes: readonly string[];
  readonly centralQuestion: string;
  readonly endingNature: string;
  readonly origin: $Enums.ContentOrigin;
  readonly lockedAt: Date | null;
}

export interface BibleStyleRow {
  readonly pointOfView: string;
  readonly focalization: string;
  readonly tense: string;
  readonly languageRegister: string;
  readonly descriptiveDensity: string;
  readonly pacing: string;
  readonly dialogueBalance: string;
  readonly recurringMotifs: readonly string[];
  readonly elementsToAvoid: readonly string[];
  readonly origin: $Enums.ContentOrigin;
  readonly lockedAt: Date | null;
}

export interface BibleWorldRow {
  readonly era: string;
  readonly socialContext: string;
  readonly politicalContext: string | null;
  readonly technologies: readonly string[];
  readonly institutions: readonly string[];
  readonly constraints: readonly string[];
  readonly origin: $Enums.ContentOrigin;
  readonly lockedAt: Date | null;
}

export interface BiblePlaceRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly origin: $Enums.ContentOrigin;
  readonly lockedAt: Date | null;
}

export interface BibleWorldRuleRow {
  readonly id: string;
  readonly name: string;
  readonly statement: string;
  readonly isSupernatural: boolean;
  readonly limits: readonly string[];
  readonly costs: readonly string[];
  readonly failureConditions: readonly string[];
  readonly origin: $Enums.ContentOrigin;
  readonly lockedAt: Date | null;
}

/** The seventeen fields of the sheet (CLAUDE.md §4.3), as they are stored. */
export interface BibleCharacterRow {
  readonly id: string;
  readonly name: string;
  readonly age: number | null;
  readonly role: string | null;
  readonly importance: $Enums.CharacterImportance;
  readonly appearance: string | null;
  readonly initialSituation: string | null;
  readonly apparentDesire: string | null;
  readonly deepNeed: string | null;
  readonly fear: string | null;
  readonly contradiction: string | null;
  readonly secret: string | null;
  readonly past: string | null;
  readonly plannedArc: string | null;
  readonly speechStyle: string | null;
  readonly heldKnowledge: readonly string[];
  readonly elementsToPreserve: readonly string[];
  readonly origin: $Enums.ContentOrigin;
  readonly lockedAt: Date | null;
  readonly lockedFields: readonly $Enums.CharacterField[];
}

/** One presence at an event — CLAUDE.md's `TimelineEventParticipant`. */
export interface BibleTimelineParticipantRow {
  readonly characterId: string;
  readonly declaredAge: number | null;
}

export interface BibleTimelineEventRow {
  readonly id: string;
  readonly name: string;
  readonly summary: string | null;
  readonly category: $Enums.TimelineEventCategory;
  readonly absoluteDay: number | null;
  readonly datePrecision: $Enums.TimelinePrecision | null;
  readonly dateLabel: string | null;
  readonly precedingEventId: string | null;
  readonly daysAfterPreceding: number | null;
  readonly durationPrecision: $Enums.TimelinePrecision | null;
  readonly origin: $Enums.ContentOrigin;
  readonly lockedAt: Date | null;
  readonly participants: readonly BibleTimelineParticipantRow[];
}

export interface BibleCanonFactBeliefRow {
  readonly characterId: string;
  readonly state: $Enums.CanonFactBeliefState;
}

/** Exactly one of the two is set — `canon_fact_subjects_exactly_one_check`. */
export interface BibleCanonFactSubjectRow {
  readonly characterId: string | null;
  readonly placeId: string | null;
}

/**
 * No `origin`: `CanonFact` keeps its own `source`/`status` pair rather than
 * carrying a third, possibly disagreeing signal (see this file's own header
 * comment and `prisma/schema.test.ts`'s "element-level provenance" suite).
 */
export interface BibleCanonFactRow {
  readonly id: string;
  readonly statement: string;
  readonly isTrue: boolean;
  readonly validity: $Enums.CanonFactValidity;
  readonly validFromDay: number | null;
  readonly validFromPrecision: $Enums.TimelinePrecision | null;
  readonly validFromLabel: string | null;
  readonly validUntilDay: number | null;
  readonly validUntilPrecision: $Enums.TimelinePrecision | null;
  readonly validUntilLabel: string | null;
  readonly invalidatedByEventId: string | null;
  readonly source: $Enums.CanonFactSource;
  readonly status: $Enums.CanonFactStatus;
  readonly lockedAt: Date | null;
  readonly beliefs: readonly BibleCanonFactBeliefRow[];
  readonly subjects: readonly BibleCanonFactSubjectRow[];
}

export interface BibleOverview {
  readonly bibleId: string;
  /** CAL-100's flag, read here so `apps/web` can derive every element's
   * provenance without a second query (this file's own header comment). */
  readonly validatedAt: Date | null;
  readonly identity: BibleIdentityRow | null;
  readonly style: BibleStyleRow | null;
  readonly world: BibleWorldRow | null;
  readonly places: readonly BiblePlaceRow[];
  readonly worldRules: readonly BibleWorldRuleRow[];
  readonly characters: readonly BibleCharacterRow[];
  readonly relationships: readonly BibleRelationship[];
  /** In storage order, not resolved order — `resolveTimeline` in
   * `@calepin/bible` is what a caller orders this by. */
  readonly timeline: readonly BibleTimelineEventRow[];
  readonly canonFacts: readonly BibleCanonFactRow[];
}

/**
 * The whole bible of the project this scope opens, or `null` when it has
 * none.
 *
 * Nine reads in parallel rather than one nested `include`: the sections are
 * independent rows (§3.5's "produced by its own mission, regenerated alone,
 * locked alone" shape), so there is no join between them to make atomic, and
 * a flat `Promise.all` is what lets Postgres run all nine at once instead of
 * one connection walking them in sequence.
 *
 * `client` is the seam a caller already inside a transaction reaches for —
 * `openProjectScope`'s own arrangement. CAL-099's validation gate runs the
 * coherence checks over this read and stamps `validatedAt` in one statement
 * chain, and a gate reading outside its own transaction would decide on a
 * bible other than the one it validates.
 */
export async function getBibleOverview(
  scope: ProjectScope,
  client?: TransactionClient,
): Promise<BibleOverview | null> {
  assertProjectScope(scope);

  const database = client ?? getDatabaseClient();

  const bible = await database.bible.findFirst({
    where: scopedWhere("Bible", scope),
    select: { id: true, validatedAt: true },
  });

  if (bible === null) {
    return null;
  }

  const bibleId = bible.id;

  const [
    identity,
    style,
    world,
    places,
    worldRules,
    characters,
    relationships,
    timeline,
    canonFacts,
  ] = await Promise.all([
    database.bibleIdentity.findFirst({
      where: scopedWhere("BibleIdentity", scope, { bibleId }),
      select: {
        workingTitle: true,
        genre: true,
        subGenre: true,
        tone: true,
        narrativePromise: true,
        themes: true,
        counterThemes: true,
        centralQuestion: true,
        endingNature: true,
        origin: true,
        lockedAt: true,
      },
    }),
    database.bibleStyle.findFirst({
      where: scopedWhere("BibleStyle", scope, { bibleId }),
      select: {
        pointOfView: true,
        focalization: true,
        tense: true,
        languageRegister: true,
        descriptiveDensity: true,
        pacing: true,
        dialogueBalance: true,
        recurringMotifs: true,
        elementsToAvoid: true,
        origin: true,
        lockedAt: true,
      },
    }),
    database.bibleWorld.findFirst({
      where: scopedWhere("BibleWorld", scope, { bibleId }),
      select: {
        era: true,
        socialContext: true,
        politicalContext: true,
        technologies: true,
        institutions: true,
        constraints: true,
        origin: true,
        lockedAt: true,
      },
    }),
    database.place.findMany({
      where: scopedWhere("Place", scope, { bibleId }),
      select: {
        id: true,
        name: true,
        description: true,
        origin: true,
        lockedAt: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    database.worldRule.findMany({
      where: scopedWhere("WorldRule", scope, { bibleId }),
      select: {
        id: true,
        name: true,
        statement: true,
        isSupernatural: true,
        limits: true,
        costs: true,
        failureConditions: true,
        origin: true,
        lockedAt: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    database.character.findMany({
      where: scopedWhere("Character", scope, { bibleId }),
      select: {
        id: true,
        name: true,
        age: true,
        role: true,
        importance: true,
        appearance: true,
        initialSituation: true,
        apparentDesire: true,
        deepNeed: true,
        fear: true,
        contradiction: true,
        secret: true,
        past: true,
        plannedArc: true,
        speechStyle: true,
        heldKnowledge: true,
        elementsToPreserve: true,
        origin: true,
        lockedAt: true,
        lockedFields: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    database.relationship.findMany({
      where: scopedWhere("Relationship", scope, { bibleId }),
      select: {
        id: true,
        fromCharacterId: true,
        toCharacterId: true,
        type: true,
        label: true,
        description: true,
        origin: true,
        lockedAt: true,
      },
      orderBy: [{ fromCharacterId: "asc" }, { toCharacterId: "asc" }, { type: "asc" }],
    }),
    database.timelineEvent.findMany({
      where: scopedWhere("TimelineEvent", scope, { bibleId }),
      select: {
        id: true,
        name: true,
        summary: true,
        category: true,
        absoluteDay: true,
        datePrecision: true,
        dateLabel: true,
        precedingEventId: true,
        daysAfterPreceding: true,
        durationPrecision: true,
        origin: true,
        lockedAt: true,
        participants: {
          select: { characterId: true, declaredAge: true },
          orderBy: { characterId: "asc" },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    database.canonFact.findMany({
      where: scopedWhere("CanonFact", scope, { bibleId }),
      select: {
        id: true,
        statement: true,
        isTrue: true,
        validity: true,
        validFromDay: true,
        validFromPrecision: true,
        validFromLabel: true,
        validUntilDay: true,
        validUntilPrecision: true,
        validUntilLabel: true,
        invalidatedByEventId: true,
        source: true,
        status: true,
        lockedAt: true,
        beliefs: {
          select: { characterId: true, state: true },
          orderBy: { characterId: "asc" },
        },
        subjects: {
          select: { characterId: true, placeId: true },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    bibleId,
    validatedAt: bible.validatedAt,
    identity,
    style,
    world,
    places,
    worldRules,
    characters,
    relationships,
    timeline,
    canonFacts,
  };
}
