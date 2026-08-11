/**
 * The rules CAL-080 is accepted on: three decor variations on one narrative
 * engine are detected and rejected automatically, a single flipped axis does
 * not buy distinctness, the relaunch directive is targeted and deterministic,
 * the demand stays satisfiable under the tightest freedom level, and the
 * report exposes indexes and axis identifiers only (§9).
 *
 * The fixtures are synthetic French sentences written for this file (§8).
 */

import { describe, expect, it } from "vitest";

import {
  checkDirectionDivergence,
  checkDirectionProposalDivergence,
  compareNarrativeEngines,
  NARRATIVE_ENGINE_DIVERGENCE_MINIMUM,
} from "./divergence";
import { NARRATIVE_ENGINE_AXES, type NarrativeEngine } from "./narrative-engine";
import { directionProposalsSchema } from "./proposals";

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

/**
 * One direction whose only variable part is its decor — the same premise,
 * the same mechanism, the same declared engine, moved to another place. What
 * CAL-080's acceptance criterion calls a decor variation.
 */
function decorVariation(title: string, decor: string) {
  return {
    workingTitle: title,
    developedPremise: `Une gardienne découvre que chaque registre qu'elle classe ${decor} efface un souvenir du village, et doit choisir entre l'ordre qu'elle sert et la mémoire commune.`,
    dominantGenre: "Drame psychologique",
    mainConflict: `Le devoir professionnel de la protagoniste s'oppose ${decor} à la préservation de la mémoire collective.`,
    protagonistArc:
      "De fonctionnaire scrupuleuse à dépositaire assumée d'une mémoire interdite, au prix de sa place.",
    newStakes: [
      "La disparition progressive des souvenirs du village.",
      "La confiance des habitants envers celle qui classe leurs vies.",
    ],
    charactersToIntroduce: [],
    endingNature: "Une fin douce-amère : la mémoire sauvée, la place perdue.",
    mainRisks: [
      "Le dispositif fantastique peut écraser l'étude de caractère.",
      "La répétition des effacements peut lasser sur la longueur.",
    ],
    elementsKeptFromSource: [
      "La protagoniste et son rapport maniaque au classement.",
      "Le huis clos du lieu de travail.",
    ],
    elementsTransformed: ["Le simple inventaire devient un mécanisme d'effacement."],
    novelPotentialAssessment:
      "La direction tient la longueur par l'élargissement progressif du cercle des habitants touchés ; sa promesse repose sur la tension entre ordre et mémoire.",
    dimensionTreatments: {
      premise: "preserve",
      "main-conflict": "preserve",
      "narrative-promise": "preserve",
      themes: "preserve",
      protagonist: "preserve",
      "secondary-characters": "extend",
      setting: "extend",
      tone: "preserve",
      "point-of-view": "preserve",
      ending: "preserve",
    },
    narrativeEngine: engine(),
  };
}

describe("compareNarrativeEngines", () => {
  it("partitions the five axes into shared and differing, in axis order", () => {
    const comparison = compareNarrativeEngines(
      engine(),
      engine({ tensionSource: "escalation", resolutionNature: "defeat" }),
    );

    expect(comparison.sharedAxes).toEqual(["conflictNature", "protagonistStake", "shiftTrigger"]);
    expect(comparison.differingAxes).toEqual(["tensionSource", "resolutionNature"]);
    expect([...comparison.sharedAxes, ...comparison.differingAxes].sort()).toEqual(
      [...NARRATIVE_ENGINE_AXES].sort(),
    );
  });

  // A victory flipped to a defeat is the same novel with another last
  // chapter — and one flipped member is also the cheapest way to game the
  // gate, so it must not buy distinctness.
  it("holds one differing axis to be the same engine", () => {
    const comparison = compareNarrativeEngines(engine(), engine({ resolutionNature: "defeat" }));

    expect(comparison.distinct).toBe(false);
    expect(comparison.differingAxes).toEqual(["resolutionNature"]);
  });

  it("holds the minimum of differing axes to be distinct engines", () => {
    expect(
      compareNarrativeEngines(
        engine(),
        engine({ tensionSource: "dilemma", shiftTrigger: "betrayal" }),
      ).distinct,
    ).toBe(true);
  });

  it("holds identical declarations to be the same engine on every axis", () => {
    const comparison = compareNarrativeEngines(engine(), engine());

    expect(comparison.distinct).toBe(false);
    expect(comparison.sharedAxes).toEqual([...NARRATIVE_ENGINE_AXES]);
    expect(comparison.differingAxes).toEqual([]);
  });
});

