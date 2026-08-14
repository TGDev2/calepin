/**
 * The targeted relaunch (CAL-210).
 *
 * The acceptance criterion of the task — *three deliberately quasi-identical
 * directions trigger the relaunch* — is a decision over values, so it is proved
 * here with no provider, no queue and no database. What the executor adds on top
 * is the loop and the model call, and `direction-generation.integration.test.ts`
 * proves those end to end.
 *
 * Every fixture is a synthetic token, never prose (§9).
 */

import { describe, expect, it } from "vitest";

import { checkDirectionDivergence } from "../divergence";
import type { NarrativeEngine } from "../narrative-engine";
import { type DirectionProposal, directionProposalsSchema } from "../proposals";
import {
  acceptDirectionCandidates,
  MAX_DIRECTION_PROPOSAL_ASKS,
  nextDirectionAsk,
} from "./relaunch";

const proposalSchema = directionProposalsSchema.shape.directions.element;

function engine(overrides: Partial<NarrativeEngine> = {}): NarrativeEngine {
  return {
    conflictNature: "internal",
    tensionSource: "concealment",
    protagonistStake: "belonging",
    shiftTrigger: "revelation",
    resolutionNature: "sacrifice",
    ...overrides,
  };
}

function treatments(
  overrides: Partial<DirectionProposal["dimensionTreatments"]> = {},
): DirectionProposal["dimensionTreatments"] {
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

/**
 * One direction, distinguished from its siblings only by its label and by
 * whatever the caller overrides — the decor variation the divergence gate
 * exists to refuse.
 */
function direction(label: string, overrides: Partial<DirectionProposal> = {}): DirectionProposal {
  return proposalSchema.parse({
    workingTitle: `titre-${label}`,
    developedPremise: `premisse-${label}-1 premisse-${label}-2`,
    dominantGenre: `genre-${label}`,
    mainConflict: `conflit-${label}-1`,
    protagonistArc: `arc-${label}-1`,
    newStakes: [`enjeu-${label}-1`, `enjeu-${label}-2`],
    charactersToIntroduce: [],
    endingNature: `fin-${label}-1`,
    mainRisks: [`risque-${label}-1`, `risque-${label}-2`],
    elementsKeptFromSource: [`garde-${label}-1`, `garde-${label}-2`],
    elementsTransformed: [`transforme-${label}-1`],
    novelPotentialAssessment: `potentiel-${label}-1`,
    dimensionTreatments: treatments(),
    narrativeEngine: engine(),
    ...overrides,
  });
}

describe("acceptDirectionCandidates", () => {
  // The task's own acceptance criterion, at the level it is decided.
  it("keeps one of three deliberately quasi-identical directions and refuses the rest", () => {
    const { kept, report } = acceptDirectionCandidates(
      "BALANCED",
      [],
      [direction("a"), direction("b"), direction("c")],
    );

    expect(kept).toHaveLength(1);
    expect(kept[0]?.workingTitle).toBe("titre-a");
    expect(report.acceptedCount).toBe(1);
    expect(report.complete).toBe(false);
    expect(report.rejected.map((entry) => entry.candidate)).toEqual([1, 2]);
    expect(report.rejected.every((entry) => entry.reason === "shared-engine")).toBe(true);
    expect(report.rejected.map((entry) => entry.collidesWith)).toEqual([0, 0]);
  });

  // A single flipped axis is one mechanism with a variant outcome — the
  // cheapest way to look divergent without being it (CAL-080).
  it("refuses a direction that differs on a single axis", () => {
    const { kept, report } = acceptDirectionCandidates(
      "BALANCED",
      [],
      [direction("a"), direction("b", { narrativeEngine: engine({ resolutionNature: "defeat" }) })],
    );

    expect(kept).toHaveLength(1);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]?.reason).toBe("shared-engine");
  });

  it("keeps three genuinely divergent directions and reports the answer complete", () => {
    const { kept, report } = acceptDirectionCandidates(
      "BALANCED",
      [],
      [
        direction("a"),
        direction("b", {
          narrativeEngine: engine({ tensionSource: "deadline", shiftTrigger: "betrayal" }),
        }),
        direction("c", {
          narrativeEngine: engine({ tensionSource: "dilemma", shiftTrigger: "irruption" }),
        }),
      ],
    );

    expect(kept).toHaveLength(3);
    expect(report.rejected).toEqual([]);
    expect(report.complete).toBe(true);
    expect(checkDirectionDivergence(kept.map((entry) => entry.narrativeEngine)).divergent).toBe(
      true,
    );
  });

  // A declaration that overshoots the level is not a direction the author
  // asked for, so it may not hold a slot a compliant one would have to differ
  // from.
  it("refuses a declaration the freedom level does not permit, and says which clause", () => {
    const { kept, report } = acceptDirectionCandidates(
      "LOW",
      [],
      [
        direction("a", { dimensionTreatments: treatments({ themes: "reinterpret" }) }),
        direction("b"),
      ],
    );

    expect(kept.map((entry) => entry.workingTitle)).toEqual(["titre-b"]);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]?.reason).toBe("freedom-compliance");
    expect(report.rejected[0]?.violatedConstraintIds).toContain("direction-themes");
    expect(report.rejected[0]?.collidesWith).toBeNull();
  });

  // What was rejected for its declaration keeps its mechanism available: the
  // next ask excludes the engines that stand, not the ones that were refused.
  it("does not exclude the engine of a direction refused for its declaration", () => {
    const overshooting = direction("a", {
      dimensionTreatments: treatments({ themes: "reinterpret" }),
    });

    const first = acceptDirectionCandidates("LOW", [], [overshooting]);
    expect(first.kept).toEqual([]);

    const second = acceptDirectionCandidates("LOW", first.kept, [
      direction("b", { narrativeEngine: overshooting.narrativeEngine }),
    ]);

    expect(second.kept).toHaveLength(1);
  });

  it("keeps what already stands and admits only what differs from it", () => {
    const standing = [direction("a")];

    const { kept, report } = acceptDirectionCandidates("BALANCED", standing, [
      direction("b"),
      direction("c", {
        narrativeEngine: engine({ tensionSource: "pursuit", protagonistStake: "freedom" }),
      }),
    ]);

    expect(kept.map((entry) => entry.workingTitle)).toEqual(["titre-a", "titre-c"]);
    expect(report.keptCount).toBe(2);
    expect(report.acceptedCount).toBe(1);
    expect(report.rejected[0]?.candidate).toBe(0);
    expect(report.rejected[0]?.collidesWith).toBe(0);
  });

  it("accepts nothing from an empty answer and changes nothing", () => {
    const standing = [direction("a")];
    const { kept, report } = acceptDirectionCandidates("BALANCED", standing, []);

    expect(kept).toEqual(standing);
    expect(report.acceptedCount).toBe(0);
    expect(report.rejected).toEqual([]);
  });

  // §9: a report is a log line, so it holds indexes, counts, closed reasons and
  // constraint ids — never a word of a direction.
  it("reports nothing a reader could read as part of a novel", () => {
    const { report } = acceptDirectionCandidates(
      "LOW",
      [],
      [
        direction("a", { dimensionTreatments: treatments({ themes: "reinterpret" }) }),
        direction("b"),
        direction("c"),
      ],
    );

    const serialised = JSON.stringify(report);

    expect(serialised).not.toContain("titre-");
    expect(serialised).not.toContain("premisse-");
    expect(serialised).not.toContain("enjeu-");
  });
});

