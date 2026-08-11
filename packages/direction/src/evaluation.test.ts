/**
 * The rules CAL-081 is accepted on: a critique that has not read the
 * direction does not parse (the four lists have minimums), nothing in the
 * contract can carry a score — the cahier des charges' prohibition held as a
 * shape — every critique names the element it bears on, the anchor vocabulary
 * follows the proposal contract mechanically, and a quotation nobody wrote is
 * cleared against both corpora without costing the critique its place.
 *
 * The fixtures are synthetic French sentences written for this file (§8).
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  describeDirectionElements,
  DIRECTION_ELEMENT_LABELS,
  DIRECTION_ELEMENTS,
  DIRECTION_EVALUATION_CHAR_CEILINGS,
  DIRECTION_EVALUATION_COUNTS,
  DIRECTION_EVALUATION_LISTS,
  DIRECTION_EVALUATION_WORD_TARGETS,
  type DirectionEvaluation,
  type DirectionEvaluationConvention,
  type DirectionEvaluationPromise,
  directionEvaluationSchema,
  type DirectionEvaluationShortfall,
  isVerifiedDirectionEvaluation,
  VERIFIED_DIRECTION_EVALUATION_BRAND,
  verifyDirectionEvaluationEvidence,
} from "./evaluation";
import { type NarrativeEngine } from "./narrative-engine";
import { type DirectionProposal, directionProposalsSchema } from "./proposals";

const proposalSchema = directionProposalsSchema.shape.directions.element;

const SOURCE = [
  "L'archiviste municipale classait les dossiers des vivants avec plus de soin que ceux des morts.",
  "Chaque soir elle vérifiait deux fois la serrure de la salle des registres.",
  "Personne ne lui avait jamais demandé ce qu'elle cherchait dans les marges.",
].join("\n");

/** A quotation that is really in the source text. */
const FROM_SOURCE = "les dossiers des vivants";

/** A quotation that is really in the direction's developed premise. */
const FROM_PREMISE = "l'ordre qu'elle sert et la mémoire commune";

/** A quotation that is really in one of the direction's list entries. */
const FROM_LIST = "écraser l'étude de caractère";

/** A quotation nobody wrote — well formed, on topic, absent from both corpora. */
const INVENTED = "le vent effaçait les noms sur les registres";

/**
 * The words exist, but across a field boundary — the end of `mainConflict`
 * followed by the start of `protagonistArc`. Per-field matchers must refuse
 * it: nobody wrote that sentence either.
 */
const STRADDLING = "la mémoire collective. De fonctionnaire scrupuleuse";

function engine(): NarrativeEngine {
  return {
    conflictNature: "internal",
    tensionSource: "concealment",
    protagonistStake: "belonging",
    shiftTrigger: "revelation",
    resolutionNature: "sacrifice",
  };
}

function direction(): DirectionProposal {
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
    dimensionTreatments: {
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
    },
    narrativeEngine: engine(),
  });
}

function promiseItem(
  overrides: Partial<DirectionEvaluationPromise> = {},
): DirectionEvaluationPromise {
  return {
    label: "Un fantastique à hauteur d'archive",
    element: "developedPremise",
    evidence: FROM_PREMISE,
    whatItCommitsTo: "Tenir cette promesse exigera un mécanisme d'effacement réglé et payé cher.",
    ...overrides,
  };
}

function shortfallItem(
  overrides: Partial<DirectionEvaluationShortfall> = {},
): DirectionEvaluationShortfall {
  return {
    label: "La répétition du dispositif",
    element: "mainRisks",
    evidence: null,
    whyAtRisk: "Un effacement par chapitre épuise vite ce que la prémisse promet de varier.",
    ...overrides,
  };
}

function conventionItem(
  overrides: Partial<DirectionEvaluationConvention> = {},
): DirectionEvaluationConvention {
  return {
    label: "La fonctionnaire qui s'émancipe",
    element: "protagonistArc",
    evidence: null,
    whyConventional: "La trajectoire suit l'arc attendu du genre sans en déplacer une étape.",
    ...overrides,
  };
}

