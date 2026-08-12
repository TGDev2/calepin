/**
 * The write half of a generation's life (CAL-058) — reserve, claim, complete,
 * replay, cancel.
 *
 * `./generation` reads generations; this writes them, and it is where the
 * specification's one hard rule about money lives: *aucune facturation interne
 * ne doit être comptabilisée deux fois si l'échec provient du système.* There
 * are exactly four ways one model call becomes two cost lines, and each has one
 * mechanism here:
 *
 * | Way | Mechanism |
 * |---|---|
 * | the same ask enqueued twice | `reserveGeneration` — the idempotency key and its unique index |
 * | the same try recorded twice | `claimGenerationAttempt` — the attempt number is allocated under the generation's row lock, never by a caller |
 * | the same attempt completed twice | `completeGenerationAttempt` — a conditional statement that applies only to an attempt still `RUNNING` |
 * | a worker that died mid-call, re-run | the reclaim inside the claim — the interrupted attempt is closed with its token columns **untouched**, so a try nobody measured sums to nothing |
 *
 * **What is *not* here is as deliberate as what is.** No queue, no retry policy,
 * no lease renewal: those are CAL-060's, and they sit above these four
 * functions rather than inside them. This module answers "what is true of this
 * generation right now, and what may I do to it" — and answers it in a way that
 * is the same whether the caller is a server action, a worker, or the same
 * worker restarted.
 *
 * **The audit block stays where it belongs.** Creating a generation is an act
 * of the author's, so `reserveGeneration` writes it through Prisma and the
 * CAL-022 extension credits it to the actor in scope. Every transition
 * afterwards — running, queued again, succeeded, failed — is performed by the
 * queue and authored by nobody, so it is written with raw SQL exactly as
 * CAL-033's derived counters are: crediting a redelivery to whoever happened to
 * be in scope, and burning the row's `version` while doing it, would be a lie
 * about who did what.
 */

import type { $Enums, Prisma } from "@prisma/client";

import { blockedGenerationError } from "../bible-lock";
import { getDatabaseClient, type TransactionClient } from "../database/client";
import { ConflictError, InternalError, NotFoundError } from "../errors/app-error";
import type { ErrorCategory } from "../errors/categories";
import { fail, type Result, succeed } from "../errors/result";
import {
  type AttemptCompletion,
  CAPACITY_RETRY_DELAY_MS,
  DEFAULT_PROJECT_GENERATION_CONCURRENCY_LIMIT,
  DEFAULT_USER_GENERATION_CONCURRENCY_LIMIT,
  type GenerationAttemptOutcome,
  type GenerationClaim,
  type GenerationFailureClass,
  generationIdempotencyKey,
  type GenerationPersistence,
  generationWriteTarget,
  isProjectWideWriteTarget,
  MAX_GENERATION_ATTEMPTS,
  missionsWritingTo,
  WRITE_TARGET_RETRY_DELAY_MS,
} from "../generation";
import { logger } from "../logging";
import { readBibleLocksFor } from "./bible-lock";
import type { GenerationMission } from "./generation";
import { PROJECT_OWNER_FIELD } from "./owned-models";
import { projectNotFound, RollbackSignal } from "./project-lock";
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";

export type { TransactionClient };

/**
 * How long a claim is believed by default.
 *
 * Deliberately far longer than any mission's own deadline. The longest one is
 * ten minutes and `@calepin/ai`'s port may spend that budget three times per
 * model across two models before giving up, so a lease of the same order would
 * reclaim healthy calls under themselves — and a reclaimed healthy call is
 * `superseded`: an answer paid for and thrown away, the exact outcome this
 * module exists to avoid. Erring long only costs latency after a crash, and
 * CAL-060 shortens the wait properly, by renewing the lease while the work runs
 * rather than by shortening it here.
 */
export const DEFAULT_ATTEMPT_LEASE_MS = 30 * 60_000;

/** Never selects `input`: it may carry the author's own instruction (§9). */
const RESERVATION_FIELDS = {
  id: true,
  mission: true,
  targetId: true,
  idempotencyKey: true,
  status: true,
} as const;

export interface ReserveGenerationInput {
  readonly mission: GenerationMission;
  /** The entity the mission produces, or null for a project-wide mission. */
  readonly targetId?: string | null;
  /**
   * The mission's resolved payload — identifiers, options, the author's own
   * instruction. Never the composed prompt and never a model's answer.
   *
   * **It names the versions it is built on.** That single habit is what makes
   * the key mean what it has to mean: a regeneration starting from the
   * chapter's current `ChapterRevision` names that revision and is therefore a
   * different ask from the one before it, while a job redelivered by a queue
   * carries the same payload and is therefore the same ask. A payload that
   * names no version gets deduplicated against its own past, which is visible
   * at once — the reservation comes back with `created: false`.
   */
  readonly input: Prisma.InputJsonValue;
}

export interface ReservedGeneration {
  readonly id: string;
  readonly mission: GenerationMission;
  readonly targetId: string | null;
  readonly idempotencyKey: string;
  readonly status: $Enums.GenerationStatus;
  /** False when this ask already had a generation — the whole point. */
  readonly created: boolean;
}

export interface ClaimGenerationAttemptInput {
  readonly generationId: string;
  /**
   * The model the mission routes to, known before the call because the row is
   * written before it. `completeGenerationAttempt` overwrites it with the model
   * that actually served, which a provider failover changes.
   */
  readonly model: string;
  /** The prompt version about to run (CAL-053), recorded before the call. */
  readonly promptVersion?: number;
  readonly leaseMs?: number;
  /**
   * One clock for both sides of the lease comparison — the deadline this claim
   * writes and the deadline it judges other attempts by (§8, and the reason it
   * is injectable at all).
   */
  readonly now?: Date;
}

