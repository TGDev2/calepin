/**
 * The rule the MVP is accepted on (CAL-071): an assertion the source text does
 * not support comes back marked as an interpretation, every time.
 *
 * What is worth asserting here is not that a string comparison works — that is
 * `verbatim.test.ts` — but that the rule holds at its edges: where the marker is
 * the section's rather than the model's, where a quotation is missing against
 * where it is invented, where the correction must not leave the schema, and
 * where the record of it must not carry a word of the author's text.
 *
 * The fixtures are synthetic French sentences written for this file (§8).
 */

import { describe, expect, it } from "vitest";

import { isVerifiedAnalysis, VERIFIED_ANALYSIS_BRAND, verifyAnalysisEvidence } from "./evidence";
import {
  ANALYSIS_FIXED_KINDS,
  ANALYSIS_SECTION_FIELDS,
  ANALYSIS_WORD_TARGETS,
  type AnalysisElementKind,
  type SourceTextAnalysis,
  sourceTextAnalysisSchema,
} from "./schema";

const SOURCE = [
  "Le train partait à sept heures.",
  "Elle n'avait pas emporté de valise, seulement un carnet.",
  "Personne ne l'attendait sur le quai.",
].join("\n");

/** A quotation that is really in the source text. */
const REAL = "seulement un carnet";

/** A quotation nobody wrote — well formed, on topic, absent. */
const INVENTED = "elle avait longtemps hésité sur le quai";

function filler(chars: number): string {
  return "analyse "
    .repeat(Math.ceil(chars / 8))
    .slice(0, chars)
    .trimEnd();
}

function paragraph(kind: AnalysisElementKind, evidence: string | null = null) {
  return { kind, statement: "Une phrase de diagnostic.", evidence };
}

function element(kind: AnalysisElementKind, evidence: string | null = null) {
  return { kind, label: "Une étiquette", statement: "Une phrase de diagnostic.", evidence };
}

/**
 * A diagnostic that passes the schema and asserts nothing this file is about,
 * so each test can move one thing and read the answer.
 */
function analysisWith(overrides: Record<string, unknown> = {}): SourceTextAnalysis {
  return sourceTextAnalysisSchema.parse({
    factualSummary: {
      kind: "FACTUAL",
      statement: filler(ANALYSIS_WORD_TARGETS.factualSummary * 7),
      evidence: null,
    },
    premise: paragraph("INTERPRETATION"),
    mainConflict: paragraph("INTERPRETATION"),
    narrativePromise: paragraph("INTERPRETATION"),
    themes: [element("INTERPRETATION")],
    characters: [element("FACTUAL", REAL)],
    relationships: [],
    pointOfView: [element("FACTUAL", REAL)],
    tense: [element("FACTUAL", REAL)],
    tone: paragraph("INTERPRETATION"),
    singularElements: [element("INTERPRETATION")],
    ambiguities: [],
    openQuestions: [],
    elementsToPreserve: [element("INTERPRETATION")],
    weaknesses: [element("INTERPRETATION")],
    clicheRisks: [],
    developmentPotential: {
      kind: "INTERPRETATION",
      statement: filler(ANALYSIS_WORD_TARGETS.developmentPotential * 7),
      evidence: null,
    },
    ...overrides,
  });
}

