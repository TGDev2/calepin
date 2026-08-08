/**
 * The project status, maintained (CAL-034) — the repository half of
 * `@calepin/shared/project-status`.
 *
 * The machine next door is pure: it knows the ten statuses, the table of
 * allowed transitions, and how to read a status off a `ProjectProgress`. This
 * module is the only thing that gathers that progress from the rows and the only
 * thing that ever writes `projects.status`.
 *
 * **The status is derived state, so it is written exactly as CAL-033 writes the
 * two counters beside it**: recomputed from truth inside the transaction of the
 * write that moved the evidence, under the same row lock, by a statement that
 * names the owner in its `WHERE` and touches nothing else. Raw SQL rather than a
 * Prisma `update`, and for the reason `tasks/lessons.md` records: `@updatedAt`
 * and the CAL-022 audit extension both fire on an `update`, so a status nobody
 * authored would be credited to whoever happened to be in scope and would burn
 * `Project.version` — the optimistic-concurrency token for the project's own
 * attributes, which an unrelated rename is entitled to.
 *
 * **The table sits between the derivation and the column.** A recomputation that
 * is not reachable from the stored status means the rows and the column disagree
 * by more than one legitimate step: the evidence appeared out of order, which no
 * write path in this product can do. `refreshProjectStatus` refuses it and rolls
 * the whole write back rather than ratifying it; `reconcileProjectStatus` is the
 * way back, for the fixtures, seeds and imports that wrote rows directly — the
 * same division `withProjectAggregates` and `reconcileProjectAggregates` already
 * draw.
 *
 * **Archiving is the one act, not the one exception.** `Project.archivedAt` is
 * evidence like the rest, so `deriveProjectStatus` answers `ARCHIVED` from the
 * rows and no code path has to remember that archiving is special. What
 * `archiveProject` does is write the timestamp — audited, because the decision
 * has an author — and then let the ordinary refresh follow it.
 */

import type { $Enums } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import { ConflictError, InternalError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import {
  canTransition,
  deriveProjectStatus,
  type ProjectProgress,
  type ProjectStatus,
} from "../project-status";
import { PROJECT_OWNER_FIELD } from "./owned-models";
import {
  projectNotFound,
  RollbackSignal,
  runLockedOnProject,
  type TransactionClient,
} from "./project-lock";
import { assertProjectScope, type ProjectScope } from "./scope";

type SchemaStatus = $Enums.ProjectStatus;

/**
 * The ten statuses, as an object to check a database value against — and, in
 * passing, the proof that the pure machine's list and the schema's enum are the
 * same list.
 *
 * The annotation demands every status the machine knows; the `satisfies` demands
 * every member the schema declares and refuses a key that is neither. Together
 * they make the two sets equal at compile time, so a member added to one and not
 * the other fails here rather than surfacing as a write error months later.
 * `prisma/schema.test.ts` pins the same pair textually, for the case where
 * neither file is being compiled.
 *
 * Written out rather than read off the generated `$Enums` object: that export is
 * a value, and importing it would pull the generated client into a module
 * `apps/web` compiles from source — the property `../database/client` exists to
 * keep.
 */
const PROJECT_STATUS_KEYS: Record<ProjectStatus, true> = {
  DRAFT: true,
  ANALYSIS_IN_PROGRESS: true,
  DIRECTION_TO_CHOOSE: true,
  BIBLE_TO_VALIDATE: true,
  OUTLINE_IN_PROGRESS: true,
  WRITING_IN_PROGRESS: true,
  REVISION: true,
  COMPLETED: true,
  PUBLISHED: true,
  ARCHIVED: true,
} satisfies Record<SchemaStatus, true>;

/** What one query says about a project: its evidence, and the stored answer. */
interface ProjectStatusState {
  readonly progress: ProjectProgress;
  readonly storedStatus: ProjectStatus;
}

/**
 * Every fact `deriveProjectStatus` reads, in one statement.
 *
 * Anchored on `projects` rather than aggregated from the child tables, for the
 * reason `./aggregates` states: aggregating the other way answers "no evidence"
 * for a project that does not exist, which reads as an empty project and would
 * let a caller reconcile someone else's row.
 *
 * `writtenChapterCount` is read off the row rather than recomputed — it is
 * CAL-033's maintained counter, and inside `withProjectAggregates` this
 * statement runs after the counters were rewritten, so it sees them.
 * `plannedChapterCount` is counted here, as the dashboard counts it, because
 * nothing maintains it (E10 owns chapter creation).
 */
async function selectStatusState(
  client: TransactionClient,
  scope: ProjectScope,
): Promise<ProjectStatusState | undefined> {
  const rows = await client.$queryRaw`
    SELECT
      p."archivedAt" IS NOT NULL AS "isArchived",
      EXISTS (
        SELECT 1 FROM "source_texts" st
        JOIN "source_text_versions" v ON v."sourceTextId" = st."id"
        WHERE st."projectId" = p."id"
      ) AS "hasSourceText",
      EXISTS (
        SELECT 1 FROM "analyses" a
        WHERE a."projectId" = p."id" AND a."validatedAt" IS NOT NULL
      ) AS "isAnalysisValidated",
      EXISTS (
        SELECT 1 FROM "creative_directions" d
        WHERE d."projectId" = p."id" AND d."isCanonical"
      ) AS "hasCanonicalDirection",
      EXISTS (
        SELECT 1 FROM "bibles" b
        WHERE b."projectId" = p."id" AND b."validatedAt" IS NOT NULL
      ) AS "isBibleValidated",
      (
        SELECT COUNT(*) FROM "outlines" o
        JOIN "chapters" c ON c."outlineId" = o."id"
        WHERE o."projectId" = p."id"
      )::int AS "plannedChapterCount",
      p."writtenChapterCount" AS "writtenChapterCount",
      (
        SELECT COUNT(*) FROM "outlines" o
        JOIN "chapters" c ON c."outlineId" = o."id"
        WHERE o."projectId" = p."id" AND c."status" IN ('VALIDATED', 'LOCKED')
      )::int AS "validatedChapterCount",
      EXISTS (
        SELECT 1 FROM "publications" pub
        WHERE pub."projectId" = p."id" AND pub."visibility" <> 'PRIVATE'
      ) AS "isPublished",
      p."status"::text AS "storedStatus"
    FROM "projects" p
    WHERE p."id" = ${scope.projectId} AND p."userId" = ${scope.ownerId}
  `;

  return toStatusState(rows);
}

/**
 * A raw result is untrusted input like any other (CLAUDE.md §6). The column
 * types are the migration's business, not this module's, and a cast would turn a
 * schema change into a project silently stuck in `DRAFT` rather than a failure.
 */
function toStatusState(rows: unknown): ProjectStatusState | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;

  const row: unknown = rows[0];
  if (typeof row !== "object" || row === null) throw unexpectedShape();

  const record: Record<string, unknown> = { ...row };

  return {
    progress: {
      isArchived: readBoolean(record, "isArchived"),
      hasSourceText: readBoolean(record, "hasSourceText"),
      isAnalysisValidated: readBoolean(record, "isAnalysisValidated"),
      hasCanonicalDirection: readBoolean(record, "hasCanonicalDirection"),
      isBibleValidated: readBoolean(record, "isBibleValidated"),
      plannedChapterCount: readCount(record, "plannedChapterCount"),
      writtenChapterCount: readCount(record, "writtenChapterCount"),
      validatedChapterCount: readCount(record, "validatedChapterCount"),
      isPublished: readBoolean(record, "isPublished"),
    },
    storedStatus: readStatus(record, "storedStatus"),
  };
}