describe("checkDirectionProposalDivergence", () => {
  // CAL-080's acceptance criterion, verbatim: three decor variations on one
  // engine — the same mechanism at the lighthouse, the observatory and the
  // monastery — are detected and rejected automatically.
  it("rejects three deliberately quasi-identical directions", () => {
    const decoys = directionProposalsSchema.parse({
      directions: [
        decorVariation("Le registre du phare", "au phare"),
        decorVariation("Le registre de l'observatoire", "à l'observatoire"),
        decorVariation("Le registre du monastère", "au monastère"),
      ],
    });

    const report = checkDirectionProposalDivergence(decoys);

    expect(report.divergent).toBe(false);
    expect(report.comparisons).toHaveLength(3);

    for (const comparison of report.comparisons) {
      expect(comparison.distinct).toBe(false);
      expect(comparison.sharedAxes).toEqual([...NARRATIVE_ENGINE_AXES]);
    }

    expect(report.retained).toEqual([0]);
    expect(report.regenerate).toEqual([1, 2]);
  });

  // Flipping one member per pair is still three variations of one engine —
  // the evasion the minimum of two exists to close.
  it("rejects decor variations dressed up with a single flipped axis", () => {
    const first = decorVariation("Le registre du phare", "au phare");
    const decoys = directionProposalsSchema.parse({
      directions: [
        first,
        {
          ...decorVariation("Le registre de l'observatoire", "à l'observatoire"),
          narrativeEngine: engine({ resolutionNature: "defeat" }),
        },
        {
          ...decorVariation("Le registre du monastère", "au monastère"),
          narrativeEngine: engine({ shiftTrigger: "betrayal" }),
        },
      ],
    });

    const report = checkDirectionProposalDivergence(decoys);

    expect(report.divergent).toBe(false);
    expect(report.retained).toEqual([0]);
    expect(report.regenerate).toEqual([1, 2]);
  });

  // §9: the report is what a caller will log the first time the gate fires.
  // Indexes, axis identifiers and booleans — never a member the model chose,
  // never a word of a direction.
  it("reports indexes and axis identifiers, never a word of the directions", () => {
    const decoys = directionProposalsSchema.parse({
      directions: [
        decorVariation("Le registre du phare", "au phare"),
        decorVariation("Le registre de l'observatoire", "à l'observatoire"),
        decorVariation("Le registre du monastère", "au monastère"),
      ],
    });

    const serialised = JSON.stringify(checkDirectionProposalDivergence(decoys));

    for (const forbidden of [
      "registre",
      "phare",
      "gardienne",
      "mémoire",
      "internal",
      "belonging",
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe("checkDirectionDivergence", () => {
  it("passes three pairwise-distinct engines and retains all of them", () => {
    const report = checkDirectionDivergence([
      engine(),
      engine({
        conflictNature: "interpersonal",
        tensionSource: "pursuit",
        protagonistStake: "life",
      }),
      engine({
        conflictNature: "metaphysical",
        shiftTrigger: "irreversible-loss",
        resolutionNature: "renunciation",
      }),
    ]);

    expect(report.divergent).toBe(true);
    expect(report.comparisons.every((comparison) => comparison.distinct)).toBe(true);
    expect(report.retained).toEqual([0, 1, 2]);
    expect(report.regenerate).toEqual([]);
  });

  // The relaunch is targeted: when one pair collides, only the later of the
  // two is re-asked and the two standing directions are kept.
  it("regenerates only the later direction of a colliding pair", () => {
    const kept = engine();
    const alsoKept = engine({
      conflictNature: "societal",
      tensionSource: "deadline",
      protagonistStake: "freedom",
    });

    const report = checkDirectionDivergence([
      kept,
      alsoKept,
      { ...alsoKept, resolutionNature: "defeat" },
    ]);

    expect(report.divergent).toBe(false);
    expect(report.retained).toEqual([0, 1]);
    expect(report.regenerate).toEqual([2]);

    const colliding = report.comparisons.find((comparison) => !comparison.distinct);

    expect(colliding?.directions).toEqual([1, 2]);
  });

  // The tightest freedom level pins conflict, stake and resolution to the
  // source's (LOW preserves main-conflict, protagonist and ending), leaving
  // tension source and trigger free. The demand must be satisfiable there,
  // or the gate would teach the model to lie in its declaration.
  it("stays satisfiable when only tension source and trigger are free", () => {
    const report = checkDirectionDivergence([
      engine({ tensionSource: "concealment", shiftTrigger: "revelation" }),
      engine({ tensionSource: "escalation", shiftTrigger: "transgression" }),
      engine({ tensionSource: "dilemma", shiftTrigger: "irruption" }),
    ]);

    expect(report.divergent).toBe(true);
    expect(report.regenerate).toEqual([]);
  });

  it("is trivially divergent below two engines", () => {
    expect(checkDirectionDivergence([]).divergent).toBe(true);
    expect(checkDirectionDivergence([]).retained).toEqual([]);
    expect(checkDirectionDivergence([engine()]).divergent).toBe(true);
    expect(checkDirectionDivergence([engine()]).retained).toEqual([0]);
  });

  it("pins the minimum at two, strictly inside the axis count", () => {
    expect(NARRATIVE_ENGINE_DIVERGENCE_MINIMUM).toBe(2);
    expect(NARRATIVE_ENGINE_DIVERGENCE_MINIMUM).toBeLessThan(NARRATIVE_ENGINE_AXES.length);
  });
});
