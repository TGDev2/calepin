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
import { NotFoundError } from "../errors/app-error";
import type { ErrorCategory } from "../errors/categories";
import { ERROR_CODES, type ErrorCode } from "../errors/codes";
import { fail, type Result, succeed } from "../errors/result";
import type { GenerationFailureClass } from "../generation/retry";
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
}

/**
 * A project's generations still in flight, oldest first — the order a queue
 * is read in, and the one the `[projectId, createdAt]` index already serves.
 *
 * `queuePosition` is computed here, over the array this query already fetches
 * in that same order — no second query, no window function: a running count
 * of the `QUEUED` rows seen so far *is* each one's rank.
 */
export async function listRunningGenerations(scope: ProjectScope): Promise<RunningGeneration[]> {
  assertProjectScope(scope);

  const rows = await getDatabaseClient().generation.findMany({
    where: scopedWhere("Generation", scope, { status: { in: RUNNING_STATUSES } }),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      mission: true,
      status: true,
      createdAt: true,
      progressStep: true,
      progressPercent: true,
      failureClass: true,
    },
  });

  let queued = 0;

  return rows.map((row) => ({
    ...row,
    status: row.status as RunningGenerationStatus,
    failureClass: toFailureClass(row.failureClass),
    queuePosition: row.status === "QUEUED" ? (queued += 1) : null,
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
