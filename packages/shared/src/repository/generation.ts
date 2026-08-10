/**
 * The generation reader (CAL-039's persistent indicator).
 *
 * `Generation` and its schema (CAL-021) already exist and are already
 * registered in `PROJECT_OWNED_MODELS` and the audit registry — nothing has
 * written a row yet, since the mission registry (`@calepin/ai`, CAL-048) and
 * the worker that runs it (CAL-060) are both still to come (CLAUDE.md §13).
 * This module is the read half only, built ahead of its producer the same
 * way the registries were: `listRunningGenerations` answers "nothing" today
 * and starts answering for real the moment something enqueues a row.
 *
 * **Never selects `input`.** It is the mission's resolved payload — possibly
 * carrying the author's own instructions — and §9 counts that as literary
 * content: it must never reach a screen that isn't the generation itself.
 */

import type { $Enums } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import { InternalError, NotFoundError } from "../errors/app-error";
import type { ErrorCategory } from "../errors/categories";
import { ERROR_CODES, type ErrorCode } from "../errors/codes";
import { fail, type Result, succeed } from "../errors/result";
import type { GenerationFailureClass } from "../generation/retry";
import { generationWriteTarget, sameWriteTarget } from "../generation/write-target";
import { buildGenerationContext, type GenerationContext } from "../generation-context";
import { PROJECT_OWNER_FIELD } from "./owned-models";
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";

export type { GenerationContext };

/**
 * `GenerationMission`, re-exported under the repository's own name so
 * `apps/web` can type against it without importing `@prisma/client` — the
 * import the interface layer is never allowed to hold (CLAUDE.md §3.5).
 */
export type GenerationMission = $Enums.GenerationMission;

const RUNNING_STATUSES = [
  "QUEUED",
  "RUNNING",
] as const satisfies readonly $Enums.GenerationStatus[];

export type RunningGenerationStatus = (typeof RUNNING_STATUSES)[number];

/** One generation still in flight — everything a persistent indicator needs. */
export interface RunningGeneration {
  readonly id: string;
  readonly mission: GenerationMission;
  readonly status: RunningGenerationStatus;
  readonly createdAt: Date;
  /** The named step and indicative percentage last reported (CAL-062). */
  readonly progressStep: string | null;
  readonly progressPercent: number | null;
  /**
   * Non-null when this generation is queued *again* after a failure worth
   * retrying (CAL-063) — so the indicator can say that a new attempt is coming
   * rather than leaving an author watching a spinner that looks stuck.
   */
  readonly failureClass: GenerationFailureClass | null;
  /**
   * This row's 1-based rank among the project's own `QUEUED` generations
   * (CAL-065) — "you are third in line," not a promise of when a slot opens,
   * since a slot also depends on the owner's cap across their other projects.
   * Null for a `RUNNING` row: it already has a slot, and has no position to
   * report.
   */
  readonly queuePosition: number | null;
  /**
   * True when this queued generation is waiting on the write lock (CAL-067) —
   * another generation of the project is `RUNNING` on the chapter, the bible or
   * the plan this one would write.
   *
   * The specification asks that a concurrent ask be *queued and not silently
   * refused*, and this is the second half of that: the claim keeps the row
   * `QUEUED`, and this is what lets a screen say why nothing is moving instead
   * of showing a queue position an author has no way to interpret. Always false
   * for a `RUNNING` row — it is the one holding a target, not waiting on one.
   */
  readonly blockedByWriteTarget: boolean;
}

/**
 * A project's generations still in flight, oldest first — the order a queue
 * is read in, and the one the `[projectId, createdAt]` index already serves.
 *
 * `queuePosition` is computed here, over the array this query already fetches
 * in that same order — no second query, no window function: a running count
 * of the `QUEUED` rows seen so far *is* each one's rank.
 *
 * `blockedByWriteTarget` comes out of the same array for the same reason. The
 * lock of CAL-067 is derived from the project's `RUNNING` rows and this query
 * has already fetched every one of them, so the answer is a comparison in
 * memory rather than a second statement — and it is the same comparison
 * `claimGenerationAttempt` makes, through the same table, so a screen cannot
 * disagree with the arbiter about who is waiting on whom.
 */
export async function listRunningGenerations(scope: ProjectScope): Promise<RunningGeneration[]> {
  assertProjectScope(scope);

  const rows = await getDatabaseClient().generation.findMany({
    where: scopedWhere("Generation", scope, { status: { in: RUNNING_STATUSES } }),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      mission: true,
      targetId: true,
      status: true,
      createdAt: true,
      progressStep: true,
      progressPercent: true,
      failureClass: true,
    },
  });

  const held = rows
    .filter((row) => row.status === "RUNNING")
    .map((row) => generationWriteTarget(row.mission, row.targetId));

  let queued = 0;

  return rows.map(({ targetId, ...row }) => ({
    ...row,
    status: row.status as RunningGenerationStatus,
    failureClass: toFailureClass(row.failureClass),
    queuePosition: row.status === "QUEUED" ? (queued += 1) : null,
    blockedByWriteTarget:
      row.status === "QUEUED" &&
      held.some((target) => sameWriteTarget(target, generationWriteTarget(row.mission, targetId))),
  }));
}

