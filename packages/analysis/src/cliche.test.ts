/**
 * The two rules CAL-075 is accepted on: a flagged cliché that does not cite a
 * real passage of the text does not survive, and nothing in the contract can
 * carry a score — the prohibition of cahier des charges 1195–1199 held as a
 * shape, not as a habit.
 *
 * The fixtures are synthetic French sentences written for this file (§8).
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CLICHE_RISK_CATEGORIES,
  CLICHE_RISK_CHAR_CEILINGS,
  CLICHE_RISK_COUNT,
  type ClicheRisk,
  type ClicheRiskCategory,
  clicheRiskDetectionSchema,
  isVerifiedClicheRiskDetection,
  VERIFIED_CLICHE_DETECTION_BRAND,
  verifyClicheRiskEvidence,
} from "./cliche";

const SOURCE = [
  "L'orpheline apprit à seize ans qu'elle était l'élue de la prophétie.",
  "Son vieux maître mourut dans ses bras à la fin du premier chapitre.",
  "Un frisson lui parcourut l'échine.",
].join("\n");

/** A quotation that is really in the source text. */
const REAL = "l'élue de la prophétie";

/** A quotation nobody wrote — well formed, on topic, absent. */
const INVENTED = "le destin frappa à sa porte";

function risk(overrides: Partial<ClicheRisk> = {}): ClicheRisk {
  return {
    category: "situation",
    label: "L'élue orpheline",
    evidence: REAL,
    whyConventional: "Une remarque argumentée sur le fonds commun repris ici.",
    whatItPrevents: "Ce que cette pente interdit au roman.",
    ...overrides,
  };
}

function detectionWith(risks: readonly ClicheRisk[]) {
  return clicheRiskDetectionSchema.parse({ risks });
}

describe("clicheRiskDetectionSchema", () => {
  it("accepts a finding on each of the four fronts", () => {
    const parsed = clicheRiskDetectionSchema.safeParse({
      risks: CLICHE_RISK_CATEGORIES.map((category) => risk({ category })),
    });

    expect(parsed.success).toBe(true);
  });

  // The honest answer for a singular text — a minimum above zero would order
  // the model to invent what it could not find.
  it("accepts an empty detection", () => {
    expect(clicheRiskDetectionSchema.safeParse({ risks: [] }).success).toBe(true);
  });

  it("refuses more findings than the ceiling", () => {
    const over = Array.from({ length: CLICHE_RISK_COUNT.max + 1 }, () => risk());

    expect(clicheRiskDetectionSchema.safeParse({ risks: over }).success).toBe(false);
  });

  // The acceptance criterion itself: no passage, no finding. Required, not
  // nullable — there is no whole-text fallback for a cliché.
  it("refuses a finding whose evidence is missing, null or empty", () => {
    for (const evidence of [undefined, null, "", "   "]) {
      const parsed = clicheRiskDetectionSchema.safeParse({
        risks: [{ ...risk(), evidence }],
      });

      expect(parsed.success, String(evidence)).toBe(false);
    }
  });

  it("refuses a quotation an order of magnitude past its target", () => {
    const oversized = "mot ".repeat(CLICHE_RISK_CHAR_CEILINGS.evidence);

    expect(
      clicheRiskDetectionSchema.safeParse({ risks: [risk({ evidence: oversized })] }).success,
    ).toBe(false);
  });

  it("refuses a category off the four fronts", () => {
    const parsed = clicheRiskDetectionSchema.safeParse({
      risks: [{ ...risk(), category: "theme" }],
    });

    expect(parsed.success).toBe(false);
  });

  // Cahier des charges 1195–1199. Strict objects refuse the helpful rating
  // column by name today; the structural pin below refuses it by type forever.
  it("refuses a score wherever one could be smuggled in", () => {
    expect(
      clicheRiskDetectionSchema.safeParse({
        risks: [risk()],
        banalityScore: 3,
      }).success,
    ).toBe(false);
    expect(
      clicheRiskDetectionSchema.safeParse({
        risks: [{ ...risk(), originalityScore: 0.4 }],
      }).success,
    ).toBe(false);
  });

  it("declares no numeric field anywhere in the contract", () => {
    expect(Object.keys(clicheRiskDetectionSchema.shape)).toEqual(["risks"]);

    const element = clicheRiskDetectionSchema.shape.risks.element;

    for (const [name, field] of Object.entries(element.shape)) {
      expect(field instanceof z.ZodNumber, name).toBe(false);
    }
  });
});