function unexpectedShape(fieldPath?: string): InternalError {
  return new InternalError({
    message: "the project progress query returned a row of an unexpected shape",
    ...(fieldPath === undefined ? {} : { fieldPath }),
  });
}

function readBoolean(row: Record<string, unknown>, field: string): boolean {
  const value: unknown = row[field];
  if (typeof value !== "boolean") throw unexpectedShape(field);

  return value;
}

function readCount(row: Record<string, unknown>, field: string): number {
  const value: unknown = row[field];
  if (typeof value !== "number" || !Number.isInteger(value)) throw unexpectedShape(field);

  return value;
}

function readStatus(row: Record<string, unknown>, field: string): ProjectStatus {
  const value: unknown = row[field];
  if (typeof value !== "string" || !isSchemaStatus(value)) throw unexpectedShape(field);

  return value;
}

function isSchemaStatus(value: string): value is ProjectStatus {
  return Object.hasOwn(PROJECT_STATUS_KEYS, value);
}

/**
 * Recomputes the status and stores it, refusing a move the table does not hold.
 *
 * The project row is already locked. Three outcomes, and only three: the
 * derivation agrees with the column and nothing is written; it is one legal step
 * away and the column is rewritten; it is somewhere the table does not reach,
 * and the whole transaction is rolled back so the write that moved the evidence
 * goes with it. The last one is deliberate — a project whose rows the machine
 * cannot account for is better left untouched and reported than half-advanced.
 *
 * Exported to `./aggregates` and to nothing else — it is deliberately absent
 * from the package's public surface, because a caller holding a transaction
 * client is already inside one of the two wrappers that own this sequence.
 */
