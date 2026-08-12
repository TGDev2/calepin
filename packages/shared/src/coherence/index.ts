/**
 * `@calepin/shared/coherence` — the detection engine (CAL-099).
 *
 * Pure, like `@calepin/shared/bible-lock` and `@calepin/shared/obsolescence`
 * next door: a check contract, a finding, the identity that outlives a run, the
 * reconciliation and the arbitration vocabulary. Nothing here touches a
 * database, a clock or an environment, and nothing here knows what a chapter
 * means.
 *
 * It lives in `shared` because the boundary leaves nowhere else. A domain may
 * not import a domain (§3.2), so `@calepin/coherence` — where the manuscript
 * audit will live — can never reach `@calepin/bible`, and the two epics need
 * the same answer. That is `@calepin/shared/provenance`'s position exactly, and
 * for the same reason.
 *
 * The division it draws: **the engine holds what is true of every check, the
 * domain holds every check.** Whether two canon facts contradict each other is
 * narrative meaning and belongs to `@calepin/bible`; that a finding has an
 * identity, a severity that decides whether it blocks, and a decision an author
 * can attach to it is true of the bible's checks and the manuscript's alike.
 */

export {
  ARBITRATED_STATUSES,
  type ArbitratedStatus,
  blockingIssues,
  COHERENCE_DECISIONS,
  type CoherenceDecision,
  type CoherenceIssueRestatement,
  type CoherenceReconciliation,
  isArbitratedStatus,
  isBlockingIssue,
  isCoherenceDecision,
  reconcileCoherenceIssues,
  type StoredCoherenceIssue,
} from "./arbitration";
export {
  COHERENCE_SEVERITY_ORDER,
  type CoherenceCheck,
  type CoherenceRun,
  type CoherenceRunReport,
  runCoherenceChecks,
} from "./engine";
export {
  blocksValidation,
  COHERENCE_BLOCKING_SEVERITY,
  COHERENCE_FINGERPRINT_PATTERN,
  type CoherenceFinding,
  coherenceFingerprint,
  type FingerprintedFinding,
  fingerprintFinding,
  isCoherenceFingerprint,
} from "./finding";
export {
  BIBLE_COHERENCE_CHECKS,
  BIBLE_DETERMINISTIC_CHECKS,
  BIBLE_MODEL_CHECKS,
  type BibleCoherenceCheckId,
  type BibleDeterministicCheckId,
  type BibleModelCheckId,
  type CoherenceCheckId,
  isBibleCoherenceCheckId,
  isCoherenceCheckId,
  QUALITY_ISSUE_CATEGORIES,
  QUALITY_ISSUE_SEVERITIES,
  QUALITY_ISSUE_STATUSES,
  type QualityIssueCategory,
  type QualityIssueSeverity,
  type QualityIssueStatus,
} from "./vocabulary";
