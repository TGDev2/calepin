import { describe, expect, it } from "vitest";
import { z } from "zod";

import { aConstraint, aSource, aStyle, aStyleInput } from "./fixtures";
import {
  bibleStyleInputSchema,
  operationalStyleSchema,
  STYLE_CHAR_CEILINGS,
  STYLE_FIELD_LABELS,
  STYLE_FIELDS,
  STYLE_LIST_COUNTS,
  STYLE_SCALAR_FIELDS,
  STYLE_SOURCE_COUNTS,
  STYLE_SOURCE_KINDS,
  STYLE_WORD_TARGETS,
  styleConstraintSchema,
} from "./schema";

const shape = operationalStyleSchema.shape;

describe("operationalStyleSchema", () => {
  it("accepts a complete style section", () => {
    expect(operationalStyleSchema.safeParse(aStyle()).success).toBe(true);
  });

  it("carries the nine fields BibleStyle stores, and no more", () => {
    expect(Object.keys(shape).sort()).toEqual([
      "descriptiveDensity",
      "dialogueBalance",
      "elementsToAvoid",
      "focalization",
      "languageRegister",
      "pacing",
      "pointOfView",
      "recurringMotifs",
      "tense",
    ]);
  });

  it("refuses a bare description where a constraint belongs", () => {
    // The acceptance criterion as a shape: an element is a rule paired with
    // its observable breach, never one free text a decorative adjective could
    // fill.
    expect(
      operationalStyleSchema.safeParse({ ...aStyle(), pacing: "Un rythme vif et nerveux." })
        .success,
    ).toBe(false);
  });

  it.each(["rule", "violation"] as const)("refuses a constraint with no %s", (part) => {
    const style = aStyle();
    const pair = { ...style.tense, [part]: undefined };

    expect(operationalStyleSchema.safeParse({ ...style, tense: pair }).success).toBe(false);
  });

  it("refuses a null violation — an unbreakable rule is not a rule", () => {
    const style = aStyle();

    expect(
      operationalStyleSchema.safeParse({
        ...style,
        pointOfView: { rule: style.pointOfView.rule, violation: null },
      }).success,
    ).toBe(false);
  });

  it("refuses a list entry that is not a constraint pair", () => {
    const style = aStyle();

    expect(
      operationalStyleSchema.safeParse({
        ...style,
        elementsToAvoid: [...style.elementsToAvoid.slice(0, -1), "les clichés"],
      }).success,
    ).toBe(false);
  });

  it("refuses fewer motifs than the minimum", () => {
    const style = aStyle();

    expect(
      operationalStyleSchema.safeParse({
        ...style,
        recurringMotifs: style.recurringMotifs.slice(0, STYLE_LIST_COUNTS.recurringMotifs.min - 1),
      }).success,
    ).toBe(false);
  });

  it("refuses more motifs than the ceiling", () => {
    const tooMany = Array.from({ length: STYLE_LIST_COUNTS.recurringMotifs.max + 1 }, () =>
      aConstraint(),
    );

    expect(
      operationalStyleSchema.safeParse({ ...aStyle(), recurringMotifs: tooMany }).success,
    ).toBe(false);
  });

  it("refuses fewer elements to avoid than the minimum", () => {
    const style = aStyle();

    expect(
      operationalStyleSchema.safeParse({
        ...style,
        elementsToAvoid: style.elementsToAvoid.slice(0, STYLE_LIST_COUNTS.elementsToAvoid.min - 1),
      }).success,
    ).toBe(false);
  });

  it("refuses more elements to avoid than the ceiling", () => {
    const tooMany = Array.from({ length: STYLE_LIST_COUNTS.elementsToAvoid.max + 1 }, () =>
      aConstraint(),
    );

    expect(
      operationalStyleSchema.safeParse({ ...aStyle(), elementsToAvoid: tooMany }).success,
    ).toBe(false);
  });

  it("refuses an unknown field — the object is strict", () => {
    expect(operationalStyleSchema.safeParse({ ...aStyle(), styleScore: 7 }).success).toBe(false);
  });

  it("bounds both halves of a constraint", () => {
    const style = aStyle();

    expect(
      operationalStyleSchema.safeParse({
        ...style,
        pacing: { ...style.pacing, rule: "a".repeat(STYLE_CHAR_CEILINGS.rule + 1) },
      }).success,
    ).toBe(false);
    expect(
      operationalStyleSchema.safeParse({
        ...style,
        pacing: { ...style.pacing, violation: "a".repeat(STYLE_CHAR_CEILINGS.violation + 1) },
      }).success,
    ).toBe(false);
  });

  it("declares no numeric field anywhere — no score, structurally", () => {
    // The cahier des charges (1195-1199) forbids a number presented as a
    // measure of quality. The contract closes the door on the shape, as
    // CAL-075, CAL-076, CAL-079, CAL-081 and CAL-088 already do.
    for (const [name, field] of Object.entries(shape)) {
      if (field instanceof z.ZodArray) {
        expect(field.element instanceof z.ZodObject, `${name} item`).toBe(true);
        continue;
      }

      expect(field instanceof z.ZodObject, name).toBe(true);
    }

    for (const [part, field] of Object.entries(styleConstraintSchema.shape)) {
      expect(field instanceof z.ZodString, part).toBe(true);
    }
  });
});

