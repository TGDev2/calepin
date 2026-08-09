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
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";

/**
 * `GenerationMission`, re-exported under the repository's own name so
 * `apps/web` can type against it without importing `@prisma/client` — the
 * import the interface layer is never allowed to hold (CLAUDE.md §3.5).
 */
export type GenerationMission = $Enums.GenerationMission;

const RUNNING_STATUSES = ["QUEUED", "RUNNING"] as const satisfies readonly $Enums.GenerationStatus[];

export type RunningGenerationStatus = (typeof RUNNING_STATUSES)[number];

/** One generation still in flight — everything a persistent indicator needs. */
export interface RunningGeneration {
  readonly id: string;
  readonly mission: GenerationMission;
  readonly status: RunningGenerationStatus;
  readonly createdAt: Date;
}

/**
 * A project's generations still in flight, oldest first — the order a queue
 * is read in, and the one the `[projectId, createdAt]` index already serves.
 */
export async function listRunningGenerations(scope: ProjectScope): Promise<RunningGeneration[]> {
  assertProjectScope(scope);

  const rows = await getDatabaseClient().generation.findMany({
    where: scopedWhere("Generation", scope, { status: { in: RUNNING_STATUSES } }),
    orderBy: { createdAt: "asc" },
    select: { id: true, mission: true, status: true, createdAt: true },
  });

  return rows.map((row) => ({ ...row, status: row.status as RunningGenerationStatus }));
}
