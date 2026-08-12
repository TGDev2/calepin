import { describe, expect, it } from "vitest";
import { z } from "zod";

import { aCapability, aWorld, aWorldInput, aWorldRule, worldSources } from "./fixtures";
import {
  outOfNormCapabilitySchema,
  WORLD_CHAR_CEILINGS,
  WORLD_FIELD_LABELS,
  WORLD_FIELDS,
  WORLD_LIST_COUNTS,
  WORLD_SOURCE_KINDS,
  WORLD_WORD_TARGETS,
  worldBibleInputSchema,
  worldBibleSchema,
  worldRuleSchema,
} from "./schema";

/**
 * Every numeric leaf of a schema, by path — `character/schema.test.ts`'s walk,
 * used here to prove the absence rather than to pin a carve-out.
 */
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

/** A string of `length` characters, for probing a ceiling. */
function overlong(ceiling: number): string {
  return "a".repeat(ceiling + 1);
}

/**
 * The same object without one key — how *elided* is probed, as against
 * *null*. Built by filtering rather than by `delete`, which lint refuses on a
 * computed key and which would mutate the fixture besides.
 */
function without(value: object, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

describe("the world bible contract", () => {
  it("carries the specification's ten items as nine fields", () => {
    // The tenth — *limites de ces éléments* — is the shape of the ninth, not a
    // field beside it. A `supernaturalLimits` sibling could be empty while
    // capabilities exist, which is the failure this mission exists to prevent.
    expect(Object.keys(worldBibleSchema.shape).sort()).toEqual([
      "constraints",
      "era",
      "institutions",
      "outOfNormCapabilities",
      "places",
      "politicalContext",
      "socialContext",
      "technologies",
      "worldRules",
    ]);
  });

  it("parses a complete world", () => {
    expect(worldBibleSchema.safeParse(aWorld()).success).toBe(true);
  });

  it("refuses an unknown field — the object is strict", () => {
    expect(worldBibleSchema.safeParse({ ...aWorld(), plausibilityScore: 8 }).success).toBe(false);
  });

  it("declares no numeric field anywhere — no score, structurally", () => {
    // The cahier des charges (1195-1199) forbids a number presented as a
    // measure of quality. `age` was the character sheet's one carve-out, and
    // nothing in a world measures anything at all.
    expect(numericPaths(worldBibleSchema, "")).toEqual([]);
  });

  it("declares no number in a parsed answer either", () => {
    const numbers: string[] = [];

    const walk = (value: unknown, path: string): void => {
      if (typeof value === "number") {
        numbers.push(path);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry, index) => {
          walk(entry, `${path}.${String(index)}`);
        });
        return;
      }
      if (typeof value === "object" && value !== null) {
        for (const [key, entry] of Object.entries(value)) {
          walk(entry, `${path}.${key}`);
        }
      }
    };

    walk(worldBibleSchema.parse(aWorld()), "world");

    expect(numbers).toEqual([]);
  });

  it("derives every world ceiling from its own word target", () => {
    for (const concept of Object.keys(WORLD_WORD_TARGETS)) {
      const key = concept as keyof typeof WORLD_WORD_TARGETS;
      expect(WORLD_CHAR_CEILINGS[key]).toBeGreaterThan(WORLD_WORD_TARGETS[key]);
    }
  });

  it("names every field it can report on, in French", () => {
    expect(Object.keys(WORLD_FIELD_LABELS).sort()).toEqual([...WORLD_FIELDS].sort());

    for (const field of WORLD_FIELDS) {
      expect(WORLD_FIELD_LABELS[field]).toMatch(/\S/);
    }
  });
});

