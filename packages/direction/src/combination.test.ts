/**
 * The rules CAL-084 is accepted on: combining two incompatible engines
 * produces an explicit warning before anything is paid for, a merged
 * direction serves exactly one dominant source engine — the blend between two
 * of them is refused mechanically — an irreducible answer may only name
 * elements the ask selected, the ask is canonical (CAL-058), and every report
 * exposes slots, indexes, axis identifiers and booleans only (§9).
 *
 * The fixtures are synthetic French sentences written for this file (§8).
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  checkDirectionCombinationAnswer,
  checkDirectionCombinationSelection,
  DIRECTION_COMBINABLE_ELEMENTS,
  DIRECTION_COMBINATION_CHAR_CEILINGS,
  DIRECTION_COMBINATION_SLOT_LABELS,
  DIRECTION_COMBINATION_SLOTS,
  type DirectionCombinationInput,
  directionCombinationInputSchema,
  directionCombinationSchema,
} from "./combination";
import { NARRATIVE_ENGINE_DIVERGENCE_MINIMUM } from "./divergence";
import { DIRECTION_ELEMENTS } from "./evaluation";
import { NARRATIVE_ENGINE_AXES, type NarrativeEngine } from "./narrative-engine";
import { DIRECTION_PROPOSAL_COUNT } from "./proposals";

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

/** Three pairwise-distinct engines; the first two differ on exactly two axes. */
const ENGINE_A = engine();
const ENGINE_B = engine({ conflictNature: "societal", tensionSource: "deadline" });
const ENGINE_C = engine({ shiftTrigger: "betrayal", resolutionNature: "transformation" });

function input(overrides: Partial<DirectionCombinationInput> = {}): DirectionCombinationInput {
  return {
    sourceTextVersionId: "stv_1",
    directions: [
      {
        directionId: "dir_1",
        narrativeEngine: ENGINE_A,
        elements: ["mainConflict", "protagonistArc"],
      },
      { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["endingNature"] },
    ],
    ...overrides,
  };
}

function mergedDirection(narrativeEngine: NarrativeEngine) {
  return {
    workingTitle: "Ce que la digue retient",
    developedPremise:
      "Un éclusier qui a laissé passer une crue par négligence recueille la seule témoin de sa faute, et le village fait de leur cohabitation le procès qu'aucun tribunal n'a tenu.",
    dominantGenre: "Drame rural",
    mainConflict:
      "L'éclusier veut être pardonné sans être jugé ; la témoin qu'il héberge ne peut lui offrir que le jugement.",
    protagonistArc:
      "D'un homme qui répare des vannes pour ne pas se réparer lui-même à un homme qui accepte que la faute soit dite devant tous.",
    newStakes: [
      "La place de l'éclusier dans un village qui dépend de lui chaque hiver.",
      "Ce que la témoin perd à se taire, et ce qu'elle perdrait à parler.",
    ],
    charactersToIntroduce: [],
    endingNature:
      "Un aveu public au moment de la décrue, qui ne rend rien mais rouvre le village aux deux.",
    mainRisks: [
      "Le huis clos entre deux taiseux peut manquer d'air sur la longueur.",
      "Le village-tribunal est un motif attendu du drame rural.",
    ],
    elementsKeptFromSource: [
      "Le village et sa mémoire des crues.",
      "L'éclusier et son rapport maniaque à l'ouvrage.",
    ],
    elementsTransformed: [
      "La négligence évoquée en une phrase devient la faute fondatrice du récit.",
    ],
    novelPotentialAssessment:
      "La fusion tient la longueur par le cycle des saisons et la montée du procès informel ; elle demandera le plus de travail sur la voix de la témoin.",
    dimensionTreatments: {
      premise: "reinterpret",
      "main-conflict": "reinterpret",
      "narrative-promise": "extend",
      themes: "preserve",
      protagonist: "extend",
      "secondary-characters": "extend",
      setting: "preserve",
      tone: "extend",
      "point-of-view": "preserve",
      ending: "reinterpret",
    },
    narrativeEngine,
  };
}

const WHY_IRREDUCIBLE =
  "Le conflit choisi dans la première direction exige que l'éclusier reste tenu par l'ouvrage, quand la fin choisie dans la deuxième le fait quitter la vallée sans retour.";

