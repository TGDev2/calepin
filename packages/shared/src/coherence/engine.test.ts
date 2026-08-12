import { describe, expect, it } from "vitest";

import { type CoherenceCheck, runCoherenceChecks } from "./engine";
import type { CoherenceFinding } from "./finding";
import type { CoherenceCheckId } from "./vocabulary";

interface Subject {
  readonly pairs: readonly (readonly [string, string])[];
}

function finding(overrides: Partial<CoherenceFinding> = {}): CoherenceFinding {
  return {
    checkId: "bible-canon-fact-collision",
    category: "FACTUAL_CONTINUITY",
    severity: "CRITICAL",
    anchor: ["a", "b"],
    explanation: "Deux faits se contredisent.",
    proposedFix: null,
    ...overrides,
  };
}

function check(
  id: CoherenceCheckId,
  findings: readonly CoherenceFinding[],
): CoherenceCheck<Subject> {
  return { id, run: () => findings };
}

describe("runCoherenceChecks", () => {
  it("runs a suite over one subject and reports counts only", () => {
    const suite: CoherenceCheck<Subject>[] = [
      {
        id: "bible-canon-fact-collision",
        run: (subject) =>
          subject.pairs.map(([first, second]) => finding({ anchor: [first, second] })),
      },
      check("bible-relationship-symmetry", [
        finding({
          checkId: "bible-relationship-symmetry",
          severity: "MAJOR",
          anchor: ["nora", "victor"],
        }),
      ]),
    ];

    const run = runCoherenceChecks(suite, {
      pairs: [
        ["f1", "f2"],
        ["f3", "f4"],
      ],
    });

    expect(run.checkIds).toEqual(["bible-canon-fact-collision", "bible-relationship-symmetry"]);
    expect(run.report).toEqual({
      checksRun: 2,
      findings: 3,
      blocking: 2,
      duplicates: 0,
      bySeverity: { CRITICAL: 2, MAJOR: 1, MINOR: 0 },
    });
    expect(run.findings.every((entry) => entry.fingerprint.length === 64)).toBe(true);
  });

  it("hands back the ids that ran — the exact set a reconciliation may close", () => {
    const run = runCoherenceChecks([check("bible-undeclared-name", [])], { pairs: [] });

    expect(run.checkIds).toEqual(["bible-undeclared-name"]);
    expect(run.findings).toEqual([]);
    expect(run.report.findings).toBe(0);
  });

  it("keeps one row when the same finding is reported twice, and says how many it dropped", () => {
    // Reaching the same rows twice is not an error; inserting the row twice is
    // what the unique index exists to stop, and the engine should not make the
    // caller find that out from PostgreSQL. The pair is reported in both orders
    // here, which is exactly the case the sorted fingerprint collapses.
    const run = runCoherenceChecks(
      [
        check("bible-canon-fact-collision", [
          finding({ anchor: ["f1", "f2"] }),
          finding({ anchor: ["f2", "f1"] }),
        ]),
      ],
      { pairs: [] },
    );

    expect(run.report.findings).toBe(1);
    expect(run.report.duplicates).toBe(1);
  });

  it("refuses a suite listing the same check twice", () => {
    expect(() =>
      runCoherenceChecks([check("bible-undeclared-name", []), check("bible-undeclared-name", [])], {
        pairs: [],
      }),
    ).toThrow(/same check twice/);
  });

  it("refuses a finding filed under another check's identifier", () => {
    // The dangerous one: a reconciliation closes exactly the ids it recomputed,
    // so a finding smuggled under an uncovered id would be closed by a pass that
    // never asked its question — and for a model-backed check, that is an answer
    // somebody paid for.
    expect(() =>
      runCoherenceChecks(
        [check("bible-undeclared-name", [finding({ checkId: "bible-opposed-canon-facts" })])],
        { pairs: [] },
      ),
    ).toThrow(/another check's identifier/);
  });

  it("runs nothing and reports nothing for an empty suite", () => {
    const run = runCoherenceChecks<Subject>([], { pairs: [] });

    expect(run.report).toEqual({
      checksRun: 0,
      findings: 0,
      blocking: 0,
      duplicates: 0,
      bySeverity: { CRITICAL: 0, MAJOR: 0, MINOR: 0 },
    });
  });

  it("counts only CRITICAL findings as blocking", () => {
    const run = runCoherenceChecks(
      [
        check("bible-undeclared-name", [
          finding({ checkId: "bible-undeclared-name", severity: "MAJOR", anchor: ["x"] }),
          finding({ checkId: "bible-undeclared-name", severity: "MINOR", anchor: ["y"] }),
        ]),
      ],
      { pairs: [] },
    );

    expect(run.report.blocking).toBe(0);
    expect(run.report.bySeverity).toEqual({ CRITICAL: 0, MAJOR: 1, MINOR: 1 });
  });
});
