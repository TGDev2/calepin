/**
 * What a system process may do to a generation, across every project (CAL-061).
 *
 * Everything else in this repository takes a `ProjectScope`, because *whose data
 * it is* is the question an owner's request has to answer. A reconciliation
 * sweep is not an owner's request: it acts for nobody, it sweeps every project
 * at once, and there is no owner to open a scope with. So these five functions
 * are **ungated**, in the shape §4.3 already establishes for derived columns —
 * `reconcileProjectAggregates` beside `withProjectAggregates`, an ungated twin
 * for the rows a normal write path never touched.
 *
 * The carve-out is narrow and it stays narrow, which is what makes it safe:
 *
 * - Nothing here reads or returns narrative content. Four of the five are
 *   `UPDATE`s that touch status columns and return a count; the fifth returns
 *   identifiers.
 * - `readGenerationForRun` is the one exception and it is the reason the rest
 *   can stay ungated: it resolves the **owner** of a generation, so the job
 *   runner can open a real `ProjectScope` and do everything afterwards through
 *   the scoped functions. It is a lookup that answers *whose is this*, and a
 *   scope cannot be the input to that question.
 * - `input` — the replay payload — is selected only there, only for the executor
 *   that is about to run the mission. It may carry the author's own instruction,
 *   so it is typed `unknown` and never logged (§9).
 *
 * The four sweeps are one statement each, set-based, and idempotent: two workers
 * running the sweep at the same moment do the same work twice and leave the same
 * rows. That is deliberate — a lock would make the recovery task depend on the
 * thing most likely to be broken when it is needed.
 */

import type { $Enums } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import { InternalError } from "../errors/app-error";

/** Everything the job runner needs to run one generation, and nothing more. */
export interface GenerationRunTarget {
  readonly id: string;
  readonly projectId: string;
  /** `Project.userId` — resolved here so the runner can open a scope with it. */
  readonly ownerId: string;
  readonly mission: $Enums.GenerationMission;
  readonly targetId: string | null;
  readonly status: $Enums.GenerationStatus;
  /**
   * The replay payload, as it was reserved. `unknown` rather than a JSON type:
   * the executor about to run the mission is the only thing entitled to read it,
   * and it has to parse it (§6) rather than trust a shape written by a previous
   * release. Never logged, never returned to a screen (§9).
   */
  readonly input: unknown;
}

/**
 * Reads a generation by id alone, with its owner.
 *
 * `null` when there is no such row — an account deleted while its job was still
 * in the queue, most of all. That is a completed job, not a failure: there is
 * nothing left to generate and nothing left to record it against.
 */
export async function readGenerationForRun(
  generationId: string,
): Promise<GenerationRunTarget | null> {
  const row = await getDatabaseClient().generation.findUnique({
    where: { id: generationId },
    select: {
      id: true,
      projectId: true,
      mission: true,
      targetId: true,
      status: true,
      input: true,
      project: { select: { userId: true } },
    },
  });

  if (row === null) return null;

  return {
    id: row.id,
    projectId: row.projectId,
    ownerId: row.project.userId,
    mission: row.mission,
    targetId: row.targetId,
    status: row.status,
    input: row.input,
  };
}

/**
 * Closes every attempt whose lease has run out, wherever it is.
 *
 * The same statement `claimGenerationAttempt` runs for one generation, run for
 * all of them — and it exists twice on purpose. The claim's copy is what makes a
 * redelivery able to take over immediately; this one is what makes recovery
 * happen at all when *nothing* redelivers, which is exactly the case where the
 * worker died and its job died with it.
 *
 * The token, cost and duration columns are not in the `SET` list, and their
 * absence is the guarantee: nobody can say what an unfinished call consumed, so
 * nothing is written where a number would be invented (CAL-058).
 */
export async function reclaimExpiredAttempts(now: Date = new Date()): Promise<number> {
  return getDatabaseClient().$executeRaw`
    UPDATE "generation_attempts"
    SET "status" = 'FAILED',
        "errorCode" = 'GENERATION_INTERRUPTED',
        "errorCategory" = 'INTERNAL',
        "completedAt" = ${now},
        "leaseExpiresAt" = NULL
    WHERE "status" = 'RUNNING'
      AND "leaseExpiresAt" <= ${now}
  `;
}

