import { describe, expect, it } from "vitest";

import {
  DIMENSION_TREATMENTS,
  type DimensionTreatment,
  SOURCE_DIMENSIONS,
  treatmentRank,
} from "./dimensions";
import { FREEDOM_LEVELS } from "./levels";
import {
  dimensionsTreatedAs,
  FREEDOM_LEVEL_POLICIES,
  freedomLevelPolicy,
  sourceDepartureBudget,
  treatmentFor,
} from "./policy";

/** The three adjacent pairs the scale is made of, tightest first. */
const ADJACENT_PAIRS = [
  ["LOW", "BALANCED"],
  ["BALANCED", "HIGH"],
] as const;

describe("FREEDOM_LEVEL_POLICIES", () => {
  it("assigns a known treatment to every dimension, at every level", () => {
    for (const level of FREEDOM_LEVELS) {
      const { treatments } = FREEDOM_LEVEL_POLICIES[level];

      expect(Object.keys(treatments).sort()).toEqual([...SOURCE_DIMENSIONS].sort());
      for (const dimension of SOURCE_DIMENSIONS) {
        expect(DIMENSION_TREATMENTS).toContain(treatments[dimension]);
      }
    }
  });

  it("labels each policy with the level it belongs to", () => {
    for (const level of FREEDOM_LEVELS) {
      expect(freedomLevelPolicy(level).level).toBe(level);
    }
  });
});

// The three invariants the table's own doc comment claims. Asserted rather
// than described: a treatment edited in the wrong direction is exactly the
// kind of change that reads fine in a diff.
describe("the scale", () => {
  it("never tightens a dimension as the level rises", () => {
    for (const [tighter, looser] of ADJACENT_PAIRS) {
      for (const dimension of SOURCE_DIMENSIONS) {
        expect(treatmentRank(treatmentFor(looser, dimension))).toBeGreaterThanOrEqual(
          treatmentRank(treatmentFor(tighter, dimension)),
        );
      }
    }
  });

  it("differs on at least one dimension between adjacent levels", () => {
    for (const [tighter, looser] of ADJACENT_PAIRS) {
      const moved = SOURCE_DIMENSIONS.filter(
        (dimension) => treatmentFor(tighter, dimension) !== treatmentFor(looser, dimension),
      );

      expect(moved.length).toBeGreaterThan(0);
    }
  });

  // The user's own wording for HIGH — "réinterprétation autorisée tant que
  // les thèmes essentiels sont conservés" — as a property of the table.
  it("preserves the themes at every level, HIGH included", () => {
    for (const level of FREEDOM_LEVELS) {
      expect(treatmentFor(level, "themes")).toBe("preserve");
    }
  });

  it("leaves HIGH nothing else to preserve", () => {
    expect(dimensionsTreatedAs("HIGH", "preserve")).toEqual(["themes"]);
  });

  it("keeps the narrative promise off-limits to reinterpretation at every level", () => {
    // CAL-079 forbids betraying the source's emotional promise at any level,
    // so no freedom level is entitled to switch that off.
    for (const level of FREEDOM_LEVELS) {
      expect(treatmentFor(level, "narrative-promise")).not.toBe("reinterpret");
    }
  });
});

describe("sourceDepartureBudget", () => {
  // CAL-044's acceptance criterion, made arithmetic: LOW is measurably
  // closer to the source than HIGH, and the comparison needs no model.
  it("grows strictly from LOW to HIGH", () => {
    expect(sourceDepartureBudget("LOW")).toBeLessThan(sourceDepartureBudget("BALANCED"));
    expect(sourceDepartureBudget("BALANCED")).toBeLessThan(sourceDepartureBudget("HIGH"));
  });

  it("scores each level as the sum of its treatment ranks", () => {
    expect(sourceDepartureBudget("LOW")).toBe(2);
    expect(sourceDepartureBudget("BALANCED")).toBe(8);
    expect(sourceDepartureBudget("HIGH")).toBe(17);
  });

  it("stays below what total freedom would score", () => {
    const unconstrained = SOURCE_DIMENSIONS.length * treatmentRank("reinterpret");

    expect(sourceDepartureBudget("HIGH")).toBeLessThan(unconstrained);
  });
});

describe("dimensionsTreatedAs", () => {
  it("partitions the ten dimensions, with no dimension counted twice", () => {
    for (const level of FREEDOM_LEVELS) {
      const grouped = DIMENSION_TREATMENTS.flatMap((treatment: DimensionTreatment) => [
        ...dimensionsTreatedAs(level, treatment),
      ]);

      expect(grouped.sort()).toEqual([...SOURCE_DIMENSIONS].sort());
    }
  });

  it("answers in SOURCE_DIMENSIONS order", () => {
    const preserved = dimensionsTreatedAs("LOW", "preserve");
    const positions = preserved.map((dimension) => SOURCE_DIMENSIONS.indexOf(dimension));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
