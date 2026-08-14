import { describe, expect, it } from "vitest";

import { type AnalysisSectionForPrompt, describeAnalysis } from "./describe";
import { ANALYSIS_SECTION_LABELS } from "./labels";

// Synthetic tokens, never prose: §9 binds this repository's own fixtures as
// much as its logs.
const STATEMENT = "enonce-src-1 enonce-src-2 enonce-src-3";
const QUOTATION = "mot-src-4 mot-src-5";

function section(
  name: keyof typeof ANALYSIS_SECTION_LABELS,
  elements: AnalysisSectionForPrompt["elements"],
): AnalysisSectionForPrompt {
  return { section: name, elements };
}

describe("describeAnalysis", () => {
  it("heads each section with the schema's own French label", () => {
    const rendered = describeAnalysis([
      section("PREMISE", [{ kind: "FACTUAL", label: null, statement: STATEMENT, evidence: null }]),
    ]);

    expect(rendered).toContain(`## ${ANALYSIS_SECTION_LABELS.PREMISE}`);
    expect(rendered).toContain(STATEMENT);
  });

  it("carries the fact/interpretation marker of every element", () => {
    const rendered = describeAnalysis([
      section("THEMES", [
        { kind: "FACTUAL", label: null, statement: STATEMENT, evidence: null },
        { kind: "INTERPRETATION", label: null, statement: STATEMENT, evidence: null },
      ]),
    ]);

    expect(rendered).toContain("[fait]");
    expect(rendered).toContain("[interprétation]");
  });

  it("quotes the passage an element rests on, verbatim", () => {
    const rendered = describeAnalysis([
      section("CHARACTERS", [
        { kind: "FACTUAL", label: "personnage", statement: STATEMENT, evidence: QUOTATION },
      ]),
    ]);

    expect(rendered).toContain(`« ${QUOTATION} »`);
    expect(rendered).toContain("personnage — ");
  });

  it("orders the sections by the enum, never by the order it was handed", () => {
    const shuffled = describeAnalysis([
      section("DEVELOPMENT_POTENTIAL", []),
      section("FACTUAL_SUMMARY", []),
      section("THEMES", []),
    ]);

    expect(shuffled.indexOf(ANALYSIS_SECTION_LABELS.FACTUAL_SUMMARY)).toBeLessThan(
      shuffled.indexOf(ANALYSIS_SECTION_LABELS.THEMES),
    );
    expect(shuffled.indexOf(ANALYSIS_SECTION_LABELS.THEMES)).toBeLessThan(
      shuffled.indexOf(ANALYSIS_SECTION_LABELS.DEVELOPMENT_POTENTIAL),
    );
  });

  it("does not reorder the array it was given", () => {
    const sections = [section("THEMES", []), section("PREMISE", [])];

    describeAnalysis(sections);

    expect(sections.map((entry) => entry.section)).toEqual(["THEMES", "PREMISE"]);
  });

  it("keeps a legitimately empty section, and says it is empty", () => {
    const rendered = describeAnalysis([section("AMBIGUITIES", [])]);

    expect(rendered).toContain(`## ${ANALYSIS_SECTION_LABELS.AMBIGUITIES}`);
    expect(rendered).toContain("aucun élément");
  });

  it("renders nothing for an analysis holding no section at all", () => {
    expect(describeAnalysis([])).toBe("");
  });

  it("names every section of the schema", () => {
    expect(Object.keys(ANALYSIS_SECTION_LABELS)).toHaveLength(17);
  });
});