export async function writeDerivedStatus(
  client: TransactionClient,
  scope: ProjectScope,
  options: { readonly gated: boolean },
): Promise<ProjectStatus> {
  const state = await selectStatusState(client, scope);

  // Unreachable behind the lock, which already refused a project the scope does
  // not own. A throw rather than a silent DRAFT: were it ever reached, the
  // alternative would be storing "nothing has happened" for a finished novel.
  if (state === undefined) throw new RollbackSignal(projectNotFound());

  const derived = deriveProjectStatus(state.progress);

  if (derived === state.storedStatus) return derived;

  if (options.gated && !canTransition(state.storedStatus, derived)) {
    throw new RollbackSignal(
      new ConflictError({
        code: "ILLEGAL_STATUS_TRANSITION",
        message: "the project rows imply a status the stored one cannot legally reach",
      }),
    );
  }

  await client.$executeRaw`
    UPDATE "projects"
    SET "status" = ${derived}::"project_status"
    WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
  `;

  return derived;
}

/**
 * The evidence as the rows themselves say it is.
 *
 * Reads nothing but truth and writes nothing, so it is what CAL-037's step bar
 * reads to decide which steps are behind the author and which are still out of
 * reach, and what an operations view (CAL-067) reports drift with.
 */
export async function readProjectProgress(scope: ProjectScope): Promise<Result<ProjectProgress>> {
  assertProjectScope(scope);

  const state = await selectStatusState(getDatabaseClient(), scope);

  return state === undefined ? fail(projectNotFound()) : succeed(state.progress);
}

/**
 * Runs a write that moves status evidence and leaves the status exact.
 *
 * The sibling of `withProjectAggregates`, for the evidence that is not chapters:
 * validating an analysis, choosing a direction, validating a bible, publishing.
 * The sequence is the same and so are its guarantees —
 *
 *   lock the project ──► the caller's write ──► recompute and store
 *
 * all inside one transaction, so a failure anywhere rolls back both the write
 * and the status. The mutation receives the transaction client and must use it:
 * a write issued against the ambient client runs outside the lock, which is the
 * one way to defeat this that the type system cannot see.
 */
export async function withProjectStatus<T>(
  scope: ProjectScope,
  mutate: (client: TransactionClient) => Promise<Result<T>>,
): Promise<Result<T>> {
  return runLockedOnProject(scope, async (tx) => {
    const mutated = await mutate(tx);
    if (!mutated.ok) throw new RollbackSignal(mutated.error);

    await writeDerivedStatus(tx, scope, { gated: true });

    return succeed(mutated.value);
  });
}

/** Recomputes and stores the status on its own, under the same lock and gate. */
export async function refreshProjectStatus(scope: ProjectScope): Promise<Result<ProjectStatus>> {
  return runLockedOnProject(scope, async (tx) =>
    succeed(await writeDerivedStatus(tx, scope, { gated: true })),
  );
}

/**
 * Rewrites the status from the rows, whatever the table would have said.
 *
 * The repair path, and the only ungated writer. A project seeded by a fixture, a
 * graph imported wholesale, a row a future bug left behind: in each case the
 * stored status is not a state the project ever travelled through, so refusing
 * to correct it would leave the wrong number on screen forever. It takes the
 * same lock as a real write, so it cannot race one.
 *
 * It is not a way around `refreshProjectStatus`. A caller reaching for it inside
 * a write path is silencing the check that write path exists to trip.
 */
export async function reconcileProjectStatus(scope: ProjectScope): Promise<Result<ProjectStatus>> {
  return runLockedOnProject(scope, async (tx) =>
    succeed(await writeDerivedStatus(tx, scope, { gated: false })),
  );
}

/**
 * Archives a project: stamps `archivedAt`, then lets the ordinary refresh read
 * it back as evidence.
 *
 * Two statements rather than one, and the split is the design. The timestamp is
 * an authored decision, so it goes through Prisma and the CAL-022 extension
 * credits it and bumps `Project.version`; the status is derived state, so it
 * goes through the raw statement that credits nobody. Writing both at once would
 * have to pick one of those, and either choice is wrong for the other column.
 *
 * The caller must be inside an actor scope (`runWithActor`), or the write is
 * refused rather than landing unattributed.
 */
export async function archiveProject(scope: ProjectScope): Promise<Result<ProjectStatus>> {
  return setArchivedAt(scope, new Date());
}

/**
 * Restores an archived project to the stage its rows support — never to a
 * remembered one. The graph is the only thing that stayed true while the project
 * sat archived, and `ARCHIVED → any stage` is in the table for exactly this.
 */
export async function restoreProject(scope: ProjectScope): Promise<Result<ProjectStatus>> {
  return setArchivedAt(scope, null);
}

async function setArchivedAt(
  scope: ProjectScope,
  archivedAt: Date | null,
): Promise<Result<ProjectStatus>> {
  return runLockedOnProject(scope, async (tx) => {
    await tx.project.update({
      where: { id: scope.projectId, [PROJECT_OWNER_FIELD]: scope.ownerId },
      data: { archivedAt },
    });

    return succeed(await writeDerivedStatus(tx, scope, { gated: true }));
  });
}
