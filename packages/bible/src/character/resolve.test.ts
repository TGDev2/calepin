import { describe, expect, it } from "vitest";

import { aSheet, aSheetInput } from "./fixtures";
import { CHARACTER_KNOWLEDGE_STANCE_PREFIXES } from "./knowledge";
import {
  CHARACTER_BREACH_CONNECTOR,
  CHARACTER_DILEMMA_CONNECTOR,
  CHARACTER_DIVERGENCE_CONNECTOR,
  resolveCharacterSheet,
} from "./resolve";
import { type VerifiedCharacterSheet, verifyCharacterSheet } from "./verify";

function aVerifiedSheet(): VerifiedCharacterSheet {
  const verification = verifyCharacterSheet(aSheet(), aSheetInput());

  if (verification.outcome !== "verified") {
    throw new Error("the fixture sheet no longer verifies");
  }
  return verification.sheet;
}

describe("resolveCharacterSheet", () => {
  it("produces the fifteen Character columns plus the edges, and no more", () => {
    expect(Object.keys(resolveCharacterSheet(aVerifiedSheet())).sort()).toEqual([
      "age",
      "apparentDesire",
      "appearance",
      "contradiction",
      "deepNeed",
      "elementsToPreserve",
      "fear",
      "heldKnowledge",
      "initialSituation",
      "name",
      "past",
      "plannedArc",
      "relationships",
      "role",
      "secret",
      "speechStyle",
    ]);
  });

  it("flattens each pair with its own connector, both halves visible", () => {
    const sheet = aVerifiedSheet();
    const resolved = resolveCharacterSheet(sheet);

    expect(resolved.deepNeed).toBe(
      `${sheet.deepNeed.need} ${CHARACTER_DIVERGENCE_CONNECTOR} ${sheet.deepNeed.divergence}`,
    );
    expect(resolved.contradiction).toBe(
      `${sheet.contradiction.tension} ${CHARACTER_DILEMMA_CONNECTOR} ${sheet.contradiction.dilemma}`,
    );
    expect(resolved.speechStyle).toBe(
      `${sheet.speechStyle.voice} ${CHARACTER_BREACH_CONNECTOR} ${sheet.speechStyle.breach}`,
    );
  });

  it("keeps the load-bearing half findable in every flattened text", () => {
    // CAL-107's context and CAL-136's checks find the second half by its
    // connector — `STYLE_VIOLATION_CONNECTOR`'s arrangement, one section over.
    const resolved = resolveCharacterSheet(aVerifiedSheet());

    expect(resolved.deepNeed).toContain(CHARACTER_DIVERGENCE_CONNECTOR);
    expect(resolved.contradiction).toContain(CHARACTER_DILEMMA_CONNECTOR);
    expect(resolved.speechStyle).toContain(CHARACTER_BREACH_CONNECTOR);
  });

  it("prefixes each knowledge entry with its stance, order and length preserved", () => {
    const sheet = aVerifiedSheet();
    const resolved = resolveCharacterSheet(sheet);

    expect(resolved.heldKnowledge).toHaveLength(sheet.heldKnowledge.length);
    sheet.heldKnowledge.forEach((entry, index) => {
      expect(resolved.heldKnowledge[index]).toBe(
        `${CHARACTER_KNOWLEDGE_STANCE_PREFIXES[entry.stance]} ${entry.statement}`,
      );
    });
  });

  it("passes the scalars and lists through untranslated", () => {
    const sheet = aVerifiedSheet();
    const resolved = resolveCharacterSheet(sheet);

    expect(resolved.name).toBe(sheet.name);
    expect(resolved.age).toBe(sheet.age);
    expect(resolved.role).toBe(sheet.role);
    expect(resolved.secret).toBe(sheet.secret);
    expect(resolved.elementsToPreserve).toEqual(sheet.elementsToPreserve);
  });

  it("resolves the edges name-keyed, entry for entry — ids are business code's", () => {
    const sheet = aVerifiedSheet();
    const resolved = resolveCharacterSheet(sheet);

    expect(resolved.relationships).toHaveLength(sheet.relationships.length);
    sheet.relationships.forEach((relationship, index) => {
      expect(resolved.relationships[index]).toEqual({
        toCharacterName: relationship.characterName,
        type: relationship.type,
        label: relationship.label,
        description: relationship.description,
      });
    });
  });

  it("carries no importance — the ask fixes it, the composer reads it there", () => {
    expect("importance" in resolveCharacterSheet(aVerifiedSheet())).toBe(false);
  });
});