/** The five states of a queued generation, in the spelling the column uses. */
const GENERATION_STATUS_VALUES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const satisfies readonly $Enums.GenerationStatus[];

/** A terminal generation has nothing to claim; the reason says which one it is. */
const REFUSAL_BY_STATUS: Partial<
  Record<$Enums.GenerationStatus, "already-succeeded" | "already-failed" | "cancelled">
> = {
  SUCCEEDED: "already-succeeded",
  FAILED: "already-failed",
  CANCELLED: "cancelled",
};

/** The three failure classes, in the spelling the column uses (CAL-063). */
const FAILURE_CLASS_COLUMN = {
  transient: "TRANSIENT",
  rate_limited: "RATE_LIMITED",
  permanent: "PERMANENT",
} as const satisfies Record<GenerationFailureClass, $Enums.GenerationFailureClass>;

/** The eight categories, in the spelling the column uses. Looked up, never cast. */
const ERROR_CATEGORY_COLUMN = {
  validation: "VALIDATION",
  not_found: "NOT_FOUND",
  forbidden: "FORBIDDEN",
  conflict: "CONFLICT",
  rate_limit: "RATE_LIMIT",
  provider: "PROVIDER",
  timeout: "TIMEOUT",
  internal: "INTERNAL",
} as const satisfies Record<ErrorCategory, $Enums.ErrorCategory>;

function generationNotFound(): NotFoundError {
  return new NotFoundError({ message: "no generation with this id belongs to this owner" });
}

/**
 * A `P2002`, recognised without importing `@prisma/client` as a value.
 *
 * `../database/client` keeps that import type-only so the unit Vitest project
 * runs without `prisma generate` having produced anything, and this module is
 * underneath it. The shape is Prisma's public error contract, so reading the
 * code off it is not a guess.
 */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/**
 * Reserves the generation for an ask, or hands back the one that already has it.
 *
 * The key is derived here, from the four values about to be written, so no
 * caller can supply one that disagrees with the row it names — the discipline
 * `openProjectScope` and `renderPrompt` already use. The insert is the arbiter:
 * two processes racing the same ask both attempt it, exactly one wins, and the
 * loser reads the winner's row rather than opening a second generation and
 * paying for it.
 */
export async function reserveGeneration(
  scope: ProjectScope,
  input: ReserveGenerationInput,
): Promise<Result<ReservedGeneration>> {
  assertProjectScope(scope);

  const client = getDatabaseClient();
  const targetId = input.targetId ?? null;
  const idempotencyKey = generationIdempotencyKey({
    mission: input.mission,
    projectId: scope.projectId,
    targetId,
    input: input.input,
  });

  // The parent foreign key resolved against the owner before the child row is
  // written — CLAUDE.md §3.5's rule for exactly this shape. Without it a forged
  // scope would hang a generation, and its cost, off someone else's project.
  const project = await client.project.findFirst({
    where: { id: scope.projectId, [PROJECT_OWNER_FIELD]: scope.ownerId },
    select: { id: true },
  });

  if (project === null) return fail(projectNotFound());

  // The lock, before anything is opened (CAL-095). Refusing here is what the
  // specification means by *signaler avant la génération* (§6.5): no row, no
  // job, no estimate spent, and an author who can lift the lock and ask again
  // rather than one shown a failure after the fact. The claim checks it a
  // second time, because a lock can appear between this moment and the worker.
  const gate = await readBibleLocksFor(client, scope, input.mission, targetId);

  if (gate.blocked) return fail(blockedGenerationError(gate));

  try {
    const created = await client.generation.create({
      data: {
        projectId: scope.projectId,
        mission: input.mission,
        targetId,
        idempotencyKey,
        input: input.input,
      },
      select: RESERVATION_FIELDS,
    });

    return succeed({ ...created, created: true });
  } catch (error: unknown) {
    if (!isUniqueViolation(error)) throw error;
  }

  const existing = await client.generation.findFirst({
    where: scopedWhere("Generation", scope, { idempotencyKey }),
    select: RESERVATION_FIELDS,
  });

  if (existing === null) {
    // The insert collided on `(projectId, idempotencyKey)` and the row it
    // collided with is not the owner's — impossible, since the key hashes the
    // project and the project was just resolved against the owner. A throw
    // rather than a `Result`: it would mean the index and the derivation
    // disagree, which is a defect and not a state to handle.
    throw new InternalError({
      message: "a generation key collided with a row outside the scope that derived it",
    });
  }

  return succeed({ ...existing, created: false });
}

/**
 * Reads the two numbers a capacity decision needs, in one round trip: how many
 * of this project's — and this owner's, across every project they hold — other
 * generations are `RUNNING` right now, and the caps each is bound by (the
 * row's own override, else the system default). `id != generationId` is what
 * lets a generation being resumed after a worker crash never count against
 * itself.
 */
async function readGenerationConcurrencyCapacity(
  tx: TransactionClient,
  scope: ProjectScope,
  generationId: string,
): Promise<{ readonly atCapacity: boolean }> {
  const rows = await tx.$queryRaw<
    { projectRunning: bigint; userRunning: bigint; projectLimit: number; userLimit: number }[]
  >`
    SELECT
      (SELECT count(*) FROM "generations"
        WHERE "projectId" = ${scope.projectId} AND "status" = 'RUNNING' AND "id" != ${generationId}
      ) AS "projectRunning",
      (SELECT count(*) FROM "generations" g
        JOIN "projects" p ON p."id" = g."projectId"
        WHERE p."userId" = ${scope.ownerId} AND g."status" = 'RUNNING' AND g."id" != ${generationId}
      ) AS "userRunning",
      COALESCE(
        (SELECT "generationConcurrencyLimit" FROM "projects" WHERE "id" = ${scope.projectId}),
        ${DEFAULT_PROJECT_GENERATION_CONCURRENCY_LIMIT}
      ) AS "projectLimit",
      COALESCE(
        (SELECT "generationConcurrencyLimit" FROM "users" WHERE "id" = ${scope.ownerId}),
        ${DEFAULT_USER_GENERATION_CONCURRENCY_LIMIT}
      ) AS "userLimit"
  `;

  const row = rows[0];

  if (row === undefined) {
    throw new InternalError({ message: "the concurrency capacity check returned no row" });
  }

  const overProjectLimit = row.projectRunning >= BigInt(row.projectLimit);
  const overUserLimit = row.userRunning >= BigInt(row.userLimit);

  return { atCapacity: overProjectLimit || overUserLimit };
}

