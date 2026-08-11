import { describe, expect, it } from "vitest";

import { CHARACTER_KNOWLEDGE_STANCES, knowledgeStanceToBelief } from "../character/knowledge";
import { aGraph, anAsymmetry, aRelation, aRelationsInput } from "./fixtures";
import {
  characterRelationsInputSchema,
  characterRelationsSchema,
  RELATIONSHIP_CAST_COUNTS,
  RELATIONSHIP_CHAR_CEILINGS,
  RELATIONSHIP_LIST_COUNTS,
  relationshipAsymmetrySchema,
} from "./schema";

describe("the relationship graph contract", () => {
  it("accepts a complete graph", () => {
    expect(characterRelationsSchema.safeParse(aGraph()).success).toBe(true);
  });

  it("names both ends of every edge", () => {
    const relation = aRelation();

    expect(Object.keys(relation).sort()).toEqual([
      "asymmetries",
      "description",
      "fromCharacterName",
      "label",
      "toCharacterName",
      "type",
    ]);
  });

  it("refuses an unknown relationship type", () => {
    const graph = aGraph();

    expect(
      characterRelationsSchema.safeParse({
        relations: [{ ...aRelation(), type: "COMPLICATED" }, ...graph.relations.slice(1)],
      }).success,
    ).toBe(false);
  });

  it("refuses an empty graph — an answer declaring no tie is not one", () => {
    expect(characterRelationsSchema.safeParse({ relations: [] }).success).toBe(false);
    expect(RELATIONSHIP_LIST_COUNTS.relations.min).toBe(1);
  });

  it("refuses more relations than the ceiling allows", () => {
    const relations = Array.from({ length: RELATIONSHIP_LIST_COUNTS.relations.max + 1 }, () =>
      aRelation(),
    );

    expect(characterRelationsSchema.safeParse({ relations }).success).toBe(false);
  });

  it("writes an absent side-specific description rather than eliding it", () => {
    const withoutDescription: Record<string, unknown> = { ...aRelation() };
    delete withoutDescription.description;

    expect(characterRelationsSchema.safeParse({ relations: [withoutDescription] }).success).toBe(
      false,
    );
    expect(
      characterRelationsSchema.safeParse({ relations: [{ ...aRelation(), description: null }] })
        .success,
    ).toBe(true);
  });

  it("bounds the side-specific description", () => {
    const description = "m".repeat(RELATIONSHIP_CHAR_CEILINGS.description + 1);

    expect(
      characterRelationsSchema.safeParse({ relations: [{ ...aRelation(), description }] }).success,
    ).toBe(false);
  });

  it("is strict — an invented field is refused, not ignored", () => {
    expect(
      characterRelationsSchema.safeParse({
        relations: [{ ...aRelation(), intensity: "forte" }],
      }).success,
    ).toBe(false);
  });

  it("declares no numeric field anywhere — no score, structurally", () => {
    const numbers: string[] = [];

    const walk = (value: unknown, path: string): void => {
      if (typeof value === "number") {
        numbers.push(path);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${path}.${index}`));
        return;
      }
      if (typeof value === "object" && value !== null) {
        for (const [key, entry] of Object.entries(value)) {
          walk(entry, `${path}.${key}`);
        }
      }
    };

    walk(characterRelationsSchema.parse(aGraph()), "relations");

    expect(numbers).toEqual([]);
  });
});

describe("an asymmetry", () => {
  it("accepts the canonical case — the holder knows, the subject does not", () => {
    expect(relationshipAsymmetrySchema.safeParse(anAsymmetry()).success).toBe(true);
  });

  it("refuses two stances that decide different worlds", () => {
    // `believes-wrongly` says the statement is false; `unaware` says it is
    // true. One statement cannot be both, whatever prose is wrapped round it.
    expect(
      relationshipAsymmetrySchema.safeParse({
        ...anAsymmetry(),
        holderStance: "believes-wrongly",
        subjectStance: "unaware",
      }).success,
    ).toBe(false);
  });

  it("refuses two identical stances — that is symmetric knowledge", () => {
    expect(
      relationshipAsymmetrySchema.safeParse({
        ...anAsymmetry(),
        holderStance: "knows",
        subjectStance: "knows",
      }).success,
    ).toBe(false);
  });

  it("admits exactly the stance pairs whose worlds agree and whose beliefs differ", () => {
    const admitted: string[] = [];

    for (const holderStance of CHARACTER_KNOWLEDGE_STANCES) {
      for (const subjectStance of CHARACTER_KNOWLEDGE_STANCES) {
        if (
          relationshipAsymmetrySchema.safeParse({ ...anAsymmetry(), holderStance, subjectStance })
            .success
        ) {
          admitted.push(`${holderStance} ${subjectStance}`);
        }
      }
    }

    // The six ordered pairs over the three stances that agree the statement
    // holds. `believes-wrongly` is the only stance deciding a false world, so
    // it can never pair with a different belief — a consequence of the
    // mapping, not a carve-out.
    expect(admitted.sort()).toEqual([
      "denies knows",
      "denies unaware",
      "knows denies",
      "knows unaware",
      "unaware denies",
      "unaware knows",
    ]);
  });

  it("leaves believes-wrongly unusable, and that is what forces an affirmative statement", () => {
    const usable = CHARACTER_KNOWLEDGE_STANCES.filter((stance) =>
      CHARACTER_KNOWLEDGE_STANCES.some(
        (other) =>
          relationshipAsymmetrySchema.safeParse({
            ...anAsymmetry(),
            holderStance: stance,
            subjectStance: other,
          }).success,
      ),
    );

    expect(usable).not.toContain("believes-wrongly");
    expect(knowledgeStanceToBelief("believes-wrongly").isTrue).toBe(false);
  });

  it("may be absent — a contract demanding one per edge would teach invention", () => {
    expect(RELATIONSHIP_LIST_COUNTS.asymmetries.min).toBe(0);
    expect(
      characterRelationsSchema.safeParse({ relations: [{ ...aRelation(), asymmetries: [] }] })
        .success,
    ).toBe(true);
  });

  it("refuses more asymmetries on one edge than the ceiling allows", () => {
    const asymmetries = Array.from({ length: RELATIONSHIP_LIST_COUNTS.asymmetries.max + 1 }, () =>
      anAsymmetry(),
    );

    expect(
      characterRelationsSchema.safeParse({ relations: [{ ...aRelation(), asymmetries }] }).success,
    ).toBe(false);
  });

  it("bounds the statement", () => {
    const statement = "m".repeat(RELATIONSHIP_CHAR_CEILINGS.asymmetryStatement + 1);

    expect(relationshipAsymmetrySchema.safeParse({ ...anAsymmetry(), statement }).success).toBe(
      false,
    );
  });
});

describe("the relations ask", () => {
  it("accepts a complete ask", () => {
    expect(characterRelationsInputSchema.safeParse(aRelationsInput()).success).toBe(true);
  });

  it("refuses a cast of one — a tie needs two ends", () => {
    expect(RELATIONSHIP_CAST_COUNTS.min).toBe(2);
    expect(
      characterRelationsInputSchema.safeParse({
        ...aRelationsInput(),
        cast: aRelationsInput().cast.slice(0, 1),
      }).success,
    ).toBe(false);
  });

  it("refuses the same character offered twice", () => {
    const input = aRelationsInput();

    expect(
      characterRelationsInputSchema.safeParse({
        ...input,
        cast: [...input.cast, ...input.cast.slice(0, 1)],
      }).success,
    ).toBe(false);
  });

  it("refuses the same source key offered twice", () => {
    const input = aRelationsInput();

    expect(
      characterRelationsInputSchema.safeParse({
        ...input,
        sources: [...input.sources, ...input.sources.slice(0, 1)],
      }).success,
    ).toBe(false);
  });

  it("carries no audience and no target length", () => {
    const input = aRelationsInput();

    expect(Object.keys(input).sort()).toEqual([
      "cast",
      "directionId",
      "freedomLevel",
      "sourceTextVersionId",
      "sources",
    ]);
  });
});
