import { describe, expect, it } from "vitest";
import { z } from "zod";

import { anAxis, anIdentity, anIdentityInput, aSource } from "./fixtures";
import {
  IDENTITY_SOURCE_KINDS,
  NOVEL_IDENTITY_CHAR_CEILINGS,
  NOVEL_IDENTITY_FIELD_LABELS,
  NOVEL_IDENTITY_FIELDS,
  NOVEL_IDENTITY_SCALAR_FIELDS,
  NOVEL_IDENTITY_SOURCE_COUNTS,
  NOVEL_IDENTITY_THEME_COUNTS,
  NOVEL_IDENTITY_WORD_TARGETS,
  novelIdentityInputSchema,
  tracedNovelIdentitySchema,
} from "./schema";

const shape = tracedNovelIdentitySchema.shape;

describe("tracedNovelIdentitySchema", () => {
  it("accepts a complete identity", () => {
    expect(tracedNovelIdentitySchema.safeParse(anIdentity()).success).toBe(true);
  });

  it("carries the nine fields BibleIdentity stores, and no more", () => {
    // Eight keys, because the two thematic columns are one paired list — the
    // one place the contract deliberately does not mirror a column.
    expect(Object.keys(shape).sort()).toEqual([
      "centralQuestion",
      "endingNature",
      "genre",
      "narrativePromise",
      "subGenre",
      "thematicAxes",
      "tone",
      "workingTitle",
    ]);
  });

  it("carries no field for the target audience or the target length", () => {
    // Both are Project columns the author already set. A model-authored copy
    // would be the second answer able to disagree with their own choice.
    const keys = Object.keys(shape);

    expect(keys).not.toContain("targetAudience");
    expect(keys).not.toContain("targetLength");
    expect(keys).not.toContain("targetWordCount");
  });

  it("refuses a field with no basis", () => {
    const identity = anIdentity();

    expect(
      tracedNovelIdentitySchema.safeParse({
        ...identity,
        genre: { value: identity.genre.value },
      }).success,
    ).toBe(false);
  });

  it("refuses a null basis — traceability has no absent case", () => {
    const identity = anIdentity();

    expect(
      tracedNovelIdentitySchema.safeParse({
        ...identity,
        workingTitle: { value: identity.workingTitle.value, basis: null },
      }).success,
    ).toBe(false);
  });

  it.each(["sourceKey", "quotation", "justification"] as const)(
    "refuses a basis with no %s",
    (part) => {
      const identity = anIdentity();
      const basis = { ...identity.tone.basis, [part]: undefined };

      expect(
        tracedNovelIdentitySchema.safeParse({
          ...identity,
          tone: { value: identity.tone.value, basis },
        }).success,
      ).toBe(false);
    },
  );

  it("refuses a central question that is not written as a question", () => {
    const identity = anIdentity();
    const parsed = tracedNovelIdentitySchema.safeParse({
      ...identity,
      centralQuestion: { ...identity.centralQuestion, value: "Ce qu'une promesse coûte." },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["centralQuestion", "value"]);
  });

  it("refuses fewer thematic axes than the minimum", () => {
    const identity = anIdentity();

    expect(
      tracedNovelIdentitySchema.safeParse({
        ...identity,
        thematicAxes: identity.thematicAxes.slice(0, NOVEL_IDENTITY_THEME_COUNTS.min - 1),
      }).success,
    ).toBe(false);
  });

  it("refuses more thematic axes than the ceiling", () => {
    const identity = anIdentity();
    const tooMany = Array.from({ length: NOVEL_IDENTITY_THEME_COUNTS.max + 1 }, () => anAxis());

    expect(
      tracedNovelIdentitySchema.safeParse({ ...identity, thematicAxes: tooMany }).success,
    ).toBe(false);
  });

  it("refuses a counter-theme with no basis of its own", () => {
    const identity = anIdentity();
    const axis = anAxis();

    expect(
      tracedNovelIdentitySchema.safeParse({
        ...identity,
        thematicAxes: [
          { theme: axis.theme, counterTheme: { value: axis.counterTheme.value } },
          axis,
        ],
      }).success,
    ).toBe(false);
  });

  it("refuses an unknown field — the object is strict", () => {
    expect(
      tracedNovelIdentitySchema.safeParse({ ...anIdentity(), originalityScore: 7 }).success,
    ).toBe(false);
  });

  it("bounds every prose field", () => {
    const identity = anIdentity();

    expect(
      tracedNovelIdentitySchema.safeParse({
        ...identity,
        tone: { ...identity.tone, value: "a".repeat(NOVEL_IDENTITY_CHAR_CEILINGS.tone + 1) },
      }).success,
    ).toBe(false);
  });

  it("declares no numeric field anywhere — no score, structurally", () => {
    // The cahier des charges (1195-1199) forbids a number presented as a
    // measure of quality or originality. The contract closes the door on the
    // shape, as CAL-075, CAL-076, CAL-079 and CAL-081 already do.
    for (const [name, field] of Object.entries(shape)) {
      if (field instanceof z.ZodArray) {
        expect(field.element instanceof z.ZodObject, `${name} item`).toBe(true);
        continue;
      }

      expect(field instanceof z.ZodObject, name).toBe(true);
    }

    for (const traced of tracedFields()) {
      expect(traced.shape.value instanceof z.ZodString).toBe(true);

      for (const [part, field] of Object.entries(traced.shape.basis.shape)) {
        expect(field instanceof z.ZodString, part).toBe(true);
      }
    }
  });
});

/** Every `{ value, basis }` object in the contract — the seven scalars and the axes' four. */
function tracedFields() {
  const axis = shape.thematicAxes.element;

  return [
    ...NOVEL_IDENTITY_SCALAR_FIELDS.map((field) => shape[field]),
    axis.shape.theme,
    axis.shape.counterTheme,
  ];
}

describe("the field vocabulary", () => {
  it("names every key of the contract, with the two thematic halves apart", () => {
    const scalars = Object.keys(shape).filter((key) => key !== "thematicAxes");

    expect([...NOVEL_IDENTITY_FIELDS].sort()).toEqual([...scalars, "theme", "counterTheme"].sort());
  });

  it("lists the scalar fields in contract order", () => {
    expect([...NOVEL_IDENTITY_SCALAR_FIELDS]).toEqual(
      Object.keys(shape).filter((key) => key !== "thematicAxes"),
    );
  });

  it("labels every field", () => {
    for (const field of NOVEL_IDENTITY_FIELDS) {
      expect(NOVEL_IDENTITY_FIELD_LABELS[field]).toMatch(/\S/);
    }
  });

  it("derives every character ceiling from its own word target", () => {
    for (const concept of Object.keys(NOVEL_IDENTITY_WORD_TARGETS)) {
      const key = concept as keyof typeof NOVEL_IDENTITY_WORD_TARGETS;

      expect(NOVEL_IDENTITY_CHAR_CEILINGS[key]).toBeGreaterThan(NOVEL_IDENTITY_WORD_TARGETS[key]);
    }
  });
});

describe("novelIdentityInputSchema", () => {
  it("accepts a complete ask", () => {
    expect(novelIdentityInputSchema.safeParse(anIdentityInput()).success).toBe(true);
  });

  it("names the source text version and the direction the ask was built on", () => {
    const parsed = novelIdentityInputSchema.parse(anIdentityInput());

    expect(parsed.sourceTextVersionId).toMatch(/\S/);
    expect(parsed.directionId).toMatch(/\S/);
  });

  it("refuses the same source key twice — one ask digests once", () => {
    const input = anIdentityInput();
    const parsed = novelIdentityInputSchema.safeParse({
      ...input,
      sources: [...input.sources, aSource()],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["sources", input.sources.length, "key"]);
  });

  it("refuses a corpus below the minimum", () => {
    const input = anIdentityInput();

    expect(
      novelIdentityInputSchema.safeParse({
        ...input,
        sources: input.sources.slice(0, NOVEL_IDENTITY_SOURCE_COUNTS.min - 1),
      }).success,
    ).toBe(false);
  });

  it("refuses a source of an unknown kind", () => {
    const input = anIdentityInput();

    expect(
      novelIdentityInputSchema.safeParse({
        ...input,
        sources: [...input.sources, { ...aSource(), key: "bible.identity", kind: "bible" }],
      }).success,
    ).toBe(false);
  });

  it("refuses a target word count that is not a positive integer", () => {
    for (const targetWordCount of [0, -1, 60_000.5]) {
      expect(
        novelIdentityInputSchema.safeParse({ ...anIdentityInput(), targetWordCount }).success,
      ).toBe(false);
    }
  });

  it("knows only the two upstreams the backlog names", () => {
    expect([...IDENTITY_SOURCE_KINDS]).toEqual(["direction", "analysis"]);
  });
});
