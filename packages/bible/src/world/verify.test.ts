import { describe, expect, it } from "vitest";

import { aCapability, aPlace, aWorld, aWorldRule } from "./fixtures";
import { resolveWorldRules } from "./resolve";
import { WORLD_LIST_COUNTS } from "./schema";
import { isVerifiedWorldBible, verifyWorldBible } from "./verify";

/** The verified world, or a failure that names what refused it. */
function verified(answer: ReturnType<typeof aWorld>) {
  const verification = verifyWorldBible(answer);

  if (verification.outcome !== "verified") {
    throw new Error(`expected a verified world, got ${verification.refusals.join(", ")}`);
  }

  return verification;
}

describe("verifyWorldBible", () => {
  it("drops nothing from a world that already inserts", () => {
    const verification = verified(aWorld());

    expect(verification.dropped).toEqual([]);
    expect(verification.world.places).toHaveLength(2);
    expect(verification.world.worldRules).toHaveLength(2);
    expect(verification.world.outOfNormCapabilities).toHaveLength(1);
  });

  it("brands the result, so an unverified world cannot be resolved", () => {
    expect(isVerifiedWorldBible(verified(aWorld()).world)).toBe(true);
    expect(isVerifiedWorldBible(aWorld())).toBe(false);
  });

  // Case and punctuation fold; accents deliberately do not (`sameWords` keeps
  // the letter-by-letter spelling significant, because a changed letter is a
  // changed word). So this probes what a model actually gets wrong when it
  // retypes a name it has already used.
  it("drops a second place whose name differs only in case and punctuation", () => {
    const world = aWorld();
    const verification = verified({
      ...world,
      places: [
        ...world.places,
        { ...aPlace(), name: "LE COL DE VARÈNE.", description: "Réécrit en capitales." },
      ],
    });

    expect(verification.dropped).toEqual([
      { list: "places", index: 2, boundIndex: null, reason: "duplicate-place-name" },
    ]);
    expect(verification.world.places).toHaveLength(2);
  });

  // The check that makes "a world that verifies is a world that inserts" true:
  // both arrays become `WorldRule` rows under one `@@unique([bibleId, name])`,
  // so deduplicating them separately would pass here and fail at the INSERT.
  it("drops a capability whose name an ordinary rule already took", () => {
    const world = aWorld();
    const verification = verified({
      ...world,
      outOfNormCapabilities: [{ ...aCapability(), name: aWorldRule().name }],
    });

    expect(verification.dropped).toEqual([
      { list: "outOfNormCapabilities", index: 0, boundIndex: null, reason: "duplicate-rule-name" },
    ]);
    expect(verification.world.outOfNormCapabilities).toEqual([]);
  });

  it("leaves one name per rule row once verified", () => {
    const world = aWorld();
    const verification = verified({
      ...world,
      worldRules: [...world.worldRules, { ...aWorldRule(), statement: "Réécrit." }],
      outOfNormCapabilities: [{ ...aCapability(), name: aWorldRule().name }],
    });

    const names = resolveWorldRules(verification.world).map((rule) => rule.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("drops a bound repeated between two of a capability's three lists", () => {
    const world = aWorld();
    const shared = "Trois jours de fièvre après chaque relevé.";
    const verification = verified({
      ...world,
      outOfNormCapabilities: [
        {
          ...aCapability(),
          limits: ["Rien au-delà de la ligne des sapins.", shared],
          // Two costs, so losing the repeated one still leaves the capability
          // bounded — the drop is a drop here, not a refusal.
          costs: [shared, "Le don ne revient pas avant le printemps."],
        },
      ],
    });

    // The repeat is reported against `costs`, which is walked after `limits`:
    // the first list to claim a statement keeps it.
    expect(verification.dropped).toEqual([
      { list: "costs", index: 0, boundIndex: 0, reason: "duplicate-bound" },
    ]);
    expect(verification.world.outOfNormCapabilities[0]?.costs).toEqual([
      "Le don ne revient pas avant le printemps.",
    ]);
  });

  // The imperative, held at the far end of the drop regime: de-duplicating
  // must never leave a capability standing with an empty bound list, because
  // that is exactly the unbounded state the mission exists to prevent.
  it("drops the whole capability when de-duplication would empty a bound list", () => {
    const world = aWorld();
    const only = "Rien au-delà de la ligne des sapins.";
    const verification = verified({
      ...world,
      outOfNormCapabilities: [
        { ...aCapability(), limits: [only], costs: [only], failureConditions: ["Pendant la tempête."] },
      ],
    });

    expect(verification.world.outOfNormCapabilities).toEqual([]);
    expect(verification.dropped).toContainEqual({
      list: "outOfNormCapabilities",
      index: 0,
      boundIndex: null,
      reason: "unbounded-after-dedup",
    });
  });

  it("never keeps a capability with an empty bound list, whatever was dropped", () => {
    const world = aWorld();
    const only = "Un seul énoncé pour les trois axes.";
    const verification = verified({
      ...world,
      outOfNormCapabilities: [
        { ...aCapability(), limits: [only], costs: [only], failureConditions: [only] },
        aCapability(),
      ],
    });

    for (const capability of verification.world.outOfNormCapabilities) {
      expect(capability.limits.length).toBeGreaterThan(0);
      expect(capability.costs.length).toBeGreaterThan(0);
      expect(capability.failureConditions.length).toBeGreaterThan(0);
    }
  });

  // Refusal is stated against the contract's floors, not against zero: the
  // lists ask for two, so an answer the drops took to one is a world the
  // schema would reject, and minting it would throw where a caller expected
  // an outcome.
  it("refuses a world whose rules fell below the contract's floor", () => {
    const world = aWorld();
    const verification = verifyWorldBible({
      ...world,
      worldRules: [aWorldRule(), { ...aWorldRule(), statement: "Réécrit.", forbids: "Autre chose." }],
    });

    expect(verification.outcome).toBe("refused");

    if (verification.outcome === "refused") {
      expect(verification.refusals).toEqual(["rules-below-floor"]);
    }
  });

  it("refuses a world whose places fell below the contract's floor", () => {
    const world = aWorld();
    const verification = verifyWorldBible({
      ...world,
      places: [aPlace(), { ...aPlace(), description: "Réécrit." }],
    });

    expect(verification.outcome).toBe("refused");

    if (verification.outcome === "refused") {
      expect(verification.refusals).toEqual(["places-below-floor"]);
    }
  });

  it("reports both floors when both broke", () => {
    const verification = verifyWorldBible({
      ...aWorld(),
      places: [aPlace(), { ...aPlace(), description: "Réécrit." }],
      worldRules: [aWorldRule(), { ...aWorldRule(), statement: "Réécrit.", forbids: "Autre chose." }],
    });

    expect(verification.outcome).toBe("refused");

    if (verification.outcome === "refused") {
      expect(verification.refusals).toEqual(["places-below-floor", "rules-below-floor"]);
    }
  });

  it("still verifies when every capability dropped — their floor is zero", () => {
    // The reason dropping a capability is safe where dropping a rule is not.
    expect(WORLD_LIST_COUNTS.outOfNormCapabilities.min).toBe(0);

    const verification = verified({
      ...aWorld(),
      outOfNormCapabilities: [{ ...aCapability(), name: aWorldRule().name }],
    });

    expect(verification.world.outOfNormCapabilities).toEqual([]);
  });

  it("reports positions and closed reasons only, never a word of the world", () => {
    const world = aWorld();
    const verification = verified({
      ...world,
      places: [...world.places, aPlace()],
    });

    for (const entry of verification.dropped) {
      expect(Object.keys(entry).sort()).toEqual(["boundIndex", "index", "list", "reason"]);
    }
  });
});
