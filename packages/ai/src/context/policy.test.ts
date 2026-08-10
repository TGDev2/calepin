/**
 * The selection policy and the ladder, piece by piece (CAL-054).
 *
 * Everything asserted here is structural: which ids enter, in what order, and
 * what each rung of the ladder gives up. No fixture is prose and no assertion
 * reads a statement.
 */

import { describe, expect, it } from "vitest";

import { estimateTokens } from "./estimate";
import {
  CONTEXT_ITEM_CEILINGS,
  degradationStates,
  MAX_CONTINUITY_EXCERPTS,
  selectCanonFacts,
  selectContinuityExcerpts,
} from "./policy";
import type { CanonFactCandidate, ContinuityExcerptCandidate } from "./types";

function fact(id: string, options: Partial<CanonFactCandidate> = {}): CanonFactCandidate {
  return { id, statement: `statement-${id}`, isNamedByOutline: false, subjectIds: [], ...options };
}

function excerpt(
  id: string,
  priority: number,
  distance: number,
  text = `text-${id}`,
): ContinuityExcerptCandidate {
  return { id, priority, distance, text };
}

describe("selectCanonFacts — the facts actually concerned", () => {
  it("keeps a fact the outline names, and a fact whose subject the outline names", () => {
    const selected = selectCanonFacts(
      [
        fact("named", { isNamedByOutline: true }),
        fact("linked", { subjectIds: ["char-a"] }),
        fact("stranger", { subjectIds: ["char-z"] }),
      ],
      ["char-a", "place-b"],
    );

    expect(selected.map((entry) => entry.id)).toEqual(["named", "linked"]);
  });

  it("ranks named facts before linked ones, keeping the caller's order within a rank", () => {
    const selected = selectCanonFacts(
      [
        fact("linked-1", { subjectIds: ["char-a"] }),
        fact("named-1", { isNamedByOutline: true }),
        fact("linked-2", { subjectIds: ["place-b"] }),
        fact("named-2", { isNamedByOutline: true }),
      ],
      ["char-a", "place-b"],
    );

    expect(selected.map((entry) => entry.id)).toEqual([
      "named-1",
      "named-2",
      "linked-1",
      "linked-2",
    ]);
  });

  it("selects nothing when the outline names nothing", () => {
    expect(selectCanonFacts([fact("a", { subjectIds: ["char-a"] })], [])).toEqual([]);
  });
});

describe("selectContinuityExcerpts — strictly necessary means few", () => {
  it("keeps at most the cap, by priority", () => {
    const selected = selectContinuityExcerpts([
      excerpt("d", 4, 1),
      excerpt("a", 1, 5),
      excerpt("c", 3, 2),
      excerpt("b", 2, 3),
    ]);

    expect(selected).toHaveLength(MAX_CONTINUITY_EXCERPTS);
    expect(selected.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks a priority tie toward the nearer chapter", () => {
    const selected = selectContinuityExcerpts([excerpt("far", 1, 9), excerpt("near", 1, 2)]);

    expect(selected.map((entry) => entry.id)).toEqual(["near", "far"]);
  });
});

describe("degradationStates — the ladder, in order", () => {
  it("sheds detail first, then excerpts, then the farthest summaries, and stops at the floor", () => {
    const states = degradationStates({ detailedWindow: 2, excerptCount: 2, summaryCount: 5 }, 3);

    expect(states).toEqual([
      { detailedWindow: 2, excerptCount: 2, summaryCount: 5 },
      { detailedWindow: 1, excerptCount: 2, summaryCount: 5 },
      { detailedWindow: 0, excerptCount: 2, summaryCount: 5 },
      { detailedWindow: 0, excerptCount: 1, summaryCount: 5 },
      { detailedWindow: 0, excerptCount: 0, summaryCount: 5 },
      { detailedWindow: 0, excerptCount: 0, summaryCount: 4 },
      { detailedWindow: 0, excerptCount: 0, summaryCount: 3 },
    ]);
  });

  it("is a single state when there is nothing to degrade", () => {
    expect(degradationStates({ detailedWindow: 0, excerptCount: 0, summaryCount: 0 }, 0)).toEqual([
      { detailedWindow: 0, excerptCount: 0, summaryCount: 0 },
    ]);
  });
});

describe("CONTEXT_ITEM_CEILINGS — an order of magnitude under a chapter", () => {
  it("refuses a chapter-length text under every prose-carrying kind", () => {
    // A target-length chapter, synthetically: ~1 800 words. Every ceiling that
    // carries prior-chapter prose must sit far under its estimate — that gap is
    // what the acceptance criterion leans on.
    const chapterLength = Array.from({ length: 1_800 }, (_, i) => `mot-${i}`).join(" ");
    const estimated = estimateTokens(chapterLength);

    for (const ceiling of Object.values(CONTEXT_ITEM_CEILINGS)) {
      expect(estimated).toBeGreaterThan(ceiling * 2);
    }
  });
});
