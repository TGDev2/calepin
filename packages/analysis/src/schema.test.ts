/**
 * The analysis output contract (CAL-070, §6).
 *
 * What is worth asserting is not "Zod validates strings": it is that the shape
 * this schema accepts is exactly the shape CAL-014's rows can store (the
 * section map is total and onto, labels exist where the persistence expects
 * them), that the marker discipline is a type error rather than a habit, and
 * that the bounds refuse the one answer that matters — the source text pasted
 * where a diagnosis belongs — with an issue code the repair pass can phrase.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ANALYSIS_CHAR_CEILINGS,
  ANALYSIS_ELEMENT_COUNTS,
  ANALYSIS_ELEMENT_KINDS,
  ANALYSIS_FIXED_KINDS,
  ANALYSIS_SECTION_FIELDS,
  ANALYSIS_SECTIONS,
  ANALYSIS_TOTAL_WORD_BUDGET,
  ANALYSIS_WORD_TARGETS,
  type AnalysisElementKind,
  type AnalysisSection,
  type SourceTextAnalysis,
  sourceTextAnalysisSchema,
} from "./schema";

/** A synthetic French-shaped string of a given length. No literary content. */
function filler(chars: number): string {
  return "analyse "
    .repeat(Math.ceil(chars / 8))
    .slice(0, chars)
    .trimEnd();
}

function paragraph(
  kind: "FACTUAL" | "INTERPRETATION",
  chars = 120,
): {
  kind: string;
  statement: string;
  evidence: null;
} {
  return { kind, statement: filler(chars), evidence: null };
}

function element(kind: "FACTUAL" | "INTERPRETATION" = "FACTUAL"): Record<string, unknown> {
  return {
    kind,
    label: "Une étiquette",
    statement: "Une phrase précise, appuyée sur ce que le texte construit.",
    evidence: null,
  };
}

function omit(entry: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entry).filter(([name]) => name !== key));
}

function validAnalysis(): Record<string, unknown> {
  return {
    factualSummary: paragraph("FACTUAL", ANALYSIS_WORD_TARGETS.factualSummary * 7),
    premise: paragraph("FACTUAL"),
    mainConflict: paragraph("INTERPRETATION"),
    narrativePromise: paragraph("INTERPRETATION"),
    themes: [element("INTERPRETATION")],
    characters: [element()],
    relationships: [],
    pointOfView: [element()],
    tense: [element()],
    tone: paragraph("INTERPRETATION"),
    singularElements: [{ ...element("INTERPRETATION"), evidence: "Un extrait cité tel quel." }],
    ambiguities: [],
    openQuestions: [],
    elementsToPreserve: [element("INTERPRETATION")],
    weaknesses: [element("INTERPRETATION")],
    clicheRisks: [],
    developmentPotential: paragraph(
      "INTERPRETATION",
      ANALYSIS_WORD_TARGETS.developmentPotential * 7,
    ),
  };
}

