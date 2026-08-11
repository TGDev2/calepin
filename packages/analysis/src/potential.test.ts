/**
 * The three rules CAL-076 is accepted on: an assessment that does not name at
 * least three elements to develop and two fragilities does not parse, nothing
 * in the contract can carry a score — cahier des charges 1195–1199 held as a
 * shape — and a quotation nobody wrote is cleared without costing the
 * appraisal its place.
 *
 * The fixtures are synthetic French sentences written for this file (§8).
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  isVerifiedNovelPotentialAssessment,
  NOVEL_POTENTIAL_CHAR_CEILINGS,
  NOVEL_POTENTIAL_COUNTS,
  NOVEL_POTENTIAL_EVIDENCED_LISTS,
  type NovelPotentialAssessment,
  novelPotentialAssessmentSchema,
  type NovelPotentialExpansion,
  type NovelPotentialFragility,
  VERIFIED_NOVEL_POTENTIAL_BRAND,
  verifyNovelPotentialEvidence,
} from "./potential";

const SOURCE = [
  "La gardienne du phare notait chaque naufrage dans un registre qu'elle ne relisait jamais.",
  "Son frère lui écrivait du continent des lettres qu'elle brûlait sans les ouvrir.",
  "Le registre s'arrêtait net au milieu d'une page.",
].join("\n");

/** A quotation that is really in the source text. */
const REAL = "un registre qu'elle ne relisait jamais";

/** A quotation nobody wrote — well formed, on topic, absent. */
const INVENTED = "la mer rendait toujours ce qu'on lui confiait";

function expansion(overrides: Partial<NovelPotentialExpansion> = {}): NovelPotentialExpansion {
  return {
    label: "Le registre des naufrages",
    evidence: REAL,
    whyItSustains: "Une appréciation argumentée de ce que cet élément peut porter.",
    ...overrides,
  };
}

function fragility(overrides: Partial<NovelPotentialFragility> = {}): NovelPotentialFragility {
  return {
    label: "Les lettres brûlées",
    evidence: null,
    whyFragile: "Une appréciation argumentée de ce que cette faiblesse coûtera.",
    ...overrides,
  };
}

function assessment(overrides: Partial<NovelPotentialAssessment> = {}): NovelPotentialAssessment {
  return novelPotentialAssessmentSchema.parse({
    overall: "Une appréciation argumentée de ce que le texte peut soutenir sur la longueur.",
    expansions: [expansion(), expansion(), expansion()],
    exhaustions: [],
    gaps: [],
    fragilities: [fragility(), fragility()],
    ...overrides,
  });
}

