/**
 * The engine (CAL-099) — and it is deliberately almost nothing.
 *
 * The backlog asks for a structure the manuscript audit reuses, and CAL-135
 * states the test it has to pass: *adding a new check must not require
 * modifying the engine*. The way to pass that test is not to make the engine
 * clever, it is to make it ignorant. A check is a function from a subject to
 * findings; the engine runs the ones it is handed, fingerprints what comes
 * back, and counts. It knows nothing about chronologies, canon facts, chapters
 * or prose, and there is no branch in it that names a check.
 *
 * **The two natures are not two mechanisms.** A deterministic check computes
 * its findings and a model-backed one reads them off an answer a generation
 * already produced — but both are `CoherenceCheck<Subject>`, because the
 * difference lives in what fills the subject, not in how the run works. That is
 * what lets one `runCoherenceChecks` serve the bible's arithmetic and, one epic
 * later, an audit whose findings a model wrote.
 *
 * A subject is whatever a suite needs, gathered before the run: the engine is
 * generic over it and never fetches anything, so a suite is testable with no
 * database, no clock and no network (§8).
 */

import { InternalError } from "../errors";
import { type CoherenceFinding, type FingerprintedFinding, fingerprintFinding } from "./finding";
import {
  type CoherenceCheckId,
  QUALITY_ISSUE_SEVERITIES,
  type QualityIssueSeverity,
} from "./vocabulary";

export interface CoherenceCheck<Subject> {
  readonly id: CoherenceCheckId;
  /**
   * Every finding this check has about the subject. Pure: same subject, same
   * findings, in the same order — which is what makes a fingerprint an identity
   * rather than a coincidence.
   */
  run(subject: Subject): readonly CoherenceFinding[];
}

/**
 * Counts and identifiers only, so the whole report is safe to log (§9). What a
 * finding *says* is in the finding, and that never reaches a log line.
 */
export interface CoherenceRunReport {
  readonly checksRun: number;
  readonly findings: number;
  readonly blocking: number;
  readonly duplicates: number;
  readonly bySeverity: Readonly<Record<QualityIssueSeverity, number>>;
}

export interface CoherenceRun {
  /** The checks that ran — the exact set a reconciliation is allowed to close. */
  readonly checkIds: readonly CoherenceCheckId[];
  readonly findings: readonly FingerprintedFinding[];
  readonly report: CoherenceRunReport;
}

function emptyTally(): Record<QualityIssueSeverity, number> {
  return { CRITICAL: 0, MAJOR: 0, MINOR: 0 };
}

/**
 * Run a suite over one subject.
 *
 * Two things it refuses, both programming errors and therefore throws (§7):
 * a suite listing one check id twice, and a check returning a finding filed
 * under another check's id. The second is the dangerous one — a reconciliation
 * closes exactly the ids it recomputed, so a finding smuggled under an id the
 * run did not cover would be closed by a pass that never asked its question.
 *
 * A fingerprint reported twice inside one run is kept once. Two checks can
 * legitimately reach the same pair of rows, and inserting one row twice is the
 * unique index's business rather than the caller's.
 */
export function runCoherenceChecks<Subject>(
  checks: readonly CoherenceCheck<Subject>[],
  subject: Subject,
): CoherenceRun {
  const checkIds: CoherenceCheckId[] = [];
  const seenIds = new Set<CoherenceCheckId>();

  for (const check of checks) {
    if (seenIds.has(check.id)) {
      throw new InternalError({
        message: "a coherence suite lists the same check twice",
        fieldPath: check.id,
      });
    }

    seenIds.add(check.id);
    checkIds.push(check.id);
  }

  const findings: FingerprintedFinding[] = [];
  const seenFingerprints = new Set<string>();
  const bySeverity = emptyTally();
  let blocking = 0;
  let duplicates = 0;

  for (const check of checks) {
    for (const finding of check.run(subject)) {
      if (finding.checkId !== check.id) {
        throw new InternalError({
          message: "a coherence check reported a finding under another check's identifier",
          fieldPath: check.id,
        });
      }

      const fingerprinted = fingerprintFinding(finding);

      if (seenFingerprints.has(fingerprinted.fingerprint)) {
        duplicates += 1;
        continue;
      }

      seenFingerprints.add(fingerprinted.fingerprint);
      findings.push(fingerprinted);
      bySeverity[fingerprinted.severity] += 1;

      if (fingerprinted.severity === "CRITICAL") blocking += 1;
    }
  }

  return {
    checkIds,
    findings,
    report: {
      checksRun: checks.length,
      findings: findings.length,
      blocking,
      duplicates,
      bySeverity,
    },
  };
}

/** The severities, most severe first — the order a report is ranked by. */
export const COHERENCE_SEVERITY_ORDER = QUALITY_ISSUE_SEVERITIES;
