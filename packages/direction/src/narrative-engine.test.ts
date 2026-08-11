/**
 * The rules the engine definition is accepted on: the five axes in their
 * stated order, closed member vocabularies with no room for a decor or a
 * number, French copy total over every member, and description helpers that
 * quote only the closed vocabulary — because their output travels into
 * prompts and onto screens.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CONFLICT_NATURES,
  describeNarrativeEngine,
  describeNarrativeEngineAxes,
  NARRATIVE_ENGINE_AXES,
  NARRATIVE_ENGINE_COPY,
  type NarrativeEngine,
  narrativeEngineSchema,
  PROTAGONIST_STAKES,
  RESOLUTION_NATURES,
  SHIFT_TRIGGERS,
  TENSION_SOURCES,
} from "./narrative-engine";

const MEMBER_LISTS = {
  conflictNature: CONFLICT_NATURES,
  tensionSource: TENSION_SOURCES,
  protagonistStake: PROTAGONIST_STAKES,
  shiftTrigger: SHIFT_TRIGGERS,
  resolutionNature: RESOLUTION_NATURES,
} as const;

function engine(overrides: Partial<NarrativeEngine> = {}): NarrativeEngine {
  return narrativeEngineSchema.parse({
    conflictNature: "internal",
    tensionSource: "concealment",
    protagonistStake: "belonging",
    shiftTrigger: "revelation",
    resolutionNature: "sacrifice",
    ...overrides,
  });
}

describe("narrativeEngineSchema", () => {
  // The order is part of the operational definition: the specification
  // states the axes in this order, and reports and prompt lines walk it.
  it("pins the five axes, in the specification's order", () => {
    expect(NARRATIVE_ENGINE_AXES).toEqual([
      "conflictNature",
      "tensionSource",
      "protagonistStake",
      "shiftTrigger",
      "resolutionNature",
    ]);
    expect(Object.keys(narrativeEngineSchema.shape)).toEqual([...NARRATIVE_ENGINE_AXES]);
  });

  it("declares every axis as a closed enum and nothing numeric", () => {
    for (const [name, field] of Object.entries(narrativeEngineSchema.shape)) {
      expect(field instanceof z.ZodEnum, name).toBe(true);
    }
  });

  it("accepts every member of every axis", () => {
    for (const axis of NARRATIVE_ENGINE_AXES) {
      for (const member of MEMBER_LISTS[axis]) {
        expect(narrativeEngineSchema.safeParse({ ...engine(), [axis]: member }).success).toBe(true);
      }
    }
  });

  it("refuses an invented member, a missing axis and an extra field", () => {
    expect(narrativeEngineSchema.safeParse({ ...engine(), conflictNature: "cosmic" }).success).toBe(
      false,
    );

    const missing = Object.fromEntries(
      Object.entries(engine()).filter(([key]) => key !== "resolutionNature"),
    );

    expect(narrativeEngineSchema.safeParse(missing).success).toBe(false);
    expect(narrativeEngineSchema.safeParse({ ...engine(), decor: "lighthouse" }).success).toBe(
      false,
    );
  });

  // No member may name a place, an era, a milieu or a cast — the vocabulary
  // being unable to express a decor is what makes "differs only by decor"
  // mechanically detectable. The closed lists above are reviewed for that;
  // this pins that they stay identifier-shaped (no prose can sneak in as a
  // member).
  it("keeps every member identifier-shaped", () => {
    for (const members of Object.values(MEMBER_LISTS)) {
      for (const member of members) {
        expect(member).toMatch(/^[a-z]+(-[a-z]+)*$/);
      }
    }
  });

  it("is expressible as the JSON Schema the provider is sent", () => {
    expect(() => z.toJSONSchema(narrativeEngineSchema)).not.toThrow();
  });
});

describe("NARRATIVE_ENGINE_COPY", () => {
  it("glosses every axis and every member, and no other", () => {
    expect(Object.keys(NARRATIVE_ENGINE_COPY)).toEqual([...NARRATIVE_ENGINE_AXES]);

    for (const axis of NARRATIVE_ENGINE_AXES) {
      expect(Object.keys(NARRATIVE_ENGINE_COPY[axis].members).sort()).toEqual(
        [...MEMBER_LISTS[axis]].sort(),
      );
      expect(NARRATIVE_ENGINE_COPY[axis].label.length).toBeGreaterThan(0);

      for (const gloss of Object.values(NARRATIVE_ENGINE_COPY[axis].members)) {
        expect(gloss.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("describeNarrativeEngineAxes", () => {
  it("emits one line per axis, in order, naming the key, the label and every member", () => {
    const lines = describeNarrativeEngineAxes();

    expect(lines).toHaveLength(NARRATIVE_ENGINE_AXES.length);

    NARRATIVE_ENGINE_AXES.forEach((axis, index) => {
      const line = lines[index];

      expect(line).toContain(`« ${axis} »`);
      expect(line).toContain(NARRATIVE_ENGINE_COPY[axis].label);

      for (const member of MEMBER_LISTS[axis]) {
        expect(line).toContain(`« ${member} »`);
      }
    });
  });
});

describe("describeNarrativeEngine", () => {
  it("quotes each axis label with the gloss of the declared member", () => {
    const described = describeNarrativeEngine(
      engine({ conflictNature: "metaphysical", resolutionNature: "renunciation" }),
    );

    expect(described).toContain(NARRATIVE_ENGINE_COPY.conflictNature.label);
    expect(described).toContain(NARRATIVE_ENGINE_COPY.conflictNature.members.metaphysical);
    expect(described).toContain(NARRATIVE_ENGINE_COPY.resolutionNature.members.renunciation);
    expect(described).not.toContain(NARRATIVE_ENGINE_COPY.resolutionNature.members.sacrifice);
  });
});