describe("novelPotentialAssessmentSchema", () => {
  it("accepts an assessment on all four axes", () => {
    const parsed = novelPotentialAssessmentSchema.safeParse({
      overall: "Ce que le texte peut soutenir, apprécié en mots.",
      expansions: [expansion(), expansion(), expansion()],
      exhaustions: [{ label: "Un motif", evidence: REAL, whyItExhausts: "Pourquoi il s'épuise." }],
      gaps: [{ label: "Ce qui manque", whyNeeded: "Pourquoi la longueur l'exige." }],
      fragilities: [fragility(), fragility({ evidence: REAL })],
    });

    expect(parsed.success).toBe(true);
  });

  // The backlog's "Fini quand" clause, as a property of the shape: fewer than
  // three elements to develop or two fragilities is not an assessment.
  it("refuses fewer than three expansions or two fragilities", () => {
    expect(
      novelPotentialAssessmentSchema.safeParse({
        ...assessment(),
        expansions: [expansion(), expansion()],
      }).success,
    ).toBe(false);
    expect(
      novelPotentialAssessmentSchema.safeParse({
        ...assessment(),
        fragilities: [fragility()],
      }).success,
    ).toBe(false);
  });

  // A text can lack nothing and wear nothing out — those two absences are
  // meaningful, so their minimum is zero.
  it("accepts empty exhaustions and gaps", () => {
    expect(assessment({ exhaustions: [], gaps: [] })).toBeTruthy();
  });

  it("refuses more entries than an axis's ceiling", () => {
    const over = Array.from({ length: NOVEL_POTENTIAL_COUNTS.expansions.max + 1 }, () =>
      expansion(),
    );

    expect(
      novelPotentialAssessmentSchema.safeParse({ ...assessment(), expansions: over }).success,
    ).toBe(false);
  });

  // Nullable, never elided: "no passage carries this" is said with null, an
  // empty string is a hole wearing a quotation's name.
  it("accepts a null evidence and refuses an empty one", () => {
    expect(
      novelPotentialAssessmentSchema.safeParse({
        ...assessment(),
        expansions: [expansion({ evidence: null }), expansion(), expansion()],
      }).success,
    ).toBe(true);
    expect(
      novelPotentialAssessmentSchema.safeParse({
        ...assessment(),
        expansions: [expansion({ evidence: "   " }), expansion(), expansion()],
      }).success,
    ).toBe(false);
  });

  // An absence has no passage; a gap carrying one would be quoting what the
  // text does not contain.
  it("refuses a gap that carries evidence", () => {
    const parsed = novelPotentialAssessmentSchema.safeParse({
      ...assessment(),
      gaps: [{ label: "Ce qui manque", whyNeeded: "Pourquoi.", evidence: REAL }],
    });

    expect(parsed.success).toBe(false);
  });

  it("refuses a quotation an order of magnitude past its target", () => {
    const oversized = "mot ".repeat(NOVEL_POTENTIAL_CHAR_CEILINGS.evidence);

    expect(
      novelPotentialAssessmentSchema.safeParse({
        ...assessment(),
        expansions: [expansion({ evidence: oversized }), expansion(), expansion()],
      }).success,
    ).toBe(false);
  });

  // Cahier des charges 1195–1199. Strict objects refuse the helpful rating
  // column by name today; the structural pin below refuses it by type forever.
  it("refuses a score wherever one could be smuggled in", () => {
    expect(
      novelPotentialAssessmentSchema.safeParse({
        ...assessment(),
        viabilityScore: 7,
      }).success,
    ).toBe(false);
    expect(
      novelPotentialAssessmentSchema.safeParse({
        ...assessment(),
        expansions: [{ ...expansion(), promise: 0.8 }, expansion(), expansion()],
      }).success,
    ).toBe(false);
  });

  it("declares no numeric field anywhere in the contract", () => {
    const shape = novelPotentialAssessmentSchema.shape;

    expect(Object.keys(shape).sort()).toEqual([
      "exhaustions",
      "expansions",
      "fragilities",
      "gaps",
      "overall",
    ]);
    expect(shape.overall instanceof z.ZodNumber).toBe(false);

    for (const listSchema of [shape.expansions, shape.exhaustions, shape.gaps, shape.fragilities]) {
      for (const [name, field] of Object.entries(listSchema.element.shape)) {
        expect(field instanceof z.ZodNumber, name).toBe(false);
      }
    }
  });
});

