/**
 * The rules CAL-079 is accepted on: an answer is exactly three complete
 * directions or it does not parse, the twelve attributes are spelled as
 * `CreativeDirection` stores them, every direction declares all ten dimension
 * treatments, nothing in the contract can carry a score — the cahier des
 * charges' prohibition held as a shape — and the declaration feeds the shared
 * freedom gate unchanged.
 *
 * The fixtures are synthetic French sentences written for this file (§8).
 */

import {
  DIMENSION_TREATMENTS,
  SOURCE_DIMENSIONS,
  sourceDepartureBudget,
} from "@calepin/shared/freedom-level";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  checkDirectionProposalCompliance,
  DIRECTION_CHAR_CEILINGS,
  DIRECTION_LABEL_CHAR_CEILING,
  DIRECTION_LIST_COUNTS,
  DIRECTION_PROPOSAL_COUNT,
  DIRECTION_WORD_TARGETS,
  directionDimensionClaims,
  type DirectionDimensionTreatments,
  type DirectionProposal,
  type DirectionProposals,
  directionProposalsSchema,
} from "./proposals";

const proposalSchema = directionProposalsSchema.shape.directions.element;

/** All ten dimensions declared at the most binding treatment. */
function treatments(
  overrides: Partial<DirectionDimensionTreatments> = {},
): DirectionDimensionTreatments {
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
    ...overrides,
  };
}

function proposal(overrides: Partial<DirectionProposal> = {}): DirectionProposal {
  return proposalSchema.parse({
    workingTitle: "Le registre des absents",
    developedPremise:
      "Une gardienne d'archives découvre que chaque dossier qu'elle classe efface un souvenir du village, et doit choisir entre l'ordre qu'elle sert et la mémoire commune.",
    dominantGenre: "Drame psychologique",
    mainConflict:
      "Le devoir professionnel de la protagoniste s'oppose à la préservation de la mémoire collective.",
    protagonistArc:
      "De fonctionnaire scrupuleuse à dépositaire assumée d'une mémoire interdite, au prix de sa place.",
    newStakes: [
      "La disparition progressive des souvenirs du village.",
      "La confiance des habitants envers celle qui classe leurs vies.",
    ],
    charactersToIntroduce: ["Un inspecteur des archives, garant de l'ordre établi."],
    endingNature: "Une fin douce-amère : la mémoire sauvée, la place perdue.",
    mainRisks: [
      "Le dispositif fantastique peut écraser l'étude de caractère.",
      "La répétition des effacements peut lasser sur la longueur.",
    ],
    elementsKeptFromSource: [
      "La protagoniste et son rapport maniaque au classement.",
      "Le huis clos du bâtiment d'archives.",
    ],
    elementsTransformed: ["Le simple inventaire devient un mécanisme d'effacement."],
    novelPotentialAssessment:
      "La direction tient la longueur par l'élargissement progressif du cercle des habitants touchés ; sa promesse repose sur la tension entre ordre et mémoire, déjà présente dans le texte.",
    dimensionTreatments: treatments(),
    ...overrides,
  });
}

function proposals(overrides: Partial<DirectionProposals> = {}): DirectionProposals {
  return directionProposalsSchema.parse({
    directions: [
      proposal(),
      proposal({ workingTitle: "La part du feu" }),
      proposal({ workingTitle: "Les heures creuses" }),
    ],
    ...overrides,
  });
}

