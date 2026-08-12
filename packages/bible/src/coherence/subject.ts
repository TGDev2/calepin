/**
 * What the bible's checks are given (CAL-099).
 *
 * Structural, id-keyed, and declared here rather than imported: a row read out
 * of `getBibleOverview` satisfies these interfaces as they stand, and so does a
 * fixture written by hand. That is the arrangement `TimelineArithmeticInput`
 * already uses one section over, and it buys the same two things — the checks
 * are testable with no database (§8), and the domain holds no Prisma type.
 *
 * **Ids, not indexes.** `checkTimelineArithmetic` is index-keyed because a
 * model answer has no ids to offer; here the rows exist, and a finding's
 * identity has to survive an insertion elsewhere in the list. An index would
 * move when an unrelated event is added, and the author's arbitration would
 * move with it.
 *
 * `canonFacts` is deliberately the caller's business to filter: what is canon
 * is `CONFIRMED`, and `buildBibleCoherenceSubject` is where that is decided,
 * once, rather than in four checks that could disagree.
 */

import type { CanonFactBeliefState, CanonFactStatus, CanonFactValidity } from "../canon-fact/types";
import type { CharacterRelationshipType } from "../character/schema";
import type { TimelineEventCategoryInput, TimelinePrecisionInput } from "../timeline/schema";

/**
 * Where a passage of the bible's prose comes from.
 *
 * A closed list, because the undeclared-name check reports *where* a name
 * appears and the screen has to say it in French. Naming the section rather
 * than the column keeps the vocabulary short enough for the author to read.
 */
export const BIBLE_PROSE_SOURCES = [
  "identity",
  "style",
  "world",
  "place",
  "world-rule",
  "character",
  "relationship",
  "timeline-event",
  "canon-fact",
] as const;
export type BibleProseSource = (typeof BIBLE_PROSE_SOURCES)[number];

export interface BibleProsePassage {
  readonly source: BibleProseSource;
  /** The row the passage belongs to, or null for the three singleton sections. */
  readonly rowId: string | null;
  readonly text: string;
}

export interface CoherenceCharacter {
  readonly id: string;
  readonly name: string;
  /** Age at day 0 of the chronology — the left-hand side of the arithmetic. */
  readonly age: number | null;
}

export interface CoherencePlace {
  readonly id: string;
  readonly name: string;
}

export interface CoherenceRelationship {
  readonly id: string;
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly type: CharacterRelationshipType;
}

export interface CoherenceTimelineParticipant {
  readonly characterId: string;
  /** The age the bible asserts at this event, never a cache of a computation. */
  readonly declaredAge: number | null;
}

export interface CoherenceTimelineEvent {
  readonly id: string;
  readonly name: string;
  readonly category: TimelineEventCategoryInput;
  readonly absoluteDay: number | null;
  readonly datePrecision: TimelinePrecisionInput | null;
  readonly precedingEventId: string | null;
  readonly daysAfterPreceding: number | null;
  readonly durationPrecision: TimelinePrecisionInput | null;
  readonly participants: readonly CoherenceTimelineParticipant[];
}

export interface CoherenceCanonFactBelief {
  readonly characterId: string;
  readonly state: CanonFactBeliefState;
}

export interface CoherenceCanonFact {
  readonly id: string;
  readonly statement: string;
  readonly isTrue: boolean;
  readonly validity: CanonFactValidity;
  readonly validFromDay: number | null;
  readonly validUntilDay: number | null;
  readonly invalidatedByEventId: string | null;
  readonly beliefs: readonly CoherenceCanonFactBelief[];
  readonly subjectCharacterIds: readonly string[];
  readonly subjectPlaceIds: readonly string[];
}

export interface CoherenceWorldRule {
  readonly id: string;
  readonly name: string;
  readonly statement: string;
  readonly isSupernatural: boolean;
  readonly limits: readonly string[];
  readonly costs: readonly string[];
  readonly failureConditions: readonly string[];
}

