import { describe, expect, it } from "vitest";

import { FREEDOM_LEVELS, freedomLevelRank, isFreedomLevel } from "./levels";

describe("FREEDOM_LEVELS", () => {
  it("holds the three levels of the specification, tightest first", () => {
    expect(FREEDOM_LEVELS).toEqual(["LOW", "BALANCED", "HIGH"]);
  });
});

describe("isFreedomLevel", () => {
  it("accepts each member", () => {
    for (const level of FREEDOM_LEVELS) {
      expect(isFreedomLevel(level)).toBe(true);
    }
  });

  it("refuses a lowercase spelling, a neighbour and a non-string", () => {
    expect(isFreedomLevel("low")).toBe(false);
    expect(isFreedomLevel("EXTREME")).toBe(false);
    expect(isFreedomLevel(undefined)).toBe(false);
    expect(isFreedomLevel(0)).toBe(false);
  });
});

describe("freedomLevelRank", () => {
  it("orders the levels from the most faithful to the most free", () => {
    expect(freedomLevelRank("LOW")).toBeLessThan(freedomLevelRank("BALANCED"));
    expect(freedomLevelRank("BALANCED")).toBeLessThan(freedomLevelRank("HIGH"));
  });
});
