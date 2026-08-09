import { describe, expect, it } from "vitest";

import { checkFreedomCompliance, type DimensionClaim, sourceDeparture } from "./compliance";
import { SOURCE_DIMENSIONS } from "./dimensions";
import { FREEDOM_LEVELS } from "./levels";
import { sourceDepartureBudget, treatmentFor } from "./policy";

/** What an artefact generated exactly at a level's ceiling would declare. */
function claimsAtCeiling(level: (typeof FREEDOM_LEVELS)[number]): DimensionClaim[] {
  return SOURCE_DIMENSIONS.map((dimension) => ({
    dimension,
    treatment: treatmentFor(level, dimension),
  }));
}

describe("checkFreedomCompliance", () => {
  it("passes a declaration sitting exactly at the level's ceiling", () => {
    for (const level of FREEDOM_LEVELS) {
      const report = checkFreedomCompliance(level, "direction", claimsAtCeiling(level));

      expect(report.compliant).toBe(true);
      expect(report.violations).toEqual([]);
      expect(report.undeclared).toEqual([]);
    }
  });

  it("passes a declaration tighter than the ceiling", () => {
    const report = checkFreedomCompliance(
      "HIGH",
      "direction",
      SOURCE_DIMENSIONS.map((dimension) => ({ dimension, treatment: "preserve" as const })),
    );

    expect(report.compliant).toBe(true);
    expect(report.departure).toBe(0);
  });

  it("names the clause, the allowance and the overshoot on a violation", () => {
    const claims = claimsAtCeiling("LOW").map((claim) =>
      claim.dimension === "ending" ? { ...claim, treatment: "reinterpret" as const } : claim,
    );

    const report = checkFreedomCompliance("LOW", "direction", claims);

    expect(report.compliant).toBe(false);
    expect(report.violations).toEqual([
      {
        constraintId: "direction-ending",
        dimension: "ending",
        allowed: "preserve",
        declared: "reinterpret",
      },
    ]);
  });

  it("refuses to let a reinterpretation hide behind a second, tamer claim", () => {
    const report = checkFreedomCompliance("LOW", "bible", [
      ...claimsAtCeiling("LOW"),
      { dimension: "premise", treatment: "reinterpret" },
    ]);

    expect(report.violations.map((violation) => violation.dimension)).toEqual(["premise"]);
  });

  it("reports a silent dimension as undeclared rather than as compliant", () => {
    const report = checkFreedomCompliance(
      "BALANCED",
      "outline",
      claimsAtCeiling("BALANCED").filter((claim) => claim.dimension !== "themes"),
    );

    expect(report.violations).toEqual([]);
    expect(report.undeclared).toEqual(["themes"]);
    expect(report.compliant).toBe(false);
  });

  it("counts the stage into the clause id it reports", () => {
    const claims = claimsAtCeiling("LOW").map((claim) =>
      claim.dimension === "premise" ? { ...claim, treatment: "extend" as const } : claim,
    );

    expect(checkFreedomCompliance("LOW", "bible", claims).violations[0]?.constraintId).toBe(
      "bible-premise",
    );
  });

  it("carries the level's budget alongside what was declared", () => {
    const report = checkFreedomCompliance("BALANCED", "direction", claimsAtCeiling("BALANCED"));

    expect(report.budget).toBe(sourceDepartureBudget("BALANCED"));
    expect(report.departure).toBe(report.budget);
  });
});

describe("sourceDeparture", () => {
  it("scores nothing for an empty declaration", () => {
    expect(sourceDeparture([])).toBe(0);
  });

  it("scores a ceiling declaration at exactly the level's budget", () => {
    for (const level of FREEDOM_LEVELS) {
      expect(sourceDeparture(claimsAtCeiling(level))).toBe(sourceDepartureBudget(level));
    }
  });

  // CAL-044's acceptance criterion, on generated artefacts rather than on the
  // table: the same declaration measured on the same scale is what makes
  // "measurably closer to the source" a comparison of two numbers.
  it("ranks a faithful artefact below a free one", () => {
    expect(sourceDeparture(claimsAtCeiling("LOW"))).toBeLessThan(
      sourceDeparture(claimsAtCeiling("HIGH")),
    );
  });

  it("counts a dimension once, at its widest claim", () => {
    expect(
      sourceDeparture([
        { dimension: "setting", treatment: "preserve" },
        { dimension: "setting", treatment: "reinterpret" },
      ]),
    ).toBe(2);
  });
});
