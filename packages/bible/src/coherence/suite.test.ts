import { BIBLE_DETERMINISTIC_CHECKS } from "@calepin/shared/coherence";
import { describe, expect, it } from "vitest";

import { aBibleContent } from "./fixtures";
import { buildBibleCoherenceSubject } from "./subject";
import { BIBLE_COHERENCE_SUITE, BIBLE_SUITE_CHECK_IDS, checkBibleCoherence } from "./suite";

describe("the bible suite", () => {
  it("runs exactly the checks the vocabulary calls calculable", () => {
    // The pin that makes the split load-bearing: a check added to the array and
    // not to the vocabulary would let a run close findings under an identifier
    // nothing recomputes.
    expect([...BIBLE_SUITE_CHECK_IDS].sort()).toEqual([...BIBLE_DETERMINISTIC_CHECKS].sort());
  });

  it("declares each check once", () => {
    expect(new Set(BIBLE_SUITE_CHECK_IDS).size).toBe(BIBLE_COHERENCE_SUITE.length);
  });

  it("finds nothing wrong with a bible that holds together", () => {
    const run = checkBibleCoherence(buildBibleCoherenceSubject(aBibleContent()));

    expect(run.findings).toEqual([]);
    expect(run.report.blocking).toBe(0);
  });

  it("finds nothing in an empty bible", () => {
    const run = checkBibleCoherence(
      buildBibleCoherenceSubject({
        identity: null,
        style: null,
        world: null,
        places: [],
        worldRules: [],
        characters: [],
        relationships: [],
        timeline: [],
        canonFacts: [],
      }),
    );

    expect(run.findings).toEqual([]);
  });
});