/**
 * Puts a queued generation back in front of the sweep at a given moment — the
 * one write a refusal that is a *wait* performs.
 *
 * No attempt is opened and nothing failed, so there is nothing to classify and
 * `failureClass` stays null; what the row needs is a deadline, or it would sit
 * out the sweep's full staleness window before being reconsidered at all. Both
 * waits share this: over its owner's capacity (CAL-065), and behind another
 * generation writing the same target (CAL-067).
 */
function deferQueuedGeneration(
  tx: TransactionClient,
  scope: ProjectScope,
  generationId: string,
  dueAt: Date,
): Promise<number> {
  return tx.$executeRaw`
    UPDATE "generations"
    SET "nextAttemptAt" = ${dueAt}
    WHERE "id" = ${generationId}
      AND "status" = 'QUEUED'
      AND "projectId" IN (
        SELECT "id" FROM "projects"
        WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
      )
  `;
}

/**
 * Whether a locked bible element stands in the way of this generation
 * (CAL-095).
 *
 * `isWriteTargetHeld`'s shape, deliberately: the mission and the target are
 * read off the row rather than taken from a caller, so nothing outside can
 * claim to be a mission it is not. A generation nobody owns answers `false` for
 * the same reason its neighbour does — `runLockedOnGeneration` has already
 * refused that case, and answering *blocked* to a row that is not there would
 * turn a `NOT_FOUND` into a lock.
 */
async function isBibleElementLocked(
  tx: TransactionClient,
  scope: ProjectScope,
  generationId: string,
): Promise<boolean> {
  const own = await tx.generation.findFirst({
    where: scopedWhere("Generation", scope, { id: generationId }),
    select: { mission: true, targetId: true },
  });

  if (own === null) return false;

  const gate = await readBibleLocksFor(tx, scope, own.mission, own.targetId);

  return gate.blocked;
}

/**
 * Closes a generation the bible's locks stand in the way of (CAL-095).
 *
 * A **stop**, not a wait — which is the whole difference from `target-locked`
 * beside it. A held write target is released by the generation holding it, so
 * the row waits and the sweep brings it back; a lock is released by a person,
 * and a row left `QUEUED` for one would be redelivered every minute until it
 * ran out of tries. So it lands where a decision can be taken about it: `FAILED`
 * and `PERMANENT`, which is what puts it in `listFailedGenerations` with a
 * *Relancer* button, and `replayGeneration` reopens the same row once the author
 * has lifted the lock.
 *
 * **No attempt is opened and no usage column is written**, because nothing was
 * asked of a provider. That is the same arithmetic `GENERATION_INTERRUPTED`
 * relies on: a try nobody made sums to nothing.
 */
function settleLockedGeneration(
  tx: TransactionClient,
  scope: ProjectScope,
  generationId: string,
): Promise<number> {
  return tx.$executeRaw`
    UPDATE "generations"
    SET "status" = 'FAILED',
        "completedAt" = now(),
        "errorCode" = 'BIBLE_ELEMENT_LOCKED',
        "errorCategory" = 'CONFLICT',
        "failureClass" = 'PERMANENT',
        "nextAttemptAt" = NULL
    WHERE "id" = ${generationId}
      AND "status" IN ('QUEUED', 'RUNNING')
      AND "projectId" IN (
        SELECT "id" FROM "projects"
        WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
      )
  `;
}

/**
 * Whether another generation of this project is already writing where this one
 * would write (CAL-067).
 *
 * **The lock is these rows, not a row of its own.** A write target is held by a
 * generation that is `RUNNING` on it, so it is released by the same three things
 * that end a generation — it completes, it is cancelled, or its worker dies and
 * `requeueOrphanedGenerations` returns it to `QUEUED`. There is nothing to
 * expire separately and nothing that can disagree with the lease.
 *
 * The comparison is on the *write target* and not on `targetId`, because those
 * are different questions: `CREATE_CHARACTER_SHEET` names a character and
 * `EXTRACT_FACTS` names a chapter, and both write the one bible a project has.
 * `../generation/write-target` holds the table; this reads it.
 *
 * Correct only because it runs under the claim's `FOR UPDATE OF g, u`: two
 * generations on one chapter necessarily share an owner, so the owner row lock
 * CAL-065 already takes is what stops two claims passing this check at once.
 */
async function isWriteTargetHeld(
  tx: TransactionClient,
  scope: ProjectScope,
  generationId: string,
): Promise<boolean> {
  const own = await tx.generation.findFirst({
    where: scopedWhere("Generation", scope, { id: generationId }),
    select: { mission: true, targetId: true },
  });

  if (own === null) return false;

  const target = generationWriteTarget(own.mission, own.targetId);

  const holder = await tx.generation.findFirst({
    where: scopedWhere("Generation", scope, {
      id: { not: generationId },
      status: "RUNNING",
      mission: { in: missionsWritingTo(target.kind) },
      // Omitted for a kind the project has exactly one of: two missions writing
      // into one bible collide however their own targets are spelled.
      ...(isProjectWideWriteTarget(target.kind) ? {} : { targetId: target.id }),
    }),
    select: { id: true },
  });

  return holder !== null;
}