function evaluation(overrides: Partial<DirectionEvaluation> = {}): DirectionEvaluation {
  return directionEvaluationSchema.parse({
    promises: [promiseItem(), promiseItem({ element: "endingNature", evidence: null })],
    shortfalls: [shortfallItem(), shortfallItem({ element: "novelPotentialAssessment" })],
    conventions: [conventionItem()],
    comparativeWeaknesses: [
      {
        label: "Le moteur le plus sage des trois",
        element: "narrativeEngine",
        evidence: null,
        whyLessInteresting:
          "Face aux deux autres directions, sa résolution par sacrifice est la plus balisée.",
      },
    ],
    ...overrides,
  });
}

describe("directionEvaluationSchema", () => {
  it("accepts a critique on all four lists", () => {
    const parsed = evaluation();

    expect(parsed.promises).toHaveLength(2);
    expect(parsed.comparativeWeaknesses).toHaveLength(1);
  });

  // The backlog's "Fini quand" as a property of the shape: a critique that
  // has not read the direction does not parse.
  it("refuses each list under its minimum", () => {
    expect(
      directionEvaluationSchema.safeParse({ ...evaluation(), promises: [promiseItem()] }).success,
    ).toBe(false);
    expect(
      directionEvaluationSchema.safeParse({ ...evaluation(), shortfalls: [shortfallItem()] })
        .success,
    ).toBe(false);
    expect(directionEvaluationSchema.safeParse({ ...evaluation(), conventions: [] }).success).toBe(
      false,
    );
    expect(
      directionEvaluationSchema.safeParse({ ...evaluation(), comparativeWeaknesses: [] }).success,
    ).toBe(false);
  });

  it("refuses more entries than a list's ceiling", () => {
    const over = Array.from({ length: DIRECTION_EVALUATION_COUNTS.promises.max + 1 }, () =>
      promiseItem(),
    );

    expect(directionEvaluationSchema.safeParse({ ...evaluation(), promises: over }).success).toBe(
      false,
    );
  });

  // "Rattachée à un élément précis de la direction", held by a parse: the
  // anchor is a closed vocabulary, not a free string.
  it("refuses an invented element and accepts every declared one", () => {
    expect(
      directionEvaluationSchema.safeParse({
        ...evaluation(),
        conventions: [conventionItem({ element: "atmosphere" as never })],
      }).success,
    ).toBe(false);

    for (const element of DIRECTION_ELEMENTS) {
      expect(
        directionEvaluationSchema.safeParse({
          ...evaluation(),
          conventions: [conventionItem({ element })],
        }).success,
        element,
      ).toBe(true);
    }
  });

  // Nullable, never elided: "no passage carries this" is said with null.
  it("accepts a null evidence and refuses an empty one", () => {
    expect(
      directionEvaluationSchema.safeParse({
        ...evaluation(),
        promises: [promiseItem({ evidence: null }), promiseItem()],
      }).success,
    ).toBe(true);
    expect(
      directionEvaluationSchema.safeParse({
        ...evaluation(),
        promises: [promiseItem({ evidence: "   " }), promiseItem()],
      }).success,
    ).toBe(false);
  });

  // Cahier des charges 1195–1199. Strict objects refuse the helpful rating
  // column by name today; the structural pin below refuses it by type forever.
  it("refuses a score wherever one could be smuggled in", () => {
    expect(
      directionEvaluationSchema.safeParse({ ...evaluation(), originalityScore: 8 }).success,
    ).toBe(false);
    expect(
      directionEvaluationSchema.safeParse({
        ...evaluation(),
        shortfalls: [{ ...shortfallItem(), score: 0.4 }, shortfallItem()],
      }).success,
    ).toBe(false);
  });

  it("declares no numeric field anywhere in the contract", () => {
    expect(Object.keys(directionEvaluationSchema.shape)).toEqual([...DIRECTION_EVALUATION_LISTS]);

    for (const list of DIRECTION_EVALUATION_LISTS) {
      for (const [name, field] of Object.entries(
        directionEvaluationSchema.shape[list].element.shape,
      )) {
        expect(field instanceof z.ZodNumber, `${list}.${name}`).toBe(false);
      }
    }
  });

  // Every critique of every list is anchored and may cite: the two halves of
  // "rattachée à un élément précis de la direction ou du texte source".
  it("carries an element and an evidence field on every list's items", () => {
    for (const list of DIRECTION_EVALUATION_LISTS) {
      const keys = Object.keys(directionEvaluationSchema.shape[list].element.shape);

      expect(keys, list).toContain("element");
      expect(keys, list).toContain("evidence");
    }
  });
});

