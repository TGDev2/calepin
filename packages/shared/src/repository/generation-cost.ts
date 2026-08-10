/**
 * A project's accounted cost (CAL-056) — read from `GenerationAttempt`,
 * never stored.
 *
 * `Generation`'s own doc-comment (`prisma/schema.prisma`) states the formula
 * this module implements: *"the cost of a project is a `SUM` over the
 * attempts of its generations, failures included — which is the only way
 * indicator §17.8, average cost per project, is not an undercount."* So
 * every query here sums over every attempt regardless of `status`; a call
 * that failed still consumed the tokens it consumed.
 *
 * **Read-only, deliberately.** Nothing writes `inputTokens`, `outputTokens`
 * or `estimatedCostUsd` yet — no worker exists (CLAUDE.md §13, CAL-060) — so
 * this module is built ahead of its producer, the same way
 * `./generation`'s `listRunningGenerations` was: it answers with real
 * numbers the moment something starts writing them, and with honest zeros
 * until then.
 *
 * **Anchored on `projects`, like `./aggregates`.** A project that is not the
 * caller's, or does not exist, must answer `NOT_FOUND` rather than a
 * misleading summary of zeros — the same distinction `aggregates.ts` draws
 * between "no chapters" and "not your project." Grouping from
 * `generation_attempts` outward would lose that distinction; anchoring on
 * `projects` and requiring at least one row keeps it.
 *
 * **`estimatedCostUsd` is cast to `text`, never read as `Decimal`.** It is
 * the only `Decimal` column in the schema, and nothing else in the codebase
 * reads one through `$queryRaw` yet. Casting in SQL sidesteps the ambiguity
 * entirely and keeps "money is a decimal string, never a float" true on both
 * sides of the boundary — `@calepin/ai`'s `estimateCostUsd` returns the same
 * shape. The `COALESCE` fallback is `0::numeric(12, 6)`, not a bare `0`: an
 * untyped integer literal would win the common type and collapse `"0.000000"`
 * to `"0"` the moment a group has no priced attempt to sum.
 */