/**
 * One generation that has failed for good, as the screen offering a replay needs
 * it (CAL-063).
 *
 * Classification only. The code, its category and its class are the three fields
 * §9 lets a failure carry, and every one of them is a closed enumeration — no
 * message, no provider payload, no fragment of what was being written. The
 * French sentence the author reads is built in `apps/web` from the code, which
 * is the same division `project-action-error.ts` already uses for a refused
 * action.
 */
export interface FailedGeneration {
  readonly id: string;
  readonly mission: GenerationMission;
  readonly targetId: string | null;
  readonly errorCode: ErrorCode | null;
  readonly errorCategory: ErrorCategory | null;
  readonly failureClass: GenerationFailureClass | null;
  /** How many tries it took before Calepin stopped. `MAX(attempt)`, never stored. */
  readonly attemptCount: number;
  readonly completedAt: Date | null;
}

/**
 * A project's failed generations, newest first — the order an author reads a
 * problem list in, and the one `@@index([projectId, createdAt])` serves.
 *
 * `FAILED` only. A cancelled generation is not a failure (nothing went wrong and
 * there is nothing to explain), and a generation waiting out a backoff is still
 * in flight — it appears in `listRunningGenerations` above, where it belongs,
 * because offering a *Relancer* button for work that is about to run by itself
 * would invite an author to pay for the same call twice.
 */
