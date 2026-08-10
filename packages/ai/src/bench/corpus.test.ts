/**
 * The corpus and criteria gates (CAL-059): a bench run starts from validated
 * ground or does not start. Both validators throw — a corpus and a criteria
 * set are authored code, so a hole in either is a call-site bug (§7) — and
 * every field path they raise names an id or an index, never content (§9).
 */

import { describe, expect, it } from "vitest";

import { assertReferenceCorpus, type BenchCase, type ReferenceCorpus } from "./corpus";
import { assertBenchCriteria, type BenchCriterion, criteriaLines } from "./criteria";

const CASE: BenchCase = {
  id: "case-one",
  title: "Cas un",
  provenance: "Synthetic fixture, written for this test file.",
  referenceText: "TEXTE-REPERE",
  variables: { language: "fr" },
  expectations: ["ATTENTE-REPERE"],
};

function corpus(cases: readonly BenchCase[]): ReferenceCorpus {
  return { id: "corpus-test", description: "Corpus de démonstration.", cases };
}

describe("assertReferenceCorpus", () => {
  it("accepts a well-formed corpus", () => {
    expect(() => assertReferenceCorpus(corpus([CASE]))).not.toThrow();
  });

  it("refuses an empty corpus", () => {
    expect(() => assertReferenceCorpus(corpus([]))).toThrowError(
      expect.objectContaining({ fieldPath: "corpus-test" }),
    );
  });

  it("refuses two cases sharing one id", () => {
    expect(() => assertReferenceCorpus(corpus([CASE, CASE]))).toThrowError(
      expect.objectContaining({ fieldPath: "case-one" }),
    );
  });

  it("refuses a case id that is not kebab-case, naming its index", () => {
    expect(() => assertReferenceCorpus(corpus([{ ...CASE, id: "Case One" }]))).toThrowError(
      expect.objectContaining({ fieldPath: "cases[0]" }),
    );
  });

  it("refuses a case with no provenance — a fixture nobody committed knowingly", () => {
    expect(() => assertReferenceCorpus(corpus([{ ...CASE, provenance: "  " }]))).toThrowError(
      expect.objectContaining({ fieldPath: "case-one" }),
    );
  });

  it("refuses a blank expectation", () => {
    expect(() => assertReferenceCorpus(corpus([{ ...CASE, expectations: [""] }]))).toThrowError(
      expect.objectContaining({ fieldPath: "case-one" }),
    );
  });
});

const CRITERION: BenchCriterion = {
  id: "grounding",
  label: "Ancrage",
  question: "Question de démonstration sur l'ancrage.",
};

describe("assertBenchCriteria", () => {
  it("accepts a well-formed set", () => {
    expect(() => assertBenchCriteria([CRITERION])).not.toThrow();
  });

  it("refuses an empty set — a bench with no questions to ask", () => {
    expect(() => assertBenchCriteria([])).toThrow();
  });

  it("refuses two criteria sharing one id", () => {
    expect(() => assertBenchCriteria([CRITERION, CRITERION])).toThrowError(
      expect.objectContaining({ fieldPath: "grounding" }),
    );
  });

  it("refuses a criterion with no question", () => {
    expect(() => assertBenchCriteria([{ ...CRITERION, question: " " }])).toThrowError(
      expect.objectContaining({ fieldPath: "grounding" }),
    );
  });

  it("renders one line per criterion, id first, for the judge to read", () => {
    expect(criteriaLines([CRITERION])).toEqual([
      "grounding — Ancrage : Question de démonstration sur l'ancrage.",
    ]);
  });
});
