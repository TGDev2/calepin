import { describe, expect, it } from "vitest";

import {
  blockingIssues,
  isArbitratedStatus,
  isBlockingIssue,
  isCoherenceDecision,
  reconcileCoherenceIssues,
  type StoredCoherenceIssue,
} from "./arbitration";
import { type FingerprintedFinding, fingerprintFinding } from "./finding";
import type { QualityIssueSeverity, QualityIssueStatus } from "./vocabulary";

function produced(
  anchor: readonly string[],
  explanation = "Deux faits se contredisent.",
): FingerprintedFinding {
  return fingerprintFinding({
    checkId: "bible-canon-fact-collision",
    category: "FACTUAL_CONTINUITY",
    severity: "CRITICAL",
    anchor,
    explanation,
    proposedFix: null,
  });
}

function stored(
  finding: FingerprintedFinding,
  overrides: Partial<StoredCoherenceIssue> = {},
): StoredCoherenceIssue {
  return {
    id: `issue-${finding.fingerprint.slice(0, 8)}`,
    checkId: finding.checkId,
    fingerprint: finding.fingerprint,
    severity: finding.severity,
    status: "DETECTED",
    explanation: finding.explanation,
    proposedFix: finding.proposedFix,
    ...overrides,
  };
}

describe("isBlockingIssue", () => {
  const cases: readonly (readonly [QualityIssueSeverity, QualityIssueStatus, boolean])[] = [
    ["CRITICAL", "DETECTED", true],
    ["CRITICAL", "TO_FIX", true],
    ["CRITICAL", "ACCEPTED", false],
    ["CRITICAL", "IGNORED", false],
    ["CRITICAL", "FIXED", false],
    ["MAJOR", "DETECTED", false],
    ["MINOR", "DETECTED", false],
  ];

  it.each(cases)("%s / %s blocks: %s", (severity, status, expected) => {
    expect(isBlockingIssue(stored(produced(["a", "b"]), { severity, status }))).toBe(expected);
  });

  it("treats TO_FIX as unarbitrated — it is a decision to change the bible, not to stand by it", () => {
    expect(isArbitratedStatus("TO_FIX")).toBe(false);
    expect(isArbitratedStatus("ACCEPTED")).toBe(true);
  });

  it("lists every blocking issue, and only those", () => {
    const first = produced(["a", "b"]);
    const second = produced(["c", "d"]);
    const third = produced(["e", "f"]);

    const blocking = blockingIssues([
      stored(first),
      stored(second, { status: "ACCEPTED" }),
      stored(third, { severity: "MAJOR" }),
    ]);

    expect(blocking.map((issue) => issue.fingerprint)).toEqual([first.fingerprint]);
  });
});

describe("isCoherenceDecision", () => {
  it("accepts the three an author may write and refuses the two the engine owns", () => {
    expect(isCoherenceDecision("ACCEPTED")).toBe(true);
    expect(isCoherenceDecision("TO_FIX")).toBe(true);
    expect(isCoherenceDecision("IGNORED")).toBe(true);
    expect(isCoherenceDecision("DETECTED")).toBe(false);
    expect(isCoherenceDecision("FIXED")).toBe(false);
  });
});

describe("reconcileCoherenceIssues", () => {
  it("inserts a finding nothing on file matches", () => {
    const finding = produced(["a", "b"]);
    const plan = reconcileCoherenceIssues([], [finding]);

    expect(plan.insert).toEqual([finding]);
    expect(plan.close).toEqual([]);
    expect(plan.unchanged).toBe(0);
  });

  it("carries an arbitration across a re-run — the whole reason a fingerprint exists", () => {
    const finding = produced(["a", "b"]);
    const plan = reconcileCoherenceIssues([stored(finding, { status: "ACCEPTED" })], [finding]);

    expect(plan.insert).toEqual([]);
    expect(plan.reopen).toEqual([]);
    expect(plan.restate).toEqual([]);
    expect(plan.close).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("closes a row the run no longer produces, whatever the author had said", () => {
    const gone = produced(["a", "b"]);
    const plan = reconcileCoherenceIssues([stored(gone, { status: "ACCEPTED" })], []);

    expect(plan.close).toEqual([stored(gone).id]);
  });

  it("leaves an already closed row alone", () => {
    const gone = produced(["a", "b"]);
    const plan = reconcileCoherenceIssues([stored(gone, { status: "FIXED" })], []);

    expect(plan.close).toEqual([]);
  });

  it("reopens a closed row whose finding is back", () => {
    const finding = produced(["a", "b"]);
    const plan = reconcileCoherenceIssues([stored(finding, { status: "FIXED" })], [finding]);

    expect(plan.reopen).toEqual([stored(finding).id]);
    expect(plan.unchanged).toBe(0);
  });

  it("restates a row whose wording moved while the finding did not", () => {
    const before = produced(["a", "b"], "Ancienne formulation.");
    const after = produced(["a", "b"], "Nouvelle formulation.");

    const plan = reconcileCoherenceIssues([stored(before, { status: "ACCEPTED" })], [after]);

    expect(plan.restate).toEqual([
      { id: stored(before).id, explanation: "Nouvelle formulation.", proposedFix: null },
    ]);
    expect(plan.close).toEqual([]);
    expect(plan.unchanged).toBe(0);
  });

  it("restates a row whose proposed correction appeared", () => {
    const before = produced(["a", "b"]);
    const after: FingerprintedFinding = { ...before, proposedFix: "Retirer l'un des deux." };

    const plan = reconcileCoherenceIssues([stored(before)], [after]);

    expect(plan.restate).toEqual([
      {
        id: stored(before).id,
        explanation: before.explanation,
        proposedFix: "Retirer l'un des deux.",
      },
    ]);
  });

  it("handles a mixed run in one pass", () => {
    const kept = produced(["a", "b"]);
    const fresh = produced(["c", "d"]);
    const vanished = produced(["e", "f"]);

    const plan = reconcileCoherenceIssues(
      [stored(kept, { status: "IGNORED" }), stored(vanished)],
      [kept, fresh],
    );

    expect(plan.insert).toEqual([fresh]);
    expect(plan.close).toEqual([stored(vanished).id]);
    expect(plan.unchanged).toBe(1);
    expect(plan.reopen).toEqual([]);
  });
});