describe("the analysis schema", () => {
  it("asks for the lengths the specification names", () => {
    expect(ANALYSIS_TOTAL_WORD_BUDGET).toBe(2_000);
    expect(ANALYSIS_WORD_TARGETS.factualSummary).toBe(200);
    expect(ANALYSIS_WORD_TARGETS.developmentPotential).toBe(200);
  });

  it("derives every character ceiling from its word target", () => {
    for (const [key, target] of Object.entries(ANALYSIS_WORD_TARGETS)) {
      expect(ANALYSIS_CHAR_CEILINGS[key as keyof typeof ANALYSIS_CHAR_CEILINGS], key).toBe(
        Math.ceil(target * 7 * 2),
      );
    }
  });

  // The two long paragraphs alone must leave most of the budget to the listed
  // sections — a diagnostic is elements, not two essays.
  it("keeps the paragraph targets well inside the total budget", () => {
    const paragraphWords =
      ANALYSIS_WORD_TARGETS.factualSummary +
      ANALYSIS_WORD_TARGETS.premise +
      ANALYSIS_WORD_TARGETS.mainConflict +
      ANALYSIS_WORD_TARGETS.narrativePromise +
      ANALYSIS_WORD_TARGETS.tone +
      ANALYSIS_WORD_TARGETS.developmentPotential;

    expect(paragraphWords).toBeLessThan(ANALYSIS_TOTAL_WORD_BUDGET / 2);
  });

  it("accepts a diagnostic of about the shape that was asked for", () => {
    const parsed = sourceTextAnalysisSchema.safeParse(validAnalysis());

    expect(parsed.success, JSON.stringify(parsed.error?.issues[0])).toBe(true);
  });

  it("accepts a paragraph that overshoots its target by half", () => {
    const analysis = validAnalysis();

    analysis["factualSummary"] = paragraph(
      "FACTUAL",
      Math.round(ANALYSIS_WORD_TARGETS.factualSummary * 7 * 1.5),
    );

    expect(sourceTextAnalysisSchema.safeParse(analysis).success).toBe(true);
  });

  // What the bound is for: a model handed a short story and asked to diagnose
  // it can paste the story into a field. That answer must fail, and with a
  // standard code — the repair pass phrases its clauses from issue codes
  // (CAL-052), and a `.refine` would come back `custom` with nothing to say.
  it("refuses the source text pasted where a diagnosis belongs", () => {
    const analysis = validAnalysis();

    analysis["factualSummary"] = paragraph("FACTUAL", 2_000 * 7);

    const parsed = sourceTextAnalysisSchema.safeParse(analysis);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.code).toBe("too_big");
    expect(parsed.error?.issues[0]?.path).toEqual(["factualSummary", "statement"]);
  });

  it("refuses an unknown key, at the root and inside an element", () => {
    expect(sourceTextAnalysisSchema.safeParse({ ...validAnalysis(), extra: 1 }).success).toBe(
      false,
    );

    const analysis = validAnalysis();

    analysis["themes"] = [{ ...element("INTERPRETATION"), extra: 1 }];
    expect(sourceTextAnalysisSchema.safeParse(analysis).success).toBe(false);
  });

  // A label belongs to a listed section and not to a paragraph one — CAL-014's
  // own distinction, enforced here by the strict object rather than by review.
  it("refuses a label on a paragraph section and demands one on a listed element", () => {
    const labelled = validAnalysis();

    labelled["premise"] = { ...paragraph("FACTUAL"), label: "Prémisse" };
    expect(sourceTextAnalysisSchema.safeParse(labelled).success).toBe(false);

    const unlabelled = validAnalysis();

    unlabelled["characters"] = [omit(element(), "label")];
    expect(sourceTextAnalysisSchema.safeParse(unlabelled).success).toBe(false);
  });

  it("fixes the marker where the section's definition decides it", () => {
    const summary = validAnalysis();

    summary["factualSummary"] = paragraph("INTERPRETATION");
    expect(sourceTextAnalysisSchema.safeParse(summary).success).toBe(false);

    const weaknesses = validAnalysis();

    weaknesses["weaknesses"] = [element("FACTUAL")];
    expect(sourceTextAnalysisSchema.safeParse(weaknesses).success).toBe(false);

    const potential = validAnalysis();

    potential["developmentPotential"] = paragraph("FACTUAL");
    expect(sourceTextAnalysisSchema.safeParse(potential).success).toBe(false);
  });

  // CAL-071 reads this list to know whose marker it may rewrite, so the list
  // has to agree with the schema in both directions rather than describe it
  // from memory: a section named here must refuse the other marker, and a
  // section left out must accept both.
  it("lists exactly the sections whose marker the schema fixes", () => {
    for (const section of ANALYSIS_SECTIONS) {
      const field = ANALYSIS_SECTION_FIELDS[section];
      const fixed: AnalysisElementKind | undefined = (
        ANALYSIS_FIXED_KINDS as Partial<Record<AnalysisSection, AnalysisElementKind>>
      )[section];

      for (const kind of ANALYSIS_ELEMENT_KINDS) {
        const analysis = validAnalysis();
        const listed = Array.isArray(analysis[field]);

        analysis[field] = listed ? [element(kind)] : paragraph(kind);

        expect(sourceTextAnalysisSchema.safeParse(analysis).success, `${section} ${kind}`).toBe(
          fixed === undefined || fixed === kind,
        );
      }
    }
  });

  it("lets a section be empty only where absence is meaningful", () => {
    for (const [field, counts] of Object.entries(ANALYSIS_ELEMENT_COUNTS)) {
      const analysis = validAnalysis();

      analysis[field] = [];

      expect(sourceTextAnalysisSchema.safeParse(analysis).success, field).toBe(counts.min === 0);
    }
  });

  it("demands the evidence key and accepts its null", () => {
    const analysis = validAnalysis();

    analysis["premise"] = omit(paragraph("FACTUAL"), "evidence");
    expect(sourceTextAnalysisSchema.safeParse(analysis).success).toBe(false);
  });

  // What CAL-073+'s persistence walks: total over the enum mirror (the
  // `satisfies` in schema.ts), onto the output fields (here), and in the
  // enum's own order — which is the display order.
  it("maps the seventeen sections onto the seventeen fields, in order", () => {
    const fields = Object.values(ANALYSIS_SECTION_FIELDS);

    expect(Object.keys(ANALYSIS_SECTION_FIELDS)).toEqual([...ANALYSIS_SECTIONS]);
    expect(fields).toEqual(Object.keys(sourceTextAnalysisSchema.shape));
    expect(new Set(fields).size).toBe(ANALYSIS_SECTIONS.length);
    expect(ANALYSIS_ELEMENT_KINDS).toEqual(["FACTUAL", "INTERPRETATION"]);
  });

  // The schema travels to the provider as `output_config.format` json_schema
  // (`create-model-port.ts`), where an inexpressible construct throws at call
  // time. Prove expressibility at test time instead.
  it("is expressible as the JSON Schema the provider is sent", () => {
    expect(() => z.toJSONSchema(sourceTextAnalysisSchema)).not.toThrow();
  });

  it("derives the TypeScript type from the schema", () => {
    const parsed: SourceTextAnalysis = sourceTextAnalysisSchema.parse(validAnalysis());

    expect(parsed.factualSummary.kind).toBe("FACTUAL");
  });
});
