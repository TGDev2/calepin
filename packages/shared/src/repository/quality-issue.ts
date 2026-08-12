/**
 * The issues a check reported, read, reconciled and arbitrated (CAL-099).
 *
 * Generic on purpose. Nothing here knows what a bible is: it takes findings a
 * domain computed, a list of the check identifiers that produced them, and
 * writes the difference. E13's manuscript audit reuses it as it stands, which
 * is the whole reason the engine's vocabulary lives in `@calepin/shared` rather
 * than beside the checks.
 *
 * **The scope of a reconciliation is the set of ids that actually ran.** A run
 * closes a stored issue when it no longer produces it, and that is only a valid
 * inference for a check the run performed. Passing the deterministic ids while
 * a model-backed check's rows sit in the same table would close findings
 * somebody paid a provider for, and nothing would ever say so.
 *
 * §9: a `QualityIssue.explanation` names elements of the novel. It is written
 * to the column and read by the screen; it never reaches a log line, and the
 * report these functions return carries counts alone.
 */

import type { Prisma } from "@prisma/client";

import {
  type CoherenceCheckId,
  type FingerprintedFinding,
  isCoherenceCheckId,
  reconcileCoherenceIssues,
  type StoredCoherenceIssue,
} from "../coherence";
import { getDatabaseClient, type TransactionClient } from "../database";
import { fail, NotFoundError, type Result, succeed } from "../errors";
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";
import { withProjectTransaction } from "./transaction";

export interface QualityIssueRow extends StoredCoherenceIssue {
  readonly category: Prisma.QualityIssueCreateManyInput["category"];
  readonly detectedByGenerationId: string | null;
  readonly createdAt: Date;
}

const ISSUE_SELECT = {
  id: true,
  checkId: true,
  fingerprint: true,
  category: true,
  severity: true,
  status: true,
  explanation: true,
  proposedFix: true,
  detectedByGenerationId: true,
  createdAt: true,
} as const;

interface RawIssue {
  readonly id: string;
  readonly checkId: string;
  readonly fingerprint: string;
  readonly category: QualityIssueRow["category"];
  readonly severity: StoredCoherenceIssue["severity"];
  readonly status: StoredCoherenceIssue["status"];
  readonly explanation: string;
  readonly proposedFix: string | null;
  readonly detectedByGenerationId: string | null;
  readonly createdAt: Date;
}

/**
 * A row whose `checkId` no longer belongs to any registry is skipped rather
 * than crashed on. The column is free text — CAL-135 owns the registry and it
 * will grow — so a row written by a release that knew a check this one does not
 * is a real state, and the honest answer is to leave it alone.
 */
function toIssue(row: RawIssue): QualityIssueRow | null {
  if (!isCoherenceCheckId(row.checkId)) return null;

  return { ...row, checkId: row.checkId };
}

export interface ListQualityIssuesInput {
  /** The checks whose issues to read — required, never *everything*. */
  readonly checkIds: readonly CoherenceCheckId[];
}

