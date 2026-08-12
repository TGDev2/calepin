import { describe, expect, it } from "vitest";

import { aContradictionsAnswer, aContradictionsInput } from "./fixtures";
import {
  BIBLE_CONTRADICTION_LIST_COUNTS,
  bibleContradictionsInputSchema,
  bibleContradictionsSchema,
} from "./schema";

/** Every path of a parsed value, so an assertion can be made about all of them. */
function paths(value: unknown, prefix = ""): readonly { path: string; value: unknown }[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => paths(entry, `${prefix}[${String(index)}]`));
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) =>
      paths(entry, prefix === "" ? key : `${prefix}.${key}`),
    );
  }

  return [{ path: prefix, value }];
}

describe("bibleContradictionsInputSchema", () => {
  it("accepts an ask holding facts and rules", () => {
    expect(bibleContradictionsInputSchema.safeParse(aContradictionsInput()).success).toBe(true);
  });

  it("refuses an ask with nothing to compare", () => {
    // One element cannot contradict anything, and an ask nobody can answer is
    // an ask nobody should pay for.
    const refused = bibleContradictionsInputSchema.safeParse(
      aContradictionsInput({ facts: aContradictionsInput().facts.slice(0, 1), worldRules: [] }),
    );

    expect(refused.success).toBe(false);
  });

  it("accepts two rules and no fact at all — rules contradict without the canon", () => {
    expect(
      bibleContradictionsInputSchema.safeParse(aContradictionsInput({ facts: [] })).success,
    ).toBe(true);
  });

  it("carries no per-character belief — what a character believes may disagree with the world", () => {
    // `CanonFactBelief` exists so a character can be wrong. Showing the beliefs
    // would invite the model to report the product's central feature as a
    // defect.
    const parsed = bibleContradictionsInputSchema.parse(aContradictionsInput());
    const fields = new Set(Object.keys(parsed.facts[0] ?? {}));

    expect(fields.has("knownBy")).toBe(false);
    expect(fields.has("beliefs")).toBe(false);
  });
});

describe("bibleContradictionsSchema", () => {
  it("accepts an answer naming two pairs", () => {
    expect(bibleContradictionsSchema.safeParse(aContradictionsAnswer()).success).toBe(true);
  });

  it("accepts an answer that found nothing — a bible that holds together is the good case", () => {
    expect(
      bibleContradictionsSchema.safeParse({ opposedFacts: [], contradictoryRules: [] }).success,
    ).toBe(true);
  });

  it("refuses a pair naming the same element twice", () => {
    const refused = bibleContradictionsSchema.safeParse(
      aContradictionsAnswer({
        opposedFacts: [
          { firstIndex: 2, secondIndex: 2, explanation: "un fait", proposedFix: "un acte" },
        ],
      }),
    );

    expect(refused.success).toBe(false);
  });

  it("refuses a negative index", () => {
    const refused = bibleContradictionsSchema.safeParse(
      aContradictionsAnswer({
        opposedFacts: [
          { firstIndex: -1, secondIndex: 2, explanation: "un fait", proposedFix: "un acte" },
        ],
      }),
    );

    expect(refused.success).toBe(false);
  });

  it("refuses a field the contract never declared", () => {
    const refused = bibleContradictionsSchema.safeParse({
      ...aContradictionsAnswer(),
      severity: "CRITICAL",
    });

    expect(refused.success).toBe(false);
  });

  it("carries no number but the indexes — no score, structurally", () => {
    // CAL-075's rule, held here the way CAL-090 held it: the carve-out is
    // stated as a test rather than as a comment. An index measures nothing.
    const parsed = bibleContradictionsSchema.parse(aContradictionsAnswer());
    const numeric = paths(parsed).filter((entry) => typeof entry.value === "number");

    expect(numeric.every((entry) => /\.(firstIndex|secondIndex)$/.test(entry.path))).toBe(true);
    expect(numeric.length).toBeGreaterThan(0);
  });

  it("bounds both lists at what an author can act on", () => {
    const tooMany = {
      opposedFacts: Array.from(
        { length: BIBLE_CONTRADICTION_LIST_COUNTS.opposedFacts.max + 1 },
        (_, index) => ({
          firstIndex: index,
          secondIndex: index + 1,
          explanation: "un fait",
          proposedFix: "un acte",
        }),
      ),
      contradictoryRules: [],
    };

    expect(bibleContradictionsSchema.safeParse(tooMany).success).toBe(false);
  });
});