describe("verifyAnalysisEvidence", () => {
  it("leaves a fact the text really supports exactly as it was", () => {
    const { analysis, report } = verifyAnalysisEvidence(analysisWith(), SOURCE);

    expect(analysis.characters[0]).toMatchObject({ kind: "FACTUAL", evidence: REAL });
    expect(report.corrections).toEqual([]);
    expect(report.reclassified).toBe(0);
    expect(report.quotationsDropped).toBe(0);
  });

  // The specification's own sentence: *un élément non appuyé doit
  // obligatoirement être marqué comme interprétation*.
  it("reclassifies a fact that cites nothing", () => {
    const { analysis, report } = verifyAnalysisEvidence(
      analysisWith({ characters: [element("FACTUAL", null)] }),
      SOURCE,
    );

    expect(analysis.characters[0]?.kind).toBe("INTERPRETATION");
    expect(report.corrections).toEqual([
      {
        section: "CHARACTERS",
        index: 0,
        reason: "no-quotation",
        reclassified: true,
        quotationDropped: false,
      },
    ]);
  });

  it("reclassifies a fact whose quotation is nowhere in the text, and drops the quotation", () => {
    const { analysis, report } = verifyAnalysisEvidence(
      analysisWith({ characters: [element("FACTUAL", INVENTED)] }),
      SOURCE,
    );

    expect(analysis.characters[0]).toMatchObject({ kind: "INTERPRETATION", evidence: null });
    expect(report.corrections[0]).toMatchObject({
      reason: "quotation-not-found",
      reclassified: true,
      quotationDropped: true,
    });
  });

  // An interpretation is allowed to cite the passage it starts from, and it is
  // held to the same standard: a passage the author never wrote is not evidence
  // of anything, and CAL-072 would put it on screen as if it were theirs.
  it("drops an invented quotation from an interpretation without touching its marker", () => {
    const { analysis, report } = verifyAnalysisEvidence(
      analysisWith({ themes: [element("INTERPRETATION", INVENTED)] }),
      SOURCE,
    );

    expect(analysis.themes[0]).toMatchObject({ kind: "INTERPRETATION", evidence: null });
    expect(report.reclassified).toBe(0);
    expect(report.quotationsDropped).toBe(1);
  });

  it("keeps a quotation that differs from the text only in typography", () => {
    const retyped = "Elle n’avait pas emporté de valise";

    const { analysis, report } = verifyAnalysisEvidence(
      analysisWith({ characters: [element("FACTUAL", retyped)] }),
      SOURCE,
    );

    expect(analysis.characters[0]).toMatchObject({ kind: "FACTUAL", evidence: retyped });
    expect(report.corrections).toEqual([]);
  });

  it("keeps a quotation that crosses a line break", () => {
    const across = "seulement un carnet. Personne ne l'attendait";

    const { report } = verifyAnalysisEvidence(
      analysisWith({ characters: [element("FACTUAL", across)] }),
      SOURCE,
    );

    expect(report.corrections).toEqual([]);
  });

  it("treats a quotation that is only the marks around it as absent", () => {
    const { analysis, report } = verifyAnalysisEvidence(
      analysisWith({ characters: [element("FACTUAL", "« »")] }),
      SOURCE,
    );

    expect(analysis.characters[0]).toMatchObject({ kind: "INTERPRETATION", evidence: null });
    expect(report.quotationsDropped).toBe(1);
  });

  // The summary is not one assertion among others — it is the text restated,
  // and its support is the whole text. Reclassifying it would also produce a
  // value the schema that produced it refuses.
  it("never rewrites the marker of the factual summary", () => {
    const { analysis, report } = verifyAnalysisEvidence(analysisWith(), SOURCE);

    expect(analysis.factualSummary.kind).toBe("FACTUAL");
    expect(report.corrections).toEqual([]);
  });

  it("still drops an invented quotation from a section whose marker is fixed", () => {
    const { analysis, report } = verifyAnalysisEvidence(
      analysisWith({
        factualSummary: {
          kind: "FACTUAL",
          statement: filler(ANALYSIS_WORD_TARGETS.factualSummary * 7),
          evidence: INVENTED,
        },
        weaknesses: [element("INTERPRETATION", INVENTED)],
      }),
      SOURCE,
    );

    expect(analysis.factualSummary).toMatchObject({ kind: "FACTUAL", evidence: null });
    expect(analysis.weaknesses[0]).toMatchObject({ kind: "INTERPRETATION", evidence: null });
    expect(report.quotationsDropped).toBe(2);
    expect(report.reclassified).toBe(0);
  });

  // The worst case the walk has to survive: nothing is supported by anything.
  // Every marker the model chose falls back, the five the schema fixes stand,
  // and the result is still an analysis.
  it("survives a source text that supports nothing at all", () => {
    const { analysis, report } = verifyAnalysisEvidence(analysisWith(), "");

    expect(sourceTextAnalysisSchema.safeParse(analysis).success).toBe(true);
    expect(analysis.factualSummary.kind).toBe("FACTUAL");
    expect(analysis.characters[0]?.kind).toBe("INTERPRETATION");
    expect(analysis.pointOfView[0]?.kind).toBe("INTERPRETATION");
    expect(report.reclassified).toBe(3);
    expect(report.quotationsDropped).toBe(3);
    expect(report.supported).toBe(0);
  });

  it("walks every element of every section", () => {
    const { report } = verifyAnalysisEvidence(analysisWith(), SOURCE);

    // Six paragraph sections plus the seven listed elements the fixture holds.
    expect(report.elements).toBe(13);
    expect(report.quoted).toBe(3);
    expect(report.supported).toBe(report.quoted - report.quotationsDropped);
  });

  it("names the position of a correction inside its section", () => {
    const { report } = verifyAnalysisEvidence(
      analysisWith({
        characters: [element("FACTUAL", REAL), element("FACTUAL", INVENTED)],
      }),
      SOURCE,
    );

    expect(report.corrections).toEqual([
      {
        section: "CHARACTERS",
        index: 1,
        reason: "quotation-not-found",
        reclassified: true,
        quotationDropped: true,
      },
    ]);
  });

  // §9. This report is exactly the thing somebody will log the first time a
  // mission misbehaves, so nothing a reader could read as part of the novel may
  // be reachable from it — not the statement, not the quotation, not the label.
  it("reports counts and identifiers, never a word of the text", () => {
    const { report } = verifyAnalysisEvidence(
      analysisWith({ characters: [element("FACTUAL", INVENTED)] }),
      SOURCE,
    );

    const serialised = JSON.stringify(report);

    for (const forbidden of [INVENTED, REAL, "diagnostic", "étiquette", "analyse"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("brands what it returns, and only what it returns", () => {
    const before = analysisWith();
    const { analysis } = verifyAnalysisEvidence(before, SOURCE);

    expect(isVerifiedAnalysis(analysis)).toBe(true);
    expect(isVerifiedAnalysis(before)).toBe(false);
    expect(analysis[VERIFIED_ANALYSIS_BRAND]).toBe(true);
  });

  // The brand is a receipt, not a property of the data: a value that crossed a
  // serialisation boundary has not been checked by anybody.
  it("does not let the brand survive a round trip through JSON", () => {
    const { analysis } = verifyAnalysisEvidence(analysisWith(), SOURCE);

    expect(isVerifiedAnalysis(JSON.parse(JSON.stringify(analysis)))).toBe(false);
  });

  it("has nothing left to correct the second time", () => {
    const first = verifyAnalysisEvidence(
      analysisWith({ characters: [element("FACTUAL", INVENTED)] }),
      SOURCE,
    );
    const second = verifyAnalysisEvidence(first.analysis, SOURCE);

    expect(first.report.corrections).toHaveLength(1);
    expect(second.report.corrections).toEqual([]);
  });

  it("rewrites a marker in every section the schema leaves open, and in no other", () => {
    for (const [section, field] of Object.entries(ANALYSIS_SECTION_FIELDS)) {
      if (section in ANALYSIS_FIXED_KINDS) {
        continue;
      }

      const base = analysisWith();
      const listed = Array.isArray(base[field as keyof SourceTextAnalysis]);
      const unsupported = listed ? [element("FACTUAL", null)] : paragraph("FACTUAL");

      const { report } = verifyAnalysisEvidence(analysisWith({ [field]: unsupported }), SOURCE);

      expect(
        report.corrections.some((entry) => entry.section === section),
        section,
      ).toBe(true);
    }
  });
});
