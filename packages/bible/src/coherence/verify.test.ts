import { describe, expect, it } from "vitest";

import { aContradictionsAnswer, aContradictionsInput } from "./fixtures";
import { bibleContradictionsSchema } from "./schema";
import { isVerifiedBibleContradictions, verifyBibleContradictions } from "./verify";

describe("verifyBibleContradictions", () => {
  it("keeps an answer whose pairs the ask actually offered, and brands it", () => {
    const verification = verifyBibleContradictions(aContradictionsAnswer(), aContradictionsInput());

    expect(verification.report.dropped).toEqual([]);
    expect(verification.report.verified).toBe(2);
    expect(isVerifiedBibleContradictions(verification.contradictions)).toBe(true);
  });

  it("drops a pair naming a fact the ask never offered", () => {
    const verification = verifyBibleContradictions(
      aContradictionsAnswer({
        opposedFacts: [
          { firstIndex: 0, secondIndex: 9, explanation: "un fait", proposedFix: "un acte" },
        ],
      }),
      aContradictionsInput(),
    );

    expect(verification.contradictions.opposedFacts).toEqual([]);
    expect(verification.report.dropped).toEqual([
      { list: "opposedFacts", index: 0, reason: "unknown-element" },
    ]);
  });

  it("drops a pair naming a rule the ask never offered", () => {
    const verification = verifyBibleContradictions(
      aContradictionsAnswer({
        contradictoryRules: [
          { firstIndex: 0, secondIndex: 7, explanation: "une règle", proposedFix: "un acte" },
        ],
      }),
      aContradictionsInput(),
    );

    expect(verification.contradictions.contradictoryRules).toEqual([]);
    expect(verification.report.dropped[0]?.reason).toBe("unknown-element");
  });

  it("keeps the pairs that were right when one of them was not", () => {
    // The reason there is no refusal arm: throwing away an answer because one
    // pair was mis-numbered discards the pairs somebody paid for and that hold.
    const verification = verifyBibleContradictions(
      aContradictionsAnswer({
        opposedFacts: [
          { firstIndex: 0, secondIndex: 9, explanation: "un fait", proposedFix: "un acte" },
          { firstIndex: 0, secondIndex: 1, explanation: "un autre", proposedFix: "un acte" },
        ],
      }),
      aContradictionsInput(),
    );

    expect(verification.contradictions.opposedFacts).toHaveLength(1);
    expect(verification.report.answered).toBe(3);
    expect(verification.report.verified).toBe(2);
  });

  it("keeps one row when the same pair is named twice, in either order", () => {
    const verification = verifyBibleContradictions(
      aContradictionsAnswer({
        opposedFacts: [
          { firstIndex: 0, secondIndex: 1, explanation: "un fait", proposedFix: "un acte" },
          { firstIndex: 1, secondIndex: 0, explanation: "le même", proposedFix: "un acte" },
        ],
      }),
      aContradictionsInput(),
    );

    expect(verification.contradictions.opposedFacts).toHaveLength(1);
    expect(verification.report.dropped).toEqual([
      { list: "opposedFacts", index: 1, reason: "duplicate-pair" },
    ]);
  });

  it("verifies an answer that found nothing", () => {
    const verification = verifyBibleContradictions(
      { opposedFacts: [], contradictoryRules: [] },
      aContradictionsInput(),
    );

    expect(verification.report.verified).toBe(0);
    expect(isVerifiedBibleContradictions(verification.contradictions)).toBe(true);
  });

  it("reports list names, indexes and counts, and nothing a log could not carry", () => {
    const verification = verifyBibleContradictions(
      aContradictionsAnswer({
        opposedFacts: [
          { firstIndex: 0, secondIndex: 9, explanation: "un fait", proposedFix: "un acte" },
        ],
      }),
      aContradictionsInput(),
    );

    const serialised = JSON.stringify(verification.report);

    expect(serialised).not.toContain("père");
    expect(serialised).not.toContain("vallée");
  });

  it("brands only what the schema still accepts", () => {
    // `mint` re-parses before branding, so a brand can never certify something
    // the contract would refuse — the discipline every sibling verifier follows,
    // and the one lesson 80 was written about.
    const { contradictions } = verifyBibleContradictions(
      aContradictionsAnswer(),
      aContradictionsInput(),
    );

    expect(bibleContradictionsSchema.safeParse(contradictions).success).toBe(true);
  });

  it("does not brand a bare answer", () => {
    expect(isVerifiedBibleContradictions(aContradictionsAnswer())).toBe(false);
    expect(isVerifiedBibleContradictions(null)).toBe(false);
  });
});
