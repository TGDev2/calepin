/**
 * Cross-section search over a bible (CAL-096) — the acceptance criterion is
 * ten seconds to find one canon fact, so the index is built once from the
 * data the server already read and matched entirely on the client: no round
 * trip is fast enough to be the bottleneck a network call would make it.
 *
 * A simple, case- and accent-insensitive substring match, deliberately not
 * `createVerbatimMatcher` (`@calepin/shared/text`): that one exists to prove
 * a quotation is verbatim in a source, word by word — the opposite question
 * from *does this look like what the author is typing*, which is what a
 * search-as-you-type box asks.
 */

import type { BibleOverview } from "@calepin/shared/repository";

export const BIBLE_SEARCH_SECTIONS = [
  "identity",
  "style",
  "world",
  "characters",
  "timeline",
  "canon-facts",
] as const;

export type BibleSearchSection = (typeof BIBLE_SEARCH_SECTIONS)[number];

export interface BibleSearchEntry {
  readonly section: BibleSearchSection;
  readonly anchorId: string;
  readonly title: string;
  readonly snippet: string;
  readonly haystack: string;
}

export function characterAnchorId(characterId: string): string {
  return `character-${characterId}`;
}

export function placeAnchorId(placeId: string): string {
  return `place-${placeId}`;
}

export function worldRuleAnchorId(worldRuleId: string): string {
  return `world-rule-${worldRuleId}`;
}

export function timelineEventAnchorId(eventId: string): string {
  return `timeline-event-${eventId}`;
}

export function canonFactAnchorId(factId: string): string {
  return `canon-fact-${factId}`;
}

// The combining diacritical marks block (U+0300-U+036F), named by code point
// rather than typed literally: a raw combining character in source reads as
// nothing on screen and cannot be matched back out of the file (lesson
// recorded in tasks/lessons.md).
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

function entry(
  section: BibleSearchSection,
  anchorId: string,
  title: string,
  snippet: string,
  fields: readonly (string | null | undefined)[],
): BibleSearchEntry {
  return {
    section,
    anchorId,
    title,
    snippet,
    haystack: normalize([title, ...fields.filter((field): field is string => Boolean(field))].join(" • ")),
  };
}

/** One entry per character, one per place, one per rule, one per event, one
 * per fact — plus one each for the three single-row sections (identity,
 * style, world) so a query matching their prose still surfaces something to
 * jump to. */
export function buildBibleSearchIndex(
  overview: BibleOverview,
  characterNameOf: ReadonlyMap<string, string>,
): readonly BibleSearchEntry[] {
  const entries: BibleSearchEntry[] = [];

  if (overview.identity !== null) {
    const { identity } = overview;
    entries.push(
      entry("identity", "identity", identity.workingTitle || "Identité du roman", identity.genre, [
        identity.genre,
        identity.subGenre,
        identity.tone,
        identity.narrativePromise,
        identity.centralQuestion,
        identity.endingNature,
        ...identity.themes,
        ...identity.counterThemes,
      ]),
    );
  }

  if (overview.style !== null) {
    const { style } = overview;
    entries.push(
      entry("style", "style", "Style", style.pointOfView, [
        style.pointOfView,
        style.focalization,
        style.tense,
        style.languageRegister,
        style.descriptiveDensity,
        style.pacing,
        style.dialogueBalance,
        ...style.recurringMotifs,
        ...style.elementsToAvoid,
      ]),
    );
  }

  if (overview.world !== null) {
    const { world } = overview;
    entries.push(
      entry("world", "world", "Monde", world.era, [
        world.era,
        world.socialContext,
        world.politicalContext,
        ...world.technologies,
        ...world.institutions,
        ...world.constraints,
      ]),
    );
  }

  for (const place of overview.places) {
    entries.push(entry("world", placeAnchorId(place.id), place.name, place.description ?? "", [
      place.description,
    ]));
  }

  for (const rule of overview.worldRules) {
    entries.push(
      entry("world", worldRuleAnchorId(rule.id), rule.name, rule.statement, [
        rule.statement,
        ...rule.limits,
        ...rule.costs,
        ...rule.failureConditions,
      ]),
    );
  }

  for (const character of overview.characters) {
    entries.push(
      entry(
        "characters",
        characterAnchorId(character.id),
        character.name,
        character.role ?? character.initialSituation ?? "",
        [
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
        ],
      ),
    );
  }

  for (const event of overview.timeline) {
    entries.push(
      entry("timeline", timelineEventAnchorId(event.id), event.name, event.summary ?? "", [
        event.summary,
        event.dateLabel,
      ]),
    );
  }

  for (const fact of overview.canonFacts) {
    const subjectNames = fact.subjects
      .map((subject) => (subject.characterId === null ? null : characterNameOf.get(subject.characterId)))
      .filter((name): name is string => Boolean(name));

    entries.push(
      entry(
        "canon-facts",
        canonFactAnchorId(fact.id),
        fact.statement.length > 60 ? `${fact.statement.slice(0, 60)}…` : fact.statement,
        fact.statement,
        [fact.statement, ...subjectNames],
      ),
    );
  }

  return entries;
}

/** Every entry whose haystack contains the query, in index order. Nothing is
 * returned for a blank query — a screen showing everything is not a search
 * result. */
export function searchBibleIndex(
  index: readonly BibleSearchEntry[],
  query: string,
): readonly BibleSearchEntry[] {
  const needle = normalize(query.trim());
  if (needle === "") return [];

  return index.filter((candidate) => candidate.haystack.includes(needle));
}
