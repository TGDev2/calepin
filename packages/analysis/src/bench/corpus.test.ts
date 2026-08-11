/**
 * The reference corpus is a checked property, not a claim in a comment
 * (CAL-078). No network, no model call (§8) — this is data validation only.
 */

import { assertReferenceCorpus } from "@calepin/ai";
import { describe, expect, it } from "vitest";

import { ANALYSIS_SECTIONS } from "../schema";
import { ANALYSIS_REFERENCE_CORPUS } from "./corpus";

describe("ANALYSIS_REFERENCE_CORPUS", () => {
  it("is accepted by the bench's own corpus gate", () => {
    expect(() => assertReferenceCorpus(ANALYSIS_REFERENCE_CORPUS)).not.toThrow();
  });

  it("holds exactly five cases", () => {
    expect(ANALYSIS_REFERENCE_CORPUS.cases).toHaveLength(5);
  });

  it("carries one annotated expectation per analysis section, in every case", () => {
    for (const benchCase of ANALYSIS_REFERENCE_CORPUS.cases) {
      expect(benchCase.expectations).toHaveLength(ANALYSIS_SECTIONS.length);
    }
  });

  it("covers five distinct registers — no two cases share a title", () => {
    const titles = new Set(ANALYSIS_REFERENCE_CORPUS.cases.map((benchCase) => benchCase.title));

    expect(titles.size).toBe(ANALYSIS_REFERENCE_CORPUS.cases.length);
  });

  it("declares every variable the current analyze-source-text prompt needs", () => {
    for (const benchCase of ANALYSIS_REFERENCE_CORPUS.cases) {
      expect(Object.keys(benchCase.variables).sort()).toEqual(
        [
          "evidenceWordTarget",
          "language",
          "potentialWordTarget",
          "sourceText",
          "summaryWordTarget",
          "targetAudience",
          "totalWordBudget",
        ].sort(),
      );
    }
  });
});
