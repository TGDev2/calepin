import { describe, expect, it } from "vitest";

import { aRelationship, aSheet, aSheetInput } from "./fixtures";
import type { ConflictedCharacterSheet } from "./schema";
import {
  type CharacterSheetVerification,
  isVerifiedCharacterSheet,
  type VerifiedCharacterSheet,
  verifyCharacterSheet,
} from "./verify";

function verified(verification: CharacterSheetVerification): VerifiedCharacterSheet {
  if (verification.outcome !== "verified") {
    throw new Error("expected a verified sheet");
  }
  return verification.sheet;
}

describe("verifyCharacterSheet", () => {
  it("verifies a faithful sheet whole, dropping nothing", () => {
    const verification = verifyCharacterSheet(aSheet(), aSheetInput());

    expect(verification.outcome).toBe("verified");
    if (verification.outcome === "verified") {
      expect(verification.dropped).toEqual([]);
      expect(isVerifiedCharacterSheet(verification.sheet)).toBe(true);
      expect(verification.sheet.relationships).toHaveLength(2);
      expect(verification.sheet.heldKnowledge).toHaveLength(4);
    }
  });

  it("accepts an imposed name the model retyped, and writes back the ask's spelling", () => {
    // Typography and case are what a model retypes wrong; the stored spelling
    // is the ask's, never the echo — no second answer able to disagree.
    const sheet: ConflictedCharacterSheet = { ...aSheet(), name: "BLANCHE  AUBRY" };

    expect(verified(verifyCharacterSheet(sheet, aSheetInput())).name).toBe("Blanche Aubry");
  });

  it("refuses a sheet that did not respect the imposed name", () => {
    const verification = verifyCharacterSheet({ ...aSheet(), name: "Berthe Aubry" }, aSheetInput());

    expect(verification).toEqual({
      outcome: "refused",
      refusals: ["imposed-name-not-respected"],
    });
  });

  it("refuses a proposed name that collides with an established character", () => {
    const verification = verifyCharacterSheet(
      { ...aSheet(), name: "corentin maillard" },
      { ...aSheetInput(), characterName: null },
    );

    expect(verification).toEqual({ outcome: "refused", refusals: ["name-collision"] });
  });

  it("keeps a proposed name in the model's own spelling — the first spelling that exists", () => {
    const verification = verifyCharacterSheet(
      { ...aSheet(), name: "Sidonie Vernet" },
      { ...aSheetInput(), characterName: null },
    );

    expect(verified(verification).name).toBe("Sidonie Vernet");
  });

  it("drops an edge toward a character the ask never offered", () => {
    const sheet = aSheet();
    const verification = verifyCharacterSheet(
      {
        ...sheet,
        relationships: [
          ...sheet.relationships,
          { ...aRelationship(), characterName: "Maître Pontier", type: "PROFESSIONAL" },
        ],
      },
      aSheetInput(),
    );

    expect(verification.outcome).toBe("verified");
    if (verification.outcome === "verified") {
      expect(verification.dropped).toEqual([
        { list: "relationships", index: 2, reason: "unknown-character" },
      ]);
      expect(verification.sheet.relationships).toHaveLength(2);
    }
  });

  it("drops a self-relation", () => {
    const sheet = aSheet();
    const verification = verifyCharacterSheet(
      {
        ...sheet,
        relationships: [
          { ...aRelationship(), characterName: "Blanche Aubry", type: "OTHER" },
          ...sheet.relationships,
        ],
      },
      aSheetInput(),
    );

    expect(verification.outcome).toBe("verified");
    if (verification.outcome === "verified") {
      expect(verification.dropped).toEqual([
        { list: "relationships", index: 0, reason: "self-relation" },
      ]);
    }
  });

  it("rewrites an edge's retyped name to the ask's spelling", () => {
    const sheet = aSheet();
    const [first, ...rest] = sheet.relationships;
    const verification = verifyCharacterSheet(
      {
        ...sheet,
        relationships: [{ ...aRelationship(), characterName: "corentin maillard" }, ...rest],
      },
      aSheetInput(),
    );

    expect(first).toBeDefined();
    expect(verified(verification).relationships[0]?.characterName).toBe("Corentin Maillard");
  });

  it("drops a duplicate (character, type) edge — the table's own unique, first wins", () => {
    const sheet = aSheet();
    const verification = verifyCharacterSheet(
      {
        ...sheet,
        relationships: [...sheet.relationships, { ...aRelationship(), label: "gardienne de" }],
      },
      aSheetInput(),
    );

    expect(verification.outcome).toBe("verified");
    if (verification.outcome === "verified") {
      expect(verification.dropped).toEqual([
        { list: "relationships", index: 2, reason: "duplicate-relationship" },
      ]);
      expect(verification.sheet.relationships[0]?.label).toBe("sœur aînée de");
    }
  });

  it("drops a duplicate knowledge statement, whatever its stance — first wins", () => {
    const sheet = aSheet();
    const [first] = sheet.heldKnowledge;
    const verification = verifyCharacterSheet(
      {
        ...sheet,
        heldKnowledge: [
          ...sheet.heldKnowledge,
          { statement: first?.statement ?? "", stance: "denies" },
        ],
      },
      aSheetInput(),
    );

    expect(verification.outcome).toBe("verified");
    if (verification.outcome === "verified") {
      expect(verification.dropped).toEqual([
        { list: "heldKnowledge", index: 4, reason: "duplicate-knowledge" },
      ]);
      expect(verification.sheet.heldKnowledge[0]?.stance).toBe("knows");
    }
  });

  it("reports indexes and closed reasons, never a name (§9)", () => {
    const sheet = aSheet();
    const verification = verifyCharacterSheet(
      {
        ...sheet,
        relationships: [{ ...aRelationship(), characterName: "Maître Pontier" }],
      },
      aSheetInput(),
    );

    expect(verification.outcome).toBe("verified");
    if (verification.outcome === "verified") {
      const reported = JSON.stringify(verification.dropped);

      expect(reported).not.toContain("Pontier");
      expect(reported).not.toContain("Blanche");
    }
  });

  it("carries no sheet on the refused arm — there is nothing to keep", () => {
    const verification = verifyCharacterSheet({ ...aSheet(), name: "Berthe Aubry" }, aSheetInput());

    expect(verification.outcome).toBe("refused");
    expect("sheet" in verification).toBe(false);
  });
});
