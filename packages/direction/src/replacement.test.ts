/**
 * The rules CAL-083 is accepted on: a replacement that reproduces the engine of
 * the direction that was rejected is refused, the two kept directions are
 * excluded as well, the author's reason is optional and bounded, the ask is a
 * value that names what it was built on, and the report exposes indexes and
 * axis identifiers only (§9).
 *
 * The fixtures are synthetic French sentences written for this file (§8).
 */

import { describe, expect, it } from "vitest";

import { NARRATIVE_ENGINE_DIVERGENCE_MINIMUM } from "./divergence";
import { NARRATIVE_ENGINE_AXES, type NarrativeEngine } from "./narrative-engine";
import {
  checkDirectionReplacement,
  checkDirectionReplacementAnswer,
  DIRECTION_DISCARD_REASON_CHAR_CEILING,
  type DirectionReplacementInput,
  directionReplacementInputSchema,
  directionReplacementSchema,
  excludedEnginesForReplacement,
  parseDirectionDiscardReason,
} from "./replacement";

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

/** The engine of the direction the author rejected. */
const DISCARDED = engine();

/** The two they kept — each distinct from the discarded one and from each other. */
const RETAINED = [
  engine({ conflictNature: "societal", tensionSource: "deadline" }),
  engine({ shiftTrigger: "betrayal", resolutionNature: "transformation" }),
] as const;

const EXCLUDED = excludedEnginesForReplacement(DISCARDED, RETAINED);

