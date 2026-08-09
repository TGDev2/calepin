import { describe, expect, it } from "vitest";

import {
  DIMENSION_TREATMENT_LABELS,
  FREEDOM_LEVEL_COPY,
  freedomLevelCopy,
  SOURCE_DIMENSION_LABELS,
  summarizeFreedomLevel,
} from "./copy";
import { DIMENSION_TREATMENTS, SOURCE_DIMENSIONS } from "./dimensions";
import { FREEDOM_LEVELS } from "./levels";
import { dimensionsTreatedAs } from "./policy";

describe("SOURCE_DIMENSION_LABELS", () => {
  it("labels every dimension, and none twice", () => {
    const labels = SOURCE_DIMENSIONS.map((dimension) => SOURCE_DIMENSION_LABELS[dimension]);

    expect(labels).toHaveLength(SOURCE_DIMENSIONS.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("writes each label uncapitalised, so a clause can name it mid-sentence", () => {
    for (const dimension of SOURCE_DIMENSIONS) {
      const label = SOURCE_DIMENSION_LABELS[dimension];

      expect(label[0]).toBe(label[0]?.toLowerCase());
    }
  });
});

describe("FREEDOM_LEVEL_COPY", () => {
  it("covers the three levels and labels each with its own", () => {
    for (const level of FREEDOM_LEVELS) {
      expect(freedomLevelCopy(level).level).toBe(level);
    }
  });

  it("gives each level a distinct label, tagline and explanation", () => {
    const fields = (["label", "tagline", "explanation"] as const).map((field) =>
      FREEDOM_LEVELS.map((level) => FREEDOM_LEVEL_COPY[level][field]),
    );

    for (const values of fields) {
      expect(new Set(values).size).toBe(FREEDOM_LEVELS.length);
    }
  });

  // The backlog asks for a *short* explanation in accessible literary
  // vocabulary — long enough to say what the level does to the source text,
  // short enough to read while choosing between three radio buttons.
  it("keeps every explanation short enough to read at the point of choice", () => {
    for (const level of FREEDOM_LEVELS) {
      const { explanation } = FREEDOM_LEVEL_COPY[level];

      expect(explanation.length).toBeGreaterThan(80);
      expect(explanation.length).toBeLessThan(320);
      expect(explanation.endsWith(".")).toBe(true);
    }
  });

  it("keeps every tagline to one sentence", () => {
    for (const level of FREEDOM_LEVELS) {
      expect(FREEDOM_LEVEL_COPY[level].tagline.length).toBeLessThan(90);
    }
  });
});

describe("summarizeFreedomLevel", () => {
  it("derives its lists from the policy rather than restating them", () => {
    for (const level of FREEDOM_LEVELS) {
      for (const group of summarizeFreedomLevel(level)) {
        expect(group.dimensions).toEqual(
          dimensionsTreatedAs(level, group.treatment).map(
            (dimension) => SOURCE_DIMENSION_LABELS[dimension],
          ),
        );
        expect(group.heading).toBe(DIMENSION_TREATMENT_LABELS[group.treatment]);
      }
    }
  });

  it("accounts for all ten dimensions at every level", () => {
    for (const level of FREEDOM_LEVELS) {
      const listed = summarizeFreedomLevel(level).flatMap((group) => group.dimensions);

      expect(listed).toHaveLength(SOURCE_DIMENSIONS.length);
    }
  });

  it("drops a group with nothing in it rather than showing an empty heading", () => {
    const headings = summarizeFreedomLevel("LOW").map((group) => group.treatment);

    expect(headings).not.toContain("reinterpret");
    expect(summarizeFreedomLevel("LOW").every((group) => group.dimensions.length > 0)).toBe(true);
  });

  it("orders the groups from the most binding to the most permissive", () => {
    const groups = summarizeFreedomLevel("HIGH").map((group) => group.treatment);
    const positions = groups.map((treatment) => DIMENSION_TREATMENTS.indexOf(treatment));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
