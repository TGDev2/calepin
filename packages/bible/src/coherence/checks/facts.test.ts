import { describe, expect, it } from "vitest";

import {
  describeContradictoryBelief,
  describeOpposedFacts,
  describeOpposedFactsFix,
} from "../copy";
import { aBibleContent, aCanonFact, FIRE, NORA, VICTOR } from "../fixtures";
import {
  type BibleCanonFactRow,
  type BibleContentRows,
  buildBibleCoherenceSubject,
} from "../subject";
import { checkCanonFactCollisions } from "./facts";

const STATEMENT = "le père de Nora est vivant";

function withFacts(facts: readonly BibleCanonFactRow[]): BibleContentRows {
  return { ...aBibleContent(), canonFacts: facts };
}

function findings(content: BibleContentRows) {
  return checkCanonFactCollisions(buildBibleCoherenceSubject(content));
}

describe("checkCanonFactCollisions", () => {
  it("says nothing about a canon that agrees with itself", () => {
    expect(findings(aBibleContent())).toEqual([]);
  });

  it("reports the same statement held true and held false — the acceptance criterion's own case", () => {
    const [finding, ...rest] = findings(
      withFacts([
        aCanonFact({ id: "fact-true", statement: STATEMENT, isTrue: true }),
        aCanonFact({ id: "fact-false", statement: STATEMENT, isTrue: false, beliefs: [] }),
      ]),
    );

    expect(rest).toEqual([]);
    expect(finding?.checkId).toBe("bible-canon-fact-collision");
    expect(finding?.severity).toBe("CRITICAL");
    expect([...(finding?.anchor ?? [])].sort()).toEqual(
      ["fact:fact-false", "fact:fact-true"].sort(),
    );
    expect(finding?.explanation).toBe(describeOpposedFacts(STATEMENT, STATEMENT));
    expect(finding?.proposedFix).toBe(describeOpposedFactsFix());
  });

  it("compares content words, so the wording may differ in its determiners", () => {
    const found = findings(
      withFacts([
        aCanonFact({ id: "fact-true", statement: "le père de Nora est vivant", isTrue: true }),
        aCanonFact({
          id: "fact-false",
          statement: "un père de Nora est vivant",
          isTrue: false,
          beliefs: [],
        }),
      ]),
    );

    expect(found).toHaveLength(1);
  });

  it("says nothing when the two periods are provably disjoint", () => {
    expect(
      findings(
        withFacts([
          aCanonFact({
            id: "fact-true",
            statement: STATEMENT,
            isTrue: true,
            validity: "DURING_PERIOD",
            validFromDay: -1_000,
            validUntilDay: -10,
          }),
          aCanonFact({
            id: "fact-false",
            statement: STATEMENT,
            isTrue: false,
            beliefs: [],
            validity: "DURING_PERIOD",
            validFromDay: 10,
            validUntilDay: 1_000,
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it("reports two periods that overlap", () => {
    expect(
      findings(
        withFacts([
          aCanonFact({
            id: "fact-true",
            statement: STATEMENT,
            isTrue: true,
            validity: "DURING_PERIOD",
            validFromDay: -1_000,
            validUntilDay: 100,
          }),
          aCanonFact({
            id: "fact-false",
            statement: STATEMENT,
            isTrue: false,
            beliefs: [],
            validity: "DURING_PERIOD",
            validFromDay: 10,
            validUntilDay: 1_000,
          }),
        ]),
      ),
    ).toHaveLength(1);
  });

  it("reports when a bound is stated in words alone — an unprovable separation is not a separation", () => {
    // The deliberate asymmetry: a false positive costs one click and is
    // remembered forever after, a missed contradiction reaches the novel.
    expect(
      findings(
        withFacts([
          aCanonFact({
            id: "fact-true",
            statement: STATEMENT,
            isTrue: true,
            validity: "DURING_PERIOD",
            validFromDay: null,
            validUntilDay: null,
          }),
          aCanonFact({
            id: "fact-false",
            statement: STATEMENT,
            isTrue: false,
            beliefs: [],
            validity: "DURING_PERIOD",
            validFromDay: 10,
            validUntilDay: 1_000,
          }),
        ]),
      ),
    ).toHaveLength(1);
  });

  it("separates a fact that ends at a dated event from one that starts after it", () => {
    expect(
      findings(
        withFacts([
          aCanonFact({
            id: "fact-true",
            statement: STATEMENT,
            isTrue: true,
            validity: "UNTIL_EVENT",
            invalidatedByEventId: FIRE,
          }),
          aCanonFact({
            id: "fact-false",
            statement: STATEMENT,
            isTrue: false,
            beliefs: [],
            validity: "DURING_PERIOD",
            validFromDay: -3_649,
            validUntilDay: 0,
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it("ignores a fact the author has not confirmed", () => {
    // PROPOSED is waiting for an arbitration and REJECTED has been written off;
    // treating either as canon would make the check contradict the screen the
    // author just used.
    expect(
      findings(
        withFacts([
          aCanonFact({ id: "fact-true", statement: STATEMENT, isTrue: true }),
          aCanonFact({
            id: "fact-false",
            statement: STATEMENT,
            isTrue: false,
            beliefs: [],
            status: "PROPOSED",
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it("says nothing about the same statement said twice the same way", () => {
    expect(
      findings(
        withFacts([
          aCanonFact({ id: "fact-one", statement: STATEMENT, isTrue: true }),
          aCanonFact({ id: "fact-two", statement: STATEMENT, isTrue: true, beliefs: [] }),
        ]),
      ),
    ).toEqual([]);
  });

  it("reports one fact said twice giving one character two different states of knowledge", () => {
    const [finding, ...rest] = findings(
      withFacts([
        aCanonFact({
          id: "fact-one",
          statement: STATEMENT,
          beliefs: [{ characterId: VICTOR, state: "BELIEVES_TRUE" }],
        }),
        aCanonFact({
          id: "fact-two",
          statement: STATEMENT,
          beliefs: [{ characterId: VICTOR, state: "UNAWARE" }],
        }),
      ]),
    );

    expect(rest).toEqual([]);
    expect(finding?.severity).toBe("CRITICAL");
    expect([...(finding?.anchor ?? [])].sort()).toEqual(
      ["fact:fact-one", "fact:fact-two", `character:${VICTOR}`].sort(),
    );
    expect(finding?.explanation).toBe(describeContradictoryBelief("Victor", STATEMENT));
  });

  it("cannot see an opposition worded differently — the honest bound of a rule with no model", () => {
    // `detect-bible-contradictions` is the task's other half, and this is the
    // line between them, stated as a test rather than as a comment.
    expect(
      findings(
        withFacts([
          aCanonFact({ id: "fact-true", statement: "le père de Nora est vivant", isTrue: true }),
          aCanonFact({
            id: "fact-other",
            statement: "le père de Nora repose au cimetière du hameau",
            isTrue: true,
            beliefs: [],
            subjects: [{ characterId: NORA, placeId: null }],
          }),
        ]),
      ),
    ).toEqual([]);
  });
});