function replacementDirection(narrativeEngine: NarrativeEngine) {
  return {
    workingTitle: "La crue de novembre",
    developedPremise:
      "Une institutrice de village accepte d'héberger la fille d'un homme qu'elle a fait condamner, et découvre au fil de l'hiver que l'enfant sait exactement ce qu'elle a fait.",
    dominantGenre: "Drame rural",
    mainConflict:
      "La protagoniste veut réparer sans avouer ; l'enfant qu'elle héberge attend l'aveu et rien d'autre.",
    protagonistArc:
      "D'une bienfaitrice convaincue de sa droiture à une femme qui accepte d'être jugée par plus jeune qu'elle.",
    newStakes: [
      "La réputation de la protagoniste dans un village qui l'a choisie comme arbitre.",
      "L'avenir de l'enfant, qui dépend matériellement de celle qu'elle accuse.",
    ],
    charactersToIntroduce: [],
    endingNature: "Un aveu tardif, obtenu par l'enfant, qui ne répare rien et libère les deux.",
    mainRisks: [
      "Le face-à-face peut tourner au huis clos statique sur la longueur.",
      "Le motif de l'enfant qui sait est un ressort attendu du drame rural.",
    ],
    elementsKeptFromSource: [
      "Le village et son besoin d'un arbitre moral.",
      "La protagoniste et son rapport au devoir.",
    ],
    elementsTransformed: ["Le litige de voisinage devient une condamnation qui engage une vie."],
    novelPotentialAssessment:
      "La direction tient la longueur par l'hiver partagé et l'inversion progressive des rôles ; elle demandera le plus de travail sur le rythme du dernier tiers.",
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

function input(overrides: Partial<DirectionReplacementInput> = {}): DirectionReplacementInput {
  return {
    sourceTextVersionId: "stv_1",
    discardedDirectionId: "dir_1",
    discardReason: null,
    excludedEngines: [...EXCLUDED],
    ...overrides,
  };
}

describe("excludedEnginesForReplacement", () => {
  // Index 0 is the only distinction a reader of the report can make between
  // three otherwise interchangeable clauses.
  it("lists the discarded engine first, then the kept ones in order", () => {
    expect(EXCLUDED).toEqual([DISCARDED, RETAINED[0], RETAINED[1]]);
  });
});

describe("checkDirectionReplacement", () => {
  // The backlog's own acceptance criterion, and the one collision that is
  // never a matter of taste: the replacement is the rejected direction again.
  it("refuses a replacement that reproduces the discarded engine", () => {
    const report = checkDirectionReplacement(EXCLUDED, engine());

    expect(report.acceptable).toBe(false);
    expect(report.collidingWith).toEqual([0]);
  });

  // A decor change declares the same five members, so the engine is untouched
  // and the collision must survive it.
  it("refuses a replacement that changes only its decor", () => {
    const report = checkDirectionReplacement(EXCLUDED, engine());

    expect(report.comparisons[0]?.differingAxes).toEqual([]);
    expect(report.comparisons[0]?.sharedAxes).toEqual([...NARRATIVE_ENGINE_AXES]);
  });

  // One flipped member is the cheapest way to game the gate — the same
  // mechanism with another last chapter.
  it("refuses a replacement differing from the discarded engine on a single axis", () => {
    const report = checkDirectionReplacement(EXCLUDED, engine({ resolutionNature: "defeat" }));

    expect(report.acceptable).toBe(false);
    expect(report.collidingWith).toEqual([0]);
  });

  it("accepts a replacement differing from every excluded engine on the minimum of axes", () => {
    const report = checkDirectionReplacement(
      EXCLUDED,
      engine({ conflictNature: "metaphysical", tensionSource: "temptation" }),
    );

    expect(report.acceptable).toBe(true);
    expect(report.collidingWith).toEqual([]);
    expect(
      report.comparisons.every(
        (comparison) => comparison.differingAxes.length >= NARRATIVE_ENGINE_DIVERGENCE_MINIMUM,
      ),
    ).toBe(true);
  });

  // A replacement colliding with a direction still on screen would leave the
  // author with two proposals and three cards.
  it("refuses a replacement that reproduces a kept direction's engine", () => {
    const report = checkDirectionReplacement(EXCLUDED, engine({ ...RETAINED[1] }));

    expect(report.acceptable).toBe(false);
    expect(report.collidingWith).toEqual([2]);
  });

  it("reports every collision, not the first", () => {
    const report = checkDirectionReplacement(
      [DISCARDED, DISCARDED, RETAINED[0]],
      engine({ resolutionNature: "defeat" }),
    );

    expect(report.collidingWith).toEqual([0, 1]);
  });

  it("compares the candidate against every excluded engine, in the exclusion order", () => {
    const report = checkDirectionReplacement(EXCLUDED, engine({ tensionSource: "pursuit" }));

    expect(report.comparisons.map((comparison) => comparison.excluded)).toEqual([0, 1, 2]);
  });

  it("is trivially acceptable against an empty exclusion list", () => {
    const report = checkDirectionReplacement([], engine());

    expect(report.acceptable).toBe(true);
    expect(report.comparisons).toEqual([]);
  });

  // §9: the report travels into logs, so nothing in it may carry a word of a
  // direction or a member the model chose.
  it("reports indexes, axis identifiers and booleans only", () => {
    const report = checkDirectionReplacement(EXCLUDED, engine());
    const axes = new Set<string>(NARRATIVE_ENGINE_AXES);

    for (const comparison of report.comparisons) {
      expect(Object.keys(comparison).sort()).toEqual([
        "differingAxes",
        "distinct",
        "excluded",
        "sharedAxes",
      ]);
      expect(
        [...comparison.sharedAxes, ...comparison.differingAxes].every((axis) => axes.has(axis)),
      ).toBe(true);
    }
  });
});

describe("checkDirectionReplacementAnswer", () => {
  it("reads the exclusion list off the ask and the engine off the answer", () => {
    const answer = directionReplacementSchema.parse({
      direction: replacementDirection(engine()),
    });

    expect(checkDirectionReplacementAnswer(input(), answer).collidingWith).toEqual([0]);
  });

  it("accepts an answer whose engine clears every excluded one", () => {
    const answer = directionReplacementSchema.parse({
      direction: replacementDirection(
        engine({ conflictNature: "environmental", shiftTrigger: "irruption" }),
      ),
    });

    expect(checkDirectionReplacementAnswer(input(), answer).acceptable).toBe(true);
  });
});

describe("directionReplacementSchema", () => {
  it("accepts exactly one direction, of the shape a proposal has", () => {
    const parsed = directionReplacementSchema.safeParse({
      direction: replacementDirection(engine({ conflictNature: "societal" })),
    });

    expect(parsed.success).toBe(true);
  });

  // A bare direction would give the repair classifier twelve field names to
  // match on instead of one (§6).
  it("refuses a bare direction", () => {
    expect(directionReplacementSchema.safeParse(replacementDirection(engine())).success).toBe(
      false,
    );
  });

  it("refuses a second direction", () => {
    expect(
      directionReplacementSchema.safeParse({
        direction: replacementDirection(engine()),
        other: replacementDirection(engine()),
      }).success,
    ).toBe(false);
  });

  // No score, structurally — CAL-075/076/079's rule, inherited whole.
  it("carries no numeric field anywhere", () => {
    const answer = directionReplacementSchema.parse({
      direction: replacementDirection(engine()),
    });

    const numbers: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "number") numbers.push(path);
      else if (Array.isArray(value))
        value.forEach((item, index) => walk(item, `${path}[${index}]`));
      else if (value !== null && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) walk(nested, `${path}.${key}`);
      }
    };

    walk(answer, "answer");

    expect(numbers).toEqual([]);
  });
});