describe("directionProposalsSchema", () => {
  it("accepts three complete directions", () => {
    expect(proposals().directions).toHaveLength(DIRECTION_PROPOSAL_COUNT);
  });

  // The specification's own number: fewer is an unfinished answer, more is
  // noise the comparison screen cannot hold.
  it("refuses any count other than three", () => {
    const [first, second] = proposals().directions;

    expect(directionProposalsSchema.safeParse({ directions: [first, second] }).success).toBe(false);
    expect(
      directionProposalsSchema.safeParse({
        directions: [...proposals().directions, proposal()],
      }).success,
    ).toBe(false);
  });

  // The twelve attributes under their CreativeDirection spellings, plus the
  // declaration the direction stage rule demands — nothing else.
  it("pins the field set to the twelve stored attributes and the declaration", () => {
    expect(Object.keys(proposalSchema.shape)).toEqual([
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
      "dimensionTreatments",
    ]);
  });

  // Cahier des charges: no number presented as a measure of quality or
  // originality. Strict objects refuse the helpful rating column by name
  // today; the structural walk refuses it by type forever.
  it("refuses a score wherever one could be smuggled in", () => {
    expect(
      directionProposalsSchema.safeParse({
        directions: proposals().directions,
        originalityScore: 8,
      }).success,
    ).toBe(false);
    expect(proposalSchema.safeParse({ ...proposal(), potentialScore: 0.9 }).success).toBe(false);
  });

  it("declares no numeric field anywhere in the contract", () => {
    expect(Object.keys(directionProposalsSchema.shape)).toEqual(["directions"]);

    for (const [name, field] of Object.entries(proposalSchema.shape)) {
      expect(field instanceof z.ZodNumber, name).toBe(false);

      if (field instanceof z.ZodArray) {
        expect(field.element instanceof z.ZodString, `${name} item`).toBe(true);
      }
    }

    for (const [name, field] of Object.entries(proposalSchema.shape.dimensionTreatments.shape)) {
      expect(field instanceof z.ZodEnum, name).toBe(true);
    }
  });

  it("bounds every list as DIRECTION_LIST_COUNTS says", () => {
    expect(
      proposalSchema.safeParse({ ...proposal(), newStakes: ["Un seul enjeu nouveau."] }).success,
    ).toBe(false);
    expect(
      proposalSchema.safeParse({ ...proposal(), mainRisks: ["Un seul risque nommé."] }).success,
    ).toBe(false);
    expect(
      proposalSchema.safeParse({
        ...proposal(),
        elementsKeptFromSource: ["Un seul élément conservé."],
      }).success,
    ).toBe(false);
    expect(proposalSchema.safeParse({ ...proposal(), elementsTransformed: [] }).success).toBe(
      false,
    );

    const over = Array.from(
      { length: DIRECTION_LIST_COUNTS.newStakes.max + 1 },
      (_, index) => `Enjeu numéro ${String(index)}.`,
    );

    expect(proposalSchema.safeParse({ ...proposal(), newStakes: over }).success).toBe(false);
  });

  // An existing cast can suffice: that absence is an answer, not a hole.
  it("accepts an empty charactersToIntroduce and no other empty minimum-bound list", () => {
    expect(proposal({ charactersToIntroduce: [] }).charactersToIntroduce).toEqual([]);
  });

  it("refuses a blank or overlong heading", () => {
    expect(proposalSchema.safeParse({ ...proposal(), workingTitle: "   " }).success).toBe(false);
    expect(
      proposalSchema.safeParse({
        ...proposal(),
        dominantGenre: "g".repeat(DIRECTION_LABEL_CHAR_CEILING + 1),
      }).success,
    ).toBe(false);
  });

  it("refuses prose an order of magnitude past its target", () => {
    const oversized = "mot ".repeat(DIRECTION_CHAR_CEILINGS.developedPremise);

    expect(proposalSchema.safeParse({ ...proposal(), developedPremise: oversized }).success).toBe(
      false,
    );
    expect(
      proposalSchema.safeParse({ ...proposal(), newStakes: [oversized, oversized] }).success,
    ).toBe(false);
  });

  // The schema travels to the provider as JSON Schema, where an inexpressible
  // construct throws at call time. Prove expressibility at test time instead.
  it("is expressible as the JSON Schema the provider is sent", () => {
    expect(() => z.toJSONSchema(directionProposalsSchema)).not.toThrow();
  });
});

describe("dimensionTreatments", () => {
  // The declaration is total over the freedom policy's own vocabulary: a
  // dimension the schema names that the policy does not, or the reverse,
  // fails here before it can fail in production.
  it("declares exactly the ten source dimensions, in their order", () => {
    expect(Object.keys(proposalSchema.shape.dimensionTreatments.shape)).toEqual([
      ...SOURCE_DIMENSIONS,
    ]);
  });

  it("accepts only the three treatments", () => {
    for (const value of DIMENSION_TREATMENTS) {
      expect(
        proposalSchema.safeParse({
          ...proposal(),
          dimensionTreatments: treatments({ setting: value }),
        }).success,
      ).toBe(true);
    }

    expect(
      proposalSchema.safeParse({
        ...proposal(),
        dimensionTreatments: { ...treatments(), setting: "rewrite" },
      }).success,
    ).toBe(false);
  });

  it("refuses a missing or invented dimension", () => {
    const missing = Object.fromEntries(
      Object.entries(treatments()).filter(([key]) => key !== "ending"),
    );

    expect(proposalSchema.safeParse({ ...proposal(), dimensionTreatments: missing }).success).toBe(
      false,
    );
    expect(
      proposalSchema.safeParse({
        ...proposal(),
        dimensionTreatments: { ...treatments(), atmosphere: "preserve" },
      }).success,
    ).toBe(false);
  });
});

