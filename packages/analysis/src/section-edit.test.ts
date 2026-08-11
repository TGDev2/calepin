import { describe, expect, it } from "vitest";

import {
  ANALYSIS_ELEMENT_COUNTS,
  ANALYSIS_FIXED_KINDS,
  ANALYSIS_SECTION_FIELDS,
  ANALYSIS_SECTIONS,
} from "./schema";
import {
  analysisSectionElementLimit,
  isListedAnalysisSection,
  parseAnalysisSectionEdit,
} from "./section-edit";

/**
 * The edited section is bound by the mission's own schema. These assert that it
 * really is the same schema — a bound read back off `ANALYSIS_ELEMENT_COUNTS`,
 * a fixed kind refused, a paragraph section kept to one element — rather than a
 * second copy that happens to agree today.
 *
 * The fixtures are two words long and about nothing (§9).
 */

const listed = (overrides: Record<string, unknown> = {}) => ({
  kind: "INTERPRETATION" as const,
  label: "Un titre",
  statement: "Un énoncé court.",
  evidence: null,
  ...overrides,
});

const paragraph = (overrides: Record<string, unknown> = {}) => ({
  kind: "INTERPRETATION" as const,
  label: null,
  statement: "Un énoncé court.",
  evidence: null,
  ...overrides,
});

describe("isListedAnalysisSection", () => {
  it("agrees with the count table on every section", () => {
    for (const section of ANALYSIS_SECTIONS) {
      const field = ANALYSIS_SECTION_FIELDS[section];

      expect(isListedAnalysisSection(section)).toBe(field in ANALYSIS_ELEMENT_COUNTS);
    }
  });
});

describe("analysisSectionElementLimit", () => {
  it("gives a paragraph section exactly one row", () => {
    expect(analysisSectionElementLimit("PREMISE")).toBe(1);
    expect(analysisSectionElementLimit("FACTUAL_SUMMARY")).toBe(1);
  });

  it("gives a listed section the maximum its own schema enforces", () => {
    expect(analysisSectionElementLimit("THEMES")).toBe(ANALYSIS_ELEMENT_COUNTS.themes.max);
    expect(analysisSectionElementLimit("CHARACTERS")).toBe(ANALYSIS_ELEMENT_COUNTS.characters.max);
  });

  it("never offers a row the schema would refuse", () => {
    for (const section of ANALYSIS_SECTIONS) {
      // The five sections whose definition fixes the marker only accept that
      // one — the same table the schema builds its literals from.
      const kind = ANALYSIS_FIXED_KINDS[section as keyof typeof ANALYSIS_FIXED_KINDS] ?? "FACTUAL";
      const full = Array.from({ length: analysisSectionElementLimit(section) }, () =>
        isListedAnalysisSection(section) ? listed({ kind }) : paragraph({ kind }),
      );

      expect(parseAnalysisSectionEdit(section, full).ok).toBe(true);
    }
  });
});

describe("parseAnalysisSectionEdit", () => {
  it("accepts a listed section the author wrote", () => {
    const result = parseAnalysisSectionEdit("THEMES", [
      listed({ label: "La routine" }),
      listed({ label: "Le départ", kind: "FACTUAL", evidence: "Un fragment." }),
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it("refuses a listed section emptied past its minimum", () => {
    const result = parseAnalysisSectionEdit("THEMES", []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe("validation");
      expect(result.error.userMessage).toBe("Cette section doit garder au moins un élément.");
    }
  });

  it("allows emptying a section where absence is meaningful", () => {
    expect(parseAnalysisSectionEdit("RELATIONSHIPS", []).ok).toBe(true);
    expect(parseAnalysisSectionEdit("AMBIGUITIES", []).ok).toBe(true);
  });

  it("refuses more elements than the section admits", () => {
    const tooMany = Array.from({ length: ANALYSIS_ELEMENT_COUNTS.themes.max + 1 }, () => listed());
    const result = parseAnalysisSectionEdit("THEMES", tooMany);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.userMessage).toBe("Cette section n'accepte pas autant d'éléments.");
    }
  });

  it("keeps a paragraph section to exactly one element", () => {
    expect(parseAnalysisSectionEdit("PREMISE", [paragraph()]).ok).toBe(true);
    expect(parseAnalysisSectionEdit("PREMISE", []).ok).toBe(false);
    expect(parseAnalysisSectionEdit("PREMISE", [paragraph(), paragraph()]).ok).toBe(false);
  });

  it("refuses a label on a paragraph section rather than dropping it", () => {
    const result = parseAnalysisSectionEdit("PREMISE", [paragraph({ label: "Un titre" })]);

    expect(result.ok).toBe(false);
  });

  it("requires a label on a listed section", () => {
    expect(parseAnalysisSectionEdit("THEMES", [listed({ label: null })]).ok).toBe(false);
    expect(parseAnalysisSectionEdit("THEMES", [listed({ label: "" })]).ok).toBe(false);
  });

  it("refuses to move the marker of a section whose definition fixes it", () => {
    const result = parseAnalysisSectionEdit("WEAKNESSES", [listed({ kind: "FACTUAL" })]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.userMessage).toBe(
        "La nature des éléments de cette section est fixée par sa définition et ne peut pas être changée.",
      );
    }
  });

  it("lets the author choose the marker where the model chooses it", () => {
    expect(parseAnalysisSectionEdit("THEMES", [listed({ kind: "FACTUAL" })]).ok).toBe(true);
    expect(parseAnalysisSectionEdit("THEMES", [listed({ kind: "INTERPRETATION" })]).ok).toBe(true);
  });

  it("refuses an empty statement", () => {
    const result = parseAnalysisSectionEdit("THEMES", [listed({ statement: "   " })]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.userMessage).toBe(
        "Chaque élément doit porter un énoncé ; un champ obligatoire est vide.",
      );
    }
  });

  it("refuses a statement past the section's own ceiling", () => {
    const result = parseAnalysisSectionEdit("THEMES", [listed({ statement: "a".repeat(10_000) })]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.userMessage).toBe(
        "Un des textes saisis est trop long pour cette section.",
      );
    }
  });

  it("refuses an unknown field rather than ignoring it", () => {
    expect(parseAnalysisSectionEdit("THEMES", [listed({ origin: "GENERATED" })]).ok).toBe(false);
  });

  it("refuses anything that is not a list of elements", () => {
    expect(parseAnalysisSectionEdit("THEMES", "des thèmes").ok).toBe(false);
    expect(parseAnalysisSectionEdit("THEMES", [null]).ok).toBe(false);
  });

  it("never carries what was typed into the error", () => {
    const secret = "phrase-du-manuscrit-qui-ne-doit-pas-fuiter";
    const result = parseAnalysisSectionEdit("THEMES", [
      listed({ statement: `${secret} ${"a".repeat(10_000)}` }),
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify({ ...result.error, stack: result.error.stack })).not.toContain(secret);
      expect(result.error.fieldPath).toBe("0.statement");
    }
  });
});