// The anchor vocabulary follows the proposal contract, mechanically: an
// attribute added to a direction becomes criticisable here or fails there.
describe("DIRECTION_ELEMENTS", () => {
  it("mirrors the proposal schema's own keys, in order", () => {
    expect([...DIRECTION_ELEMENTS]).toEqual(Object.keys(proposalSchema.shape));
  });

  it("labels every element in French", () => {
    for (const element of DIRECTION_ELEMENTS) {
      expect(DIRECTION_ELEMENT_LABELS[element], element).toMatch(/\S/);
    }
  });

  it("describes every element with its key and its label, in order", () => {
    const lines = describeDirectionElements();

    expect(lines).toHaveLength(DIRECTION_ELEMENTS.length);
    DIRECTION_ELEMENTS.forEach((element, index) => {
      expect(lines[index]).toContain(`« ${element} »`);
      expect(lines[index]).toContain(DIRECTION_ELEMENT_LABELS[element]);
    });
  });
});

describe("verifyDirectionEvaluationEvidence", () => {
  it("keeps a quotation that is really in the source text", () => {
    const { report } = verifyDirectionEvaluationEvidence(
      evaluation({ promises: [promiseItem({ evidence: FROM_SOURCE }), promiseItem()] }),
      SOURCE,
      direction(),
    );

    expect(report.cleared).toBe(0);
  });

  it("keeps a quotation found only in the direction's own prose", () => {
    const { report } = verifyDirectionEvaluationEvidence(
      evaluation({ promises: [promiseItem({ evidence: FROM_PREMISE }), promiseItem()] }),
      SOURCE,
      direction(),
    );

    expect(report.cleared).toBe(0);
  });

  it("keeps a quotation found only in one of the direction's list entries", () => {
    const { report } = verifyDirectionEvaluationEvidence(
      evaluation({ shortfalls: [shortfallItem({ evidence: FROM_LIST }), shortfallItem()] }),
      SOURCE,
      direction(),
    );

    expect(report.cleared).toBe(0);
  });

  // CAL-075 dropped the finding whole because its passage was its standing;
  // here the argument is the standing, so only the quotation goes.
  it("clears a quotation found in neither corpus without dropping the critique", () => {
    const { evaluation: verified, report } = verifyDirectionEvaluationEvidence(
      evaluation({ conventions: [conventionItem({ evidence: INVENTED })] }),
      SOURCE,
      direction(),
    );

    expect(verified.conventions).toHaveLength(DIRECTION_EVALUATION_COUNTS.conventions.min);
    expect(verified.conventions[0]?.evidence).toBeNull();
    expect(verified.conventions[0]?.label).toBe(conventionItem().label);
    expect(report).toMatchObject({
      cleared: 1,
      corrections: [{ list: "conventions", index: 0 }],
    });
  });

  // One matcher per field: words that exist on both sides of a field boundary
  // make a sentence nobody wrote.
  it("clears a quotation straddling two direction fields", () => {
    const { report } = verifyDirectionEvaluationEvidence(
      evaluation({ promises: [promiseItem({ evidence: STRADDLING }), promiseItem()] }),
      SOURCE,
      direction(),
    );

    expect(report.cleared).toBe(1);
  });

  it("keeps a quotation that differs from its corpus only in typography", () => {
    const retyped = "l’ordre qu’elle sert et la mémoire commune";

    const { report } = verifyDirectionEvaluationEvidence(
      evaluation({ promises: [promiseItem({ evidence: retyped }), promiseItem()] }),
      SOURCE,
      direction(),
    );

    expect(report.cleared).toBe(0);
  });

  it("does not count a null evidence as a citation", () => {
    const { report } = verifyDirectionEvaluationEvidence(evaluation(), SOURCE, direction());

    expect(report).toEqual({ critiques: 6, cited: 1, cleared: 0, corrections: [] });
  });

  it("has nothing left to clear the second time", () => {
    const first = verifyDirectionEvaluationEvidence(
      evaluation({ promises: [promiseItem({ evidence: INVENTED }), promiseItem()] }),
      SOURCE,
      direction(),
    );
    const second = verifyDirectionEvaluationEvidence(first.evaluation, SOURCE, direction());

    expect(first.report.cleared).toBe(1);
    expect(second.report.cleared).toBe(0);
  });

  // §9. The report is what somebody will log the first time the mission
  // misbehaves; nothing a reader could read as part of the novel may be
  // reachable from it.
  it("reports counts and identifiers, never a word of the critique", () => {
    const { report } = verifyDirectionEvaluationEvidence(
      evaluation({ promises: [promiseItem({ evidence: INVENTED }), promiseItem()] }),
      SOURCE,
      direction(),
    );

    const serialised = JSON.stringify(report);

    for (const forbidden of [INVENTED, FROM_SOURCE, FROM_PREMISE, "archiviste", "registre"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("brands what it returns, and only what it returns", () => {
    const before = evaluation();
    const { evaluation: verified } = verifyDirectionEvaluationEvidence(before, SOURCE, direction());

    expect(isVerifiedDirectionEvaluation(verified)).toBe(true);
    expect(isVerifiedDirectionEvaluation(before)).toBe(false);
    expect(verified[VERIFIED_DIRECTION_EVALUATION_BRAND]).toBe(true);
  });

  // The brand is a receipt, not a property of the data: a value that crossed
  // a serialisation boundary has not been checked by anybody.
  it("does not let the brand survive a round trip through JSON", () => {
    const { evaluation: verified } = verifyDirectionEvaluationEvidence(
      evaluation(),
      SOURCE,
      direction(),
    );

    expect(isVerifiedDirectionEvaluation(JSON.parse(JSON.stringify(verified)))).toBe(false);
  });
});

// The numbers the contract fixes — identifiers a report can safely log.
describe("the contract's constants", () => {
  it("pins the four minimums as prioritisation demands", () => {
    expect(DIRECTION_EVALUATION_COUNTS.promises.min).toBe(2);
    expect(DIRECTION_EVALUATION_COUNTS.shortfalls.min).toBe(2);
    expect(DIRECTION_EVALUATION_COUNTS.conventions.min).toBe(1);
    expect(DIRECTION_EVALUATION_COUNTS.comparativeWeaknesses.min).toBe(1);
  });

  it("caps every list at six", () => {
    for (const list of DIRECTION_EVALUATION_LISTS) {
      expect(DIRECTION_EVALUATION_COUNTS[list].max, list).toBe(6);
    }
  });

  it("derives every ceiling as twice the target in characters", () => {
    expect(DIRECTION_EVALUATION_CHAR_CEILINGS.argument).toBe(
      Math.ceil(DIRECTION_EVALUATION_WORD_TARGETS.argument * 7 * 2),
    );
    expect(DIRECTION_EVALUATION_CHAR_CEILINGS.evidence).toBe(
      Math.ceil(DIRECTION_EVALUATION_WORD_TARGETS.evidence * 7 * 2),
    );
  });
});
