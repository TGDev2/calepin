/**
 * The walk that turns a verified diagnostic into rows (CAL-209).
 *
 * What is worth asserting is not that seventeen fields can be copied, but the
 * four properties the write path leans on: the groups are the seventeen
 * sections in the enum's order, nothing is lost on the way, a paragraph section
 * and a listed one land in the same shape, and a legitimately empty section
 * comes back as an empty group rather than as no group.
 *
 * The fixtures are synthetic French sentences written for this file (§8).
 */

import { describe, expect, it } from "vitest";

import { verifyAnalysisEvidence } from "./evidence";
import { resolveSourceTextAnalysis } from "./persistence";
import {
  ANALYSIS_SECTIONS,
  ANALYSIS_WORD_TARGETS,
  type AnalysisElementKind,
  type SourceTextAnalysis,
  sourceTextAnalysisSchema,
} from "./schema";

const SOURCE = [
  "Le train partait à sept heures.",
  "Elle n'avait pas emporté de valise, seulement un carnet.",
].join("\n");

/** A quotation that is really in the source text, so nothing is corrected. */
const REAL = "seulement un carnet";

function filler(chars: number): string {
  return "analyse "
    .repeat(Math.ceil(chars / 8))
    .slice(0, chars)
    .trimEnd();
}

function paragraph(kind: AnalysisElementKind, evidence: string | null = null) {
  return { kind, statement: "Une phrase de diagnostic.", evidence };
}

function element(label: string, kind: AnalysisElementKind, evidence: string | null = null) {
  return { kind, label, statement: `Énoncé « ${label} ».`, evidence };
}

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
    themes: [element("Premier thème", "INTERPRETATION")],
    characters: [element("Une figure", "FACTUAL", REAL), element("Une autre", "FACTUAL", REAL)],
    relationships: [],
    pointOfView: [element("Point de vue", "FACTUAL", REAL)],
    tense: [element("Temps", "FACTUAL", REAL)],
    tone: paragraph("INTERPRETATION"),
    singularElements: [element("Un détail", "INTERPRETATION")],
    ambiguities: [],
    openQuestions: [],
    elementsToPreserve: [element("À garder", "INTERPRETATION")],
    weaknesses: [element("Une fragilité", "INTERPRETATION")],
    clicheRisks: [],
    developmentPotential: {
      kind: "INTERPRETATION",
      statement: filler(ANALYSIS_WORD_TARGETS.developmentPotential * 7),
      evidence: null,
    },
    ...overrides,
  });
}

/** The only legitimate way to obtain the brand the resolver demands. */
function verified(overrides: Record<string, unknown> = {}) {
  return verifyAnalysisEvidence(analysisWith(overrides), SOURCE);
}

describe("resolveSourceTextAnalysis", () => {
  it("produces the seventeen sections, in the enum's own order", () => {
    const resolved = resolveSourceTextAnalysis(verified().analysis);

    expect(resolved.map((entry) => entry.section)).toEqual([...ANALYSIS_SECTIONS]);
  });

  // The property the write path rests on: what reaches a row is every element
  // the check counted, and no more. Read off `verifyAnalysisEvidence`'s own
  // total rather than a number written here, so the two walks cannot drift.
  it("loses no element on the way", () => {
    const { analysis, report } = verified();

    const total = resolveSourceTextAnalysis(analysis).reduce(
      (count, entry) => count + entry.elements.length,
      0,
    );

    expect(total).toBe(report.elements);
  });

  it("gives a paragraph section one element with no label", () => {
    const resolved = resolveSourceTextAnalysis(verified().analysis);
    const premise = resolved.find((entry) => entry.section === "PREMISE");

    expect(premise?.elements).toEqual([
      {
        kind: "INTERPRETATION",
        label: null,
        statement: "Une phrase de diagnostic.",
        evidence: null,
      },
    ]);
  });

  it("keeps a listed section's elements, their labels and their order", () => {
    const resolved = resolveSourceTextAnalysis(verified().analysis);
    const characters = resolved.find((entry) => entry.section === "CHARACTERS");

    expect(characters?.elements).toEqual([
      {
        kind: "FACTUAL",
        label: "Une figure",
        statement: "Énoncé « Une figure ».",
        evidence: REAL,
      },
      {
        kind: "FACTUAL",
        label: "Une autre",
        statement: "Énoncé « Une autre ».",
        evidence: REAL,
      },
    ]);
  });

  // A section the text gives nothing to is a group with no element, never a
  // missing group: the writer appends a revision for it, which is what stops a
  // re-run leaving the previous revision of an emptied section on screen.
  it("keeps a legitimately empty section as an empty group", () => {
    const resolved = resolveSourceTextAnalysis(verified().analysis);

    for (const section of ["RELATIONSHIPS", "AMBIGUITIES", "OPEN_QUESTIONS", "CLICHE_RISKS"]) {
      const entry = resolved.find((candidate) => candidate.section === section);

      expect(entry).toBeDefined();
      expect(entry?.elements).toEqual([]);
    }
  });

  // The resolver copies, it never re-decides: the marker it hands the writer is
  // the one verification left behind, demotion included (CAL-071).
  it("carries the marker verification decided, not the one the answer claimed", () => {
    const { analysis } = verified({
      characters: [element("Une figure", "FACTUAL", "une citation que personne n'a écrite")],
    });

    const resolved = resolveSourceTextAnalysis(analysis);
    const characters = resolved.find((entry) => entry.section === "CHARACTERS");

    expect(characters?.elements[0]).toMatchObject({ kind: "INTERPRETATION", evidence: null });
  });
});