describe("directionDimensionClaims", () => {
  it("maps the declaration to one claim per dimension, in SOURCE_DIMENSIONS order", () => {
    const claims = directionDimensionClaims(
      proposal({ dimensionTreatments: treatments({ setting: "extend", ending: "reinterpret" }) }),
    );

    expect(claims.map((claim) => claim.dimension)).toEqual([...SOURCE_DIMENSIONS]);
    expect(claims.find((claim) => claim.dimension === "setting")?.treatment).toBe("extend");
    expect(claims.find((claim) => claim.dimension === "ending")?.treatment).toBe("reinterpret");
  });
});

describe("checkDirectionProposalCompliance", () => {
  // Declaring less than allowed always passes: a level is a ceiling, never a
  // floor obliging the novel to travel.
  it("finds an all-preserve declaration compliant at every level", () => {
    for (const level of ["LOW", "BALANCED", "HIGH"] as const) {
      const report = checkDirectionProposalCompliance(level, proposal());

      expect(report.compliant, level).toBe(true);
      expect(report.violations, level).toEqual([]);
      expect(report.undeclared, level).toEqual([]);
      expect(report.departure, level).toBe(0);
      expect(report.budget, level).toBe(sourceDepartureBudget(level));
    }
  });

  it("reports a declaration past the level's ceiling, by clause", () => {
    const report = checkDirectionProposalCompliance(
      "LOW",
      proposal({ dimensionTreatments: treatments({ premise: "reinterpret" }) }),
    );

    expect(report.compliant).toBe(false);
    expect(report.violations).toEqual([
      {
        constraintId: "direction-premise",
        dimension: "premise",
        allowed: "preserve",
        declared: "reinterpret",
      },
    ]);
  });

  // The measure, never the gate: extend counts 1 and reinterpret 2 on the
  // same scale the level's budget is stated on.
  it("measures the declared departure on the budget's own scale", () => {
    const report = checkDirectionProposalCompliance(
      "BALANCED",
      proposal({
        dimensionTreatments: treatments({ setting: "extend", "point-of-view": "reinterpret" }),
      }),
    );

    expect(report.departure).toBe(3);
    expect(report.budget).toBe(sourceDepartureBudget("BALANCED"));
    expect(report.compliant).toBe(true);
  });

  // §9. The report is what somebody will log the first time the mission
  // misbehaves; nothing a reader could read as part of the novel may be
  // reachable from it.
  it("reports identifiers and counts, never a word of the proposal", () => {
    const checked = proposal();
    const serialised = JSON.stringify(checkDirectionProposalCompliance("LOW", checked));

    for (const forbidden of [checked.workingTitle, "archives", "gardienne"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe("the contract's constants", () => {
  it("pins the specification's direction count", () => {
    expect(DIRECTION_PROPOSAL_COUNT).toBe(3);
  });

  it("derives every character ceiling from its word target", () => {
    for (const [key, target] of Object.entries(DIRECTION_WORD_TARGETS)) {
      expect(DIRECTION_CHAR_CEILINGS[key as keyof typeof DIRECTION_CHAR_CEILINGS], key).toBe(
        Math.ceil(target * 7 * 2),
      );
    }
  });

  it("bounds every list field of the schema, and no other", () => {
    const listFields = Object.entries(proposalSchema.shape)
      .filter(([, field]) => field instanceof z.ZodArray)
      .map(([name]) => name);

    expect(listFields.sort()).toEqual(Object.keys(DIRECTION_LIST_COUNTS).sort());
  });

  it("keeps the minimums prioritisation demands, not quotas", () => {
    expect(DIRECTION_LIST_COUNTS.newStakes.min).toBe(2);
    expect(DIRECTION_LIST_COUNTS.charactersToIntroduce.min).toBe(0);
    expect(DIRECTION_LIST_COUNTS.mainRisks.min).toBe(2);
    expect(DIRECTION_LIST_COUNTS.elementsKeptFromSource.min).toBe(2);
    expect(DIRECTION_LIST_COUNTS.elementsTransformed.min).toBe(1);
  });
});
