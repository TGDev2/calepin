import type { BibleOverview } from "@calepin/shared/repository";
import { describe, expect, it } from "vitest";

import {
  buildBibleSearchIndex,
  canonFactAnchorId,
  characterAnchorId,
  searchBibleIndex,
} from "./bible-search";

const EMPTY_OVERVIEW: BibleOverview = {
  bibleId: "bible-1",
  validatedAt: null,
  identity: null,
  style: null,
  world: null,
  places: [],
  worldRules: [],
  characters: [],
  relationships: [],
  timeline: [],
  canonFacts: [],
};

function overview(overrides: Partial<BibleOverview>): BibleOverview {
  return { ...EMPTY_OVERVIEW, ...overrides };
}

describe("buildBibleSearchIndex / searchBibleIndex", () => {
  it("finds a canon fact by an accent- and case-insensitive substring of its statement", () => {
    const index = buildBibleSearchIndex(
      overview({
        canonFacts: [
          {
            id: "fact-1",
            statement: "Nora ignore que son père est encore vivant",
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
            lockedAt: null,
            beliefs: [],
            subjects: [],
          },
        ],
      }),
      new Map(),
    );

    const results = searchBibleIndex(index, "PERE");
    expect(results).toHaveLength(1);
    expect(results[0]?.anchorId).toBe(canonFactAnchorId("fact-1"));
    expect(results[0]?.section).toBe("canon-facts");
  });

  it("finds a character by a field the roster does not show in its title", () => {
    const index = buildBibleSearchIndex(
      overview({
        characters: [
          {
            id: "char-1",
            name: "Julien",
            age: null,
            role: null,
            importance: "SECONDARY",
            appearance: null,
            initialSituation: null,
            apparentDesire: null,
            deepNeed: null,
            fear: "les quais de gare déserts",
            contradiction: null,
            secret: null,
            past: null,
            plannedArc: null,
            speechStyle: null,
            heldKnowledge: [],
            elementsToPreserve: [],
            origin: "GENERATED",
            lockedAt: null,
            lockedFields: [],
          },
        ],
      }),
      new Map([["char-1", "Julien"]]),
    );

    const results = searchBibleIndex(index, "quais de gare");
    expect(results).toHaveLength(1);
    expect(results[0]?.anchorId).toBe(characterAnchorId("char-1"));
  });

  it("returns nothing for a blank query rather than everything", () => {
    const index = buildBibleSearchIndex(overview({}), new Map());
    expect(searchBibleIndex(index, "   ")).toEqual([]);
  });

  it("returns nothing when nothing matches", () => {
    const index = buildBibleSearchIndex(overview({}), new Map());
    expect(searchBibleIndex(index, "nonexistent")).toEqual([]);
  });
});
