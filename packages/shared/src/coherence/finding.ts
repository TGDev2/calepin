/**
 * What a check reports, and the identity that outlives the run (CAL-099).
 *
 * A finding is not a `QualityIssue` row: it is what a check produces, and the
 * row is what persistence makes of it. The difference matters in one place and
 * that place is the whole reason this file exists — **an author's arbitration
 * has to survive the next run**. A deterministic check recomputes its findings
 * from the rows every time, so without a stable identity the second run would
 * insert a new `DETECTED` row beside the one the author had already accepted,
 * and the contradiction they ruled on would block the validation forever.
 *
 * The identity is the `fingerprint`: a digest over the check's own id and the
 * rows the finding names. `checkId` alone cannot carry it — one check reports
 * several findings — and the explanation cannot either, since rewording a
 * sentence would silently orphan a decision.
 *
 * **A digest rather than a rendering**, for `generationIdempotencyKey`'s
 * reason: an anchor is made of row ids and closed enum members, but a check
 * added later could reach for a statement, and a column holding one would put
 * literary content where §9 forbids it. Hashing makes that impossible rather
 * than discouraged.
 *
 * The anchor is **sorted** before it is hashed: a contradiction between two
 * facts is one contradiction whichever order a check emits the pair in.
 */

import { createHash } from "node:crypto";

import type { CoherenceCheckId, QualityIssueCategory, QualityIssueSeverity } from "./vocabulary";

const COHERENCE_FINGERPRINT_NAMESPACE = "calepin.coherence.v1";

/** The shape a fingerprint has — the same discipline `GENERATION_KEY_PATTERN` states. */
export const COHERENCE_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

/**
 * The severity that blocks a validation.
 *
 * One answer, not two: there is no `blocking` field beside the rank, because a
 * boolean able to disagree with `CRITICAL` is exactly the second answer
 * `Project.status` and `AnalysisSectionRevision` both refuse. The enum's own
 * doc comment already glosses `CRITICAL` as *bloquant*.
 */
export const COHERENCE_BLOCKING_SEVERITY = "CRITICAL" satisfies QualityIssueSeverity;

export function blocksValidation(severity: QualityIssueSeverity): boolean {
  return severity === COHERENCE_BLOCKING_SEVERITY;
}

export interface CoherenceFinding {
  readonly checkId: CoherenceCheckId;
  readonly category: QualityIssueCategory;
  readonly severity: QualityIssueSeverity;
  /**
   * What the finding is about, as identifiers: row ids, closed enum members,
   * never a name, a statement or a quotation. It is hashed rather than stored,
   * so it is also the one part of a finding that is safe to reason about in a
   * report (§9).
   */
  readonly anchor: readonly string[];
  /**
   * Why it is a problem, in the project's language. **Literary content**: it
   * names the elements, so it goes to the column and to the screen and never to
   * a log line. The specification forbids a bare verdict, which is why it is
   * required rather than nullable.
   */
  readonly explanation: string;
  /**
   * The correction the check proposes, or null when the remedy is a decision
   * rather than an edit — `QualityIssue.proposedFix`'s own reasoning.
   */
  readonly proposedFix: string | null;
}

export interface FingerprintedFinding extends CoherenceFinding {
  readonly fingerprint: string;
}

export function isCoherenceFingerprint(value: unknown): value is string {
  return typeof value === "string" && COHERENCE_FINGERPRINT_PATTERN.test(value);
}

/**
 * The identity of a finding, stable across runs, releases and machines.
 *
 * Every part is written as JSON before it is joined, so every one of them is
 * quoted and the join is injective — no combination of check id and anchor can
 * be rearranged into another combination's material. The same reasoning
 * `generationIdempotencyKey` records, and the same reason it cannot be skipped:
 * this digest backs a unique index.
 */
export function coherenceFingerprint(checkId: CoherenceCheckId, anchor: readonly string[]): string {
  const material = [
    JSON.stringify(COHERENCE_FINGERPRINT_NAMESPACE),
    JSON.stringify(checkId),
    JSON.stringify([...anchor].sort()),
  ].join("\n");

  return createHash("sha256").update(material, "utf8").digest("hex");
}

export function fingerprintFinding(finding: CoherenceFinding): FingerprintedFinding {
  return { ...finding, fingerprint: coherenceFingerprint(finding.checkId, finding.anchor) };
}
