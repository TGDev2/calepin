import { describe, expect, it } from "vitest";

import {
  DIMENSION_TREATMENTS,
  isDimensionTreatment,
  isSourceDimension,
  permitsTreatment,
  SOURCE_DIMENSIONS,
  treatmentRank,
} from "./dimensions";

describe("SOURCE_DIMENSIONS", () => {
  it("names ten distinct dimensions", () => {
    expect(SOURCE_DIMENSIONS).toHaveLength(10);
    expect(new Set(SOURCE_DIMENSIONS).size).toBe(SOURCE_DIMENSIONS.length);
  });

  it("spells every member in kebab-case", () => {
    for (const dimension of SOURCE_DIMENSIONS) {
      expect(dimension).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it("recognises its own members and nothing else", () => {
    expect(isSourceDimension("themes")).toBe(true);
    expect(isSourceDimension("mood")).toBe(false);
    expect(isSourceDimension(null)).toBe(false);
  });
});

describe("DIMENSION_TREATMENTS", () => {
  it("runs from the most binding to the most permissive", () => {
    expect(DIMENSION_TREATMENTS).toEqual(["preserve", "extend", "reinterpret"]);
    expect(treatmentRank("preserve")).toBeLessThan(treatmentRank("extend"));
    expect(treatmentRank("extend")).toBeLessThan(treatmentRank("reinterpret"));
  });

  it("recognises its own members and nothing else", () => {
    expect(isDimensionTreatment("extend")).toBe(true);
    expect(isDimensionTreatment("EXTEND")).toBe(false);
  });
});

describe("permitsTreatment", () => {
  it("accepts a declaration at the allowed treatment", () => {
    for (const treatment of DIMENSION_TREATMENTS) {
      expect(permitsTreatment(treatment, treatment)).toBe(true);
    }
  });

  it("accepts a declaration tighter than allowed", () => {
    // A freedom level is a ceiling, never a floor: a direction that preserves
    // the setting under HIGH has broken no rule.
    expect(permitsTreatment("reinterpret", "preserve")).toBe(true);
    expect(permitsTreatment("extend", "preserve")).toBe(true);
  });

  it("refuses a declaration looser than allowed", () => {
    expect(permitsTreatment("preserve", "extend")).toBe(false);
    expect(permitsTreatment("preserve", "reinterpret")).toBe(false);
    expect(permitsTreatment("extend", "reinterpret")).toBe(false);
  });
});