describe("an out-of-norm capability", () => {
  // The acceptance criterion, stated as what it now is: a property of the
  // type. There is no inhabitant of the contract carrying a capability
  // without limits, without costs or without failure conditions — so
  // "refuse the generation if a supernatural element is declared without
  // limits" is not a check anybody can forget to run.
  it.each(["limits", "costs", "failureConditions"] as const)(
    "cannot be declared with an empty %s",
    (bound) => {
      const world = aWorld();

      expect(
        worldBibleSchema.safeParse({
          ...world,
          outOfNormCapabilities: [{ ...aCapability(), [bound]: [] }],
        }).success,
      ).toBe(false);
    },
  );

  it.each(["limits", "costs", "failureConditions"] as const)(
    "cannot be declared with %s omitted altogether",
    (bound) => {
      expect(outOfNormCapabilitySchema.safeParse(without(aCapability(), bound)).success).toBe(false);
    },
  );

  it("carries no isSupernatural flag — provenance decides it, not the answer", () => {
    // A boolean beside three optional lists is exactly the shape in which
    // "declared without limits" exists as a value. `resolveWorldRules` writes
    // the column from which array the entry came out of (§6).
    expect(Object.keys(outOfNormCapabilitySchema.shape).sort()).toEqual([
      "costs",
      "failureConditions",
      "limits",
      "name",
      "statement",
    ]);

    expect(outOfNormCapabilitySchema.safeParse({ ...aCapability(), isSupernatural: true }).success).toBe(
      false,
    );
  });

  it("holds each bound to its own ceiling", () => {
    expect(
      outOfNormCapabilitySchema.safeParse({
        ...aCapability(),
        limits: [overlong(WORLD_CHAR_CEILINGS.bound)],
      }).success,
    ).toBe(false);
  });

  it("may be absent entirely — the specification says éventuels", () => {
    expect(WORLD_LIST_COUNTS.outOfNormCapabilities.min).toBe(0);
    expect(worldBibleSchema.safeParse({ ...aWorld(), outOfNormCapabilities: [] }).success).toBe(true);
  });
});

describe("an ordinary world rule", () => {
  it("must say what it forbids — a rule that forbids nothing is decor", () => {
    const rule = aWorldRule();

    expect(worldRuleSchema.safeParse(without(rule, "forbids")).success).toBe(false);
    expect(worldRuleSchema.safeParse({ ...rule, forbids: "" }).success).toBe(false);
    expect(worldRuleSchema.safeParse(rule).success).toBe(true);
  });

  it("carries no bound lists — an ordinary rule has nothing to bound", () => {
    expect(Object.keys(worldRuleSchema.shape).sort()).toEqual(["forbids", "name", "statement"]);
  });
});

describe("the world's optional and required halves", () => {
  it("takes a null political context, and refuses it elided", () => {
    // CAL-077's discipline: an absence written, never omitted.
    expect(worldBibleSchema.safeParse({ ...aWorld(), politicalContext: null }).success).toBe(true);
    expect(worldBibleSchema.safeParse(without(aWorld(), "politicalContext")).success).toBe(false);
  });

  it.each([
    ["places", WORLD_LIST_COUNTS.places.min],
    ["worldRules", WORLD_LIST_COUNTS.worldRules.min],
    ["constraints", WORLD_LIST_COUNTS.constraints.min],
  ] as const)("asks for at least %i entries in %s", (list, min) => {
    const world = aWorld();
    const short = world[list].slice(0, min - 1);

    expect(worldBibleSchema.safeParse({ ...world, [list]: short }).success).toBe(false);
  });

  it("holds the era to its ceiling", () => {
    expect(
      worldBibleSchema.safeParse({ ...aWorld(), era: overlong(WORLD_CHAR_CEILINGS.era) }).success,
    ).toBe(false);
  });
});

describe("the world ask", () => {
  it("parses a complete ask", () => {
    expect(worldBibleInputSchema.safeParse(aWorldInput()).success).toBe(true);
  });

  it("closes the corpus over three kinds — the style section's, not the sheet's", () => {
    // No `style`: nothing in an era, a rule or an institution reads a
    // register, and an unused input would reopen the world ask on every
    // restyling (CAL-058).
    expect([...WORLD_SOURCE_KINDS]).toEqual(["direction", "identity", "analysis"]);
  });

  it("carries no audience, no target length and no cast", () => {
    expect(Object.keys(worldBibleInputSchema.shape).sort()).toEqual([
      "directionId",
      "freedomLevel",
      "sourceTextVersionId",
      "sources",
    ]);
  });

  it("refuses one source key offered twice, before a token is paid for", () => {
    const [first, second] = worldSources();
    const twice = first === undefined ? [] : [first, { ...first, text: "Autre passage, même clé." }];

    expect(worldBibleInputSchema.safeParse({ ...aWorldInput(), sources: twice }).success).toBe(false);
    // The same two entries under distinct keys are a legal ask, which is what
    // makes the refusal above about the key rather than about the count.
    expect(
      worldBibleInputSchema.safeParse({
        ...aWorldInput(),
        sources: [first, second].filter((source) => source !== undefined),
      }).success,
    ).toBe(true);
  });
});