function mergedAnswer(narrativeEngine: NarrativeEngine) {
  return directionCombinationSchema.parse({
    outcome: "merged",
    direction: mergedDirection(narrativeEngine),
    conflicts: null,
  });
}

function irreducibleAnswer(
  elements: readonly { direction: string; element: string }[] = [
    { direction: "first", element: "mainConflict" },
    { direction: "second", element: "endingNature" },
  ],
) {
  return directionCombinationSchema.parse({
    outcome: "irreducible",
    direction: null,
    conflicts: [{ elements, whyIrreducible: WHY_IRREDUCIBLE }],
  });
}

describe("DIRECTION_COMBINABLE_ELEMENTS", () => {
  // The proposal's material is selectable; its three self-descriptions are
  // not — the fusion appraises, cautions and declares for itself.
  it("is the element vocabulary minus the three self-descriptions, in order", () => {
    expect([...DIRECTION_COMBINABLE_ELEMENTS]).toEqual(
      DIRECTION_ELEMENTS.filter(
        (element) =>
          element !== "novelPotentialAssessment" &&
          element !== "mainRisks" &&
          element !== "dimensionTreatments",
      ),
    );
  });
});

describe("DIRECTION_COMBINATION_SLOTS", () => {
  it("has one slot per proposable direction, each with a French label", () => {
    expect(DIRECTION_COMBINATION_SLOTS).toHaveLength(DIRECTION_PROPOSAL_COUNT);

    for (const slot of DIRECTION_COMBINATION_SLOTS) {
      expect(DIRECTION_COMBINATION_SLOT_LABELS[slot].trim()).not.toBe("");
    }
  });
});

describe("directionCombinationInputSchema", () => {
  // Raw objects rather than the typed fixture: half of these asks are
  // deliberately outside the contract, and `safeParse` takes unknown.
  const askWith = (directions: readonly unknown[]) =>
    directionCombinationInputSchema.safeParse({
      sourceTextVersionId: "stv_1",
      directions,
    }).success;

  it("accepts two and three directions", () => {
    expect(directionCombinationInputSchema.safeParse(input()).success).toBe(true);
    expect(
      askWith([
        { directionId: "dir_1", narrativeEngine: ENGINE_A, elements: ["mainConflict"] },
        { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["endingNature"] },
        { directionId: "dir_3", narrativeEngine: ENGINE_C, elements: ["workingTitle"] },
      ]),
    ).toBe(true);
  });

  it("refuses one direction and four", () => {
    expect(
      askWith([{ directionId: "dir_1", narrativeEngine: ENGINE_A, elements: ["mainConflict"] }]),
    ).toBe(false);
    expect(
      askWith([
        { directionId: "dir_1", narrativeEngine: ENGINE_A, elements: ["mainConflict"] },
        { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["endingNature"] },
        { directionId: "dir_3", narrativeEngine: ENGINE_C, elements: ["workingTitle"] },
        { directionId: "dir_4", narrativeEngine: ENGINE_C, elements: ["workingTitle"] },
      ]),
    ).toBe(false);
  });

  it("refuses an empty selection and a self-description", () => {
    const withElements = (elements: readonly string[]) =>
      askWith([
        { directionId: "dir_1", narrativeEngine: ENGINE_A, elements },
        { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["endingNature"] },
      ]);

    expect(withElements([])).toBe(false);
    expect(withElements(["mainRisks"])).toBe(false);
    expect(withElements(["dimensionTreatments"])).toBe(false);
    expect(withElements(["novelPotentialAssessment"])).toBe(false);
  });

  // Two spellings of one ask must not digest as two asks (CAL-058).
  it("refuses a duplicate element within one direction", () => {
    expect(
      askWith([
        {
          directionId: "dir_1",
          narrativeEngine: ENGINE_A,
          elements: ["mainConflict", "mainConflict"],
        },
        { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["endingNature"] },
      ]),
    ).toBe(false);
  });

  it("refuses one direction selected twice", () => {
    expect(
      askWith([
        { directionId: "dir_1", narrativeEngine: ENGINE_A, elements: ["mainConflict"] },
        { directionId: "dir_1", narrativeEngine: ENGINE_A, elements: ["endingNature"] },
      ]),
    ).toBe(false);
  });

  // Asking for both conflicts is the combination request itself, not an error.
  it("accepts the same element selected from two directions", () => {
    expect(
      askWith([
        { directionId: "dir_1", narrativeEngine: ENGINE_A, elements: ["mainConflict"] },
        { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["mainConflict"] },
      ]),
    ).toBe(true);
  });

  it("refuses an engine that is not a declaration", () => {
    expect(
      askWith([
        {
          directionId: "dir_1",
          narrativeEngine: { ...ENGINE_A, conflictNature: "romantic" },
          elements: ["mainConflict"],
        },
        { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["endingNature"] },
      ]),
    ).toBe(false);
  });
});