/**
 * Returns to `QUEUED` every generation marked `RUNNING` that no attempt is
 * running — the *état fantôme* this whole task exists to make temporary.
 *
 * Run after `reclaimExpiredAttempts`, which is what turns a dead worker's
 * attempt into no attempt at all. A generation whose attempt is still `RUNNING`
 * with a live lease is left exactly where it is: somebody is on it.
 */
export async function requeueOrphanedGenerations(): Promise<number> {
  return getDatabaseClient().$executeRaw`
    UPDATE "generations" g
    SET "status" = 'QUEUED', "completedAt" = NULL
    WHERE g."status" = 'RUNNING'
      AND NOT EXISTS (
        SELECT 1 FROM "generation_attempts" a
        WHERE a."generationId" = g."id" AND a."status" = 'RUNNING'
      )
  `;
}

/**
 * Closes every `QUEUED` generation that has already had all the tries it is
 * allowed.
 *
 * The loop breaker. A retryable failure returns a generation to `QUEUED` and the
 * sweep is the only thing that redelivers one, so without this a provider that
 * stays broken is paid for once a minute for as long as it stays broken. A
 * generation with **no** attempt at all is never closed here: that is the
 * rolling-deployment case, where the mission is simply unknown to the workers
 * running right now, and nothing has been spent on it.
 *
 * `maxAttempts` is the default ceiling; a row that carries its own
 * `attemptCeiling` is judged by that instead (CAL-063). Only `replayGeneration`
 * writes one, which is what keeps a human's decision to try again from being
 * undone by the sweep a minute later, without letting an automatic retry loop
 * past its own bound.
 *
 * The row is closed `PERMANENT`: whatever the last cause was, *Calepin* has
 * stopped, and nothing further happens without someone asking. `nextAttemptAt` is
 * cleared with it — the deadline the last failure wrote is now a wait nobody is
 * waiting for, and `generations_retry_check` refuses one on a failed row anyway.
 */
export async function exhaustSpentGenerations(maxAttempts: number): Promise<number> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new InternalError({ message: "an attempt ceiling must be a whole number of tries" });
  }

  return getDatabaseClient().$executeRaw`
    UPDATE "generations" g
    SET "status" = 'FAILED',
        "completedAt" = now(),
        "errorCode" = 'GENERATION_ATTEMPTS_EXHAUSTED',
        "errorCategory" = 'INTERNAL',
        "failureClass" = 'PERMANENT',
        "nextAttemptAt" = NULL
    WHERE g."status" = 'QUEUED'
      AND (
        SELECT count(*) FROM "generation_attempts" a WHERE a."generationId" = g."id"
      ) >= COALESCE(g."attemptCeiling", ${maxAttempts})
  `;
}

export interface DeliverableGenerationQuery {
  /** Only rows created or last moved before this instant. */
  readonly staleBefore: Date;
  /** The clock the retry deadlines below are judged against (§8). */
  readonly now?: Date;
  readonly limit: number;
}

/**
 * The identifiers of the generations a sweep should hand back to the queue,
 * oldest first — the order `@@index([status, createdAt])` already serves.
 *
 * Identifiers only. What the sweep does with them is enqueue a job named by the
 * id, which Redis deduplicates against one already there, so asking whether a
 * job exists would be a round trip that changes no decision.
 *
 * **Two ways to be deliverable, and the second one is CAL-063's.** A row with no
 * retry deadline is deliverable once it has sat in `QUEUED` past the staleness
 * threshold — the original rule, which covers a fresh ask whose enqueue Redis
 * refused and a generation the sweep itself returned to the queue. A row *with*
 * one is deliverable exactly when that deadline has passed, and not a moment
 * before: it failed transiently, and the wait is the backoff. Judging the second
 * kind by `createdAt` too would defeat the whole thing — a generation created an
 * hour ago is stale by definition, so its first transient failure would be
 * retried on the very next tick at full speed.
 */
export async function listDeliverableGenerations(
  query: DeliverableGenerationQuery,
): Promise<string[]> {
  const rows = await getDatabaseClient().generation.findMany({
    where: {
      status: "QUEUED",
      OR: [
        { nextAttemptAt: null, createdAt: { lte: query.staleBefore } },
        { nextAttemptAt: { lte: query.now ?? new Date() } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: query.limit,
    select: { id: true },
  });

  return rows.map((row) => row.id);
}