/**
 * Decides whether an attempt is owed, and opens one if it is.
 *
 * Everything happens under the generation's own row lock, which is what makes
 * "how many attempts are there" and "insert the next one" one decision instead
 * of two. The lock is on the generation rather than on the project (`./project-lock`)
 * on purpose: two chapters of one novel may be generated at once, and
 * serialising them behind the project row would make a queue's concurrency
 * setting a lie.
 *
 * **Since CAL-065 the transaction also locks the owning `users` row.** That is
 * not the project-row serialisation the paragraph above rules out — it is held
 * only for this short decision, never for the mission call that follows once
 * the transaction commits, so two chapters of one novel (or of two projects of
 * one author) still run fully concurrently once each has been admitted. What it
 * buys is a race-free capacity check: every claim belonging to one owner, across
 * every project they hold, is serialised for the few statements below, which is
 * exactly what makes "count the owner's running generations, then decide"
 * atomic instead of a check two concurrent claims could each pass at once.
 *
 * **CAL-067's write lock rides on that same owner lock**, and could not exist
 * without it. Two generations that would write one chapter belong to one author
 * by construction, so serialising an owner's claims is already serialising every
 * contest for a write target — the lock check below is a `SELECT` under a lock
 * that was already being taken, not a mechanism of its own. What it adds is the
 * answer: a target another generation is `RUNNING` on refuses this claim as
 * `target-locked`, and the row waits rather than being dropped.
 */
export async function claimGenerationAttempt(
  scope: ProjectScope,
  input: ClaimGenerationAttemptInput,
): Promise<Result<GenerationClaim>> {
  assertProjectScope(scope);

  const leaseMs = input.leaseMs ?? DEFAULT_ATTEMPT_LEASE_MS;

  if (!Number.isInteger(leaseMs) || leaseMs < 0) {
    // A call-site bug, and one every call would hit (§7).
    throw new InternalError({ message: "a lease must be a non-negative whole number of ms" });
  }

  const now = input.now ?? new Date();

  return runLockedOnGeneration<GenerationClaim>(
    scope,
    input.generationId,
    async (tx, status) => {
      const settled = REFUSAL_BY_STATUS[status];

      if (settled !== undefined) return succeed({ kind: "refused", reason: settled } as const);

      // The bible's locks, before the two waits and outside the `QUEUED` branch
      // (CAL-095). Outside it because a lock must also stop a `RUNNING` row
      // being resumed after its worker died: the ask was admitted before the
      // author settled the element, and running it now would rewrite what they
      // settled — *modifié silencieusement*, which is the one thing the lock
      // exists to make impossible. Before them because a stop is worth
      // reporting over a wait, `isWriteTargetHeld`'s own reasoning against the
      // capacity check.
      if (await isBibleElementLocked(tx, scope, input.generationId)) {
        await settleLockedGeneration(tx, scope, input.generationId);

        return succeed({ kind: "refused", reason: "element-locked" } as const);
      }

      // Only a genuinely new admission competes for a slot. A generation that
      // is already `RUNNING` here is being resumed after its lease expired —
      // it was already granted a slot, and the sweep's own
      // `requeueOrphanedGenerations` is the fallback if it ever needs to
      // re-enter the queue instead.
      if (status === "QUEUED") {
        // The write lock comes first (CAL-067). A held target is a correctness
        // constraint and a slot is only a budget one, so the more specific
        // reason is the one worth reporting when both apply — and an author
        // reading "another generation is writing this chapter" learns something
        // a capacity message would have hidden.
        if (await isWriteTargetHeld(tx, scope, input.generationId)) {
          await deferQueuedGeneration(
            tx,
            scope,
            input.generationId,
            new Date(now.getTime() + WRITE_TARGET_RETRY_DELAY_MS),
          );

          return succeed({ kind: "refused", reason: "target-locked" } as const);
        }

        const capacity = await readGenerationConcurrencyCapacity(tx, scope, input.generationId);

        if (capacity.atCapacity) {
          await deferQueuedGeneration(
            tx,
            scope,
            input.generationId,
            new Date(now.getTime() + CAPACITY_RETRY_DELAY_MS),
          );

          return succeed({ kind: "refused", reason: "at-capacity" } as const);
        }
      }

      // The whole of the "worker restarted" answer, in one statement. The token
      // and cost columns are not in the SET list, and their absence is the
      // guarantee: nobody can say what an unfinished call consumed, so nothing is
      // written where a number would be invented, and the replay that follows is
      // charged once.
      const reclaimed = await tx.generationAttempt.updateMany({
        where: scopedWhere("GenerationAttempt", scope, {
          generationId: input.generationId,
          status: "RUNNING",
          leaseExpiresAt: { lte: now },
        }),
        data: {
          status: "FAILED",
          errorCode: "GENERATION_INTERRUPTED",
          errorCategory: "INTERNAL",
          completedAt: now,
          leaseExpiresAt: null,
        },
      });

      if (reclaimed.count > 0) {
        // Identifiers and a count (§9). Worth a line: it is the only trace that a
        // worker died, and the number of them is how an operations view sees a
        // host restarting in a loop.
        logger.warn("generation.attempt-reclaimed", {
          generationId: input.generationId,
          itemCount: reclaimed.count,
        });
      }

      const live = await tx.generationAttempt.findFirst({
        where: scopedWhere("GenerationAttempt", scope, {
          generationId: input.generationId,
          status: "RUNNING",
        }),
        orderBy: { attempt: "desc" },
        select: { attempt: true },
      });

      // Someone holds a lease that has not expired. A redelivery must leave them
      // alone: two workers on one ask is two answers and two prices.
      if (live !== null) {
        return succeed({ kind: "refused", reason: "in-flight", attempt: live.attempt } as const);
      }

      const last = await tx.generationAttempt.findFirst({
        where: scopedWhere("GenerationAttempt", scope, { generationId: input.generationId }),
        orderBy: { attempt: "desc" },
        select: { attempt: true },
      });

      const attempt = (last?.attempt ?? 0) + 1;

      await tx.generationAttempt.create({
        data: {
          generationId: input.generationId,
          attempt,
          model: input.model,
          promptVersion: input.promptVersion ?? null,
          status: "RUNNING",
          startedAt: now,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
        },
      });

      // Progress is cleared with the same statement that opens the attempt: a
      // reload during attempt 2 must never show attempt 1's last step. The retry
      // pair goes with it (CAL-063): the wait is over — this *is* the attempt it
      // was waiting for — and nothing has failed yet, so a screen watching the row
      // must not still be told a retry is pending.
      await tx.$executeRaw`
        UPDATE "generations"
        SET "status" = 'RUNNING', "progressStep" = NULL, "progressPercent" = NULL,
            "failureClass" = NULL, "nextAttemptAt" = NULL
        WHERE "id" = ${input.generationId}
          AND "status" IN ('QUEUED', 'RUNNING')
          AND "projectId" IN (
            SELECT "id" FROM "projects"
            WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
          )
      `;

      return succeed({ kind: "claimed", attempt } as const);
    },
    { lockOwner: true },
  );
}