describe("checkDirectionCombinationSelection", () => {
  // The backlog's own acceptance criterion, before anything is paid for:
  // combining two incompatible engines produces an explicit warning.
  it("refuses two selected engines that are distinct, naming both", () => {
    const report = checkDirectionCombinationSelection(
      input({
        directions: [
          {
            directionId: "dir_1",
            narrativeEngine: ENGINE_A,
            elements: ["narrativeEngine", "mainConflict"],
          },
          { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["narrativeEngine"] },
        ],
      }),
    );

    expect(report.admissible).toBe(false);
    expect(report.engineSelections).toEqual(["first", "second"]);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]?.elements).toEqual([
      { direction: "first", element: "narrativeEngine" },
      { direction: "second", element: "narrativeEngine" },
    ]);
    expect(report.conflicts[0]?.differingAxes.length).toBeGreaterThanOrEqual(
      NARRATIVE_ENGINE_DIVERGENCE_MINIMUM,
    );
  });

  // Two engines within one axis of each other are one engine — the gate never
  // contradicts the doctrine it is built on.
  it("admits two selected engines that are one engine", () => {
    const report = checkDirectionCombinationSelection(
      input({
        directions: [
          { directionId: "dir_1", narrativeEngine: ENGINE_A, elements: ["narrativeEngine"] },
          {
            directionId: "dir_2",
            narrativeEngine: engine({ tensionSource: "deadline" }),
            elements: ["narrativeEngine"],
          },
        ],
      }),
    );

    expect(report.admissible).toBe(true);
    expect(report.conflicts).toEqual([]);
  });

  it("admits one engine selection, and none — prose is never judged here", () => {
    const oneEngine = checkDirectionCombinationSelection(
      input({
        directions: [
          { directionId: "dir_1", narrativeEngine: ENGINE_A, elements: ["narrativeEngine"] },
          { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["endingNature"] },
        ],
      }),
    );
    const proseOnly = checkDirectionCombinationSelection(
      input({
        directions: [
          { directionId: "dir_1", narrativeEngine: ENGINE_A, elements: ["mainConflict"] },
          { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["mainConflict"] },
        ],
      }),
    );

    expect(oneEngine.admissible).toBe(true);
    expect(oneEngine.engineSelections).toEqual(["first"]);
    expect(proseOnly.admissible).toBe(true);
    expect(proseOnly.engineSelections).toEqual([]);
  });
});

