import { describe, expect, it } from "vitest";

import { aWorld } from "./fixtures";
import {
  countWorldRows,
  resolveBibleWorld,
  resolveWorldPlaces,
  resolveWorldRules,
  WORLD_CONSEQUENCE_CONNECTOR,
  WORLD_FORBIDS_CONNECTOR,
} from "./resolve";
import { verifyWorldBible } from "./verify";

function aVerifiedWorld() {
  const verification = verifyWorldBible(aWorld());

  if (verification.outcome !== "verified") {
    throw new Error("the world fixture no longer verifies");
  }

  return verification.world;
}

describe("resolveBibleWorld", () => {
  it("answers the six BibleWorld columns and no more", () => {
    expect(Object.keys(resolveBibleWorld(aVerifiedWorld())).sort()).toEqual([
      "constraints",
      "era",
      "institutions",
      "politicalContext",
      "socialContext",
      "technologies",
    ]);
  });

  it("carries a null political context through as null", () => {
    const verification = verifyWorldBible({ ...aWorld(), politicalContext: null });

    if (verification.outcome !== "verified") throw new Error("unexpected refusal");

    expect(resolveBibleWorld(verification.world).politicalContext).toBeNull();
  });

  it("flattens each constraint behind its connector, keeping the consequence visible", () => {
    const world = aVerifiedWorld();
    const [first] = resolveBibleWorld(world).constraints;
    const source = world.constraints[0];

    expect(source).toBeDefined();
    expect(first).toBe(`${source?.statement} ${WORLD_CONSEQUENCE_CONNECTOR} ${source?.consequence}`);
    expect(first).toContain(source?.consequence);
  });

  it("keeps the answer's own order and length for the two inventories", () => {
    const world = aVerifiedWorld();
    const resolved = resolveBibleWorld(world);

    expect(resolved.technologies).toEqual(world.technologies);
    expect(resolved.institutions).toEqual(world.institutions);
  });
});

describe("resolveWorldPlaces", () => {
  it("answers the Place columns, name-keyed and in order", () => {
    const rows = resolveWorldPlaces(aVerifiedWorld());

    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["description", "name"]);
    expect(rows.map((row) => row.name)).toEqual(aWorld().places.map((place) => place.name));
  });
});

describe("resolveWorldRules", () => {
  it("answers the WorldRule columns for both arrays, ordinary rules first", () => {
    const rows = resolveWorldRules(aVerifiedWorld());

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.isSupernatural)).toEqual([false, false, true]);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "costs",
      "failureConditions",
      "isSupernatural",
      "limits",
      "name",
      "statement",
    ]);
  });

  // The acceptance criterion at the row: the only entries that can carry
  // `isSupernatural: true` are the ones whose schema required three non-empty
  // bounds, so `world_rules_supernatural_bounds_check` can never be the thing
  // that discovers a problem.
  it("gives every supernatural row all three bounds, non-empty", () => {
    for (const row of resolveWorldRules(aVerifiedWorld()).filter((rule) => rule.isSupernatural)) {
      expect(row.limits.length).toBeGreaterThan(0);
      expect(row.costs.length).toBeGreaterThan(0);
      expect(row.failureConditions.length).toBeGreaterThan(0);
    }
  });

  it("leaves an ordinary rule's three bound lists empty — it has nothing to bound", () => {
    for (const row of resolveWorldRules(aVerifiedWorld()).filter((rule) => !rule.isSupernatural)) {
      expect(row.limits).toEqual([]);
      expect(row.costs).toEqual([]);
      expect(row.failureConditions).toEqual([]);
    }
  });

  it("folds what an ordinary rule forbids into its statement, behind the connector", () => {
    const world = aVerifiedWorld();
    const first = resolveWorldRules(world)[0];
    const source = world.worldRules[0];

    expect(source).toBeDefined();
    expect(first?.statement).toBe(`${source?.statement} ${WORLD_FORBIDS_CONNECTOR} ${source?.forbids}`);
    expect(first?.statement).toContain(source?.forbids);
  });

  it("leaves a capability's statement alone — its bounds have their own columns", () => {
    const world = aVerifiedWorld();
    const capabilityRow = resolveWorldRules(world).find((rule) => rule.isSupernatural);

    expect(capabilityRow).toBeDefined();
    expect(capabilityRow?.statement).toBe(world.outOfNormCapabilities[0]?.statement);
  });
});

describe("countWorldRows", () => {
  it("counts what each destination takes, and carries no prose", () => {
    // Safe to log (§9), unlike everything else this module produces.
    expect(countWorldRows(aWorld())).toEqual({
      places: 2,
      worldRules: 2,
      outOfNormCapabilities: 1,
    });
  });
});