/** The same read, inside a transaction the caller already holds. */
export async function listQualityIssuesWithin(
  client: TransactionClient,
  scope: ProjectScope,
  input: ListQualityIssuesInput,
): Promise<readonly QualityIssueRow[]> {
  assertProjectScope(scope);
  if (input.checkIds.length === 0) return [];

  const rows = await client.qualityIssue.findMany({
    where: scopedWhere("QualityIssue", scope, { checkId: { in: [...input.checkIds] } }),
    select: ISSUE_SELECT,
    orderBy: [{ severity: "asc" }, { checkId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map(toIssue).filter((issue): issue is QualityIssueRow => issue !== null);
}

export async function listQualityIssues(
  scope: ProjectScope,
  input: ListQualityIssuesInput,
): Promise<Result<readonly QualityIssueRow[]>> {
  assertProjectScope(scope);
  if (input.checkIds.length === 0) return succeed([]);

  const database = getDatabaseClient();
  const rows = await database.qualityIssue.findMany({
    where: scopedWhere("QualityIssue", scope, { checkId: { in: [...input.checkIds] } }),
    select: ISSUE_SELECT,
    orderBy: [{ severity: "asc" }, { checkId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  return succeed(rows.map(toIssue).filter((issue): issue is QualityIssueRow => issue !== null));
}

export interface ReconcileQualityIssuesInput {
  /** The checks the run performed — the exact set it may close. */
  readonly checkIds: readonly CoherenceCheckId[];
  readonly findings: readonly FingerprintedFinding[];
  /** The generation that produced them, for a model-backed run. */
  readonly generationId?: string | null;
}

export interface QualityIssueReconciliationReport {
  readonly inserted: number;
  readonly reopened: number;
  readonly restated: number;
  readonly closed: number;
  readonly unchanged: number;
}

/**
 * The reconciliation itself, inside a transaction the caller already holds.
 *
 * Not exported from the barrel: a caller that has no transaction should use
 * `reconcileQualityIssues` below, and one that has should be a repository
 * function rather than a page — `readBibleLocksFor`'s arrangement.
 */
export async function reconcileQualityIssuesWithin(
  client: TransactionClient,
  scope: ProjectScope,
  input: ReconcileQualityIssuesInput,
): Promise<QualityIssueReconciliationReport> {
  const scopedIds = new Set<CoherenceCheckId>(input.checkIds);
  const findings = input.findings.filter((finding) => scopedIds.has(finding.checkId));

  const stored = await client.qualityIssue.findMany({
    where: scopedWhere("QualityIssue", scope, { checkId: { in: [...scopedIds] } }),
    select: ISSUE_SELECT,
  });

  const plan = reconcileCoherenceIssues(
    stored.map(toIssue).filter((issue): issue is QualityIssueRow => issue !== null),
    findings,
  );

  if (plan.insert.length > 0) {
    await client.qualityIssue.createMany({
      data: plan.insert.map((finding) => ({
        projectId: scope.projectId,
        category: finding.category,
        severity: finding.severity,
        checkId: finding.checkId,
        fingerprint: finding.fingerprint,
        explanation: finding.explanation,
        proposedFix: finding.proposedFix,
        detectedByGenerationId: input.generationId ?? null,
      })),
    });
  }

  if (plan.reopen.length > 0) {
    await client.qualityIssue.updateMany({
      where: scopedWhere("QualityIssue", scope, { id: { in: [...plan.reopen] } }),
      data: { status: "DETECTED" },
    });
  }

  for (const restatement of plan.restate) {
    await client.qualityIssue.updateMany({
      where: scopedWhere("QualityIssue", scope, { id: restatement.id }),
      data: { explanation: restatement.explanation, proposedFix: restatement.proposedFix },
    });
  }

  if (plan.close.length > 0) {
    await client.qualityIssue.updateMany({
      where: scopedWhere("QualityIssue", scope, { id: { in: [...plan.close] } }),
      data: { status: "FIXED" },
    });
  }

  return {
    inserted: plan.insert.length,
    reopened: plan.reopen.length,
    restated: plan.restate.length,
    closed: plan.close.length,
    unchanged: plan.unchanged,
  };
}

export async function reconcileQualityIssues(
  scope: ProjectScope,
  input: ReconcileQualityIssuesInput,
): Promise<Result<QualityIssueReconciliationReport>> {
  assertProjectScope(scope);

  return withProjectTransaction(scope, async (client) =>
    succeed(await reconcileQualityIssuesWithin(client, scope, input)),
  );
}

export interface SetQualityIssueStatusInput {
  readonly issueId: string;
  /** What the author decided — `DETECTED` and `FIXED` are the engine's. */
  readonly status: StoredCoherenceIssue["status"];
}

/**
 * The author's arbitration, written as a status.
 *
 * One statement, scoped: a row that is not theirs and a row that is not there
 * are the same answer, which is §3.5's rule and the reason the enumeration
 * cannot leak. Nothing here decides *whether* a decision is allowed — the three
 * an author may write are `COHERENCE_DECISIONS`, and applying that vocabulary
 * is the caller's, since `shared` cannot know which screen is asking.
 */
export async function setQualityIssueStatus(
  scope: ProjectScope,
  input: SetQualityIssueStatusInput,
): Promise<Result<void>> {
  assertProjectScope(scope);

  const database = getDatabaseClient();
  const written = await database.qualityIssue.updateMany({
    where: scopedWhere("QualityIssue", scope, { id: input.issueId }),
    data: { status: input.status },
  });

  if (written.count === 0) {
    return fail(new NotFoundError({ message: "quality issue not found", fieldPath: "issueId" }));
  }

  return succeed();
}
