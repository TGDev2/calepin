import { describe, expect, it } from "vitest";

import { resolveDirectionProposal, resolveDirectionProposals } from "./persistence";
import { type DirectionProposal, directionProposalsSchema } from "./proposals";

const proposalSchema = directionProposalsSchema.shape.directions.element;

function treatments(): DirectionProposal["dimensionTreatments"] {
  return {
    premise: "preserve",
    "main-conflict": "preserve",
    "narrative-promise": "preserve",
    themes: "preserve",
    protagonist: "preserve",
    "secondary-characters": "preserve",
    setting: "preserve",
    tone: "preserve",
    "point-of-view": "preserve",
    ending: "preserve",
  };
}

function proposal(overrides: Partial<DirectionProposal> = {}): DirectionProposal {
  return proposalSchema.parse({
    workingTitle: "titre-dir-1",
    developedPremise: "premisse-dir-1 premisse-dir-2",
    dominantGenre: "genre-dir-1",
    mainConflict: "conflit-dir-1 conflit-dir-2",
    protagonistArc: "arc-dir-1 arc-dir-2",
    newStakes: ["enjeu-dir-1", "enjeu-dir-2"],
    charactersToIntroduce: [],
    endingNature: "fin-dir-1",
    mainRisks: ["risque-dir-1", "risque-dir-2"],
    elementsKeptFromSource: ["garde-dir-1", "garde-dir-2"],
    elementsTransformed: ["transforme-dir-1"],
    novelPotentialAssessment: "potentiel-dir-1 potentiel-dir-2",
    dimensionTreatments: treatments(),
    narrativeEngine: {
      conflictNature: "internal",
      tensionSource: "concealment",
      protagonistStake: "belonging",
      shiftTrigger: "revelation",
      resolutionNature: "sacrifice",
    },
    ...overrides,
  });
}

describe("resolveDirectionProposal", () => {
  it("carries the twelve attributes and the engine, under the column spellings", () => {
    const resolved = resolveDirectionProposal(proposal());

    expect(Object.keys(resolved).sort()).toEqual(
      [
        "charactersToIntroduce",
        "developedPremise",
        "dominantGenre",
        "elementsKeptFromSource",
        "elementsTransformed",
        "endingNature",
        "mainConflict",
        "mainRisks",
        "narrativeEngine",
        "newStakes",
        "novelPotentialAssessment",
        "protagonistArc",
        "workingTitle",
      ].sort(),
    );
  });

  // No column stores the declaration, for any direction — the manual write path
  // says so too (`directionContentSchema`, CAL-085). Dropping it once, here, is
  // what stops a write path finding out from Prisma.
  it("drops the dimension declaration, which no column stores", () => {
    expect(resolveDirectionProposal(proposal())).not.toHaveProperty("dimensionTreatments");
  });

  it("loses nothing of what the columns do hold", () => {
    const source = proposal();
    const resolved = resolveDirectionProposal(source);

    expect(resolved.workingTitle).toBe(source.workingTitle);
    expect(resolved.newStakes).toEqual(source.newStakes);
    expect(resolved.charactersToIntroduce).toEqual([]);
    expect(resolved.narrativeEngine).toEqual(source.narrativeEngine);
  });
});

describe("resolveDirectionProposals", () => {
  it("keeps the order it was given, which is the order the rows are written in", () => {
    const resolved = resolveDirectionProposals([
      proposal({ workingTitle: "titre-dir-a" }),
      proposal({ workingTitle: "titre-dir-b" }),
      proposal({ workingTitle: "titre-dir-c" }),
    ]);

    expect(resolved.map((direction) => direction.workingTitle)).toEqual([
      "titre-dir-a",
      "titre-dir-b",
      "titre-dir-c",
    ]);
  });

  it("resolves an empty list to an empty list", () => {
    expect(resolveDirectionProposals([])).toEqual([]);
  });
});