describe("verifyClicheRiskEvidence", () => {
  it("keeps a finding whose passage is really in the text", () => {
    const { detection, report } = verifyClicheRiskEvidence(detectionWith([risk()]), SOURCE);

    expect(detection.risks).toHaveLength(1);
    expect(report).toMatchObject({ risks: 1, kept: 1, dropped: 0, drops: [] });
  });

  // CAL-071 could demote and keep; here the passage is the finding's standing,
  // so an invented one removes the finding whole.
  it("drops a finding whose quotation is nowhere in the text", () => {
    const { detection, report } = verifyClicheRiskEvidence(
      detectionWith([risk({ evidence: INVENTED })]),
      SOURCE,
    );

    expect(detection.risks).toEqual([]);
    expect(report).toEqual({
      risks: 1,
      kept: 0,
      dropped: 1,
      drops: [{ index: 0, category: "situation" }],
    });
  });

  it("names the received position and the front of what it drops", () => {
    const { detection, report } = verifyClicheRiskEvidence(
      detectionWith([
        risk(),
        risk({ category: "reversal", evidence: INVENTED }),
        risk({ category: "formula", evidence: "un frisson lui parcourut l'échine" }),
      ]),
      SOURCE,
    );

    expect(detection.risks.map((entry) => entry.category)).toEqual(["situation", "formula"]);
    expect(report.drops).toEqual([{ index: 1, category: "reversal" }]);
  });

  it("keeps a quotation that differs from the text only in typography", () => {
    const retyped = "l’élue de la prophétie";

    const { report } = verifyClicheRiskEvidence(
      detectionWith([risk({ evidence: retyped })]),
      SOURCE,
    );

    expect(report.dropped).toBe(0);
  });

  it("survives a text that supports nothing, and an empty detection", () => {
    const emptied = verifyClicheRiskEvidence(detectionWith([risk()]), "");
    const empty = verifyClicheRiskEvidence(detectionWith([]), SOURCE);

    expect(emptied.detection.risks).toEqual([]);
    expect(emptied.report.dropped).toBe(1);
    expect(empty.report).toMatchObject({ risks: 0, kept: 0, dropped: 0 });
  });

  it("has nothing left to drop the second time", () => {
    const first = verifyClicheRiskEvidence(
      detectionWith([risk(), risk({ evidence: INVENTED })]),
      SOURCE,
    );
    const second = verifyClicheRiskEvidence(first.detection, SOURCE);

    expect(first.report.dropped).toBe(1);
    expect(second.report.dropped).toBe(0);
  });

  // §9. The report is what somebody will log the first time the mission
  // misbehaves; nothing a reader could read as part of the novel may be
  // reachable from it.
  it("reports counts and identifiers, never a word of the text", () => {
    const { report } = verifyClicheRiskEvidence(
      detectionWith([risk({ evidence: INVENTED })]),
      SOURCE,
    );

    const serialised = JSON.stringify(report);

    for (const forbidden of [INVENTED, REAL, "orpheline", "argumentée", "pente"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("brands what it returns, and only what it returns", () => {
    const before = detectionWith([risk()]);
    const { detection } = verifyClicheRiskEvidence(before, SOURCE);

    expect(isVerifiedClicheRiskDetection(detection)).toBe(true);
    expect(isVerifiedClicheRiskDetection(before)).toBe(false);
    expect(detection[VERIFIED_CLICHE_DETECTION_BRAND]).toBe(true);
  });

  // The brand is a receipt, not a property of the data: a value that crossed a
  // serialisation boundary has not been checked by anybody.
  it("does not let the brand survive a round trip through JSON", () => {
    const { detection } = verifyClicheRiskEvidence(detectionWith([risk()]), SOURCE);

    expect(isVerifiedClicheRiskDetection(JSON.parse(JSON.stringify(detection)))).toBe(false);
  });
});

// One guard the categories owe the screens that will label them: identifiers,
// in the naming rule's spelling, and category names a drop can safely log.
describe("CLICHE_RISK_CATEGORIES", () => {
  it("spells four unique lowercase identifiers", () => {
    const unique = new Set<ClicheRiskCategory>(CLICHE_RISK_CATEGORIES);

    expect(CLICHE_RISK_CATEGORIES).toHaveLength(4);
    expect(unique.size).toBe(4);

    for (const category of CLICHE_RISK_CATEGORIES) {
      expect(category).toMatch(/^[a-z]+$/);
    }
  });
});