export interface BibleCoherenceSubject {
  readonly characters: readonly CoherenceCharacter[];
  readonly places: readonly CoherencePlace[];
  readonly relationships: readonly CoherenceRelationship[];
  readonly timeline: readonly CoherenceTimelineEvent[];
  /** The canon, already narrowed to what the author confirmed. */
  readonly canonFacts: readonly CoherenceCanonFact[];
  readonly worldRules: readonly CoherenceWorldRule[];
  /** Every passage of the bible's prose, for the checks that read words. */
  readonly prose: readonly BibleProsePassage[];
}

/**
 * The bible as the repository hands it over.
 *
 * Structural on purpose: `BibleOverview` satisfies it as it stands, so
 * `packages/bible` needs no Prisma type to build a subject, and a fixture needs
 * no database to build one either. Only the fields the checks read are
 * declared — a narrower interface is a narrower blast radius the day a column
 * moves.
 */
export interface BibleContentRows {
  readonly identity: BibleIdentityProse | null;
  readonly style: BibleStyleProse | null;
  readonly world: BibleWorldProse | null;
  readonly places: readonly BiblePlaceRow[];
  readonly worldRules: readonly BibleWorldRuleRow[];
  readonly characters: readonly BibleCharacterRow[];
  readonly relationships: readonly BibleRelationshipRow[];
  readonly timeline: readonly BibleTimelineRow[];
  readonly canonFacts: readonly BibleCanonFactRow[];
}

export interface BibleIdentityProse {
  readonly genre: string;
  readonly subGenre: string;
  readonly tone: string;
  readonly narrativePromise: string;
  readonly themes: readonly string[];
  readonly counterThemes: readonly string[];
  readonly centralQuestion: string;
  readonly endingNature: string;
}

export interface BibleStyleProse {
  readonly pointOfView: string;
  readonly focalization: string;
  readonly tense: string;
  readonly languageRegister: string;
  readonly descriptiveDensity: string;
  readonly pacing: string;
  readonly dialogueBalance: string;
  readonly recurringMotifs: readonly string[];
  readonly elementsToAvoid: readonly string[];
}

export interface BibleWorldProse {
  readonly era: string;
  readonly socialContext: string;
  readonly politicalContext: string | null;
  readonly technologies: readonly string[];
  readonly institutions: readonly string[];
  readonly constraints: readonly string[];
}

export interface BiblePlaceRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

export type BibleWorldRuleRow = CoherenceWorldRule;

export interface BibleCharacterRow {
  readonly id: string;
  readonly name: string;
  readonly age: number | null;
  readonly role: string | null;
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
}

export interface BibleRelationshipRow extends CoherenceRelationship {
  readonly label: string;
  readonly description: string | null;
}

export interface BibleTimelineRow extends CoherenceTimelineEvent {
  readonly summary: string | null;
}

export interface BibleCanonFactRow {
  readonly id: string;
  readonly statement: string;
  readonly isTrue: boolean;
  readonly validity: CanonFactValidity;
  readonly validFromDay: number | null;
  readonly validUntilDay: number | null;
  readonly invalidatedByEventId: string | null;
  readonly status: CanonFactStatus;
  readonly beliefs: readonly CoherenceCanonFactBelief[];
  readonly subjects: readonly {
    readonly characterId: string | null;
    readonly placeId: string | null;
  }[];
}

function passages(
  source: BibleProseSource,
  rowId: string | null,
  values: readonly (string | null)[],
): readonly BibleProsePassage[] {
  return values
    .filter((value): value is string => value !== null && value.trim().length > 0)
    .map((text) => ({ source, rowId, text }));
}

/**
 * Every passage of the bible's prose, for the checks that read words.
 *
 * `BibleIdentity.workingTitle` is deliberately absent. A title is capitalised
 * typographically — *Le Chant des Cendres* — so scanning it would report a name
 * per title, forever, in every project. It names nothing the story references.
 */