describe("verifyNovelPotentialEvidence", () => {
  it("keeps a quotation that is really in the text", () => {
    const { assessment: verified, report } = verifyNovelPotentialEvidence(assessment(), SOURCE);

    expect(verified.expansions.map((entry) => entry.evidence)).toEqual([REAL, REAL, REAL]);
    expect(report).toEqual({ appraisals: 5, cited: 3, cleared: 0, corrections: [] });
  });

  // CAL-075 dropped the finding whole because its passage was its standing;
  // here the argument is the standing, so only the quotation goes.
  it("clears an invented quotation without dropping the appraisal", () => {
    const { assessment: verified, report } = verifyNovelPotentialEvidence(
      assessment({
        expansions: [expansion({ evidence: INVENTED }), expansion(), expansion()],
      }),
      SOURCE,
    );

    expect(verified.expansions).toHaveLength(3);
    expect(verified.expansions[0]?.evidence).toBeNull();
    expect(verified.expansions[0]?.label).toBe(expansion().label);
    expect(report).toMatchObject({
      cleared: 1,
      corrections: [{ list: "expansions", index: 0 }],
    });
  });

  // The reason evidence is nullable: verification must not be able to push an
  // assessment under the minimums the backlog fixes.
  it("leaves the minimums intact when every quotation is invented", () => {
    const { assessment: verified, report } = verifyNovelPotentialEvidence(
      assessment({
        expansions: [
          expansion({ evidence: INVENTED }),
          expansion({ evidence: INVENTED }),
          expansion({ evidence: INVENTED }),
        ],
        fragilities: [fragility({ evidence: INVENTED }), fragility({ evidence: INVENTED })],
      }),
      SOURCE,
    );

    expect(verified.expansions).toHaveLength(NOVEL_POTENTIAL_COUNTS.expansions.min);
    expect(verified.fragilities).toHaveLength(NOVEL_POTENTIAL_COUNTS.fragilities.min);
    expect(report.cleared).toBe(5);
  });

  it("keeps a quotation that differs from the text only in typography", () => {
    const retyped = "un registre qu’elle ne relisait jamais";

    const { report } = verifyNovelPotentialEvidence(
      assessment({ expansions: [expansion({ evidence: retyped }), expansion(), expansion()] }),
      SOURCE,
    );

    expect(report.cleared).toBe(0);
  });

  it("does not count a null evidence as a citation", () => {
    const { report } = verifyNovelPotentialEvidence(
      assessment({
        expansions: [expansion({ evidence: null }), expansion(), expansion()],
        fragilities: [fragility(), fragility()],
      }),
      SOURCE,
    );

    expect(report).toEqual({ appraisals: 5, cited: 2, cleared: 0, corrections: [] });
  });

  it("has nothing left to clear the second time", () => {
    const first = verifyNovelPotentialEvidence(
      assessment({ expansions: [expansion({ evidence: INVENTED }), expansion(), expansion()] }),
      SOURCE,
    );
    const second = verifyNovelPotentialEvidence(first.assessment, SOURCE);

    expect(first.report.cleared).toBe(1);
    expect(second.report.cleared).toBe(0);
  });

  // §9. The report is what somebody will log the first time the mission
  // misbehaves; nothing a reader could read as part of the novel may be
  // reachable from it.
  it("reports counts and identifiers, never a word of the text", () => {
    const { report } = verifyNovelPotentialEvidence(
      assessment({ expansions: [expansion({ evidence: INVENTED }), expansion(), expansion()] }),
      SOURCE,
    );

    const serialised = JSON.stringify(report);

    for (const forbidden of [INVENTED, REAL, "naufrage", "registre", "appréciation"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("brands what it returns, and only what it returns", () => {
    const before = assessment();
    const { assessment: verified } = verifyNovelPotentialEvidence(before, SOURCE);

    expect(isVerifiedNovelPotentialAssessment(verified)).toBe(true);
    expect(isVerifiedNovelPotentialAssessment(before)).toBe(false);
    expect(verified[VERIFIED_NOVEL_POTENTIAL_BRAND]).toBe(true);
  });

  // The brand is a receipt, not a property of the data: a value that crossed a
  // serialisation boundary has not been checked by anybody.
  it("does not let the brand survive a round trip through JSON", () => {
    const { assessment: verified } = verifyNovelPotentialEvidence(assessment(), SOURCE);

    expect(isVerifiedNovelPotentialAssessment(JSON.parse(JSON.stringify(verified)))).toBe(false);
  });
});

// The two numbers the backlog fixes, and the closed list a correction may
// name — identifiers a report can safely log.
describe("NOVEL_POTENTIAL_COUNTS", () => {
  it("pins the backlog's two minimums", () => {
    expect(NOVEL_POTENTIAL_COUNTS.expansions.min).toBe(3);
    expect(NOVEL_POTENTIAL_COUNTS.fragilities.min).toBe(2);
  });

  it("names every evidenced list in the schema, and no other", () => {
    for (const list of NOVEL_POTENTIAL_EVIDENCED_LISTS) {
      const element = novelPotentialAssessmentSchema.shape[list].element;

      expect(Object.keys(element.shape), list).toContain("evidence");
    }

    expect(Object.keys(novelPotentialAssessmentSchema.shape.gaps.element.shape)).not.toContain(
      "evidence",
    );
  });
});
