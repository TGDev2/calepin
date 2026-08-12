/**
 * What the author decided, and what a re-run may do to it (CAL-099).
 *
 * *Une bible contenant une contradiction ne peut pas être validée sans
 * arbitrage explicite* is two rules, and both are here. The gate reads
 * `isBlockingIssue`; what makes an arbitration *stick* across the next run is
 * `reconcileCoherenceIssues`.
 *
 * **Arbitrated is a property of the status, not a column beside it.** The five
 * statuses of the specification already answer *has somebody ruled on this*:
 * `DETECTED` is nobody yet, `TO_FIX` is *I have seen it and I am going to fix
 * it* — which is a decision to change the bible rather than to stand by it, so
 * it does not open the gate — and the other three are rulings that do. A sixth
 * column saying the same thing could disagree with the five, which is the
 * arrangement `Project.status` and `AnalysisSectionRevision` both refuse.
 *
 * Reconciliation is pure and takes both sides in full, so it can be tested
 * without a database and so the statement that writes it has nothing left to
 * decide. It is scoped by the caller to the check ids that actually ran — the
 * engine hands that list back for exactly this.
 */

import type { FingerprintedFinding } from "./finding";
import type { CoherenceCheckId, QualityIssueSeverity, QualityIssueStatus } from "./vocabulary";

/**
 * The three statuses that count as *the author has ruled*.
 *
 * `ACCEPTED` and `IGNORED` are the two the specification distinguishes and
 * neither deletes the row — the reasoning `QualityIssueStatus` records.
 * `FIXED` joins them because a finding nobody reproduces is settled by the
 * bible itself; there is nothing left to arbitrate.
 */
export const ARBITRATED_STATUSES = [
  "ACCEPTED",
  "IGNORED",
  "FIXED",
] as const satisfies readonly QualityIssueStatus[];
export type ArbitratedStatus = (typeof ARBITRATED_STATUSES)[number];

/** The statuses an author may write. `DETECTED` is the engine's, `FIXED` the reconciler's. */
export const COHERENCE_DECISIONS = [
  "ACCEPTED",
  "TO_FIX",
  "IGNORED",
] as const satisfies readonly QualityIssueStatus[];
export type CoherenceDecision = (typeof COHERENCE_DECISIONS)[number];

export function isArbitratedStatus(status: QualityIssueStatus): status is ArbitratedStatus {
  return (ARBITRATED_STATUSES as readonly QualityIssueStatus[]).includes(status);
}

export function isCoherenceDecision(value: string): value is CoherenceDecision {
  return (COHERENCE_DECISIONS as readonly string[]).includes(value);
}

/** A `QualityIssue` row, as the engine needs to see it. */
export interface StoredCoherenceIssue {
  readonly id: string;
  readonly checkId: CoherenceCheckId;
  readonly fingerprint: string;
  readonly severity: QualityIssueSeverity;
  readonly status: QualityIssueStatus;
  readonly explanation: string;
  readonly proposedFix: string | null;
}

/**
 * Does this issue stand between the bible and its validation?
 *
 * Severity and status, and nothing else. A `MAJOR` finding is worth showing and
 * never worth blocking on: the two checks that produce one — a missing
 * symmetric relation, a name the bible never declares — report an absence
 * rather than a contradiction, and a gate that fired on an absence would be the
 * one an author turns off, which is the failure CAL-093 and CAL-094 each
 * refused in their own words.
 */
export function isBlockingIssue(issue: StoredCoherenceIssue): boolean {
  return issue.severity === "CRITICAL" && !isArbitratedStatus(issue.status);
}

export function blockingIssues(
  issues: readonly StoredCoherenceIssue[],
): readonly StoredCoherenceIssue[] {
  return issues.filter(isBlockingIssue);
}

export interface CoherenceIssueRestatement {
  readonly id: string;
  readonly explanation: string;
  readonly proposedFix: string | null;
}

export interface CoherenceReconciliation {
  /** Findings nothing on file matches — new rows, born `DETECTED`. */
  readonly insert: readonly FingerprintedFinding[];
  /** Rows that had been closed and whose finding is back — returned to `DETECTED`. */
  readonly reopen: readonly string[];
  /** Rows whose wording moved while the finding did not. */
  readonly restate: readonly CoherenceIssueRestatement[];
  /** Rows the run no longer produces — closed `FIXED`, never deleted. */
  readonly close: readonly string[];
  /** Rows matched, still open, still worded the same way. */
  readonly unchanged: number;
}

/**
 * What a run does to what is already on file.
 *
 * The author's status is carried across every match, which is the whole point:
 * a contradiction accepted last week is still accepted after a run that finds
 * it again, and the gate stays open. Two exceptions, both derived rather than
 * chosen:
 *
 * - a row closed `FIXED` whose finding is produced again is **reopened**. It
 *   was closed because nobody reproduced it; somebody just did.
 * - a row nobody reproduces is **closed**, whatever the author had said about
 *   it. `ACCEPTED` and `IGNORED` are rulings about a problem that exists, and
 *   this one no longer does.
 *
 * Nothing is deleted, so the next run recognises a contradiction the author has
 * already seen instead of proposing it forever — the reasoning
 * `CanonFactStatus.REJECTED` records, one table over.
 *
 * `stored` must already be narrowed to the check ids that ran. Passing rows
 * from a check the run did not cover would close findings nobody re-examined —
 * which for a model-backed check means throwing away an answer somebody paid
 * for.
 */
export function reconcileCoherenceIssues(
  stored: readonly StoredCoherenceIssue[],
  produced: readonly FingerprintedFinding[],
): CoherenceReconciliation {
  const byFingerprint = new Map<string, StoredCoherenceIssue>();
  for (const issue of stored) byFingerprint.set(issue.fingerprint, issue);

  const insert: FingerprintedFinding[] = [];
  const reopen: string[] = [];
  const restate: CoherenceIssueRestatement[] = [];
  const matched = new Set<string>();
  let unchanged = 0;

  for (const finding of produced) {
    const existing = byFingerprint.get(finding.fingerprint);

    if (existing === undefined) {
      insert.push(finding);
      continue;
    }

    matched.add(existing.fingerprint);

    const reworded =
      existing.explanation !== finding.explanation || existing.proposedFix !== finding.proposedFix;

    if (existing.status === "FIXED") reopen.push(existing.id);
    if (reworded) {
      restate.push({
        id: existing.id,
        explanation: finding.explanation,
        proposedFix: finding.proposedFix,
      });
    }
    if (existing.status !== "FIXED" && !reworded) unchanged += 1;
  }

  const close = stored
    .filter((issue) => !matched.has(issue.fingerprint) && issue.status !== "FIXED")
    .map((issue) => issue.id);

  return { insert, reopen, restate, close, unchanged };
}
