import { describe, expect, it } from "vitest";
import { z } from "zod";

import { aCanonFacts, anInitialCanonFactsInput } from "./fixtures";
import {
  CANON_FACT_LIST_COUNTS,
  CANON_FACT_LISTS,
  CANON_FACT_SOURCE_KINDS,
  CANON_FACT_SUBJECT_KINDS,
  CANON_FACT_TOTAL_COUNTS,
  CANON_FACT_VALIDITY_BY_LIST,
  endedFactSchema,
  initialCanonFactsInputSchema,
  initialCanonFactsSchema,
  periodFactSchema,
  permanentFactSchema,
} from "./schema";
import { CANON_FACT_VALIDITIES } from "./types";

function without(value: object, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

function numericPaths(schema: unknown, path: string): string[] {
  if (schema instanceof z.ZodNumber) return [path];
  if (schema instanceof z.ZodNullable) return numericPaths(schema.unwrap(), path);
  if (schema instanceof z.ZodArray) return numericPaths(schema.element, `${path}[]`);
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([key, member]) =>
      numericPaths(member, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

/** One fact of the fixture, to be spread over with whatever a test is about. */
function aPermanentFact() {
  const [fact] = aCanonFacts().permanentFacts;
  if (fact === undefined) throw new Error("the fixture lost its facts");

  return fact;
}

function aPeriodFact() {
  const [fact] = aCanonFacts().periodFacts;
  if (fact === undefined) throw new Error("the fixture lost its period facts");

  return fact;
}

function anEndedFact() {
  const [fact] = aCanonFacts().endedFacts;
  if (fact === undefined) throw new Error("the fixture lost its ended facts");

  return fact;
}

describe("the canon contract", () => {
  it("accepts a complete canon", () => {
    expect(initialCanonFactsSchema.safeParse(aCanonFacts()).success).toBe(true);
  });

  it("carries the three temporal lists and the decompositions, and nothing else", () => {
    expect(Object.keys(initialCanonFactsSchema.shape).sort()).toEqual([
      "decompositions",
      "endedFacts",
      "periodFacts",
      "permanentFacts",
    ]);
  });

  it("refuses a field nobody declared", () => {
    expect(initialCanonFactsSchema.safeParse({ ...aCanonFacts(), summary: "…" }).success).toBe(
      false,
    );
  });

  it("holds the whole answer to a floor and a ceiling", () => {
    const facts = aCanonFacts();

    expect(
      initialCanonFactsSchema.safeParse({
        ...facts,
        permanentFacts: [],
        decompositions: [],
      }).success,
    ).toBe(false);

    expect(
      initialCanonFactsSchema.safeParse({
        ...facts,
        permanentFacts: Array.from({ length: CANON_FACT_TOTAL_COUNTS.max }, aPermanentFact),
        decompositions: [],
      }).success,
    ).toBe(false);
  });

  it("holds no number that is not a measure of time or a position", () => {
    expect(numericPaths(initialCanonFactsSchema, "").sort()).toEqual([
      "decompositions[].factIndexes[]",
      "periodFacts[].validFrom.day",
      "periodFacts[].validUntil.day",
    ]);
  });
});

describe("a fact of the canon", () => {
  it("writes an absence rather than eliding it", () => {
    expect(periodFactSchema.safeParse({ ...aPeriodFact(), validUntil: null }).success).toBe(true);
    expect(periodFactSchema.safeParse(without(aPeriodFact(), "validUntil")).success).toBe(false);
    expect(permanentFactSchema.safeParse(without(aPermanentFact(), "knownBy")).success).toBe(false);
  });

  it("owes a basis, where the column owes only a source member", () => {
    expect(permanentFactSchema.safeParse(without(aPermanentFact(), "basis")).success).toBe(false);
    expect(
      permanentFactSchema.safeParse({ ...aPermanentFact(), basis: { sourceKey: "monde" } }).success,
    ).toBe(false);
  });

  describe("the temporal cases, which the answer never declares", () => {
    it("gives a permanent fact no bound to carry", () => {
      expect(permanentFactSchema.safeParse({ ...aPermanentFact(), validFrom: null }).success).toBe(
        false,
      );
      expect(
        permanentFactSchema.safeParse({ ...aPermanentFact(), endedByEventName: "x" }).success,
      ).toBe(false);
    });

    it("refuses a period fact placed by neither of its bounds", () => {
      expect(
        periodFactSchema.safeParse({ ...aPeriodFact(), validFrom: null, validUntil: null }).success,
      ).toBe(false);
    });

    it("refuses a period that ends before it starts, and accepts a single day", () => {
      const fact = aPeriodFact();
      const bound = { day: 10, precision: "DAY", label: "ce jour" };

      expect(
        periodFactSchema.safeParse({ ...fact, validFrom: bound, validUntil: bound }).success,
      ).toBe(true);
      expect(
        periodFactSchema.safeParse({
          ...fact,
          validFrom: bound,
          validUntil: { ...bound, day: 9 },
        }).success,
      ).toBe(false);
    });

    it("gives a period fact no event to be ended by", () => {
      expect(
        periodFactSchema.safeParse({ ...aPeriodFact(), endedByEventName: "l'accident" }).success,
      ).toBe(false);
    });

    it("gives an ended fact no bound at all", () => {
      expect(endedFactSchema.safeParse({ ...anEndedFact(), validFrom: null }).success).toBe(false);
    });

    it("pairs each list with one temporal case, and covers all three", () => {
      expect(Object.keys(CANON_FACT_VALIDITY_BY_LIST).sort()).toEqual([...CANON_FACT_LISTS].sort());
      expect(Object.values(CANON_FACT_VALIDITY_BY_LIST).sort()).toEqual(
        [...CANON_FACT_VALIDITIES].sort(),
      );
    });
  });

  describe("a bound", () => {
    it("requires its day, its precision and its wording together", () => {
      const fact = aPeriodFact();

      for (const key of ["day", "precision", "label"]) {
        expect(
          periodFactSchema.safeParse({
            ...fact,
            validFrom: without(fact.validFrom ?? {}, key),
          }).success,
        ).toBe(false);
      }
    });

    it("keeps the day inside the axis the column is", () => {
      const fact = aPeriodFact();

      expect(
        periodFactSchema.safeParse({
          ...fact,
          validFrom: { day: 4_000_000, precision: "YEAR", label: "loin" },
          validUntil: null,
        }).success,
      ).toBe(false);
    });
  });

  it("holds a subject to the two kinds the row has", () => {
    expect(CANON_FACT_SUBJECT_KINDS).toEqual(["character", "place"]);
    expect(
      permanentFactSchema.safeParse({
        ...aPermanentFact(),
        subjects: [{ kind: "event", name: "l'accident" }],
      }).success,
    ).toBe(false);
  });
});

describe("a decomposition", () => {
  it("names at least two parts, since one is a rewrite", () => {
    expect(CANON_FACT_LIST_COUNTS.decomposedFacts.min).toBe(2);
    expect(
      initialCanonFactsSchema.safeParse({
        ...aCanonFacts(),
        decompositions: [{ composite: "…", factIndexes: [0] }],
      }).success,
    ).toBe(false);
  });

  it("carries the composed wording it started from", () => {
    expect(
      initialCanonFactsSchema.safeParse({
        ...aCanonFacts(),
        decompositions: [{ factIndexes: [0, 1] }],
      }).success,
    ).toBe(false);
  });
});

describe("the canon ask", () => {
  it("accepts a complete ask", () => {
    expect(initialCanonFactsInputSchema.safeParse(anInitialCanonFactsInput()).success).toBe(true);
  });

  it("closes the corpus over the source text and the five bible sections", () => {
    expect(CANON_FACT_SOURCE_KINDS).toEqual([
      "source-text",
      "identity",
      "character",
      "relationship",
      "world",
      "timeline",
    ]);
  });

  it("refuses an unknown key, so the cast stays the shape the sheet offers", () => {
    const input = anInitialCanonFactsInput();

    expect(
      initialCanonFactsInputSchema.safeParse({ ...input, targetWordCount: 80_000 }).success,
    ).toBe(false);
  });

  it.each([
    [
      "cast",
      (input: ReturnType<typeof anInitialCanonFactsInput>) => ({
        ...input,
        cast: [...input.cast, input.cast[0]],
      }),
    ],
    [
      "places",
      (input: ReturnType<typeof anInitialCanonFactsInput>) => ({
        ...input,
        places: [...input.places, input.places[0]],
      }),
    ],
    [
      "events",
      (input: ReturnType<typeof anInitialCanonFactsInput>) => ({
        ...input,
        events: [...input.events, input.events[0]],
      }),
    ],
    [
      "sources",
      (input: ReturnType<typeof anInitialCanonFactsInput>) => ({
        ...input,
        sources: [...input.sources, input.sources[0]],
      }),
    ],
  ])("refuses one %s entry offered twice, before any generation", (_name, duplicate) => {
    expect(
      initialCanonFactsInputSchema.safeParse(duplicate(anInitialCanonFactsInput())).success,
    ).toBe(false);
  });

  it("needs somebody for a belief to attach to, and no place at all", () => {
    const input = anInitialCanonFactsInput();

    expect(initialCanonFactsInputSchema.safeParse({ ...input, cast: [] }).success).toBe(false);
    expect(initialCanonFactsInputSchema.safeParse({ ...input, places: [] }).success).toBe(true);
  });

  it("carries the facts already recorded, so none is proposed twice", () => {
    const input = anInitialCanonFactsInput();

    expect(initialCanonFactsInputSchema.safeParse(without(input, "knownFacts")).success).toBe(
      false,
    );
    expect(
      initialCanonFactsInputSchema.safeParse({
        ...input,
        knownFacts: [{ statement: "Le manoir possède une cave.", isTrue: false }],
      }).success,
    ).toBe(true);
  });
});