/**
 * Records what one attempt ended in, and moves the generation with it — in one
 * transaction, together with whatever the caller appends.
 *
 * The attempt update is conditional on the row still being `RUNNING`, and that
 * condition is the no-double-count rule: a redelivered completion, or one from
 * a worker whose lease was reclaimed while it worked, moves nothing and is told
 * so. Nothing else in this function runs when it does — no revision is
 * appended, no status is moved, no cost is written a second time.
 *
 * `append` receives the same transaction, which is how §7's *succeed is a
 * single atomic operation* is satisfied: the revision and the completion commit
 * together or not at all. A failure from it rolls the whole thing back.
 *
 * A **retryable** failure returns the generation to `QUEUED` rather than
 * closing it. The classification is already on the outcome (§7: *classify
 * before retrying*), and it is what lets a queue redeliver a transient failure
 * without a human deciding to replay — while a permanent one lands `FAILED` and
 * waits for `replayGeneration`, which is a decision and looks like one.
 *
 * A **cancelled** generation absorbs whatever its attempt was about to say
 * (CAL-064). The decision is already terminal and it is a person's, so the
 * attempt is closed with the usage it really reported and nothing else happens:
 * no append, no generation update. That is what makes cancelling free of a
 * partial write — the append is the only thing in this transaction that touches
 * narrative data, and it is skipped rather than rolled back.
 */
export async function completeGenerationAttempt(
  scope: ProjectScope,
  outcome: GenerationAttemptOutcome,
  append?: (client: TransactionClient) => Promise<Result<void>>,
): Promise<Result<AttemptCompletion>> {
  assertProjectScope(scope);

  if (outcome.status === "running") {
    // Completing an attempt as running is not a state, it is a call-site bug.
    throw new InternalError({ message: "an attempt cannot be completed as running" });
  }

  const succeeded = outcome.status === "succeeded";
  const usage = outcome.usage;
  const category =
    outcome.errorCategory === undefined ? null : ERROR_CATEGORY_COLUMN[outcome.errorCategory];
  const failureClass =
    outcome.failureClass === undefined ? null : FAILURE_CLASS_COLUMN[outcome.failureClass];
  // A deadline only ever accompanies a row going back to `QUEUED`. Writing one
  // on the permanent path would be refused by `generations_retry_check`, and
  // rightly: a failed generation is not waiting for anything.
  const nextAttemptAt = outcome.retryable ? (outcome.nextAttemptAt ?? null) : null;

  return runLockedOnGeneration(scope, outcome.generationId, async (tx, status) => {
    // The author cancelled while this attempt was in flight (CAL-064). The
    // attempt is still settled — it ran, and it is the only party that can say
    // what it consumed, so whatever `report()` stated is written here and
    // nowhere else. What is *not* done is the point: the append never runs, so
    // no revision, no aggregate and no chapter status moves, and the generation
    // row keeps the terminal state a person chose. Recording it `FAILED` rather
    // than honouring `outcome.status` is the honest record of an answer that was
    // discarded — a `SUCCEEDED` attempt whose result was thrown away would make
    // `readMissionMeasurements` count a generation nobody received.
    const cancelled = status === "CANCELLED";

    const applied = await tx.generationAttempt.updateMany({
      where: scopedWhere("GenerationAttempt", scope, {
        generationId: outcome.generationId,
        attempt: outcome.attempt,
        status: "RUNNING",
      }),
      data: {
        status: succeeded && !cancelled ? "SUCCEEDED" : "FAILED",
        completedAt: new Date(),
        leaseExpiresAt: null,
        durationMs: outcome.durationMs,
        promptVersion: outcome.promptVersion,
        // Left untouched when the provider reported nothing: an attempt with no
        // measurement costs nothing, which is the honest record of a call that
        // never came back.
        model: usage?.model,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        estimatedCostUsd: usage?.estimatedCostUsd,
        errorCode: cancelled ? "GENERATION_CANCELLED" : (outcome.errorCode ?? null),
        errorCategory: cancelled ? "CONFLICT" : category,
      },
    });

    if (applied.count === 0) return succeed<AttemptCompletion>("already-completed");

    if (cancelled) return succeed<AttemptCompletion>("cancelled");

    if (append !== undefined) {
      const appended = await append(tx);

      if (!appended.ok) throw new RollbackSignal(appended.error);
    }

    if (succeeded) {
      await tx.$executeRaw`
        UPDATE "generations"
        SET "status" = 'SUCCEEDED', "completedAt" = now(),
            "errorCode" = NULL, "errorCategory" = NULL,
            "failureClass" = NULL, "nextAttemptAt" = NULL
        WHERE "id" = ${outcome.generationId}
          AND "projectId" IN (
            SELECT "id" FROM "projects"
            WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
          )
      `;
    } else if (outcome.retryable) {
      // Back in the queue, with the wait CAL-063's policy computed. The code and
      // the category are cleared because the row has no failure a client may be
      // shown any more — it is open again — while the class stays, since it is
      // the only thing that distinguishes a generation waiting out a rate limit
      // from one that has simply not started yet.
      await tx.$executeRaw`
        UPDATE "generations"
        SET "status" = 'QUEUED', "completedAt" = NULL,
            "errorCode" = NULL, "errorCategory" = NULL,
            "failureClass" = ${failureClass}::"generation_failure_class",
            "nextAttemptAt" = ${nextAttemptAt}
        WHERE "id" = ${outcome.generationId}
          AND "projectId" IN (
            SELECT "id" FROM "projects"
            WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
          )
      `;
    } else {
      await tx.$executeRaw`
        UPDATE "generations"
        SET "status" = 'FAILED', "completedAt" = now(),
            "errorCode" = ${outcome.errorCode ?? null},
            "errorCategory" = ${category}::"error_category",
            "failureClass" = ${failureClass}::"generation_failure_class",
            "nextAttemptAt" = NULL
        WHERE "id" = ${outcome.generationId}
          AND "projectId" IN (
            SELECT "id" FROM "projects"
            WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
          )
      `;
    }

    return succeed<AttemptCompletion>("applied");
  });
}

