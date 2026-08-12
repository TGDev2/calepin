import { describe, expect, it } from "vitest";

import {
  countWorldBounds,
  describeWorldBounds,
  describeWorldRule,
  WORLD_CAPABILITY_NOTICE,
  WORLD_COSTS_NOTICE,
  WORLD_FAILURE_NOTICE,
  WORLD_LIMITS_NOTICE,
} from "./bounds";
import { aWorld } from "./fixtures";
import { resolveWorldRules } from "./resolve";
import { verifyWorldBible } from "./verify";

function worldRows() {
  const verification = verifyWorldBible(aWorld());

  if (verification.outcome !== "verified") {
    throw new Error("the world fixture no longer verifies");
  }

  return resolveWorldRules(verification.world);
}

/** The fixture's one capability row, or a failure that says the fixture moved. */
function capabilityRow() {
  const capability = worldRows().find((rule) => rule.isSupernatural);

  if (capability === undefined) {
    throw new Error("the world fixture no longer declares a capability");
  }

  return capability;
}

/** The fixture's first ordinary rule row. */
function ordinaryRow() {
  const ordinary = worldRows().find((rule) => !rule.isSupernatural);

  if (ordinary === undefined) {
    throw new Error("the world fixture no longer declares an ordinary rule");
  }

  return ordinary;
}

describe("describeWorldRule", () => {
  it("gives an ordinary rule one line — its bounds are already in the statement", () => {
    expect(describeWorldRule(ordinaryRow())).toHaveLength(1);
  });

  // A verified capability cannot have an empty bound list, so a reader seeing
  // three bound lines is reading a guarantee rather than a coincidence.
  it("gives a capability four lines, one per bound axis", () => {
    const lines = describeWorldRule(capabilityRow());

    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain(WORLD_CAPABILITY_NOTICE);
    expect(lines[1]).toContain(WORLD_LIMITS_NOTICE);
    expect(lines[2]).toContain(WORLD_COSTS_NOTICE);
    expect(lines[3]).toContain(WORLD_FAILURE_NOTICE);
  });

  it("marks a capability as out of the ordinary and leaves a rule unmarked", () => {
    expect(describeWorldRule(ordinaryRow())[0]).not.toContain(WORLD_CAPABILITY_NOTICE);
    expect(describeWorldRule(capabilityRow())[0]).toContain(WORLD_CAPABILITY_NOTICE);
  });

  it("carries every bound the row holds", () => {
    const capability = capabilityRow();
    const rendered = describeWorldRule(capability).join("\n");

    for (const bound of [
      ...capability.limits,
      ...capability.costs,
      ...capability.failureConditions,
    ]) {
      expect(rendered).toContain(bound);
    }
  });
});

describe("describeWorldBounds", () => {
  it("reads the ordinary rules before the exceptions to them", () => {
    // The frame before the exception: a capability read first is read as the
    // world. Proved against a deliberately reversed input.
    const rows = worldRows();
    const reversed = [...rows].reverse();
    const lines = describeWorldBounds(reversed);

    const firstCapabilityLine = lines.findIndex((line) => line.includes(WORLD_CAPABILITY_NOTICE));
    const ordinaryLines = rows.filter((rule) => !rule.isSupernatural).length;

    expect(firstCapabilityLine).toBe(ordinaryLines);
    expect(lines).toHaveLength(ordinaryLines + describeWorldRule(capabilityRow()).length);
  });

  it("renders every rule of the world", () => {
    const rows = worldRows();
    const rendered = describeWorldBounds(rows).join("\n");

    for (const row of rows) {
      expect(rendered).toContain(row.name);
    }
  });

  it("returns lines rather than a block, so a caller bounds one at a time", () => {
    for (const line of describeWorldBounds(worldRows())) {
      expect(line).not.toContain("\n");
    }
  });
});

describe("countWorldBounds", () => {
  it("counts the capabilities and their bounds, and nothing else", () => {
    // The safe-to-log twin of `describeWorldBounds`, whose lines are the
    // world's own prose (§9).
    expect(countWorldBounds(worldRows())).toEqual({ capabilities: 1, bounds: 5 });
  });

  it("counts nothing for a world with no capability", () => {
    const ordinary = worldRows().filter((rule) => !rule.isSupernatural);

    expect(countWorldBounds(ordinary)).toEqual({ capabilities: 0, bounds: 0 });
  });
});
