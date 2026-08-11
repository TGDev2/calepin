import { describe, expect, it } from "vitest";

import { aGraph, anAsymmetry, aRelation, aRelationsInput } from "./fixtures";
import type { CharacterRelations } from "./schema";
import {
  CHARACTER_RELATIONS_DROP_REASONS,
  isVerifiedCharacterRelations,
  verifyCharacterRelations,
} from "./verify";

function verify(relations: CharacterRelations["relations"]) {
  return verifyCharacterRelations({ relations }, aRelationsInput());
}

describe("verifyCharacterRelations", () => {
  it("verifies a faithful graph with nothing dropped", () => {
    const verification = verifyCharacterRelations(aGraph(), aRelationsInput());

    expect(verification.outcome).toBe("verified");
    expect(verification.dropped).toEqual([]);
  });

  it("brands what it verified, so unverified relations cannot be resolved", () => {
    const verification = verifyCharacterRelations(aGraph(), aRelationsInput());

    if (verification.outcome !== "verified") {
      throw new Error("expected a verified graph");
    }

    expect(isVerifiedCharacterRelations(verification.relations)).toBe(true);
    expect(isVerifiedCharacterRelations(aGraph())).toBe(false);
  });

  it("drops an edge naming a character the ask never offered", () => {
    const verification = verify([
      { ...aRelation(), toCharacterName: "Un inconnu" },
      ...aGraph().relations.slice(1),
    ]);

    expect(verification.dropped).toContainEqual({
      list: "relations",
      index: 0,
      asymmetryIndex: null,
      reason: "unknown-character",
    });
  });

  it("drops a self-relation", () => {
    const verification = verify([
      { ...aRelation(), toCharacterName: aRelation().fromCharacterName },
      ...aGraph().relations.slice(1),
    ]);

    expect(verification.dropped).toContainEqual({
      list: "relations",
      index: 0,
      asymmetryIndex: null,
      reason: "self-relation",
    });
  });

  it("drops a self-relation the model spelled two different ways", () => {
    // The two spellings reduce to one cast entry, so this is one character
    // relating to itself — invisible to raw equality.
    const verification = verify([
      { ...aRelation(), toCharacterName: "corentin  maillard" },
      ...aGraph().relations.slice(1),
    ]);

    expect(verification.dropped).toContainEqual({
      list: "relations",
      index: 0,
      asymmetryIndex: null,
      reason: "self-relation",
    });
  });

  it("drops a duplicate (from, to, type) — the table's own unique", () => {
    const verification = verify([aRelation(), aRelation()]);

    expect(verification.dropped).toEqual([
      { list: "relations", index: 1, asymmetryIndex: null, reason: "duplicate-relationship" },
    ]);
  });

  it("keeps the reverse edge, which is a second row on purpose", () => {
    const forward = aRelation();
    const verification = verify([
      forward,
      {
        ...forward,
        fromCharacterName: forward.toCharacterName,
        toCharacterName: forward.fromCharacterName,
      },
    ]);

    if (verification.outcome !== "verified") {
      throw new Error("expected a verified graph");
    }

    expect(verification.dropped).toEqual([]);
    expect(verification.relations.relations).toHaveLength(2);
  });

  it("drops a duplicate asymmetry within one edge, and keeps the edge", () => {
    const verification = verify([{ ...aRelation(), asymmetries: [anAsymmetry(), anAsymmetry()] }]);

    if (verification.outcome !== "verified") {
      throw new Error("expected a verified graph");
    }

    expect(verification.dropped).toEqual([
      { list: "asymmetries", index: 0, asymmetryIndex: 1, reason: "duplicate-asymmetry" },
    ]);
    expect(verification.relations.relations).toHaveLength(1);
    expect(verification.relations.relations[0]?.asymmetries).toHaveLength(1);
  });

  it("writes back the ask's spelling of both ends, never the model's echo", () => {
    const verification = verify([
      {
        ...aRelation(),
        fromCharacterName: "corentin  maillard",
        toCharacterName: "ÉLISE FOUGERAY",
      },
    ]);

    if (verification.outcome !== "verified") {
      throw new Error("expected a verified graph");
    }

    expect(verification.relations.relations[0]).toMatchObject({
      fromCharacterName: "Corentin Maillard",
      toCharacterName: "Élise Fougeray",
    });
  });

  it("refuses the answer whole when nothing survives", () => {
    const verification = verify([{ ...aRelation(), toCharacterName: "Un inconnu" }]);

    expect(verification.outcome).toBe("refused");

    if (verification.outcome !== "refused") {
      throw new Error("expected a refusal");
    }

    expect(verification.refusals).toEqual(["empty-graph"]);
    expect(verification.dropped).toHaveLength(1);
  });

  it("reports positions, counts and closed reasons — never a name or a statement", () => {
    const verification = verify([
      { ...aRelation(), toCharacterName: "Un inconnu" },
      ...aGraph().relations.slice(1),
    ]);

    for (const entry of verification.dropped) {
      expect(["relations", "asymmetries"]).toContain(entry.list);
      expect(typeof entry.index).toBe("number");
      expect(CHARACTER_RELATIONS_DROP_REASONS).toContain(entry.reason);
      expect(Object.keys(entry).sort()).toEqual(["asymmetryIndex", "index", "list", "reason"]);
    }
  });
});