describe("nextDirectionAsk", () => {
  it("asks for three and excludes nothing on a first ask", () => {
    expect(nextDirectionAsk([])).toEqual({ directionCount: 3, excludedEngines: [] });
  });

  // The targeted relaunch, exactly as CAL-080 described it: re-ask the slots
  // that collided, naming the engines that stand.
  it("asks only for the slots still missing, excluding the engines that stand", () => {
    const standing = [direction("a")];
    const plan = nextDirectionAsk(standing);

    expect(plan).toEqual({ directionCount: 2, excludedEngines: [standing[0]?.narrativeEngine] });
  });

  it("stops rather than asking for nothing once enough directions stand", () => {
    const standing = [direction("a"), direction("b"), direction("c")];

    expect(nextDirectionAsk(standing)).toBeNull();
  });
});

describe("MAX_DIRECTION_PROPOSAL_ASKS", () => {
  // A bound, and one that has to leave room for the relaunch it exists to
  // permit: the first ask is the question, the second is the one the divergence
  // report was designed for.
  it("leaves room for at least one relaunch and stops well short of a loop", () => {
    expect(MAX_DIRECTION_PROPOSAL_ASKS).toBeGreaterThanOrEqual(2);
    expect(MAX_DIRECTION_PROPOSAL_ASKS).toBeLessThanOrEqual(4);
  });
});
