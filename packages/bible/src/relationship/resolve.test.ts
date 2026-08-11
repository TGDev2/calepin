import { describe, expect, it } from "vitest";

import { CHARACTER_KNOWLEDGE_STANCE_VERBS } from "../character/knowledge";
import { aGraph, anAsymmetry, aRelation, aRelationsInput } from "./fixtures";
import {
  RELATIONSHIP_ASYMMETRY_CONNECTOR,
  resolveCharacterRelations,
  resolveRelationshipAsymmetries,
} from "./resolve";
import type { CharacterRelations } from "./schema";
import { type VerifiedCharacterRelations, verifyCharacterRelations } from "./verify";

function verified(relations?: CharacterRelations["relations"]): VerifiedCharacterRelations {
  const verification = verifyCharacterRelations(
    relations === undefined ? aGraph() : { relations },
    aRelationsInput(),
  );

  if (verification.outcome !== "verified") {
    throw new Error("expected a verified graph");
  }

  return verification.relations;
}

describe("resolveCharacterRelations", () => {
  it("answers the Relationship columns and no more", () => {
    const rows = resolveCharacterRelations(verified());

    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "description",
        "fromCharacterName",
        "label",
        "toCharacterName",
        "type",
      ]);
    }
  });

  it("keeps the answer's order and length", () => {
    expect(resolveCharacterRelations(verified())).toHaveLength(aGraph().relations.length);
  });

  it("flattens an asymmetry into the one description column, without erasing it", () => {
    const rows = resolveCharacterRelations(
      verified([{ ...aRelation(), asymmetries: [anAsymmetry()] }]),
    );
    const description = rows[0]?.description ?? "";

    // The side-specific prose, then the asymmetry: statement, and both
    // characters named beside their stance.
    expect(description).toContain(aRelation().description ?? "");
    expect(description).toContain(RELATIONSHIP_ASYMMETRY_CONNECTOR);
    expect(description).toContain(anAsymmetry().statement);
    expect(description).toContain(`Corentin Maillard ${CHARACTER_KNOWLEDGE_STANCE_VERBS.knows}`);
    expect(description).toContain(`Élise Fougeray ${CHARACTER_KNOWLEDGE_STANCE_VERBS.unaware}`);
  });

  it("answers null when the edge carries neither prose nor an asymmetry", () => {
    const rows = resolveCharacterRelations(
      verified([{ ...aRelation(), description: null, asymmetries: [] }]),
    );

    expect(rows[0]?.description).toBeNull();
  });

  it("carries the asymmetry alone when there is no side-specific prose", () => {
    const rows = resolveCharacterRelations(
      verified([{ ...aRelation(), description: null, asymmetries: [anAsymmetry()] }]),
    );

    expect(rows[0]?.description).toContain(anAsymmetry().statement);
    expect(rows[0]?.description?.startsWith(RELATIONSHIP_ASYMMETRY_CONNECTOR)).toBe(true);
  });
});

describe("resolveRelationshipAsymmetries", () => {
  it("answers one pending canon fact per declared asymmetry", () => {
    expect(resolveRelationshipAsymmetries(verified())).toHaveLength(1);
    expect(resolveRelationshipAsymmetries(verified([{ ...aRelation(), asymmetries: [] }]))).toEqual(
      [],
    );
  });

  it("makes « A sait de B ce que B ignore » two comparable beliefs", () => {
    const [fact] = resolveRelationshipAsymmetries(
      verified([{ ...aRelation(), asymmetries: [anAsymmetry()] }]),
    );

    expect(fact).toEqual({
      statement: anAsymmetry().statement,
      isTrue: true,
      subjectCharacterName: "Élise Fougeray",
      beliefs: [
        { characterName: "Corentin Maillard", state: "BELIEVES_TRUE" },
        { characterName: "Élise Fougeray", state: "UNAWARE" },
      ],
    });
  });

  it("names the edge's target as the fact's subject", () => {
    const [fact] = resolveRelationshipAsymmetries(
      verified([{ ...aRelation(), asymmetries: [anAsymmetry()] }]),
    );

    expect(fact?.subjectCharacterName).toBe(aRelation().toCharacterName);
  });

  it("always answers two beliefs, and they never agree", () => {
    for (const fact of resolveRelationshipAsymmetries(verified())) {
      expect(fact.beliefs).toHaveLength(2);
      expect(fact.beliefs[0].state).not.toBe(fact.beliefs[1].state);
    }
  });

  it("reads the world's truth off a stance, never off prose", () => {
    const [fact] = resolveRelationshipAsymmetries(
      verified([
        {
          ...aRelation(),
          asymmetries: [{ ...anAsymmetry(), holderStance: "denies", subjectStance: "knows" }],
        },
      ]),
    );

    // `denies` is refusing a truth, so the statement still holds in the world.
    expect(fact?.isTrue).toBe(true);
    expect(fact?.beliefs[0].state).toBe("BELIEVES_FALSE");
    expect(fact?.beliefs[1].state).toBe("BELIEVES_TRUE");
  });
});