export async function listFailedGenerations(scope: ProjectScope): Promise<FailedGeneration[]> {
  assertProjectScope(scope);

  const rows = await getDatabaseClient().generation.findMany({
    where: scopedWhere("Generation", scope, { status: "FAILED" }),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      mission: true,
      targetId: true,
      errorCode: true,
      errorCategory: true,
      failureClass: true,
      completedAt: true,
      // The attempt count is an aggregate, never a column (§4.3). Taking the
      // highest attempt number rather than counting rows answers the same
      // question and matches what `claimGenerationAttempt` allocates.
      attempts: { orderBy: { attempt: "desc" }, take: 1, select: { attempt: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    mission: row.mission,
    targetId: row.targetId,
    // The column is free text — the code set is closed in TypeScript and adding
    // a member is a one-line diff, so pinning the column to it in PostgreSQL
    // would make every new code a migration. Narrowed on the way out rather than
    // cast: a row written by a later release than this reader answers `null` and
    // the screen falls back to the class, instead of naming a code it has no
    // message for (§6).
    errorCode: toErrorCode(row.errorCode),
    errorCategory: toErrorCategory(row.errorCategory),
    failureClass: toFailureClass(row.failureClass),
    attemptCount: row.attempts[0]?.attempt ?? 0,
    completedAt: row.completedAt,
  }));
}

/** The three enum spellings, read back into the lowercase union (CAL-063). */
const FAILURE_CLASS_BY_COLUMN = {
  TRANSIENT: "transient",
  RATE_LIMITED: "rate_limited",
  PERMANENT: "permanent",
} as const satisfies Record<$Enums.GenerationFailureClass, GenerationFailureClass>;

function toFailureClass(
  value: $Enums.GenerationFailureClass | null,
): GenerationFailureClass | null {
  return value === null ? null : FAILURE_CLASS_BY_COLUMN[value];
}

const ERROR_CATEGORY_BY_COLUMN = {
  VALIDATION: "validation",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  RATE_LIMIT: "rate_limit",
  PROVIDER: "provider",
  TIMEOUT: "timeout",
  INTERNAL: "internal",
} as const satisfies Record<$Enums.ErrorCategory, ErrorCategory>;

function toErrorCategory(value: $Enums.ErrorCategory | null): ErrorCategory | null {
  return value === null ? null : ERROR_CATEGORY_BY_COLUMN[value];
}

function toErrorCode(value: string | null): ErrorCode | null {
  // `find` rather than a cast behind an `includes`, the shape `readStatus` in
  // `./generation-run.ts` already uses: the narrowing is the search's own result,
  // so §6's "never cast" holds without a comment promising it does.
  return value === null ? null : (ERROR_CODES.find((code) => code === value) ?? null);
}

/**
 * `Generation.status`, re-exported under the repository's own name — the
 * five-value execution status, never to be confused with the three-value
 * attempt outcome `GenerationStatus` of `@calepin/shared/generation`.
 */
export type GenerationExecutionStatus = $Enums.GenerationStatus;

const GENERATION_EXECUTION_STATUSES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const satisfies readonly $Enums.GenerationStatus[];

function toGenerationExecutionStatus(value: string): GenerationExecutionStatus {
  const status = GENERATION_EXECUTION_STATUSES.find((candidate) => candidate === value);

  if (status === undefined) {
    throw new InternalError({
      message: "the recent generations query returned a status this build has no name for",
      fieldPath: "status",
    });
  }

  return status;
}

/**
 * The user's own generations, newest first — CAL-068's operations screen, the
 * one place every mission call an author has ever asked for is diagnosable
 * without opening the database.
 *
 * **User-wide, not project-scoped.** The backlog names it "les générations
 * récentes de l'utilisateur", and the same shape `listProjectDashboardRows`
 * already uses: an owner id, no `ProjectScope`, because the whole point is to
 * cross every project the author has.
 *
 * **Every field that `Generation` itself cannot answer — model, tokens,
 * duration, cost, attempt count — is aggregated from `GenerationAttempt`**,
 * the same reasoning `readMissionMeasurements` and `readProjectCostSummary`
 * already carry: a retried generation may have called more than one model, so
 * none of those numbers is a column on the generation, only a sum or a most-
 * recent value over its attempts. `model` is the *latest* attempt's, read via
 * `ARRAY_AGG(... ORDER BY "attempt" DESC)`, since a fallback (CAL-050) can
 * change it between tries and the reader wants what was last asked, not what
 * was first.
 *
 * **Never selects `Generation.input` or `targetId`.** `input` is the mission's
 * resolved payload — literary content, forbidden here by §9 — and a raw
 * `targetId` on screen would be a database key with nothing to resolve it
 * against, which is not what "diagnose without opening the database" means.
 *
 * `estimatedCostUsd` is cast to `text` in SQL, never read as a `Decimal` —
 * the same rule `generation-cost.ts`'s own doc-comment states and the same
 * reason: money is a decimal string on both sides of the boundary, never a
 * float.
 */
export interface RecentGeneration {
  readonly id: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly mission: GenerationMission;
  readonly status: GenerationExecutionStatus;
  /** The latest attempt's model, or `null` for a generation never attempted. */
  readonly model: string | null;
  /** `COUNT` over the attempts, never a stored column (§4.3). */
  readonly attemptCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** `SUM` of every attempt's own `durationMs` — the model time actually spent. */
  readonly durationMs: number;
  readonly estimatedCostUsd: string;
  readonly errorCode: ErrorCode | null;
  readonly errorCategory: ErrorCategory | null;
  readonly failureClass: GenerationFailureClass | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

const DEFAULT_RECENT_GENERATIONS_LIMIT = 100;

function assertOwnerId(ownerId: string): void {
  if (ownerId !== "") return;

  throw new InternalError({
    code: "PROJECT_SCOPE_REQUIRED",
    message: "the recent generations query was reached without an owner",
  });
}

function toRecentGeneration(row: unknown): RecentGeneration {
  if (
    typeof row !== "object" ||
    row === null ||
    !("id" in row) ||
    !("projectId" in row) ||
    !("projectTitle" in row) ||
    !("mission" in row) ||
    !("status" in row) ||
    !("model" in row) ||
    !("attemptCount" in row) ||
    !("inputTokens" in row) ||
    !("outputTokens" in row) ||
    !("durationMs" in row) ||
    !("estimatedCostUsd" in row) ||
    !("errorCode" in row) ||
    !("errorCategory" in row) ||
    !("failureClass" in row) ||
    !("createdAt" in row) ||
    !("completedAt" in row)
  ) {
    throw new InternalError({ message: "the recent generations query returned an unexpected row" });
  }

  const {
    id,
    projectId,
    projectTitle,
    mission,
    status,
    model,
    attemptCount,
    inputTokens,
    outputTokens,
    durationMs,
    estimatedCostUsd,
    errorCode,
    errorCategory,
    failureClass,
    createdAt,
    completedAt,
  } = row as Record<string, unknown>;

  if (typeof id !== "string") throw new InternalError({ message: "bad row", fieldPath: "id" });
  if (typeof projectId !== "string") {
    throw new InternalError({ message: "bad row", fieldPath: "projectId" });
  }
  if (typeof projectTitle !== "string") {
    throw new InternalError({ message: "bad row", fieldPath: "projectTitle" });
  }
  if (typeof mission !== "string") {
    throw new InternalError({ message: "bad row", fieldPath: "mission" });
  }
  if (typeof status !== "string") {
    throw new InternalError({ message: "bad row", fieldPath: "status" });
  }
  if (model !== null && typeof model !== "string") {
    throw new InternalError({ message: "bad row", fieldPath: "model" });
  }
  if (typeof attemptCount !== "number") {
    throw new InternalError({ message: "bad row", fieldPath: "attemptCount" });
  }
  if (typeof inputTokens !== "number") {
    throw new InternalError({ message: "bad row", fieldPath: "inputTokens" });
  }
  if (typeof outputTokens !== "number") {
    throw new InternalError({ message: "bad row", fieldPath: "outputTokens" });
  }
  if (typeof durationMs !== "number") {
    throw new InternalError({ message: "bad row", fieldPath: "durationMs" });
  }
  if (typeof estimatedCostUsd !== "string") {
    throw new InternalError({ message: "bad row", fieldPath: "estimatedCostUsd" });
  }
  if (!(createdAt instanceof Date)) {
    throw new InternalError({ message: "bad row", fieldPath: "createdAt" });
  }
  if (completedAt !== null && !(completedAt instanceof Date)) {
    throw new InternalError({ message: "bad row", fieldPath: "completedAt" });
  }

  return {
    id,
    projectId,
    projectTitle,
    mission: mission as GenerationMission,
    status: toGenerationExecutionStatus(status),
    model,
    attemptCount,
    inputTokens,
    outputTokens,
    durationMs,
    estimatedCostUsd,
    errorCode: toErrorCode(typeof errorCode === "string" ? errorCode : null),
    // The raw column comes back untyped from `$queryRaw`; narrowed to the
    // Prisma enum the same way `mission` above is — the value the database
    // actually stores, asserted rather than reparsed.
    errorCategory: toErrorCategory(
      typeof errorCategory === "string" ? (errorCategory as $Enums.ErrorCategory) : null,
    ),
    failureClass: toFailureClass(
      typeof failureClass === "string" ? (failureClass as $Enums.GenerationFailureClass) : null,
    ),
    createdAt,
    completedAt,
  };
}

export async function listRecentGenerations(
  ownerId: string,
  limit: number = DEFAULT_RECENT_GENERATIONS_LIMIT,
): Promise<RecentGeneration[]> {
  assertOwnerId(ownerId);

  const rows = await getDatabaseClient().$queryRaw`
    WITH "target_generations" AS (
      SELECT g."id", g."projectId", p."title" AS "projectTitle", g."mission", g."status",
             g."errorCode", g."errorCategory", g."failureClass", g."createdAt", g."completedAt"
      FROM "generations" g
      JOIN "projects" p ON p."id" = g."projectId"
      WHERE p."userId" = ${ownerId}
      ORDER BY g."createdAt" DESC
      LIMIT ${limit}
    )
    SELECT tg.*,
           COALESCE(agg."attemptCount", 0)::int AS "attemptCount",
           COALESCE(agg."inputTokens", 0)::int AS "inputTokens",
           COALESCE(agg."outputTokens", 0)::int AS "outputTokens",
           COALESCE(agg."durationMs", 0)::int AS "durationMs",
           COALESCE(agg."estimatedCostUsd", 0::numeric(12, 6))::text AS "estimatedCostUsd",
           agg."model" AS "model"
    FROM "target_generations" tg
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS "attemptCount",
             SUM(a."inputTokens")::int AS "inputTokens",
             SUM(a."outputTokens")::int AS "outputTokens",
             SUM(a."durationMs")::int AS "durationMs",
             SUM(a."estimatedCostUsd")::numeric(12, 6) AS "estimatedCostUsd",
             (ARRAY_AGG(a."model" ORDER BY a."attempt" DESC))[1] AS "model"
      FROM "generation_attempts" a
      WHERE a."generationId" = tg."id"
    ) agg ON true
    ORDER BY tg."createdAt" DESC
  `;

  if (!Array.isArray(rows)) {
    throw new InternalError({
      message: "the recent generations query returned an unexpected shape",
    });
  }

  return rows.map((row: unknown) => toRecentGeneration(row));
}

/**
 * The context every future generation call must carry (CAL-042, CAL-044,
 * CAL-045) — read ahead of its producer, the same way `listRunningGenerations`
 * above is: no mission calls this yet, but it is the one place that will get
 * the project's resolved language, freedom level and target audience from
 * once one does.
 *
 * The ownership clause is repeated in the `where` rather than trusted from
 * the scope alone — the same rule every other scoped read in this repository
 * follows (`./scope`'s own doc comment: "the scope is a receipt, not the
 * guarantee").
 */
export async function getGenerationContextForProject(
  scope: ProjectScope,
): Promise<Result<GenerationContext>> {
  assertProjectScope(scope);

  const project = await getDatabaseClient().project.findFirst({
    where: { id: scope.projectId, [PROJECT_OWNER_FIELD]: scope.ownerId },
    select: { language: true, freedomLevel: true, targetAudience: true },
  });

  if (project === null) {
    return fail(new NotFoundError({ message: "no project with this id belongs to this owner" }));
  }

  return succeed(buildGenerationContext(project));
}
