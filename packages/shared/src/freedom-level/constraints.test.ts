import { describe, expect, it } from "vitest";

import {
  allFreedomConstraints,
  FREEDOM_CONSTRAINED_STAGES,
  freedomConstraints,
  isFreedomConstrainedStage,
  preservedDimensionLabels,
} from "./constraints";
import { SOURCE_DIMENSION_LABELS } from "./copy";
import { SOURCE_DIMENSIONS } from "./dimensions";
import { FREEDOM_LEVELS } from "./levels";
import { dimensionsTreatedAs, treatmentFor } from "./policy";

describe("FREEDOM_CONSTRAINED_STAGES", () => {
  it("names the four stages a freedom level governs", () => {
    expect(FREEDOM_CONSTRAINED_STAGES).toEqual(["analysis", "direction", "bible", "outline"]);
  });

  it("recognises its own members and nothing else", () => {
    expect(isFreedomConstrainedStage("bible")).toBe(true);
    // Downstream of the choice rather than bound by it.
    expect(isFreedomConstrainedStage("manuscript")).toBe(false);
  });
});

describe("freedomConstraints", () => {
  it("emits the stage rule first, then one clause per dimension in order", () => {
    for (const level of FREEDOM_LEVELS) {
      for (const stage of FREEDOM_CONSTRAINED_STAGES) {
        const constraints = freedomConstraints(level, stage);

        expect(constraints).toHaveLength(SOURCE_DIMENSIONS.length + 1);
        expect(constraints[0]).toMatchObject({ id: `${stage}-rule`, dimension: null });
        expect(constraints.slice(1).map((constraint) => constraint.dimension)).toEqual([
          ...SOURCE_DIMENSIONS,
        ]);
      }
    }
  });

  it("gives every clause a unique id, stable across the three levels", () => {
    for (const stage of FREEDOM_CONSTRAINED_STAGES) {
      const ids = FREEDOM_LEVELS.map((level) =>
        freedomConstraints(level, stage).map((constraint) => constraint.id),
      );

      expect(new Set(ids[0]).size).toBe(ids[0]?.length);
      // Same subjects, different content — which is what makes two levels
      // diffable clause by clause.
      expect(ids[1]).toEqual(ids[0]);
      expect(ids[2]).toEqual(ids[0]);
    }
  });

  it("states the treatment the policy assigns, never one of its own", () => {
    for (const level of FREEDOM_LEVELS) {
      for (const stage of FREEDOM_CONSTRAINED_STAGES) {
        for (const constraint of freedomConstraints(level, stage)) {
          if (constraint.dimension === null) continue;

          expect(constraint.treatment).toBe(treatmentFor(level, constraint.dimension));
        }
      }
    }
  });

  it("writes every clause in French, naming its dimension", () => {
    for (const level of FREEDOM_LEVELS) {
      for (const stage of FREEDOM_CONSTRAINED_STAGES) {
        for (const constraint of freedomConstraints(level, stage)) {
          expect(constraint.statement.length).toBeGreaterThan(30);
          expect(constraint.statement.endsWith(".")).toBe(true);

          if (constraint.dimension === null) continue;
          expect(constraint.statement).toContain(SOURCE_DIMENSION_LABELS[constraint.dimension]);
        }
      }
    }
  });

  // The analysis records the source text, it does not transform it — so its
  // clauses have to say something a describing mission can actually obey.
  it("phrases the analysis stage as recording, and the other three as transforming", () => {
    const analysis = freedomConstraints("BALANCED", "analysis");
    const direction = freedomConstraints("BALANCED", "direction");

    expect(analysis.slice(1).every((constraint) => constraint.statement.includes("relevé"))).toBe(
      true,
    );
    expect(direction.slice(1).some((constraint) => constraint.statement.includes("relevé"))).toBe(
      false,
    );
  });

  // CAL-044's criterion again, this time on the clauses a mission receives
  // rather than on the table behind them.
  it("binds strictly more at LOW than at HIGH, stage by stage", () => {
    const preserving = (level: (typeof FREEDOM_LEVELS)[number], stage: "direction" | "bible") =>
      freedomConstraints(level, stage).filter((constraint) => constraint.treatment === "preserve")
        .length;

    for (const stage of ["direction", "bible"] as const) {
      expect(preserving("LOW", stage)).toBeGreaterThan(preserving("BALANCED", stage));
      expect(preserving("BALANCED", stage)).toBeGreaterThan(preserving("HIGH", stage));
    }
  });
});

describe("allFreedomConstraints", () => {
  it("covers the four stages and agrees with the per-stage call", () => {
    const all = allFreedomConstraints("LOW");

    expect(Object.keys(all).sort()).toEqual([...FREEDOM_CONSTRAINED_STAGES].sort());
    for (const stage of FREEDOM_CONSTRAINED_STAGES) {
      expect(all[stage]).toEqual(freedomConstraints("LOW", stage));
    }
  });
});

describe("preservedDimensionLabels", () => {
  it("answers the French labels of exactly the preserved dimensions", () => {
    for (const level of FREEDOM_LEVELS) {
      expect(preservedDimensionLabels(level)).toEqual(
        dimensionsTreatedAs(level, "preserve").map(
          (dimension) => SOURCE_DIMENSION_LABELS[dimension],
        ),
      );
    }
  });

  it("still names the themes at HIGH", () => {
    expect(preservedDimensionLabels("HIGH")).toEqual([SOURCE_DIMENSION_LABELS.themes]);
  });
});