describe("directionReplacementInputSchema", () => {
  it("names the source text version and the direction being replaced", () => {
    expect(directionReplacementInputSchema.parse(input())).toEqual(input());
  });

  it("refuses an empty exclusion list", () => {
    expect(directionReplacementInputSchema.safeParse(input({ excludedEngines: [] })).success).toBe(
      false,
    );
  });

  it("refuses an engine that is not a declaration", () => {
    expect(
      directionReplacementInputSchema.safeParse({
        ...input(),
        excludedEngines: [{ ...DISCARDED, conflictNature: "romantic" }],
      }).success,
    ).toBe(false);
  });

  // Asking again with a different reason is a different ask, which is what
  // makes the idempotency key mean what it has to mean (CAL-058).
  it("carries the reason, so two reasons are two asks", () => {
    const withReason = directionReplacementInputSchema.parse(
      input({ discardReason: "Le protagoniste ne m'intéresse pas." }),
    );

    expect(withReason).not.toEqual(directionReplacementInputSchema.parse(input()));
  });

  it("refuses a reason past the ceiling", () => {
    expect(
      directionReplacementInputSchema.safeParse(
        input({ discardReason: "a".repeat(DIRECTION_DISCARD_REASON_CHAR_CEILING + 1) }),
      ).success,
    ).toBe(false);
  });
});

describe("parseDirectionDiscardReason", () => {
  it("reads absent, empty and blank as no reason at all", () => {
    for (const value of [undefined, null, "", "   ", "\n\t "]) {
      const parsed = parseDirectionDiscardReason(value);

      expect(parsed.ok).toBe(true);
      expect(parsed.ok && parsed.value).toBe(null);
    }
  });

  it("trims what the author wrote", () => {
    const parsed = parseDirectionDiscardReason("  C'est le même roman que la deuxième.  ");

    expect(parsed.ok && parsed.value).toBe("C'est le même roman que la deuxième.");
  });

  it("refuses a reason past the ceiling, in French, without repeating it", () => {
    const typed = "é".repeat(DIRECTION_DISCARD_REASON_CHAR_CEILING + 1);
    const parsed = parseDirectionDiscardReason(typed);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    expect(parsed.error.category).toBe("validation");
    expect(parsed.error.userMessage).toContain(String(DIRECTION_DISCARD_REASON_CHAR_CEILING));
    expect(parsed.error.userMessage).not.toContain(typed);
    expect(parsed.error.message).not.toContain(typed);
  });

  it("refuses anything that is not text", () => {
    expect(parseDirectionDiscardReason(42).ok).toBe(false);
  });
});