function proseOf(content: BibleContentRows): readonly BibleProsePassage[] {
  const { identity, style, world } = content;

  return [
    ...passages(
      "identity",
      null,
      identity === null
        ? []
        : [
            identity.genre,
            identity.subGenre,
            identity.tone,
            identity.narrativePromise,
            identity.centralQuestion,
            identity.endingNature,
            ...identity.themes,
            ...identity.counterThemes,
          ],
    ),
    ...passages(
      "style",
      null,
      style === null
        ? []
        : [
            style.pointOfView,
            style.focalization,
            style.tense,
            style.languageRegister,
            style.descriptiveDensity,
            style.pacing,
            style.dialogueBalance,
            ...style.recurringMotifs,
            ...style.elementsToAvoid,
          ],
    ),
    ...passages(
      "world",
      null,
      world === null
        ? []
        : [
            world.era,
            world.socialContext,
            world.politicalContext,
            ...world.technologies,
            ...world.institutions,
            ...world.constraints,
          ],
    ),
    ...content.places.flatMap((place) => passages("place", place.id, [place.description])),
    ...content.worldRules.flatMap((rule) =>
      passages("world-rule", rule.id, [
        rule.statement,
        ...rule.limits,
        ...rule.costs,
        ...rule.failureConditions,
      ]),
    ),
    ...content.characters.flatMap((character) =>
      passages("character", character.id, [
        character.role,
        character.appearance,
        character.initialSituation,
        character.apparentDesire,
        character.deepNeed,
        character.fear,
        character.contradiction,
        character.secret,
        character.past,
        character.plannedArc,
        character.speechStyle,
        ...character.heldKnowledge,
        ...character.elementsToPreserve,
      ]),
    ),
    ...content.relationships.flatMap((relationship) =>
      passages("relationship", relationship.id, [relationship.label, relationship.description]),
    ),
    ...content.timeline.flatMap((event) =>
      passages("timeline-event", event.id, [event.name, event.summary]),
    ),
    ...content.canonFacts.flatMap((fact) => passages("canon-fact", fact.id, [fact.statement])),
  ];
}

/**
 * The subject the bible's suite runs over.
 *
 * The one narrowing that happens here and nowhere else: **only `CONFIRMED`
 * facts are canon.** A `PROPOSED` row is waiting for the author to arbitrate it
 * and a `REJECTED` one has been written off; treating either as canon would
 * make the check contradict the screen the author just used. Deciding it once,
 * here, is what stops four checks disagreeing about it.
 */
export function buildBibleCoherenceSubject(content: BibleContentRows): BibleCoherenceSubject {
  return {
    characters: content.characters.map((character) => ({
      id: character.id,
      name: character.name,
      age: character.age,
    })),
    places: content.places.map((place) => ({ id: place.id, name: place.name })),
    relationships: content.relationships.map((relationship) => ({
      id: relationship.id,
      fromCharacterId: relationship.fromCharacterId,
      toCharacterId: relationship.toCharacterId,
      type: relationship.type,
    })),
    timeline: content.timeline.map((event) => ({
      id: event.id,
      name: event.name,
      category: event.category,
      absoluteDay: event.absoluteDay,
      datePrecision: event.datePrecision,
      precedingEventId: event.precedingEventId,
      daysAfterPreceding: event.daysAfterPreceding,
      durationPrecision: event.durationPrecision,
      participants: event.participants,
    })),
    canonFacts: content.canonFacts
      .filter((fact) => fact.status === "CONFIRMED")
      .map((fact) => ({
        id: fact.id,
        statement: fact.statement,
        isTrue: fact.isTrue,
        validity: fact.validity,
        validFromDay: fact.validFromDay,
        validUntilDay: fact.validUntilDay,
        invalidatedByEventId: fact.invalidatedByEventId,
        beliefs: fact.beliefs,
        subjectCharacterIds: fact.subjects
          .map((subject) => subject.characterId)
          .filter((id): id is string => id !== null),
        subjectPlaceIds: fact.subjects
          .map((subject) => subject.placeId)
          .filter((id): id is string => id !== null),
      })),
    worldRules: content.worldRules,
    prose: proseOf(content),
  };
}

/** Names by id, for the checks that report about rows and the copy that names them. */
export function characterNames(subject: BibleCoherenceSubject): ReadonlyMap<string, string> {
  return new Map(subject.characters.map((character) => [character.id, character.name]));
}

export function placeNames(subject: BibleCoherenceSubject): ReadonlyMap<string, string> {
  return new Map(subject.places.map((place) => [place.id, place.name]));
}

export function timelineEventNames(subject: BibleCoherenceSubject): ReadonlyMap<string, string> {
  return new Map(subject.timeline.map((event) => [event.id, event.name]));
}
