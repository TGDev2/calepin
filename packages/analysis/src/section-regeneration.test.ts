/**
 * CAL-077 — what a targeted regeneration is asked, and what it may answer.
 *
 * The side-effect guarantee itself is a property of a statement and is proved
 * in `test/integration/analysis-regeneration.integration.test.ts`. What is
 * provable here is the contract around it: the ask is content-addressed, the
 * author's instruction is bounded and optional, and a regenerated section is
 * held to CAL-071's evidence rule exactly as the whole diagnostic is.
 *
 * The fixture text is short, synthetic and about nothing (§8).
 */

import { describe, expect, it } from "vitest";

import type { AnalysisElementDraft } from "./section-edit";
import {
  ANALYSIS_REGENERATION_INSTRUCTION_CHAR_CEILING,
  analysisSectionRegenerationInputSchema,
  parseAnalysisRegenerationInstruction,
  verifyAnalysisSectionEvidence,
} from "./section-regeneration";

const SOURCE_TEXT =
  "La porte du hangar restait ouverte. Elle comptait les caisses une deuxième fois, puis une troisième.";

function element(overrides: Partial<AnalysisElementDraft> = {}): AnalysisElementDraft {
  return {
    kind: "INTERPRETATION",
    label: "Étiquette",
    statement: "Un énoncé de test.",
    evidence: null,
    ...overrides,
  };
}

describe("the ask a regeneration records (CAL-077)", () => {
  const valid = {
    section: "THEMES",
    sourceTextVersionId: "stv-1",
    fromRevisionNumber: 1,
    instruction: "Insiste sur le comptage.",
  };

  it("names the versions it is built on, so two asks differ when an input does", () => {
    const parsed = analysisSectionRegenerationInputSchema.safeParse(valid);

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.fromRevisionNumber).toBe(1);
  });

  it("accepts a section that has never been produced", () => {
    expect(
      analysisSectionRegenerationInputSchema.safeParse({ ...valid, fromRevisionNumber: 0 }).success,
    ).toBe(true);
  });

  it("accepts an ask with no instruction, and refuses one that is merely absent", () => {
    expect(
      analysisSectionRegenerationInputSchema.safeParse({ ...valid, instruction: null }).success,
    ).toBe(true);

    const withoutInstruction = {
      section: valid.section,
      sourceTextVersionId: valid.sourceTextVersionId,
      fromRevisionNumber: valid.fromRevisionNumber,
    };

    // Required-but-nullable, as `evidence` is: the composer must decide, never
    // merely forget — an omitted key would be digested as a different ask from
    // an explicit "no instruction" and open two generations for one question.
    expect(analysisSectionRegenerationInputSchema.safeParse(withoutInstruction).success).toBe(
      false,
    );
  });

  it("refuses an unknown section, a negative revision and an unknown key", () => {
    expect(
      analysisSectionRegenerationInputSchema.safeParse({ ...valid, section: "PLOT" }).success,
    ).toBe(false);
    expect(
      analysisSectionRegenerationInputSchema.safeParse({ ...valid, fromRevisionNumber: -1 })
        .success,
    ).toBe(false);
    expect(
      analysisSectionRegenerationInputSchema.safeParse({ ...valid, sourceText: SOURCE_TEXT })
        .success,
    ).toBe(false);
  });

  it("refuses an instruction past the ceiling", () => {
    const tooLong = "a".repeat(ANALYSIS_REGENERATION_INSTRUCTION_CHAR_CEILING + 1);

    expect(
      analysisSectionRegenerationInputSchema.safeParse({ ...valid, instruction: tooLong }).success,
    ).toBe(false);
  });
});

describe("the author's complementary instruction", () => {
  it("reads absent, empty and blank as the same answer", () => {
    for (const value of [undefined, null, "", "   \n  "]) {
      const parsed = parseAnalysisRegenerationInstruction(value);

      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.value).toBeNull();
    }
  });

  it("trims what the author typed", () => {
    const parsed = parseAnalysisRegenerationInstruction("  Reste sur le hangar.  ");

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toBe("Reste sur le hangar.");
  });

  it("refuses one past the ceiling, with a sentence that never repeats it", () => {
    const typed = "z".repeat(ANALYSIS_REGENERATION_INSTRUCTION_CHAR_CEILING + 1);
    const parsed = parseAnalysisRegenerationInstruction(typed);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.category).toBe("validation");
      expect(parsed.error.userMessage).not.toContain("zzz");
      expect(parsed.error.message).not.toContain("zzz");
      expect(parsed.error.fieldPath).toBe("instruction");
    }
  });

  it("refuses something that is not text at all", () => {
    const parsed = parseAnalysisRegenerationInstruction(42);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.category).toBe("validation");
  });
});