describe("directionCombinationSchema", () => {
  it("parses a merged answer and an irreducible one", () => {
    expect(mergedAnswer(ENGINE_A).outcome).toBe("merged");
    expect(irreducibleAnswer().outcome).toBe("irreducible");
  });

  // The branch the outcome does not own is null, written and never omitted;
  // a mixed answer fails on the branch field, which keeps its repair pass (§6).
  it("ties each outcome to exactly its branch, with field-located issues", () => {
    const mixed = directionCombinationSchema.safeParse({
      outcome: "merged",
      direction: mergedDirection(ENGINE_A),
      conflicts: [
        {
          elements: [
            { direction: "first", element: "mainConflict" },
            { direction: "second", element: "endingNature" },
          ],
          whyIrreducible: WHY_IRREDUCIBLE,
        },
      ],
    });

    expect(mixed.success).toBe(false);
    expect(mixed.error?.issues.map((issue) => issue.path)).toEqual([["conflicts"]]);

    expect(
      directionCombinationSchema.safeParse({
        outcome: "merged",
        direction: null,
        conflicts: null,
      }).success,
    ).toBe(false);
    expect(
      directionCombinationSchema.safeParse({
        outcome: "irreducible",
        direction: null,
        conflicts: null,
      }).success,
    ).toBe(false);
    expect(
      directionCombinationSchema.safeParse({
        outcome: "irreducible",
        direction: mergedDirection(ENGINE_A),
        conflicts: [
          {
            elements: [
              { direction: "first", element: "mainConflict" },
              { direction: "second", element: "endingNature" },
            ],
            whyIrreducible: WHY_IRREDUCIBLE,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("refuses an irreducibility that names nothing", () => {
    expect(
      directionCombinationSchema.safeParse({
        outcome: "irreducible",
        direction: null,
        conflicts: [],
      }).success,
    ).toBe(false);
  });

  it("refuses a conflict that is not mutual, an unknown slot and a self-description", () => {
    const withConflict = (elements: readonly { direction: string; element: string }[]) =>
      directionCombinationSchema.safeParse({
        outcome: "irreducible",
        direction: null,
        conflicts: [{ elements, whyIrreducible: WHY_IRREDUCIBLE }],
      }).success;

    expect(withConflict([{ direction: "first", element: "mainConflict" }])).toBe(false);
    expect(
      withConflict([
        { direction: "fourth", element: "mainConflict" },
        { direction: "second", element: "endingNature" },
      ]),
    ).toBe(false);
    expect(
      withConflict([
        { direction: "first", element: "mainRisks" },
        { direction: "second", element: "endingNature" },
      ]),
    ).toBe(false);
  });

  it("refuses an argued case past its ceiling", () => {
    expect(
      directionCombinationSchema.safeParse({
        outcome: "irreducible",
        direction: null,
        conflicts: [
          {
            elements: [
              { direction: "first", element: "mainConflict" },
              { direction: "second", element: "endingNature" },
            ],
            whyIrreducible: "a".repeat(DIRECTION_COMBINATION_CHAR_CEILINGS.whyIrreducible + 1),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("declares its three fields in order and refuses a smuggled score", () => {
    expect(Object.keys(directionCombinationSchema.shape)).toEqual([
      "outcome",
      "direction",
      "conflicts",
    ]);
    expect(
      directionCombinationSchema.safeParse({
        outcome: "merged",
        direction: mergedDirection(ENGINE_A),
        conflicts: null,
        mergeQualityScore: 0.9,
      }).success,
    ).toBe(false);
  });

  // No score, structurally — CAL-075/076/079's rule, inherited whole.
  it("carries no numeric field anywhere, in either outcome", () => {
    const numbers: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "number") numbers.push(path);
      else if (Array.isArray(value))
        value.forEach((item, index) => walk(item, `${path}[${index}]`));
      else if (value !== null && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) walk(nested, `${path}.${key}`);
      }
    };

    walk(mergedAnswer(ENGINE_A), "merged");
    walk(irreducibleAnswer(), "irreducible");

    expect(numbers).toEqual([]);
  });

  // The contract travels to the provider as JSON Schema; a shape the
  // converter refuses would fail at the first live call, not here.
  it("is expressible as JSON Schema", () => {
    expect(() => z.toJSONSchema(directionCombinationSchema)).not.toThrow();
  });
});

describe("checkDirectionCombinationAnswer — merged", () => {
  it("accepts the selected slot's engine and compares every source in order", () => {
    const ask = input({
      directions: [
        {
          directionId: "dir_1",
          narrativeEngine: ENGINE_A,
          elements: ["narrativeEngine", "mainConflict"],
        },
        { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["endingNature"] },
      ],
    });
    const report = checkDirectionCombinationAnswer(ask, mergedAnswer(ENGINE_A));

    expect(report).toMatchObject({
      outcome: "merged",
      acceptable: true,
      dominantSlots: ["first"],
      engineSelections: ["first"],
    });
    expect(report.outcome === "merged" && report.comparisons.map((c) => c.source)).toEqual([
      "first",
      "second",
    ]);
  });

  it("refuses an engine nobody asked for", () => {
    const foreign = engine({
      conflictNature: "environmental",
      tensionSource: "pursuit",
      shiftTrigger: "irruption",
      resolutionNature: "suspension",
    });
    const report = checkDirectionCombinationAnswer(input(), mergedAnswer(foreign));

    expect(report).toMatchObject({ acceptable: false, dominantSlots: [] });
  });

  // The compromis mou, mechanically: two sources two axes apart, and a
  // candidate taking one differing axis from each is within one axis of both
  // — it *is* both engines, which is exactly what a fusion must not be.
  it("refuses the blend sitting between two source engines", () => {
    const blend = engine({ conflictNature: "societal" });
    const report = checkDirectionCombinationAnswer(input(), mergedAnswer(blend));

    expect(report).toMatchObject({
      acceptable: false,
      dominantSlots: ["first", "second"],
    });
  });

  it("refuses a dominant the ask did not select", () => {
    const ask = input({
      directions: [
        { directionId: "dir_1", narrativeEngine: ENGINE_A, elements: ["narrativeEngine"] },
        { directionId: "dir_2", narrativeEngine: ENGINE_B, elements: ["endingNature"] },
      ],
    });
    const report = checkDirectionCombinationAnswer(ask, mergedAnswer(ENGINE_B));

    expect(report).toMatchObject({ acceptable: false, dominantSlots: ["second"] });
  });

  it("accepts exactly one dominant when no engine was selected", () => {
    const report = checkDirectionCombinationAnswer(
      input(),
      mergedAnswer(engine({ tensionSource: "temptation" })),
    );

    expect(report).toMatchObject({
      acceptable: true,
      dominantSlots: ["first"],
      engineSelections: [],
    });
  });

  // The degenerate-but-admissible ask: two selected engines that are one
  // engine. A candidate equal to one dominates both, and that is a choice,
  // not a blend.
  it("accepts a candidate dominating two selected engines that are one engine", () => {
    const ask = input({
      directions: [
        { directionId: "dir_1", narrativeEngine: ENGINE_A, elements: ["narrativeEngine"] },
        {
          directionId: "dir_2",
          narrativeEngine: engine({ tensionSource: "deadline" }),
          elements: ["narrativeEngine"],
        },
      ],
    });
    const report = checkDirectionCombinationAnswer(ask, mergedAnswer(ENGINE_A));

    expect(report).toMatchObject({ acceptable: true, dominantSlots: ["first", "second"] });
  });

  // §9: the report travels into logs, so nothing in it may carry a word of a
  // direction or a member the model chose.
  it("reports slots, axis identifiers and booleans only", () => {
    const report = checkDirectionCombinationAnswer(input(), mergedAnswer(ENGINE_A));
    const axes = new Set<string>(NARRATIVE_ENGINE_AXES);

    expect(Object.keys(report).sort()).toEqual([
      "acceptable",
      "comparisons",
      "dominantSlots",
      "engineSelections",
      "outcome",
    ]);

    if (report.outcome === "merged") {
      for (const comparison of report.comparisons) {
        expect(Object.keys(comparison).sort()).toEqual([
          "differingAxes",
          "distinct",
          "sharedAxes",
          "source",
        ]);
        expect(
          [...comparison.sharedAxes, ...comparison.differingAxes].every((axis) => axes.has(axis)),
        ).toBe(true);
      }
    }
  });
});

describe("checkDirectionCombinationAnswer — irreducible", () => {
  it("accepts conflicts naming only selected elements", () => {
    const report = checkDirectionCombinationAnswer(input(), irreducibleAnswer());

    expect(report).toMatchObject({
      outcome: "irreducible",
      acceptable: true,
      conflictCount: 1,
      unverifiable: [],
    });
  });

  // A warning about elements nobody chose is an answer to a question nobody
  // asked — and it refuses the answer whole, never drops the conflict.
  it("refuses a conflict naming an element the ask never selected", () => {
    const report = checkDirectionCombinationAnswer(
      input(),
      irreducibleAnswer([
        { direction: "first", element: "workingTitle" },
        { direction: "second", element: "endingNature" },
      ]),
    );

    expect(report).toMatchObject({
      acceptable: false,
      unverifiable: [{ conflict: 0, element: { direction: "first", element: "workingTitle" } }],
    });
  });

  it("refuses a slot the ask does not have", () => {
    const report = checkDirectionCombinationAnswer(
      input(),
      irreducibleAnswer([
        { direction: "third", element: "mainConflict" },
        { direction: "second", element: "endingNature" },
      ]),
    );

    expect(report).toMatchObject({ acceptable: false });
  });

  // §9: the argued case is the model's prose about the author's novel.
  it("never carries the argued case's text", () => {
    const report = checkDirectionCombinationAnswer(input(), irreducibleAnswer());

    expect(JSON.stringify(report)).not.toContain("éclusier");
    expect(JSON.stringify(report)).not.toContain("vallée");
  });
});
