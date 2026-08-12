import { describe, expect, it } from "vitest";
import { z } from "zod";

import { PART_COUNT_RANGE } from "../target-length/calibrate";
import { aPartStructure, aPartStructureInput } from "./fixtures";
import {
  PART_CHAR_CEILINGS,
  PART_LIST_COUNTS,
  PART_WORD_TARGETS,
  partStructureInputSchema,
  partStructureSchema,
} from "./schema";

/**
 * The walker `timeline/schema.test.ts` uses — a numeric field anywhere in the
 * answer is a score waiting to be asked for, so every path is enumerated and
 * pinned.
 */
function numericPaths(schema: unknown, path: string): string[] {
  if (schema instanceof z.ZodNumber) return [path];
  if (schema instanceof z.ZodNullable) return numericPaths(schema.unwrap(), path);
  if (schema instanceof z.ZodArray) return numericPaths(schema.element, `${path}[]`);
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([key, member]) =>
      numericPaths(member, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

describe("partStructureSchema", () => {
  it("accepts a complete part structure", () => {
    expect(partStructureSchema.safeParse(aPartStructure()).success).toBe(true);
  });

  /**
   * **No score, structurally** (cahier des charges 1195–1199), with the
   * carve-out that is not one: a thread index is a position in the answer's
   * own list, and a position measures nothing.
   */
  it("holds no number that is not a thread index", () => {
    expect(numericPaths(partStructureSchema, "")).toEqual(["parts[].threadIndexes[]"]);
  });

  // The subset discipline: the indexes' lower bound is a `.check()`, so the
  // only `minimum` keywords in the derived JSON Schema are the safe-integer
  // bounds `z.int()` itself declares — none of ours entered untested
  // (CAL-090's move) — and no `pattern` anywhere (CAL-088's, against `.regex`).
  it("derives a JSON Schema with no minimum of ours and no pattern keyword", () => {
    const derived = JSON.stringify(z.toJSONSchema(partStructureSchema));

    expect(derived).not.toContain('"pattern"');
    const minimums = [...derived.matchAll(/"minimum":(-?\d+)/gu)].map((match) => match[1]);
    expect(new Set(minimums)).toEqual(new Set(["-9007199254740991"]));
  });

  it("derives every character ceiling from its word target, once", () => {
    for (const field of Object.keys(PART_WORD_TARGETS) as (keyof typeof PART_WORD_TARGETS)[]) {
      expect(PART_CHAR_CEILINGS[field]).toBe(Math.ceil(PART_WORD_TARGETS[field] * 7 * 2));
    }
  });

  it("bounds the parts by the calibration's own envelope", () => {
    const structure = aPartStructure();

    const single = { ...structure, parts: structure.parts.slice(0, PART_COUNT_RANGE.min - 1) };
    expect(partStructureSchema.safeParse(single).success).toBe(false);

    const firstPart = structure.parts[0];
    if (firstPart === undefined) throw new Error("the fixture holds no part");
    const crowded = {
      ...structure,
      parts: Array.from({ length: PART_COUNT_RANGE.max + 1 }, (unused, index) => ({
        ...firstPart,
        title: `Partie ${String(index)}`,
      })),
    };
    expect(partStructureSchema.safeParse(crowded).success).toBe(false);
  });

  it("bounds the threads by the contract's own floor", () => {
    const structure = aPartStructure();
    const oneThread = {
      ...structure,
      threads: structure.threads.slice(0, PART_LIST_COUNTS.threads.min - 1),
    };

    expect(partStructureSchema.safeParse(oneThread).success).toBe(false);
  });

  it("refuses a negative thread index", () => {
    const structure = aPartStructure();
    const firstPart = structure.parts[0];
    if (firstPart === undefined) throw new Error("the fixture holds no part");
    firstPart.threadIndexes = [-1, 0];

    expect(partStructureSchema.safeParse(structure).success).toBe(false);
  });

  it("refuses an index past the declared threads", () => {
    const structure = aPartStructure();
    const firstPart = structure.parts[0];
    if (firstPart === undefined) throw new Error("the fixture holds no part");
    firstPart.threadIndexes = [0, structure.threads.length];

    expect(partStructureSchema.safeParse(structure).success).toBe(false);
  });

  it("refuses a part concerned by no thread", () => {
    const structure = aPartStructure();
    const firstPart = structure.parts[0];
    if (firstPart === undefined) throw new Error("the fixture holds no part");
    firstPart.threadIndexes = [];

    expect(partStructureSchema.safeParse(structure).success).toBe(false);
  });

  it("refuses a tipping point whose irreversibility is empty", () => {
    const structure = aPartStructure();
    const firstPart = structure.parts[0];
    if (firstPart === undefined) throw new Error("the fixture holds no part");
    firstPart.tippingPoint = { ...firstPart.tippingPoint, irreversibility: " " };

    expect(partStructureSchema.safeParse(structure).success).toBe(false);
  });

  it("refuses an unknown key", () => {
    expect(partStructureSchema.safeParse({ ...aPartStructure(), score: 5 }).success).toBe(false);
  });
});

describe("partStructureInputSchema", () => {
  it("accepts the canonical ask", () => {
    expect(partStructureInputSchema.safeParse(aPartStructureInput()).success).toBe(true);
  });

  it("refuses a source key offered twice", () => {
    const input = aPartStructureInput();
    const firstSource = input.sources[0];
    if (firstSource === undefined) throw new Error("the fixture holds no source");
    input.sources = [...input.sources, { ...firstSource, text: "Un autre passage." }];

    expect(partStructureInputSchema.safeParse(input).success).toBe(false);
  });

  it("refuses a character offered twice", () => {
    const input = aPartStructureInput();
    const firstMember = input.characters[0];
    if (firstMember === undefined) throw new Error("the fixture holds no character");
    input.characters = [...input.characters, { ...firstMember }];

    expect(partStructureInputSchema.safeParse(input).success).toBe(false);
  });

  it("refuses a planned event offered twice", () => {
    const input = aPartStructureInput();
    const firstEvent = input.plannedEvents[0];
    if (firstEvent === undefined) throw new Error("the fixture holds no event");
    input.plannedEvents = [...input.plannedEvents, { ...firstEvent }];

    expect(partStructureInputSchema.safeParse(input).success).toBe(false);
  });

  it("refuses a non-positive target word count", () => {
    expect(
      partStructureInputSchema.safeParse({ ...aPartStructureInput(), targetWordCount: 0 }).success,
    ).toBe(false);
  });
});