describe("the field vocabulary", () => {
  it("names every key of the contract, with a list's entries in the singular", () => {
    const scalars = Object.keys(shape).filter(
      (key) => key !== "recurringMotifs" && key !== "elementsToAvoid",
    );

    expect([...STYLE_FIELDS].sort()).toEqual(
      [...scalars, "recurringMotif", "elementToAvoid"].sort(),
    );
  });

  it("lists the scalar fields in contract order", () => {
    expect([...STYLE_SCALAR_FIELDS]).toEqual(
      Object.keys(shape).filter((key) => key !== "recurringMotifs" && key !== "elementsToAvoid"),
    );
  });

  it("labels every field", () => {
    for (const field of STYLE_FIELDS) {
      expect(STYLE_FIELD_LABELS[field]).toMatch(/\S/);
    }
  });

  it("derives every character ceiling from its own word target", () => {
    for (const concept of Object.keys(STYLE_WORD_TARGETS)) {
      const key = concept as keyof typeof STYLE_WORD_TARGETS;

      expect(STYLE_CHAR_CEILINGS[key]).toBeGreaterThan(STYLE_WORD_TARGETS[key]);
    }
  });
});

describe("bibleStyleInputSchema", () => {
  it("accepts a complete ask", () => {
    expect(bibleStyleInputSchema.safeParse(aStyleInput()).success).toBe(true);
  });

  it("names the source text version and the direction the ask was built on", () => {
    const parsed = bibleStyleInputSchema.parse(aStyleInput());

    expect(parsed.sourceTextVersionId).toMatch(/\S/);
    expect(parsed.directionId).toMatch(/\S/);
  });

  it("refuses the same source key twice — one ask digests once", () => {
    const input = aStyleInput();
    const parsed = bibleStyleInputSchema.safeParse({
      ...input,
      sources: [...input.sources, aSource()],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["sources", input.sources.length, "key"]);
  });

  it("refuses a corpus below the minimum", () => {
    const input = aStyleInput();

    expect(
      bibleStyleInputSchema.safeParse({
        ...input,
        sources: input.sources.slice(0, STYLE_SOURCE_COUNTS.min - 1),
      }).success,
    ).toBe(false);
  });

  it("refuses a source of an unknown kind", () => {
    const input = aStyleInput();

    expect(
      bibleStyleInputSchema.safeParse({
        ...input,
        sources: [...input.sources, { ...aSource(), key: "outline.arc", kind: "outline" }],
      }).success,
    ).toBe(false);
  });

  it("refuses an ask with no declared readership", () => {
    // CAL-045: the audience surfaces in the style section, so the ask cannot
    // omit it — the register would be re-decided instead of derived.
    const withoutAudience: Partial<ReturnType<typeof aStyleInput>> = { ...aStyleInput() };
    delete withoutAudience.targetAudience;

    expect(bibleStyleInputSchema.safeParse(withoutAudience).success).toBe(false);
  });

  it("carries no target word count — no style field reads a length", () => {
    expect(
      bibleStyleInputSchema.safeParse({ ...aStyleInput(), targetWordCount: 70_000 }).success,
    ).toBe(false);
  });

  it("knows the three upstreams a style section answers to", () => {
    expect([...STYLE_SOURCE_KINDS]).toEqual(["direction", "identity", "analysis"]);
  });
});