/**
 * Whether a renewal moved the lease, or found the work no longer ours to do.
 *
 * `cancelled` and `lost` are both "stop", and they are told apart because the
 * remedies differ: a cancelled generation is finished and its attempt should be
 * settled, while a lost one belongs to somebody else and settling it would write
 * over their claim.
 */
export type AttemptLeaseRenewal = "renewed" | "cancelled" | "lost";

export interface RenewGenerationAttemptLeaseInput {
  readonly generationId: string;
  readonly attempt: number;
  readonly leaseMs?: number;
  readonly now?: Date;
}

/**
 * Pushes an attempt's lease back while the work is still running (CAL-061).
 *
 * `DEFAULT_ATTEMPT_LEASE_MS` is thirty minutes because nothing renewed it: with
 * no renewal the lease has to outlast the longest mission, or a healthy call is
 * reclaimed under itself and its answer thrown away. Renewal inverts that — the
 * lease only has to outlast a plausible pause, so it can be minutes instead of
 * half an hour, and a killed worker is noticed that much sooner.
 *
 * `lost` is not an error. It means a sweep or another claim decided this attempt
 * was dead and reclaimed it; the row is no longer `RUNNING` and no renewal can
 * bring it back. The caller stops renewing and lets the run finish — its
 * completion will find the attempt closed and report `already-completed`, which
 * is the `superseded` path and the one that keeps a discarded answer from being
 * written beside the replacement's.
 *
 * **It is also the watch** (CAL-064). The statement renews only while the
 * generation itself is still `RUNNING`, which is what turns a heartbeat the
 * worker was already sending into the channel a cancellation travels down — no
 * second poll, no pub/sub, and nothing for a killed worker to lose, because the
 * decision is a column rather than a message. The disambiguating read costs a
 * query only on the path where the run is over anyway.
 */
