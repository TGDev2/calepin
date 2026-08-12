/**
 * The frozen content of a bible savepoint (CAL-100).
 *
 * `getBibleOverview` already reads the whole bible in one shot — the same read
 * CAL-099's coherence gate runs against. This is that shape, narrowed to what
 * a future generation actually needs: every field describes what the story
 * *says*, never the editing state around it. `origin`, `lockedAt` and
 * `lockedFields` are dropped from every row on the way in — a mission reading
 * "the reference bible" has no use for who last touched a field or whether it
 * is still editable, and dropping them here is also what keeps the content
 * plain JSON with no `Date` anywhere, so no serialization step is needed
 * before it reaches `BibleVersion.content`.
 *
 * Canon facts are narrowed to `status === "CONFIRMED"` — `buildBibleCoherenceSubject`'s
 * own one-narrowing-point discipline, restated here rather than imported,
 * because a bible savepoint and a coherence subject answer different
 * questions from the same rows and neither package may depend on the other's
 * internals for it (§3.2). A `PROPOSED` or `REJECTED` fact is not canon and
 * must not read as settled truth to whatever reads this later — `status`
 * itself is then dropped, since every fact left is `CONFIRMED` by
 * construction.
 */

import type {
  BibleCanonFactRow,
  BibleCharacterRow,
  BibleIdentityRow,
  BibleOverview,
  BiblePlaceRow,
  BibleRelationship,
  BibleStyleRow,
  BibleTimelineEventRow,
  BibleWorldRow,
  BibleWorldRuleRow,
} from "@calepin/shared/repository";

export interface ReferenceBibleIdentity {
  readonly workingTitle: string;
  readonly genre: string;
  readonly subGenre: string;
  readonly tone: string;
  readonly narrativePromise: string;
  readonly themes: readonly string[];
  readonly counterThemes: readonly string[];
  readonly centralQuestion: string;
  readonly endingNature: string;
}

