/**
 * The closed vocabulary of the coherence engine (CAL-099).
 *
 * Three enum mirrors and one list of check identifiers. The mirrors are here
 * for the reason `MISSION_LOCK_SCOPE` and `MISSION_WRITE_TARGET_KIND` restate
 * the mission enum rather than importing it: `packages/shared` may reach no
 * `@calepin/*` package, so anything both the engine and a domain must agree on
 * is written once, here, and pinned against the Prisma enums by
 * `prisma/schema.test.ts`.
 *
 * **The check list is the vocabulary, and it lives in `shared` deliberately.**
 * The checks themselves cannot: reading a chronology or comparing two canon
 * facts is narrative meaning, and that belongs to `@calepin/bible` (§3.3). But
 * the gate that refuses a validation and the reconciler that closes a finding
 * nobody reproduces both have to *name a suite* without reaching a domain, and
 * a free-text `checkId` would let them name one that does not exist. A domain's
 * suite `satisfies` this list, so an unlisted id fails to compile.
 *
 * E13 (CAL-135) adds `MANUSCRIPT_COHERENCE_CHECKS` beside the bible's and
 * widens `CoherenceCheckId`. Nothing in `engine.ts`, `finding.ts` or
 * `arbitration.ts` changes when it does — that is CAL-135's own acceptance
 * criterion, and it is a property of this file being the only list.
 */

import type { $Enums } from "@prisma/client";

/** The five families of the specification, as `QualityIssueCategory` spells them. */
export const QUALITY_ISSUE_CATEGORIES = [
  "FACTUAL_CONTINUITY",
  "PSYCHOLOGICAL_CONTINUITY",
  "STRUCTURE",
  "STYLE",
  "ORIGINALITY",
] as const satisfies readonly $Enums.QualityIssueCategory[];
export type QualityIssueCategory = (typeof QUALITY_ISSUE_CATEGORIES)[number];

/** A rank, never a score — the column's own doc comment, in decreasing order. */
export const QUALITY_ISSUE_SEVERITIES = [
  "CRITICAL",
  "MAJOR",
  "MINOR",
] as const satisfies readonly $Enums.QualityIssueSeverity[];
export type QualityIssueSeverity = (typeof QUALITY_ISSUE_SEVERITIES)[number];

/** The five statuses the specification names one by one. */
export const QUALITY_ISSUE_STATUSES = [
  "DETECTED",
  "ACCEPTED",
  "TO_FIX",
  "FIXED",
  "IGNORED",
] as const satisfies readonly $Enums.QualityIssueStatus[];
export type QualityIssueStatus = (typeof QUALITY_ISSUE_STATUSES)[number];

/**
 * The bible's four calculable checks — the ones a run recomputes from the rows
 * every time, and therefore the only ones a run may close.
 *
 * `bible-undeclared-name` sits here rather than with the model checks even
 * though it reads prose: it reads it with a tokenizer, not with a model, so it
 * is reproducible and closing it when the name is declared is correct.
 */
export const BIBLE_DETERMINISTIC_CHECKS = [
  "bible-timeline-arithmetic",
  "bible-relationship-symmetry",
  "bible-undeclared-name",
  "bible-canon-fact-collision",
] as const;

/**
 * The bible's two model-backed checks — the ones `detect-bible-contradictions`
 * produces, and which no deterministic run may close.
 *
 * They are declared exactly as the four above are, which is the point: the
 * engine sees one kind of check. What differs is what *produces* their rows —
 * a generation, recorded on `QualityIssue.detectedByGenerationId` — and a
 * finding somebody paid a provider for must not be closed by a pass that never
 * asked the question. Scoping a reconciliation to the ids it recomputed is what
 * keeps both true at once.
 */
export const BIBLE_MODEL_CHECKS = [
  "bible-opposed-canon-facts",
  "bible-contradictory-world-rules",
] as const;

/** Every check the bible answers to — what the validation gate reads. */
export const BIBLE_COHERENCE_CHECKS = [
  ...BIBLE_DETERMINISTIC_CHECKS,
  ...BIBLE_MODEL_CHECKS,
] as const;

export type BibleDeterministicCheckId = (typeof BIBLE_DETERMINISTIC_CHECKS)[number];
export type BibleModelCheckId = (typeof BIBLE_MODEL_CHECKS)[number];
export type BibleCoherenceCheckId = (typeof BIBLE_COHERENCE_CHECKS)[number];

/**
 * Every check identifier the engine knows. The bible's today; CAL-135 widens
 * the union by adding its own list to it.
 */
export type CoherenceCheckId = BibleCoherenceCheckId;

export function isCoherenceCheckId(value: string): value is CoherenceCheckId {
  return (BIBLE_COHERENCE_CHECKS as readonly string[]).includes(value);
}

export function isBibleCoherenceCheckId(value: string): value is BibleCoherenceCheckId {
  return isCoherenceCheckId(value);
}
