/**
 * The classification CAL-052 turns on: *erreur de forme* against *erreur de
 * fond*. Getting it wrong in one direction burns budget on an answer no retry
 * can fix; getting it wrong in the other abandons an answer one clause would
 * have corrected.
 *
 * Every fixture here is structural — counts, codes, ranks, labels — so no case
 * in this file can hold anything a reader could read as part of a novel (§9).
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildRepairPrompt, classifyOutputFailure, type OutputFailureKind } from "./repair";

const CONTRACT = z.object({
  itemCount: z.number(),
  label: z.string(),
});

const NESTED = z.object({
  entries: z.array(z.object({ code: z.string(), rank: z.number() })).min(1),
});

function contractOf(schema: z.ZodType<unknown>): Readonly<Record<string, unknown>> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

function issuesOf(schema: z.ZodType<unknown>, value: unknown): readonly z.core.$ZodIssue[] {
  const parsed = schema.safeParse(value);

  if (parsed.success) {
    throw new Error("the fixture was expected to fail the schema, and did not");
  }

  return parsed.error.issues;
}

function classify(schema: z.ZodType<unknown>, value: unknown): OutputFailureKind {
  return classifyOutputFailure(issuesOf(schema, value), value, contractOf(schema));
}

describe("classifyOutputFailure — an answer that is not of the contract's kind", () => {
  // The model did not attempt the contract. Re-asking the same question the
  // same way returns the same answer, so no repair is spent on it.
  it.each([
    ["a bare string", "not a json object"],
    ["an array", [1, 2, 3]],
    ["a null", null],
    ["a number", 7],
    // What the adapter hands over when the body did not parse as JSON at all.
    ["no json at all", undefined],
  ])("calls %s off-topic", (_label, value) => {
    expect(classify(CONTRACT, value)).toBe("off-topic");
  });
});

describe("classifyOutputFailure — an answer that shares no field with the contract", () => {
  it("calls an empty object off-topic", () => {
    expect(classify(CONTRACT, {})).toBe("off-topic");
  });

  it("calls an object of entirely different fields off-topic", () => {
    // A refusal, or an answer to some other question, wearing its own shape.
    expect(classify(CONTRACT, { status: "declined", reason: 3 })).toBe("off-topic");
  });
});

describe("classifyOutputFailure — an answer that attempted the contract", () => {
  it("calls a missing field a form failure", () => {
    expect(classify(CONTRACT, { itemCount: 3 })).toBe("malformed");
  });

  it("calls a wrong type a form failure", () => {
    expect(classify(CONTRACT, { itemCount: "three", label: "a" })).toBe("malformed");
  });

  it("calls a wrong type deep inside a form failure", () => {
    expect(classify(NESTED, { entries: [{ code: "a", rank: "high" }] })).toBe("malformed");
  });

  it("calls a value outside an enum a form failure", () => {
    const schema = z.object({ kind: z.enum(["factual", "interpretation"]) });

    expect(classify(schema, { kind: "other" })).toBe("malformed");
  });

  it("calls a failed refinement a form failure", () => {
    // A domain's own semantic constraint. It is field-located, so it takes the
    // repair path like any other field failure — semantic off-topic is the
    // domain's problem, never this layer's (§5.7).
    const schema = z.object({ code: z.string().refine((value) => value.length > 3) });

    expect(classify(schema, { code: "ab" })).toBe("malformed");
  });

  it("calls an unrecognised key a form failure, though Zod reports it at the root", () => {
    // The carve-out the classifier exists to get right: a root-located issue
    // that is nonetheless about one field, and one of the most repairable
    // there is — drop the key.
    const schema = z.strictObject({ itemCount: z.number() });

    expect(classify(schema, { itemCount: 1, extra: "surplus" })).toBe("malformed");
  });

  it("calls an empty list where the contract requires one a form failure", () => {
    // Root-located too, but a bound rather than a kind: the answer *is* a list.
    expect(classify(NESTED, { entries: [] })).toBe("malformed");
  });

  it("holds for a contract whose root is a list", () => {
    const schema = z.array(z.object({ code: z.string() }));

    expect(classify(schema, [{ code: 1 }])).toBe("malformed");
    expect(classify(schema, { entries: [] })).toBe("off-topic");
  });
});

describe("buildRepairPrompt", () => {
  const value = { itemCount: "three" };
  const prompt = (): string =>
    buildRepairPrompt({ prompt: "MISSION REQUEST", value, issues: issuesOf(CONTRACT, value) });

  it("asks the mission again, rather than in place of it", () => {
    expect(prompt()).toContain("MISSION REQUEST");
  });

  it("carries the rejected answer back", () => {
    // The provider call is stateless: without this, the model has nothing to
    // correct and the pass is a blind re-ask wearing a repair's name.
    expect(prompt()).toContain('{"itemCount":"three"}');
  });

  it("names each violation by path and by what the schema expected", () => {
    const text = prompt();

    expect(text).toContain("- itemCount : type attendu « number »");
    expect(text).toContain("- label : type attendu « string »");
  });

  it("names the keys to drop when the schema recognised none of them", () => {
    const schema = z.strictObject({ itemCount: z.number() });
    const rejected = { itemCount: 1, extra: 2, surplus: 3 };

    const text = buildRepairPrompt({
      prompt: "MISSION REQUEST",
      value: rejected,
      issues: issuesOf(schema, rejected),
    });

    expect(text).toContain("clés non prévues par le schéma, à retirer : « extra », « surplus »");
  });

  it("states the bound a list missed", () => {
    const rejected = { entries: [] };

    expect(
      buildRepairPrompt({
        prompt: "MISSION REQUEST",
        value: rejected,
        issues: issuesOf(NESTED, rejected),
      }),
    ).toContain("- entries : minimum attendu : 1");
  });

  it("never copies a validator's message", () => {
    // `@calepin/shared/errors` refuses that bridge for errors, and a
    // refinement's message is the one clause a domain could write around the
    // value that failed. The clause states the constraint, not the wording.
    const schema = z.object({
      code: z.string().refine((entry) => entry.length > 3, "REFINEMENT WORDING"),
    });
    const rejected = { code: "ab" };

    const text = buildRepairPrompt({
      prompt: "MISSION REQUEST",
      value: rejected,
      issues: issuesOf(schema, rejected),
    });

    expect(text).not.toContain("REFINEMENT WORDING");
    expect(text).toContain("- code : contrainte du schéma non satisfaite");
  });

  it("caps the clauses, so a wholly wrong answer cannot inflate the next prompt", () => {
    const wide = z.object(
      Object.fromEntries([...Array(30).keys()].map((i) => [`f${i}`, z.number()])),
    );
    const rejected = Object.fromEntries([...Array(30).keys()].map((i) => [`f${i}`, "x"]));

    const clauses = buildRepairPrompt({
      prompt: "MISSION REQUEST",
      value: rejected,
      issues: issuesOf(wide, rejected),
    })
      .split("\n")
      .filter((line) => line.startsWith("- "));

    expect(clauses).toHaveLength(10);
  });
});