export async function renewGenerationAttemptLease(
  scope: ProjectScope,
  input: RenewGenerationAttemptLeaseInput,
): Promise<Result<AttemptLeaseRenewal>> {
  assertProjectScope(scope);

  const leaseMs = input.leaseMs ?? DEFAULT_ATTEMPT_LEASE_MS;

  if (!Number.isInteger(leaseMs) || leaseMs < 0) {
    throw new InternalError({ message: "a lease must be a non-negative whole number of ms" });
  }

  const now = input.now ?? new Date();
  const client = getDatabaseClient();

  const renewed = await client.generationAttempt.updateMany({
    where: scopedWhere("GenerationAttempt", scope, {
      generationId: input.generationId,
      attempt: input.attempt,
      status: "RUNNING",
      generation: { status: "RUNNING" },
    }),
    data: { leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });

  if (renewed.count > 0) return succeed("renewed");

  const generation = await client.generation.findFirst({
    where: scopedWhere("Generation", scope, { id: input.generationId }),
    select: { status: true },
  });

  return succeed(generation?.status === "CANCELLED" ? "cancelled" : "lost");
}

export interface UpdateGenerationProgressInput {
  readonly generationId: string;
  readonly step: string;
  readonly percent?: number;
}

/**
 * Records the named step and indicative percentage a running mission last
 * reported (CAL-062) — `reportProgress` inside `produce`, persisted.
 *
 * Raw SQL and unconditional on the row's own `version`/audit block, the same
 * shape `claimGenerationAttempt`'s status write already uses: this is a
 * transition authored by nobody, exactly what `./generation-run.ts`'s own
 * doc comment describes.
 *
 * Restricted to a generation that is `RUNNING` — a progress update racing a
 * completion (the attempt finished and moved the row on) is silently a
 * no-op rather than resurrecting a display value on a settled generation.
 * Best-effort by design: nothing here throws for "no row matched", because
 * that is the ordinary outcome of a late update, not a failure.
 */
export async function updateGenerationProgress(
  scope: ProjectScope,
  input: UpdateGenerationProgressInput,
): Promise<void> {
  assertProjectScope(scope);

  const percent =
    input.percent === undefined ? null : Math.min(100, Math.max(0, Math.round(input.percent)));

  await getDatabaseClient().$executeRaw`
    UPDATE "generations"
    SET "progressStep" = ${input.step}, "progressPercent" = ${percent}
    WHERE "id" = ${input.generationId}
      AND "status" = 'RUNNING'
      AND "projectId" IN (
        SELECT "id" FROM "projects"
        WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
      )
  `;
}

/**
 * Reopens a failed generation so the next claim can try again.
 *
 * The same row, never a second one: the attempts already recorded stay where
 * they are, `MAX(attempt)` keeps climbing, and the cost already spent stays
 * counted exactly once. That is CAL-058's acceptance criterion read literally —
 * *rejouer une génération échouée n'incrémente pas deux fois le coût
 * comptabilisé*: the replay adds what it really spends and re-adds nothing.
 *
 * Idempotent for a generation already open, refused for one that succeeded or
 * was cancelled — replaying those is not a retry, it is a new ask, and a new
 * ask goes through `reserveGeneration` with the inputs that make it one.
 *
 * **It raises the row's own attempt ceiling, and it has to** (CAL-063). The
 * attempts are append-only, so a generation the sweep closed as
 * `GENERATION_ATTEMPTS_EXHAUSTED` still has `MAX_GENERATION_ATTEMPTS` of them
 * after a replay — and the sweep closes an over-ceiling row *before* it delivers
 * anything, so without a new ceiling the replay would be undone within a minute,
 * every time, and the button would look broken. The new ceiling is what has
 * already been spent plus a fresh allowance: the cost already counted stays
 * counted exactly once, and the loop breaker still breaks the loop.
 *
 * **It clears the backoff too.** An author who clicks *Relancer* has decided; the
 * exponential wait exists to protect a provider from an automatic loop, not to
 * make a person wait for a decision they have already taken.
 */
export async function replayGeneration(
  scope: ProjectScope,
  generationId: string,
): Promise<Result<ReservedGeneration>> {
  assertProjectScope(scope);

  return runLockedOnGeneration(scope, generationId, async (tx, status) => {
    if (status === "SUCCEEDED" || status === "CANCELLED") {
      throw new RollbackSignal(
        new ConflictError({ message: "only a failed generation can be replayed" }),
      );
    }

    // A `RUNNING` generation is left exactly alone: somebody holds a lease on it,
    // and reopening it under them is how two workers come to believe they own one
    // ask. A `QUEUED` one is rewritten as well as a `FAILED` one, because a row
    // waiting out a backoff is precisely what this act overrides — the wait is
    // there to protect a provider from an automatic loop, not to make a person
    // wait for a decision they have already taken.
    //
    // The ceiling is recomputed from the attempts inside the same locked
    // transaction that reads them, so two clicks cannot each add an allowance on
    // top of a count taken before the other's write.
    if (status !== "RUNNING") {
      await tx.$executeRaw`
        UPDATE "generations" g
        SET "status" = 'QUEUED', "completedAt" = NULL,
            "errorCode" = NULL, "errorCategory" = NULL,
            "failureClass" = NULL, "nextAttemptAt" = NULL,
            "attemptCeiling" = (
              SELECT count(*) FROM "generation_attempts" a WHERE a."generationId" = g."id"
            ) + ${MAX_GENERATION_ATTEMPTS}
        WHERE g."id" = ${generationId}
          AND g."projectId" IN (
            SELECT "id" FROM "projects"
            WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
          )
      `;
    }

    const row = await tx.generation.findFirst({
      where: scopedWhere("Generation", scope, { id: generationId }),
      select: RESERVATION_FIELDS,
    });

    if (row === null) throw new RollbackSignal(generationNotFound());

    return succeed({ ...row, created: false });
  });
}

/** Whether this call cancelled the generation, or found it already cancelled. */
export type GenerationCancellation = "cancelled" | "already-cancelled";

/**
 * Stops a generation the author no longer wants (CAL-064).
 *
 * **It writes the generation row and nothing else** — in particular it does not
 * close the running attempt. That is the whole design, and it is what makes
 * *comptabiliser uniquement les jetons réellement consommés* true rather than
 * hoped for: the worker holding the call is the only party that can say what the
 * provider was asked for, so it settles its own attempt with the usage it really
 * reported (`completeGenerationAttempt`, the `CANCELLED` branch). Closing the
 * attempt from here would either invent a number or throw away a real one.
 *
 * The worker finds out through the lease renewal it was already sending, which
 * refuses to renew against a generation that is no longer `RUNNING`. If the
 * worker is dead instead, nothing is owed: the lease expires and the sweep
 * reclaims the attempt with its usage columns untouched, exactly as it does for
 * any interrupted call.
 *
 * A `QUEUED` generation needs no more than this either. The sweep only ever
 * delivers `QUEUED` rows, and a job already sitting in Redis that does get
 * delivered is refused by `claimGenerationAttempt` and ends `skipped` — so the
 * row answers for itself rather than needing the queue to be corrected.
 *
 * Already cancelled is a success, not a conflict: a second click is the same
 * decision, not a new one. Succeeded and failed are conflicts, because the
 * remedy is to look again rather than to try again.
 */
export async function cancelGeneration(
  scope: ProjectScope,
  generationId: string,
): Promise<Result<GenerationCancellation>> {
  assertProjectScope(scope);

  return runLockedOnGeneration(scope, generationId, async (tx, status) => {
    if (status === "CANCELLED") return succeed<GenerationCancellation>("already-cancelled");

    if (status === "SUCCEEDED" || status === "FAILED") {
      throw new RollbackSignal(
        new ConflictError({ message: "only a generation still in flight can be cancelled" }),
      );
    }

    // `completedAt` is required of a terminal row by `generations_completion_check`
    // and `nextAttemptAt` must be null on one by `generations_retry_check`; the
    // failure columns are cleared because a cancellation is not a failure and
    // `listFailedGenerations` must not offer *Relancer* for it. The progress
    // pair goes too — it describes work that is no longer happening.
    await tx.$executeRaw`
      UPDATE "generations"
      SET "status" = 'CANCELLED', "completedAt" = now(),
          "errorCode" = NULL, "errorCategory" = NULL,
          "failureClass" = NULL, "nextAttemptAt" = NULL,
          "progressStep" = NULL, "progressPercent" = NULL
      WHERE "id" = ${generationId}
        AND "projectId" IN (
          SELECT "id" FROM "projects"
          WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
        )
    `;

    return succeed<GenerationCancellation>("cancelled");
  });
}

export interface GenerationPersistenceOptions<T> {
  readonly generationId: string;
  /** The model the mission routes to, written before the call. */
  readonly model: string;
  readonly leaseMs?: number;
  /** Injected clock (§8) — one for the lease and for the reclaim alike. */
  readonly now?: () => Date;
  /**
   * Appends what the generation produced, inside the transaction that completes
   * it. The revision write of §7's atomic `succeed`, supplied by the domain
   * that knows what a revision is.
   */
  readonly append?: (client: TransactionClient, value: T) => Promise<Result<void>>;
}

/**
 * The three writes `runGenerationAttempt` needs, over this repository.
 *
 * A `Result` failure from any of them is thrown rather than returned: the port
 * hands back plain values, and the runner already treats a throw from the
 * persistence as the failure it is. Nothing is swallowed, and the runner's own
 * bookkeeping stays the only place the decision to continue is taken.
 */
export function createGenerationPersistence<T>(
  scope: ProjectScope,
  options: GenerationPersistenceOptions<T>,
): GenerationPersistence<T> {
  const clock = options.now ?? ((): Date => new Date());

  const complete = async (
    outcome: GenerationAttemptOutcome,
    append?: (client: TransactionClient) => Promise<Result<void>>,
  ): Promise<AttemptCompletion> => {
    const completed = await completeGenerationAttempt(scope, outcome, append);

    if (!completed.ok) throw completed.error;

    return completed.value;
  };

  return {
    async claim(context): Promise<GenerationClaim> {
      const claimed = await claimGenerationAttempt(scope, {
        generationId: context.generationId,
        model: options.model,
        promptVersion: context.promptVersion,
        leaseMs: options.leaseMs,
        now: clock(),
      });

      if (!claimed.ok) throw claimed.error;

      return claimed.value;
    },

    succeed(value, outcome): Promise<AttemptCompletion> {
      const append = options.append;

      return complete(
        outcome,
        append === undefined ? undefined : (client) => append(client, value),
      );
    },

    fail(outcome): Promise<AttemptCompletion> {
      return complete(outcome);
    },
  };
}

interface RunLockedOnGenerationOptions {
  /**
   * Also locks the owning `users` row for the transaction (CAL-065). Only the
   * claim needs it — the capacity check that runs under this lock is the one
   * decision that reads across every generation an owner has, and it has to be
   * atomic against another claim by the same owner doing the same read.
   * `completeGenerationAttempt`, `replayGeneration` and `cancelGeneration` each
   * touch one row they already hold and never increase what is running, so
   * they have no reason to pay for the extra lock.
   */
  readonly lockOwner?: boolean;
}

/**
 * One transaction, holding the generation's row lock, with its ownership proven
 * by the same statement that takes it — `./project-lock`'s shape, one level
 * down. The `userId` in the `WHERE` is what makes a forged scope find nothing
 * to lock, so a body running under one never starts.
 */
async function runLockedOnGeneration<T>(
  scope: ProjectScope,
  generationId: string,
  body: (client: TransactionClient, status: $Enums.GenerationStatus) => Promise<Result<T>>,
  options: RunLockedOnGenerationOptions = {},
): Promise<Result<T>> {
  try {
    return await getDatabaseClient().$transaction(async (tx) => {
      const rows = options.lockOwner
        ? await tx.$queryRaw`
            SELECT g."status"::text AS "status"
            FROM "generations" g
            JOIN "projects" p ON p."id" = g."projectId"
            JOIN "users" u ON u."id" = p."userId"
            WHERE g."id" = ${generationId}
              AND p."id" = ${scope.projectId}
              AND p."userId" = ${scope.ownerId}
            FOR UPDATE OF g, u
          `
        : await tx.$queryRaw`
            SELECT g."status"::text AS "status"
            FROM "generations" g
            JOIN "projects" p ON p."id" = g."projectId"
            WHERE g."id" = ${generationId}
              AND p."id" = ${scope.projectId}
              AND p."userId" = ${scope.ownerId}
            FOR UPDATE OF g
          `;

      const status = readStatus(rows);

      if (status === undefined) throw new RollbackSignal(generationNotFound());

      return await body(tx, status);
    });
  } catch (error: unknown) {
    if (error instanceof RollbackSignal) return fail(error.failure);

    throw error;
  }
}

/**
 * A raw result is untrusted input like any other (§6) — never cast. The status
 * is compared against the closed list rather than trusted, so a member added to
 * the enum without being handled here fails loudly instead of falling through
 * the claim's decision table as "not terminal".
 */
function readStatus(rows: unknown): $Enums.GenerationStatus | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;

  const row: unknown = rows[0];

  if (typeof row !== "object" || row === null || !("status" in row)) {
    throw new InternalError({
      message: "the generation lock returned a row of an unexpected shape",
    });
  }

  const status: unknown = row.status;
  const known = GENERATION_STATUS_VALUES.find((value) => value === status);

  if (known === undefined) {
    throw new InternalError({
      message: "the generation lock returned a status outside the closed list",
      fieldPath: "status",
    });
  }

  return known;
}
