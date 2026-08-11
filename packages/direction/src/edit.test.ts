/**
 * `directionContentSchema`/`parseDirectionContent` (CAL-085): the field set a
 * person may submit, reusing `directionProposalSchema`'s own field schemas
 * rather than restating their bounds, and the French refusals for what a
 * person is not allowed to write.
 *
 * The fixtures are synthetic French sentences written for this file (§8).
 */

import { describe, expect, it } from "vitest";

import { type DirectionContent, directionContentSchema, parseDirectionContent } from "./edit";
import { type NarrativeEngine } from "./narrative-engine";
import { directionProposalsSchema } from "./proposals";

const proposalSchema = directionProposalsSchema.shape.directions.element;

function narrativeEngine(overrides: Partial<NarrativeEngine> = {}): NarrativeEngine {
  return {
    conflictNature: "internal",
    tensionSource: "concealment",
    protagonistStake: "belonging",
    shiftTrigger: "revelation",
    resolutionNature: "sacrifice",
    ...overrides,
  };
}

function content(overrides: Partial<DirectionContent> = {}): unknown {
  return {
    workingTitle: "Le veilleur du silo",
    developedPremise:
      "Un gardien de silo à grain découvre que les registres qu'il tient dissimulent la disparition progressive d'un hameau voisin, et doit choisir entre son poste et ce qu'il sait.",
    dominantGenre: "Drame rural",
    mainConflict: "Le devoir du gardien s'oppose à ce que ses registres lui révèlent.",
    protagonistArc: "D'employé consciencieux à témoin qui parle, au prix de sa place.",
    newStakes: [
      "La disparition progressive des habitants du hameau.",
      "La confiance des villageois envers le silo.",
    ],
    charactersToIntroduce: ["Un inspecteur agricole, garant de l'ordre établi."],
    endingNature: "Une fin douce-amère : la vérité dite, le poste perdu.",
    mainRisks: [
      "Le mystère peut écraser l'étude de caractère.",
      "La répétition des découvertes peut lasser sur la longueur.",
    ],
    elementsKeptFromSource: [
      "Le gardien et son rapport scrupuleux aux registres.",
      "Le huis clos du silo.",
    ],
    elementsTransformed: ["Le simple inventaire devient la trace d'une disparition."],
    novelPotentialAssessment:
      "La direction tient la longueur par l'élargissement du cercle des habitants concernés ; sa promesse repose sur la tension entre devoir et vérité, déjà présente dans le texte.",
    narrativeEngine: narrativeEngine(),
    ...overrides,
  };
}

describe("directionContentSchema", () => {
  // dimensionTreatments is a proposal-only declaration, never persisted for
  // any direction (proposals.ts's own doc comment) — a person editing or
  // writing a direction has nothing to fill in for it.
  it("pins the field set to the twelve attributes and the narrative engine, never dimensionTreatments", () => {
    expect(Object.keys(directionContentSchema.shape)).toEqual([
      "workingTitle",
      "developedPremise",
      "dominantGenre",
      "mainConflict",
      "protagonistArc",
      "newStakes",
      "charactersToIntroduce",
      "endingNature",
      "mainRisks",
      "elementsKeptFromSource",
      "elementsTransformed",
      "novelPotentialAssessment",
      "narrativeEngine",
    ]);
  });

  // The same schema object, not a second derivation of the same bounds — the
  // "one schema, two write paths" claim, checked by reference rather than by
  // behaviour so a ceiling raised on the proposal side cannot drift here.
  it("reuses directionProposalSchema's own field schemas rather than restating them", () => {
    expect(directionContentSchema.shape.workingTitle).toBe(proposalSchema.shape.workingTitle);
    expect(directionContentSchema.shape.developedPremise).toBe(
      proposalSchema.shape.developedPremise,
    );
    expect(directionContentSchema.shape.newStakes).toBe(proposalSchema.shape.newStakes);
    expect(directionContentSchema.shape.narrativeEngine).toBe(proposalSchema.shape.narrativeEngine);
  });

  it("accepts a complete submission", () => {
    expect(directionContentSchema.safeParse(content()).success).toBe(true);
  });

  it("refuses an unrecognised key, dimensionTreatments included", () => {
    expect(
      directionContentSchema.safeParse(content({ dimensionTreatments: {} } as never)).success,
    ).toBe(false);
  });
});

describe("parseDirectionContent", () => {
  it("returns the parsed content on a valid submission", () => {
    const result = parseDirectionContent(content());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.workingTitle).toBe("Le veilleur du silo");
  });

  it("refuses a title past its ceiling with a sentence naming the rule, not the text", () => {
    const result = parseDirectionContent(content({ workingTitle: "x".repeat(200) }));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.userMessage).not.toContain("x".repeat(200));
    expect(result.error.fieldPath).toBe("workingTitle");
  });

  it("refuses an empty required field", () => {
    const result = parseDirectionContent(content({ mainConflict: "" }));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.userMessage).toContain("obligatoire");
  });

  it("refuses a list under its minimum", () => {
    const result = parseDirectionContent(content({ newStakes: [] }));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.userMessage).toContain("liste");
  });

  it("refuses a list over its maximum", () => {
    const result = parseDirectionContent(
      content({ mainRisks: Array.from({ length: 7 }, (_, index) => `risque ${index}`) }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.userMessage).toContain("liste");
  });

  it("refuses a narrative-engine axis naming no member", () => {
    const result = parseDirectionContent(
      content({ narrativeEngine: narrativeEngine({ conflictNature: "cosmic" as never }) }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.userMessage).toContain("moteur narratif");
  });
});
