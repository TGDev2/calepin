/**
 * What this project's comparable operations actually consumed (CAL-057) —
 * the measured half of the estimate shown before a costly one.
 *
 * **A measurement is a generation, not an attempt.** What an author is about
 * to ask for is one generation of a mission; what it will cost them is
 * everything that generation consumes, its retries included. So the attempts
 * are summed into their generation first, and the median is taken across
 * generations. Reading attempt medians directly would quote the price of a
 * *try* and would get cheaper the more often the mission failed, which is the
 * wrong way round.
 *
 * **Succeeded generations only.** A failed one is a real cost — `./generation-cost`
 * counts it, and must, because money spent is money spent — but it is not what
 * the next operation is expected to cost, and forecasting a failure as the
 * normal case would put a number on screen that no successful run ever
 * matches. A generation still running is excluded for the plainer reason that
 * it is a partial measurement.
 *
 * **A generation with an unmeasured attempt is excluded whole.** Nothing writes
 * `inputTokens`, `outputTokens` or `durationMs` yet (no worker — CLAUDE.md §13,
 * CAL-060), so a row with nulls is the normal state today and summing over it
 * would silently understate. `SUM` skips nulls; the `HAVING` clause below drops
 * the generation instead. Until a worker writes them this reader answers with
 * an empty list, and the estimate falls back on the mission registry's declared
 * expectation — exactly the behaviour the specification asks for in the absence
 * of history.
 *
 * **No money.** Only tokens and durations leave here. The price is derived from
 * the tokens at today's tariff by `@calepin/ai`'s `estimateCostUsd`, so an old
 * recorded price cannot be quoted for a new operation and there is still one
 * multiplication in the codebase (CAL-056).
 *
 * The median rather than the mean, because one runaway generation should not
 * move the number an author is asked to accept.
 */

import { getDatabaseClient } from "../database/client";
import { InternalError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import type { GenerationMission } from "./generation";
import { projectNotFound } from "./project-lock";
import { assertProjectScope, type ProjectScope } from "./scope";

/** One mission's typical consumption on this project, per generation. */
export interface MissionMeasurement {
  readonly mission: GenerationMission;
  /** Generations the median was taken over — never zero in a returned row. */
  readonly sampleCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly durationMs: number;
}

function unexpectedRowShape(fieldPath?: string): InternalError {
  return new InternalError({
    message: "the mission measurement query returned a row of an unexpected shape",
    fieldPath,
  });
}

/**
 * Anchored on `projects`, so that "not your project" and "nothing measured
 * yet" stay different answers — the distinction `./aggregates` and
 * `./generation-cost` both draw, and the reason the measurement query itself
 * cannot carry it: it groups by mission, so both cases produce no rows.
 */
async function projectIsReachable(scope: ProjectScope): Promise<boolean> {
  const rows = await getDatabaseClient().$queryRaw`
    SELECT p."id"
    FROM "projects" p
    WHERE p."id" = ${scope.projectId} AND p."userId" = ${scope.ownerId}
  `;

  return Array.isArray(rows) && rows.length > 0;
}

function toMeasurement(row: unknown): MissionMeasurement {
  if (
    typeof row !== "object" ||
    row === null ||
    !("mission" in row) ||
    !("sampleCount" in row) ||
    !("inputTokens" in row) ||
    !("outputTokens" in row) ||
    !("durationMs" in row)
  ) {
    throw unexpectedRowShape();
  }

  const mission: unknown = row.mission;
  const sampleCount: unknown = row.sampleCount;
  const inputTokens: unknown = row.inputTokens;
  const outputTokens: unknown = row.outputTokens;
  const durationMs: unknown = row.durationMs;

  if (typeof mission !== "string") throw unexpectedRowShape("mission");
  if (typeof sampleCount !== "number") throw unexpectedRowShape("sampleCount");
  if (typeof inputTokens !== "number") throw unexpectedRowShape("inputTokens");
  if (typeof outputTokens !== "number") throw unexpectedRowShape("outputTokens");
  if (typeof durationMs !== "number") throw unexpectedRowShape("durationMs");

  return {
    mission: mission as GenerationMission,
    sampleCount,
    inputTokens,
    outputTokens,
    durationMs,
  };
}

/**
 * One row per mission this project has ever completed, carrying the median
 * consumption of one generation of it.
 *
 * `NOT_FOUND` for a project that is not the scope owner's, the same code
 * `openProjectScope` gives (CLAUDE.md §3.5). An empty list for a project that
 * exists and has measured nothing — the caller reads that as "no history" and
 * falls back on the theoretical expectation, which is a different thing from
 * "no access."
 */
export async function readMissionMeasurements(
  scope: ProjectScope,
): Promise<Result<readonly MissionMeasurement[]>> {
  assertProjectScope(scope);

  if (!(await projectIsReachable(scope))) return fail(projectNotFound());

  const rows = await getDatabaseClient().$queryRaw`
    WITH "per_generation" AS (
      SELECT g."id" AS "generationId",
             g."mission" AS "mission",
             SUM(a."inputTokens")::int AS "inputTokens",
             SUM(a."outputTokens")::int AS "outputTokens",
             SUM(a."durationMs")::int AS "durationMs"
      FROM "projects" p
      JOIN "generations" g ON g."projectId" = p."id"
      JOIN "generation_attempts" a ON a."generationId" = g."id"
      WHERE p."id" = ${scope.projectId}
        AND p."userId" = ${scope.ownerId}
        AND g."status" = 'SUCCEEDED'
      GROUP BY g."id", g."mission"
      HAVING COUNT(*) FILTER (
        WHERE a."inputTokens" IS NULL
           OR a."outputTokens" IS NULL
           OR a."durationMs" IS NULL
      ) = 0
    )
    SELECT "mission",
           COUNT(*)::int AS "sampleCount",
           ROUND(
             percentile_cont(0.5) WITHIN GROUP (ORDER BY "inputTokens")::numeric
           )::int AS "inputTokens",
           ROUND(
             percentile_cont(0.5) WITHIN GROUP (ORDER BY "outputTokens")::numeric
           )::int AS "outputTokens",
           ROUND(
             percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs")::numeric
           )::int AS "durationMs"
    FROM "per_generation"
    GROUP BY "mission"
    ORDER BY "mission"
  `;

  if (!Array.isArray(rows)) throw unexpectedRowShape();

  return succeed(rows.map((row: unknown) => toMeasurement(row)));
}
