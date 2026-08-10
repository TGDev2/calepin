/**
 * CAL-059's acceptance constraint, made checkable: **no arbitrary score,
 * anywhere, ever.** The specification forbids presenting a number as proof of
 * quality or originality, so the bench enforces the opposite shape — argued
 * verdicts tied to cited evidence — and this suite walks the judge contracts
 * to prove the shape holds for all of them at once, today and after any edit.
 *
 * Two halves. The structural one: the JSON Schema derived from every judge
 * contract contains no numeric type and no score-named property, so a numeric
 * judgement is not merely discouraged — it is unexpressible. The behavioural
 * one: a verdict arriving without its argument or its evidence fails
 * validation, because an unargued verdict is the other way a score sneaks in.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { assertBenchCriteria, BENCH_CRITERIA } from "./criteria";
import { BLINDED_VERDICTS, comparisonContract, reviewContract, synthesisContract } from "./judge";

const CONTRACTS = [
  ["bench-review-output", reviewContract(BENCH_CRITERIA, 2)],
  ["bench-compare-outputs", comparisonContract(BENCH_CRITERIA)],
  ["bench-synthesize-comparison", synthesisContract()],
] as const;

/** Property names that would smuggle a mark in under another spelling. */
const SCORE_NAME_PATTERN = /score|rating|grade|mark|points?$/i;

interface SchemaWalkFindings {
  readonly numericPaths: string[];
  readonly scoreNamedPaths: string[];
}

function walkSchema(node: unknown, path: string, findings: SchemaWalkFindings): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => walkSchema(item, `${path}[${index}]`, findings));
    return;
  }

  if (typeof node !== "object" || node === null) {
    return;
  }

  const record = node as Record<string, unknown>;
  const type = record["type"];
  const types = Array.isArray(type) ? type : [type];

  if (types.includes("number") || types.includes("integer")) {
    findings.numericPaths.push(path);
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === "properties" && typeof value === "object" && value !== null) {
      for (const [property, propertySchema] of Object.entries(value)) {
        if (SCORE_NAME_PATTERN.test(property)) {
          findings.scoreNamedPaths.push(`${path}.${property}`);
        }

        walkSchema(propertySchema, `${path}.${property}`, findings);
      }
      continue;
    }

    walkSchema(value, `${path}.${key}`, findings);
  }
}

describe("no arbitrary score can exist in a judge contract", () => {
  it.each(CONTRACTS)("%s holds no numeric field and no score-named property", (_id, contract) => {
    const findings: SchemaWalkFindings = { numericPaths: [], scoreNamedPaths: [] };

    walkSchema(z.toJSONSchema(contract), "$", findings);

    expect(findings.numericPaths).toEqual([]);
    expect(findings.scoreNamedPaths).toEqual([]);
  });

  it("keeps the verdict vocabulary closed, with both honest exits", () => {
    // A judge denied "comparable" invents differences; one denied "contrasted"
    // flattens real trade-offs into a winner.
    expect(BLINDED_VERDICTS).toContain("comparable");
    expect(BLINDED_VERDICTS).toContain("contrasted");
  });
});

const ARGUMENT =
  "Argument de démonstration, assez long pour satisfaire la longueur minimale exigée par le contrat du banc.";

const EVIDENCE = {
  source: "output",
  excerpt: "extrait de démonstration cité depuis la sortie évaluée",
  location: "champ de démonstration",
  relevance: "cet extrait illustre le constat porté par l'argument ci-dessus.",
} as const;

function reviewWith(overrides: {
  argument?: string;
  evidence?: readonly (typeof EVIDENCE)[];
}): unknown {
  return {
    findings: BENCH_CRITERIA.map((criterion) => ({
      criterionId: criterion.id,
      kind: "strength",
      argument: overrides.argument ?? ARGUMENT,
      evidence: overrides.evidence ?? [EVIDENCE],
    })),
    expectationChecks: [],
    summary: ARGUMENT,
  };
}

describe("a verdict cannot arrive naked", () => {
  const contract = reviewContract(BENCH_CRITERIA, 0);

  it("accepts an argued, evidenced judgement", () => {
    expect(contract.safeParse(reviewWith({})).success).toBe(true);
  });

  it("rejects a judgement without evidence", () => {
    expect(contract.safeParse(reviewWith({ evidence: [] })).success).toBe(false);
  });

  it("rejects an argument below the substance floor", () => {
    expect(contract.safeParse(reviewWith({ argument: "Bien." })).success).toBe(false);
  });

  it("rejects a review that skips a criterion", () => {
    const value = reviewWith({}) as { findings: unknown[] };

    value.findings.pop();

    expect(contract.safeParse(value).success).toBe(false);
  });

  it("rejects a comparison that answers a criterion twice instead of once each", () => {
    const pairContract = comparisonContract(BENCH_CRITERIA);
    const judgment = {
      criterionId: BENCH_CRITERIA[0]?.id,
      verdict: "comparable",
      argument: ARGUMENT,
      evidence: [{ ...EVIDENCE, source: "first-output" }],
    };
    const value = {
      judgments: BENCH_CRITERIA.map(() => judgment),
      overall: { verdict: "comparable", argument: ARGUMENT },
    };

    expect(pairContract.safeParse(value).success).toBe(false);
  });
});

describe("the default criteria", () => {
  it("form a valid set", () => {
    expect(() => assertBenchCriteria(BENCH_CRITERIA)).not.toThrow();
    expect(BENCH_CRITERIA.length).toBeGreaterThanOrEqual(5);
  });
});