describe("a regenerated section is held to CAL-071's evidence rule", () => {
  it("keeps a quotation the source text really carries", () => {
    const checked = verifyAnalysisSectionEvidence(
      "THEMES",
      [element({ kind: "FACTUAL", evidence: "Elle comptait les caisses" })],
      SOURCE_TEXT,
    );

    expect(checked.elements[0]?.kind).toBe("FACTUAL");
    expect(checked.elements[0]?.evidence).toBe("Elle comptait les caisses");
    expect(checked.report.corrections).toEqual([]);
    expect(checked.report.supported).toBe(1);
  });

  it("drops a quotation that is not there and reclassifies the element", () => {
    const checked = verifyAnalysisSectionEvidence(
      "THEMES",
      [element({ kind: "FACTUAL", evidence: "Elle recomptait les palettes" })],
      SOURCE_TEXT,
    );

    expect(checked.elements[0]?.kind).toBe("INTERPRETATION");
    expect(checked.elements[0]?.evidence).toBeNull();
    expect(checked.report.quotationsDropped).toBe(1);
    expect(checked.report.reclassified).toBe(1);
    expect(checked.report.supported).toBe(0);
  });

  it("reclassifies a factual element that cites nothing", () => {
    const checked = verifyAnalysisSectionEvidence(
      "THEMES",
      [element({ kind: "FACTUAL", evidence: null })],
      SOURCE_TEXT,
    );

    expect(checked.elements[0]?.kind).toBe("INTERPRETATION");
    expect(checked.report.corrections[0]?.reason).toBe("no-quotation");
    expect(checked.report.corrections[0]?.section).toBe("THEMES");
  });

  it("leaves the marker alone in a section whose definition fixes it", () => {
    // WEAKNESSES is INTERPRETATION by its own definition, so there is no
    // marker anybody asserted — only the invented quotation is removed.
    const checked = verifyAnalysisSectionEvidence(
      "WEAKNESSES",
      [element({ kind: "INTERPRETATION", evidence: "une phrase que le texte n'écrit pas" })],
      SOURCE_TEXT,
    );

    expect(checked.elements[0]?.kind).toBe("INTERPRETATION");
    expect(checked.elements[0]?.evidence).toBeNull();
    expect(checked.report.reclassified).toBe(0);
    expect(checked.report.quotationsDropped).toBe(1);
  });

  it("verifies a paragraph section, whose one element carries no label", () => {
    const checked = verifyAnalysisSectionEvidence(
      "PREMISE",
      [
        {
          kind: "FACTUAL",
          label: null,
          statement: "Un énoncé.",
          evidence: "hangar restait ouverte",
        },
      ],
      SOURCE_TEXT,
    );

    expect(checked.elements).toHaveLength(1);
    expect(checked.elements[0]?.label).toBeNull();
    expect(checked.elements[0]?.evidence).toBe("hangar restait ouverte");
  });

  it("is idempotent: a checked section checked again changes nothing", () => {
    const once = verifyAnalysisSectionEvidence(
      "THEMES",
      [
        element({ kind: "FACTUAL", evidence: "les caisses" }),
        element({ kind: "FACTUAL", evidence: "un wagon citerne" }),
      ],
      SOURCE_TEXT,
    );
    const twice = verifyAnalysisSectionEvidence("THEMES", once.elements, SOURCE_TEXT);

    expect(twice.elements).toEqual(once.elements);
    expect(twice.report.corrections).toEqual([]);
  });

  it("reports counts and positions, and never a word of the text", () => {
    const checked = verifyAnalysisSectionEvidence(
      "THEMES",
      [element({ kind: "FACTUAL", evidence: "un wagon citerne" })],
      SOURCE_TEXT,
    );
    const serialised = JSON.stringify(checked.report);

    expect(serialised).not.toContain("wagon");
    expect(serialised).not.toContain("hangar");
    expect(serialised).not.toContain("énoncé");
    expect(checked.report.corrections[0]?.index).toBe(0);
  });
});
