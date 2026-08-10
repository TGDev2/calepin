/**
 * The comparison tool (CAL-053) — *un outil de comparaison de deux versions d'un
 * même prompt*.
 *
 * The fixtures are two versions of one made-up prompt rather than two shipped
 * ones, because every prompt in the registry is at version 1 today: a test that
 * could only run once there is a second version would prove nothing until the
 * day it is needed, which is the day it must already work.
 */

import { describe, expect, it } from "vitest";

import { comparePrompts, comparePromptVersions, diffText, formatPromptComparison } from "./compare";
import type { PromptDefinition } from "./types";

const V1: PromptDefinition = {
  id: "summarize-chapter",
  version: 1,
  scope: { kind: "mission", missionId: "summarize-chapter" },
  variables: [
    { name: "language", type: "text", description: "The writing language." },
    { name: "chapterText", type: "text", description: "The chapter to summarise." },
  ],
  system: "ROLE\nLANGUAGE {{language}}",
  instruction: "ASK\nBODY {{chapterText}}",
};

const V2: PromptDefinition = {
  ...V1,
  version: 2,
  variables: [
    { name: "language", type: "text", description: "The writing language." },
    { name: "chapterText", type: "text", description: "The chapter to summarise." },
    { name: "knownFacts", type: "list", description: "Facts already recorded." },
  ],
  system: "ROLE\nCONSTRAINT\nLANGUAGE {{language}}",
  instruction: "ASK\nBODY {{chapterText}}\nFACTS {{knownFacts}}",
};

describe("comparePrompts — the variable contract", () => {
  it("reports what a version added", () => {
    const comparison = comparePrompts(V1, V2);

    expect(comparison.variables.added.map((variable) => variable.name)).toEqual(["knownFacts"]);
    expect(comparison.variables.removed).toEqual([]);
    expect(comparison.identical).toBe(false);
  });

  it("reports what a version removed, reading the pair the other way round", () => {
    const comparison = comparePrompts(V2, V1);

    expect(comparison.variables.removed.map((variable) => variable.name)).toEqual(["knownFacts"]);
    expect(comparison.variables.added).toEqual([]);
    expect(comparison.from).toBe(2);
    expect(comparison.to).toBe(1);
  });

  it("reports a variable that changed shape rather than one added and one removed", () => {
    // The change that breaks a call site without changing its variable names —
    // the reason a retyping is its own category.
    const retyped: PromptDefinition = {
      ...V1,
      version: 2,
      variables: [
        { name: "language", type: "text", description: "The writing language." },
        { name: "chapterText", type: "list", description: "The chapter, in blocks." },
      ],
    };

    expect(comparePrompts(V1, retyped).variables).toMatchObject({
      added: [],
      removed: [],
      retyped: [{ name: "chapterText", from: "text", to: "list" }],
    });
  });
});

describe("comparePrompts — the text", () => {
  it("names the lines one version added and the ones it dropped", () => {
    const comparison = comparePrompts(V1, V2);

    expect(comparison.system.addedCount).toBe(1);
    expect(comparison.system.removedCount).toBe(0);
    expect(comparison.system.lines).toEqual([
      { kind: "kept", text: "ROLE" },
      { kind: "added", text: "CONSTRAINT" },
      { kind: "kept", text: "LANGUAGE {{language}}" },
    ]);
    expect(comparison.instruction.addedCount).toBe(1);
  });

  it("keeps the unchanged lines, so a clause is read in its place", () => {
    const diff = diffText("a\nb\nc", "a\nB\nc");

    expect(diff.lines.map((line) => `${line.kind}:${line.text}`)).toEqual([
      "kept:a",
      "removed:b",
      "added:B",
      "kept:c",
    ]);
    expect([diff.addedCount, diff.removedCount]).toEqual([1, 1]);
  });

  it("reports no difference between a version and itself", () => {
    expect(comparePrompts(V1, V1).identical).toBe(true);
    expect(diffText(V1.instruction, V1.instruction).addedCount).toBe(0);
  });
});

describe("comparePrompts — what it refuses", () => {
  it("refuses two different prompts", () => {
    // *Deux versions d'un même prompt* is the question that has an answer: two
    // different prompts share no variable set, so the diff would report every
    // variable added and every variable removed, and say nothing about either.
    expect(() => comparePrompts(V1, { ...V2, id: "write-scene" })).toThrowError(
      expect.objectContaining({ category: "internal" }),
    );
  });
});

describe("comparePromptVersions — over the shipped registry", () => {
  it("compares a shipped version with itself", () => {
    const comparison = comparePromptVersions("write-scene", 1, 1);

    expect(comparison).toMatchObject({ promptId: "write-scene", from: 1, to: 1, identical: true });
  });

  it("refuses a version nobody shipped", () => {
    expect(() => comparePromptVersions("write-scene", 1, 7)).toThrowError(
      expect.objectContaining({ code: "PROMPT_NOT_REGISTERED" }),
    );
  });
});

describe("formatPromptComparison", () => {
  it("leads with the variables, then marks each line of the text", () => {
    const rendered = formatPromptComparison(comparePrompts(V1, V2));

    expect(rendered).toContain("summarize-chapter: version 1 → 2");
    expect(rendered).toContain("  + knownFacts (list) — Facts already recorded.");
    expect(rendered).toContain(" + CONSTRAINT");
    expect(rendered).toContain("   ROLE");
  });

  it("says so, once, when two versions differ in nothing", () => {
    expect(formatPromptComparison(comparePrompts(V1, V1))).toContain(
      "No difference other than the version number.",
    );
  });
});
