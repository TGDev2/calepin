/**
 * The write half of a generation's life (CAL-058) — reserve, claim, complete,
 * replay.
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

import { getDatabaseClient, type TransactionClient } from "../database/client";
import { ConflictError, InternalError, NotFoundError } from "../errors/app-error";
import type { ErrorCategory } from "../errors/categories";
import { fail, type Result, succeed } from "../errors/result";
import {
  type AttemptCompletion,
  type GenerationAttemptOutcome,
  type GenerationClaim,
  generationIdempotencyKey,
  type GenerationPersistence,
} from "../generation";
import { logger } from "../logging";
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
 * Decides whether an attempt is owed, and opens one if it is.
 *
 * Everything happens under the generation's own row lock, which is what makes
 * "how many attempts are there" and "insert the next one" one decision instead
 * of two. The lock is on the generation rather than on the project (`./project-lock`)
 * on purpose: two chapters of one novel may be generated at once, and
 * serialising them behind the project row would make a queue's concurrency
 * setting a lie.
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

  return runLockedOnGeneration<GenerationClaim>(scope, input.generationId, async (tx, status) => {
    const settled = REFUSAL_BY_STATUS[status];

    if (settled !== undefined) return succeed({ kind: "refused", reason: settled } as const);

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

    await tx.$executeRaw`
      UPDATE "generations"
      SET "status" = 'RUNNING'
      WHERE "id" = ${input.generationId}
        AND "status" IN ('QUEUED', 'RUNNING')
        AND "projectId" IN (
          SELECT "id" FROM "projects"
          WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
        )
    `;

    return succeed({ kind: "claimed", attempt } as const);
  });
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

  return runLockedOnGeneration(scope, outcome.generationId, async (tx) => {
    const applied = await tx.generationAttempt.updateMany({
      where: scopedWhere("GenerationAttempt", scope, {
        generationId: outcome.generationId,
        attempt: outcome.attempt,
        status: "RUNNING",
      }),
      data: {
        status: succeeded ? "SUCCEEDED" : "FAILED",
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
        errorCode: outcome.errorCode ?? null,
        errorCategory: category,
      },
    });

    if (applied.count === 0) return succeed<AttemptCompletion>("already-completed");

    if (append !== undefined) {
      const appended = await append(tx);

      if (!appended.ok) throw new RollbackSignal(appended.error);
    }

    if (succeeded) {
      await tx.$executeRaw`
        UPDATE "generations"
        SET "status" = 'SUCCEEDED', "completedAt" = now(),
            "errorCode" = NULL, "errorCategory" = NULL
        WHERE "id" = ${outcome.generationId}
          AND "projectId" IN (
            SELECT "id" FROM "projects"
            WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
          )
      `;
    } else if (outcome.retryable) {
      await tx.$executeRaw`
        UPDATE "generations"
        SET "status" = 'QUEUED', "completedAt" = NULL,
            "errorCode" = NULL, "errorCategory" = NULL
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
            "errorCategory" = ${category}::"error_category"
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

    if (status === "FAILED") {
      await tx.$executeRaw`
        UPDATE "generations"
        SET "status" = 'QUEUED', "completedAt" = NULL,
            "errorCode" = NULL, "errorCategory" = NULL
        WHERE "id" = ${generationId}
          AND "projectId" IN (
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
): Promise<Result<T>> {
  try {
    return await getDatabaseClient().$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
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