import { getDatabaseClient } from "../database/client";
import { InternalError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import type { GenerationMission } from "./generation";
import { projectNotFound } from "./project-lock";
import { assertProjectScope, type ProjectScope } from "./scope";

export interface ProjectCostByMission {
  readonly mission: GenerationMission;
  readonly attemptCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: string;
}

export interface ProjectCostByDay {
  readonly day: Date;
  readonly attemptCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: string;
}

export interface ProjectCostSummary {
  readonly attemptCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: string;
  readonly byMission: readonly ProjectCostByMission[];
  readonly byDay: readonly ProjectCostByDay[];
}

interface CostTotals {
  readonly attemptCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: string;
}

function unexpectedRowShape(fieldPath?: string): InternalError {
  return new InternalError({
    message: "the cost aggregate query returned a row of an unexpected shape",
    fieldPath,
  });
}

/**
 * The four columns every breakdown shares, validated as untrusted input like
 * every other raw-SQL result in this layer (CLAUDE.md §6) — never cast.
 */
function toCostTotals(row: unknown): CostTotals {
  if (
    typeof row !== "object" ||
    row === null ||
    !("attemptCount" in row) ||
    !("inputTokens" in row) ||
    !("outputTokens" in row) ||
    !("estimatedCostUsd" in row)
  ) {
    throw unexpectedRowShape();
  }

  const attemptCount: unknown = row.attemptCount;
  const inputTokens: unknown = row.inputTokens;
  const outputTokens: unknown = row.outputTokens;
  const estimatedCostUsd: unknown = row.estimatedCostUsd;

  if (typeof attemptCount !== "number") throw unexpectedRowShape("attemptCount");
  if (typeof inputTokens !== "number") throw unexpectedRowShape("inputTokens");
  if (typeof outputTokens !== "number") throw unexpectedRowShape("outputTokens");
  if (typeof estimatedCostUsd !== "string") throw unexpectedRowShape("estimatedCostUsd");

  return { attemptCount, inputTokens, outputTokens, estimatedCostUsd };
}

async function selectTotals(scope: ProjectScope): Promise<CostTotals | undefined> {
  const rows = await getDatabaseClient().$queryRaw`
    SELECT COUNT(a."id")::int AS "attemptCount",
           COALESCE(SUM(a."inputTokens"), 0)::int AS "inputTokens",
           COALESCE(SUM(a."outputTokens"), 0)::int AS "outputTokens",
           COALESCE(SUM(a."estimatedCostUsd"), 0::numeric(12, 6))::text AS "estimatedCostUsd"
    FROM "projects" p
    LEFT JOIN "generations" g ON g."projectId" = p."id"
    LEFT JOIN "generation_attempts" a ON a."generationId" = g."id"
    WHERE p."id" = ${scope.projectId} AND p."userId" = ${scope.ownerId}
    GROUP BY p."id"
  `;

  if (!Array.isArray(rows) || rows.length === 0) return undefined;

  return toCostTotals(rows[0]);
}

async function selectByMission(scope: ProjectScope): Promise<ProjectCostByMission[]> {
  const rows = await getDatabaseClient().$queryRaw`
    SELECT g."mission" AS "mission",
           COUNT(a."id")::int AS "attemptCount",
           COALESCE(SUM(a."inputTokens"), 0)::int AS "inputTokens",
           COALESCE(SUM(a."outputTokens"), 0)::int AS "outputTokens",
           COALESCE(SUM(a."estimatedCostUsd"), 0::numeric(12, 6))::text AS "estimatedCostUsd"
    FROM "projects" p
    JOIN "generations" g ON g."projectId" = p."id"
    JOIN "generation_attempts" a ON a."generationId" = g."id"
    WHERE p."id" = ${scope.projectId} AND p."userId" = ${scope.ownerId}
    GROUP BY g."mission"
    ORDER BY g."mission"
  `;

  if (!Array.isArray(rows)) throw unexpectedRowShape();

  return rows.map((row: unknown) => {
    if (typeof row !== "object" || row === null || !("mission" in row)) {
      throw unexpectedRowShape("mission");
    }

    const mission: unknown = row.mission;
    if (typeof mission !== "string") throw unexpectedRowShape("mission");

    return { mission: mission as GenerationMission, ...toCostTotals(row) };
  });
}

async function selectByDay(scope: ProjectScope): Promise<ProjectCostByDay[]> {
  const rows = await getDatabaseClient().$queryRaw`
    SELECT date_trunc('day', a."startedAt") AS "day",
           COUNT(a."id")::int AS "attemptCount",
           COALESCE(SUM(a."inputTokens"), 0)::int AS "inputTokens",
           COALESCE(SUM(a."outputTokens"), 0)::int AS "outputTokens",
           COALESCE(SUM(a."estimatedCostUsd"), 0::numeric(12, 6))::text AS "estimatedCostUsd"
    FROM "projects" p
    JOIN "generations" g ON g."projectId" = p."id"
    JOIN "generation_attempts" a ON a."generationId" = g."id"
    WHERE p."id" = ${scope.projectId} AND p."userId" = ${scope.ownerId}
    GROUP BY date_trunc('day', a."startedAt")
    ORDER BY 1
  `;

  if (!Array.isArray(rows)) throw unexpectedRowShape();

  return rows.map((row: unknown) => {
    if (typeof row !== "object" || row === null || !("day" in row)) {
      throw unexpectedRowShape("day");
    }

    const day: unknown = row.day;
    if (!(day instanceof Date)) throw unexpectedRowShape("day");

    return { day, ...toCostTotals(row) };
  });
}

/**
 * A project's accounted cost: the total, and the same total broken down by
 * mission and by day — every attempt of every generation the project ran,
 * failures included.
 *
 * `NOT_FOUND` for a project that is not the scope's owner's, the same code
 * `openProjectScope` gives (CLAUDE.md §3.5: not yours and not there are the
 * same answer). A project the owner owns but has never generated anything in
 * answers with real zeros instead — it exists, nothing has been spent yet.
 */
export async function readProjectCostSummary(
  scope: ProjectScope,
): Promise<Result<ProjectCostSummary>> {
  assertProjectScope(scope);

  const totals = await selectTotals(scope);
  if (totals === undefined) return fail(projectNotFound());

  const [byMission, byDay] = await Promise.all([selectByMission(scope), selectByDay(scope)]);

  return succeed({ ...totals, byMission, byDay });
}
