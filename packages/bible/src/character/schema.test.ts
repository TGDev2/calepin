import { describe, expect, it } from "vitest";
import { z } from "zod";

import { aKnowledgeEntry, aRelationship, aSheet, aSheetInput, aSource } from "./fixtures";
import {
  CHARACTER_CHAR_CEILINGS,
  CHARACTER_IMPORTANCE_LABELS,
  CHARACTER_IMPORTANCES,
  CHARACTER_LIST_COUNTS,
  CHARACTER_RELATIONSHIP_TYPE_LABELS,
  CHARACTER_RELATIONSHIP_TYPES,
  CHARACTER_SOURCE_COUNTS,
  CHARACTER_SOURCE_KINDS,
  CHARACTER_WORD_TARGETS,
  characterSheetInputSchema,
  conflictedCharacterSheetSchema,
} from "./schema";

const shape = conflictedCharacterSheetSchema.shape;

/**
 * Every numeric leaf of a schema, by path — how "no score, structurally"
 * survives the one field that is legitimately a number: the walk must find
 * `age` and nothing else.
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

describe("conflictedCharacterSheetSchema", () => {
  it("accepts a complete sheet", () => {
    expect(conflictedCharacterSheetSchema.safeParse(aSheet()).success).toBe(true);
  });

  it("carries the fifteen sheet columns Character stores, plus relationships", () => {
    // The backlog's own seventeenth field: relations are the one part of the
    // sheet the `Relationship` table holds rather than a column.
    expect(Object.keys(shape).sort()).toEqual([
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

  it("carries no field for importance — the ask fixes it", () => {
    expect(
      conflictedCharacterSheetSchema.safeParse({ ...aSheet(), importance: "MAIN" }).success,
    ).toBe(false);
  });

  it("refuses a bare description where the need pair belongs", () => {
    // The acceptance criterion as a shape: a need is paired with what pursuing
    // the desire costs it, never one free text that could restate the desire.
    expect(
      conflictedCharacterSheetSchema.safeParse({
        ...aSheet(),
        deepNeed: "Être déliée du serment fait au père.",
      }).success,
    ).toBe(false);
  });

  it.each(["need", "divergence"] as const)("refuses a need pair with no %s", (part) => {
    const sheet = aSheet();
    const pair = { ...sheet.deepNeed, [part]: undefined };

    expect(conflictedCharacterSheetSchema.safeParse({ ...sheet, deepNeed: pair }).success).toBe(
      false,
    );
  });

  it.each(["tension", "dilemma"] as const)("refuses a contradiction with no %s", (part) => {
    const sheet = aSheet();
    const pair = { ...sheet.contradiction, [part]: undefined };

    expect(
      conflictedCharacterSheetSchema.safeParse({ ...sheet, contradiction: pair }).success,
    ).toBe(false);
  });

  it.each(["voice", "breach"] as const)("refuses a speech style with no %s", (part) => {
    const sheet = aSheet();
    const pair = { ...sheet.speechStyle, [part]: undefined };

    expect(conflictedCharacterSheetSchema.safeParse({ ...sheet, speechStyle: pair }).success).toBe(
      false,
    );
  });

  it("refuses a null dilemma — a contradiction forcing no choice is a trait", () => {
    const sheet = aSheet();

    expect(
      conflictedCharacterSheetSchema.safeParse({
        ...sheet,
        contradiction: { tension: sheet.contradiction.tension, dilemma: null },
      }).success,
    ).toBe(false);
  });

  it("refuses a knowledge entry with no stance", () => {
    const sheet = aSheet();

    expect(
      conflictedCharacterSheetSchema.safeParse({
        ...sheet,
        heldKnowledge: [{ statement: aKnowledgeEntry().statement }],
      }).success,
    ).toBe(false);
  });

  it("refuses a stance outside the vocabulary", () => {
    const sheet = aSheet();

    expect(
      conflictedCharacterSheetSchema.safeParse({
        ...sheet,
        heldKnowledge: [{ ...aKnowledgeEntry(), stance: "believes" }],
      }).success,
    ).toBe(false);
  });

  it("accepts a null age — age is not always a fact of the sheet", () => {
    expect(conflictedCharacterSheetSchema.safeParse({ ...aSheet(), age: null }).success).toBe(true);
  });

  it("refuses a negative age", () => {
    const parsed = conflictedCharacterSheetSchema.safeParse({ ...aSheet(), age: -1 });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["age"]);
  });

  it("refuses a fractional age", () => {
    expect(conflictedCharacterSheetSchema.safeParse({ ...aSheet(), age: 47.5 }).success).toBe(
      false,
    );
  });

  it("refuses an unknown field — the object is strict", () => {
    expect(conflictedCharacterSheetSchema.safeParse({ ...aSheet(), depthScore: 7 }).success).toBe(
      false,
    );
  });

  it("bounds every prose field", () => {
    const sheet = aSheet();

    expect(
      conflictedCharacterSheetSchema.safeParse({
        ...sheet,
        past: "a".repeat(CHARACTER_CHAR_CEILINGS.past + 1),
      }).success,
    ).toBe(false);
    expect(
      conflictedCharacterSheetSchema.safeParse({
        ...sheet,
        speechStyle: {
          ...sheet.speechStyle,
          breach: "a".repeat(CHARACTER_CHAR_CEILINGS.breach + 1),
        },
      }).success,
    ).toBe(false);
  });

  it("refuses an empty knowledge list — a character who knows nothing holds no scene", () => {
    expect(
      conflictedCharacterSheetSchema.safeParse({ ...aSheet(), heldKnowledge: [] }).success,
    ).toBe(false);
  });

  it("refuses more knowledge than the ceiling", () => {
    const tooMany = Array.from({ length: CHARACTER_LIST_COUNTS.heldKnowledge.max + 1 }, (_, i) => ({
      ...aKnowledgeEntry(),
      statement: `Entrée numéro ${String(i)} du registre des passages.`,
    }));

    expect(
      conflictedCharacterSheetSchema.safeParse({ ...aSheet(), heldKnowledge: tooMany }).success,
    ).toBe(false);
  });

  it("refuses a sheet with nothing to preserve — no spine, no sheet", () => {
    expect(
      conflictedCharacterSheetSchema.safeParse({ ...aSheet(), elementsToPreserve: [] }).success,
    ).toBe(false);
  });

  it("accepts an empty relationship list — the first sheet has no cast to reach", () => {
    expect(
      conflictedCharacterSheetSchema.safeParse({ ...aSheet(), relationships: [] }).success,
    ).toBe(true);
  });

  it("refuses more relationships than the ceiling", () => {
    const tooMany = Array.from({ length: CHARACTER_LIST_COUNTS.relationships.max + 1 }, () =>
      aRelationship(),
    );

    expect(
      conflictedCharacterSheetSchema.safeParse({ ...aSheet(), relationships: tooMany }).success,
    ).toBe(false);
  });

  it("refuses a relationship typed outside the vocabulary", () => {
    expect(
      conflictedCharacterSheetSchema.safeParse({
        ...aSheet(),
        relationships: [{ ...aRelationship(), type: "NEIGHBOUR" }],
      }).success,
    ).toBe(false);
  });

  it("declares no numeric field other than age — age measures time, never quality", () => {
    // The cahier des charges (1195-1199) forbids a number presented as a
    // measure of quality; `age` is the first number an answer schema carries,
    // and it counts years at day 0 of the timeline, not merit.
    expect(numericPaths(conflictedCharacterSheetSchema, "")).toEqual(["age"]);
  });
});

describe("the vocabularies", () => {
  it("mirrors the CharacterImportance enum, member for member", () => {
    expect([...CHARACTER_IMPORTANCES]).toEqual(["MAIN", "SECONDARY", "MINOR"]);
  });

  it("mirrors the RelationshipType enum, member for member", () => {
    expect([...CHARACTER_RELATIONSHIP_TYPES]).toEqual([
      "FAMILY",
      "ROMANTIC",
      "FRIENDSHIP",
      "PROFESSIONAL",
      "MENTORSHIP",
      "ALLIANCE",
      "RIVALRY",
      "HOSTILITY",
      "OTHER",
    ]);
  });

  it("labels every importance and every relationship type", () => {
    for (const importance of CHARACTER_IMPORTANCES) {
      expect(CHARACTER_IMPORTANCE_LABELS[importance]).toMatch(/\S/);
    }
    for (const type of CHARACTER_RELATIONSHIP_TYPES) {
      expect(CHARACTER_RELATIONSHIP_TYPE_LABELS[type]).toMatch(/\S/);
    }
  });

  it("derives every character ceiling from its own word target", () => {
    for (const concept of Object.keys(CHARACTER_WORD_TARGETS)) {
      const key = concept as keyof typeof CHARACTER_WORD_TARGETS;

      expect(CHARACTER_CHAR_CEILINGS[key]).toBeGreaterThan(CHARACTER_WORD_TARGETS[key]);
    }
  });

  it("knows the four upstreams a sheet answers to", () => {
    expect([...CHARACTER_SOURCE_KINDS]).toEqual(["direction", "identity", "style", "analysis"]);
  });
});

describe("characterSheetInputSchema", () => {
  it("accepts a complete ask", () => {
    expect(characterSheetInputSchema.safeParse(aSheetInput()).success).toBe(true);
  });

  it("accepts a null name and a null brief — absences written, never elided", () => {
    expect(
      characterSheetInputSchema.safeParse({ ...aSheetInput(), characterName: null, brief: null })
        .success,
    ).toBe(true);
  });

  it("refuses an ask that elides the name instead of writing null", () => {
    const withoutName: Partial<ReturnType<typeof aSheetInput>> = { ...aSheetInput() };
    delete withoutName.characterName;

    expect(characterSheetInputSchema.safeParse(withoutName).success).toBe(false);
  });

  it("names the source text version and the direction the ask was built on", () => {
    const parsed = characterSheetInputSchema.parse(aSheetInput());

    expect(parsed.sourceTextVersionId).toMatch(/\S/);
    expect(parsed.directionId).toMatch(/\S/);
  });

  it("refuses the same source key twice — one ask digests once", () => {
    const input = aSheetInput();
    const parsed = characterSheetInputSchema.safeParse({
      ...input,
      sources: [...input.sources, aSource()],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["sources", input.sources.length, "key"]);
  });

  it("refuses the same established character twice", () => {
    const input = aSheetInput();
    const parsed = characterSheetInputSchema.safeParse({
      ...input,
      establishedCharacters: [...input.establishedCharacters, input.establishedCharacters[0]],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual([
      "establishedCharacters",
      input.establishedCharacters.length,
      "name",
    ]);
  });

  it("refuses an imposed name that already names an established character", () => {
    // Principle 6.5: decidable from the ask alone, so it is refused before any
    // generation is paid for.
    const input = aSheetInput();
    const parsed = characterSheetInputSchema.safeParse({
      ...input,
      characterName: input.establishedCharacters[0]?.name,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["characterName"]);
  });

  it("accepts an empty established cast — the first sheet of a project", () => {
    expect(
      characterSheetInputSchema.safeParse({ ...aSheetInput(), establishedCharacters: [] }).success,
    ).toBe(true);
  });

  it("refuses a corpus below the minimum", () => {
    const input = aSheetInput();

    expect(
      characterSheetInputSchema.safeParse({
        ...input,
        sources: input.sources.slice(0, CHARACTER_SOURCE_COUNTS.min - 1),
      }).success,
    ).toBe(false);
  });

  it("refuses a source of an unknown kind", () => {
    const input = aSheetInput();

    expect(
      characterSheetInputSchema.safeParse({
        ...input,
        sources: [...input.sources, { ...aSource(), key: "outline.arc", kind: "outline" }],
      }).success,
    ).toBe(false);
  });

  it("carries no audience and no length — no sheet field reads either", () => {
    expect(
      characterSheetInputSchema.safeParse({ ...aSheetInput(), targetAudience: "Adultes" }).success,
    ).toBe(false);
    expect(
      characterSheetInputSchema.safeParse({ ...aSheetInput(), targetWordCount: 70_000 }).success,
    ).toBe(false);
  });
});