export interface ReferenceBibleStyle {
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

export interface ReferenceBibleWorld {
  readonly era: string;
  readonly socialContext: string;
  readonly politicalContext: string | null;
  readonly technologies: readonly string[];
  readonly institutions: readonly string[];
  readonly constraints: readonly string[];
}

export interface ReferenceBiblePlace {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

export interface ReferenceBibleWorldRule {
  readonly id: string;
  readonly name: string;
  readonly statement: string;
  readonly isSupernatural: boolean;
  readonly limits: readonly string[];
  readonly costs: readonly string[];
  readonly failureConditions: readonly string[];
}

export interface ReferenceBibleCharacter {
  readonly id: string;
  readonly name: string;
  readonly age: number | null;
  readonly role: string | null;
  readonly importance: BibleCharacterRow["importance"];
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

export interface ReferenceBibleRelationship {
  readonly id: string;
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly type: BibleRelationship["type"];
  readonly label: string;
  readonly description: string | null;
}

export interface ReferenceBibleTimelineEvent {
  readonly id: string;
  readonly name: string;
  readonly summary: string | null;
  readonly category: BibleTimelineEventRow["category"];
  readonly absoluteDay: number | null;
  readonly datePrecision: BibleTimelineEventRow["datePrecision"];
  readonly dateLabel: string | null;
  readonly precedingEventId: string | null;
  readonly daysAfterPreceding: number | null;
  readonly durationPrecision: BibleTimelineEventRow["durationPrecision"];
  readonly participants: BibleTimelineEventRow["participants"];
}

export interface ReferenceCanonFact {
  readonly id: string;
  readonly statement: string;
  readonly isTrue: boolean;
  readonly validity: BibleCanonFactRow["validity"];
  readonly validFromDay: number | null;
  readonly validFromPrecision: BibleCanonFactRow["validFromPrecision"];
  readonly validFromLabel: string | null;
  readonly validUntilDay: number | null;
  readonly validUntilPrecision: BibleCanonFactRow["validUntilPrecision"];
  readonly validUntilLabel: string | null;
  readonly invalidatedByEventId: string | null;
  readonly source: BibleCanonFactRow["source"];
  readonly beliefs: BibleCanonFactRow["beliefs"];
  readonly subjects: BibleCanonFactRow["subjects"];
}

/**
 * The whole bible, as a generation should read it — never as the author is
 * currently editing it.
 */
export interface BibleVersionContent {
  readonly identity: ReferenceBibleIdentity | null;
  readonly style: ReferenceBibleStyle | null;
  readonly world: ReferenceBibleWorld | null;
  readonly places: readonly ReferenceBiblePlace[];
  readonly worldRules: readonly ReferenceBibleWorldRule[];
  readonly characters: readonly ReferenceBibleCharacter[];
  readonly relationships: readonly ReferenceBibleRelationship[];
  readonly timeline: readonly ReferenceBibleTimelineEvent[];
  readonly canonFacts: readonly ReferenceCanonFact[];
}

function stripIdentity(identity: BibleIdentityRow): ReferenceBibleIdentity {
  return {
    workingTitle: identity.workingTitle,
    genre: identity.genre,
    subGenre: identity.subGenre,
    tone: identity.tone,
    narrativePromise: identity.narrativePromise,
    themes: identity.themes,
    counterThemes: identity.counterThemes,
    centralQuestion: identity.centralQuestion,
    endingNature: identity.endingNature,
  };
}

function stripStyle(style: BibleStyleRow): ReferenceBibleStyle {
  return {
    pointOfView: style.pointOfView,
    focalization: style.focalization,
    tense: style.tense,
    languageRegister: style.languageRegister,
    descriptiveDensity: style.descriptiveDensity,
    pacing: style.pacing,
    dialogueBalance: style.dialogueBalance,
    recurringMotifs: style.recurringMotifs,
    elementsToAvoid: style.elementsToAvoid,
  };
}

function stripWorld(world: BibleWorldRow): ReferenceBibleWorld {
  return {
    era: world.era,
    socialContext: world.socialContext,
    politicalContext: world.politicalContext,
    technologies: world.technologies,
    institutions: world.institutions,
    constraints: world.constraints,
  };
}

function stripPlace(place: BiblePlaceRow): ReferenceBiblePlace {
  return { id: place.id, name: place.name, description: place.description };
}

function stripWorldRule(rule: BibleWorldRuleRow): ReferenceBibleWorldRule {
  return {
    id: rule.id,
    name: rule.name,
    statement: rule.statement,
    isSupernatural: rule.isSupernatural,
    limits: rule.limits,
    costs: rule.costs,
    failureConditions: rule.failureConditions,
  };
}

function stripCharacter(character: BibleCharacterRow): ReferenceBibleCharacter {
  return {
    id: character.id,
    name: character.name,
    age: character.age,
    role: character.role,
    importance: character.importance,
    appearance: character.appearance,
    initialSituation: character.initialSituation,
    apparentDesire: character.apparentDesire,
    deepNeed: character.deepNeed,
    fear: character.fear,
    contradiction: character.contradiction,
    secret: character.secret,
    past: character.past,
    plannedArc: character.plannedArc,
    speechStyle: character.speechStyle,
    heldKnowledge: character.heldKnowledge,
    elementsToPreserve: character.elementsToPreserve,
  };
}

function stripRelationship(relationship: BibleRelationship): ReferenceBibleRelationship {
  return {
    id: relationship.id,
    fromCharacterId: relationship.fromCharacterId,
    toCharacterId: relationship.toCharacterId,
    type: relationship.type,
    label: relationship.label,
    description: relationship.description,
  };
}

function stripTimelineEvent(event: BibleTimelineEventRow): ReferenceBibleTimelineEvent {
  return {
    id: event.id,
    name: event.name,
    summary: event.summary,
    category: event.category,
    absoluteDay: event.absoluteDay,
    datePrecision: event.datePrecision,
    dateLabel: event.dateLabel,
    precedingEventId: event.precedingEventId,
    daysAfterPreceding: event.daysAfterPreceding,
    durationPrecision: event.durationPrecision,
    participants: event.participants,
  };
}

function stripCanonFact(fact: BibleCanonFactRow): ReferenceCanonFact {
  return {
    id: fact.id,
    statement: fact.statement,
    isTrue: fact.isTrue,
    validity: fact.validity,
    validFromDay: fact.validFromDay,
    validFromPrecision: fact.validFromPrecision,
    validFromLabel: fact.validFromLabel,
    validUntilDay: fact.validUntilDay,
    validUntilPrecision: fact.validUntilPrecision,
    validUntilLabel: fact.validUntilLabel,
    invalidatedByEventId: fact.invalidatedByEventId,
    source: fact.source,
    beliefs: fact.beliefs,
    subjects: fact.subjects,
  };
}

/** What `mintBibleVersion` stores — see this file's own header comment. */
export function buildBibleVersionContent(overview: BibleOverview): BibleVersionContent {
  return {
    identity: overview.identity === null ? null : stripIdentity(overview.identity),
    style: overview.style === null ? null : stripStyle(overview.style),
    world: overview.world === null ? null : stripWorld(overview.world),
    places: overview.places.map(stripPlace),
    worldRules: overview.worldRules.map(stripWorldRule),
    characters: overview.characters.map(stripCharacter),
    relationships: overview.relationships.map(stripRelationship),
    timeline: overview.timeline.map(stripTimelineEvent),
    canonFacts: overview.canonFacts
      .filter((fact) => fact.status === "CONFIRMED")
      .map(stripCanonFact),
  };
}
