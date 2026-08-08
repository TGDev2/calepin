import { describe, expect, it } from "vitest";

import { beliefMatchesWorld } from "./belief";

describe("beliefMatchesWorld", () => {
  // Knowing is the agreement between the two independent dimensions, which is
  // why no KNOWS is stored: it is this comparison.
  it("matches a belief that agrees with the world, whichever way the world holds", () => {
    expect(beliefMatchesWorld(true, "BELIEVES_TRUE")).toBe(true);
    expect(beliefMatchesWorld(false, "BELIEVES_FALSE")).toBe(true);
  });

  // Dramatic irony, as a boolean: the belief the world contradicts. Reading it
  // as irony to preserve or as a leak to block is the mission's judgement.
  it("does not match a belief the world contradicts", () => {
    expect(beliefMatchesWorld(true, "BELIEVES_FALSE")).toBe(false);
    expect(beliefMatchesWorld(false, "BELIEVES_TRUE")).toBe(false);
  });

  // The specification's unaware example is this shape: a fact true in the
  // world, a character with no stance on it — never matching, whatever the
  // world holds, so a scene through their eyes must not act on the fact.
  it("never matches an unaware character", () => {
    expect(beliefMatchesWorld(true, "UNAWARE")).toBe(false);
    expect(beliefMatchesWorld(false, "UNAWARE")).toBe(false);
  });
});
