/**
 * The repair re-ask, as a prompt (CAL-052's mechanism, CAL-053's resource).
 *
 * Two claims are under test and they are different: that the pass carries what
 * a model needs to correct its answer, and that it carries nothing a validator
 * put a *value* into. The second is the one §6 and §9 both care about.
 *
 * Every fixture here is structural — counts, codes, labels — so no case in this
 * file can hold anything a reader could read as part of a novel (§9).
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { deriveRepairPrompt } from "./repair";
import { fixedPrompt } from "./testing";
import { isRenderedPrompt } from "./types";

const CONTRACT = z.object({ itemCount: z.number(), label: z.string() });
const NESTED = z.object({
  entries: z.array(z.object({ code: z.string(), rank: z.number() })).min(1),
});

const ORIGINAL = fixedPrompt("extract-facts", { system: "SYSTEM", text: "MISSION REQUEST" });

function issuesOf(schema: z.ZodType<unknown>, value: unknown): readonly z.core.$ZodIssue[] {
  const parsed = schema.safeParse(value);

  if (parsed.success) {
    throw new Error("the fixture was expected to fail the schema, and did not");
  }

  return parsed.error.issues;
}

function repaired(schema: z.ZodType<unknown>, value: unknown): string {
  return deriveRepairPrompt({ original: ORIGINAL, value, issues: issuesOf(schema, value) }).text;
}

describe("deriveRepairPrompt", () => {
  it("asks the mission again, rather than in place of it", () => {
    expect(repaired(CONTRACT, { itemCount: "three" })).toContain("MISSION REQUEST");
  });

  it("carries the rejected answer back", () => {
    // The provider call is stateless: without this, the model has nothing to
    // correct and the pass is a blind re-ask wearing a repair's name.
    expect(repaired(CONTRACT, { itemCount: "three" })).toContain('{"itemCount":"three"}');
  });

  it("names each violation by path and by what the schema expected", () => {
    const text = repaired(CONTRACT, { itemCount: "three" });

    expect(text).toContain("- itemCount : type attendu « number »");
    expect(text).toContain("- label : type attendu « string »");
  });

  it("names the keys to drop when the schema recognised none of them", () => {
    const schema = z.strictObject({ itemCount: z.number() });

    expect(repaired(schema, { itemCount: 1, extra: 2, surplus: 3 })).toContain(
      "clés non prévues par le schéma, à retirer : « extra », « surplus »",
    );
  });

  it("states the bound a list missed", () => {
    expect(repaired(NESTED, { entries: [] })).toContain("- entries : minimum attendu : 1");
  });

  it("says something even when the answer would not serialise", () => {
    // What the adapter hands over when the body did not parse as JSON at all:
    // `JSON.stringify` answers with nothing, and a prompt with a hole in it is
    // what the fallback exists to prevent.
    expect(repaired(CONTRACT, undefined)).toContain("null");
  });

  it("never copies a validator's message", () => {
    // `@calepin/shared/errors` refuses that bridge for errors, and a
    // refinement's message is the one clause a domain could write around the
    // value that failed. The clause states the constraint, not the wording.
    const schema = z.object({
      code: z.string().refine((entry) => entry.length > 3, "REFINEMENT WORDING"),
    });
    const text = repaired(schema, { code: "ab" });

    expect(text).not.toContain("REFINEMENT WORDING");
    expect(text).toContain("- code : contrainte du schéma non satisfaite");
  });

  it("caps the clauses, so a wholly wrong answer cannot inflate the next prompt", () => {
    const wide = z.object(
      Object.fromEntries([...Array(30).keys()].map((index) => [`f${index}`, z.number()])),
    );
    const rejected = Object.fromEntries([...Array(30).keys()].map((index) => [`f${index}`, "x"]));

    const clauses = repaired(wide, rejected)
      .split("\n")
      .filter((line) => line.startsWith("- "));

    expect(clauses).toHaveLength(10);
  });
});

describe("deriveRepairPrompt — the identity of the pass", () => {
  it("keeps the mission prompt's id, version and mission", () => {
    // The repair is still the mission's pass, and `GenerationAttempt` has one
    // `promptVersion` column: recording this resource's own version there would
    // attribute the answer to the wrong prompt (CAL-053).
    const derived = deriveRepairPrompt({
      original: ORIGINAL,
      value: { itemCount: "three" },
      issues: issuesOf(CONTRACT, { itemCount: "three" }),
    });

    expect(derived.promptId).toBe(ORIGINAL.promptId);
    expect(derived.version).toBe(ORIGINAL.version);
    expect(derived.missionId).toBe("extract-facts");
    expect(derived.system).toBe(ORIGINAL.system);
  });

  it("stays a rendered prompt, so the port still accepts it", () => {
    const derived = deriveRepairPrompt({
      original: ORIGINAL,
      value: {},
      issues: issuesOf(CONTRACT, {}),
    });

    expect(derived.text.startsWith(ORIGINAL.text)).toBe(true);
    // The brand survives the derivation — otherwise the port would refuse the
    // repair pass it just built.
    expect(isRenderedPrompt(derived)).toBe(true);
  });
});
