/**
 * The project repository (CAL-023) — the door into a user's data.
 *
 * `Project` is the only row in the schema that names an owner, so it is the
 * only place ownership is established rather than inherited. Every other model
 * is reached through a `ProjectScope` this module minted.
 *
 * It lives in `@calepin/shared` rather than in a domain package because no
 * domain owns a project: the seven of them hang off one. A domain repository —
 * chapters, characters, canon facts — belongs to its own package and its own
 * epic, and builds on `scopedWhere` and `requireOwnedRow` rather than
 * re-deriving ownership (CLAUDE.md §3.5).
 */

import type { $Enums } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import { InternalError, NotFoundError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import type { ProjectStatus } from "../project-status";
import { PROJECT_OWNER_FIELD } from "./owned-models";
import { assertProjectScope, type ProjectScope } from "./scope";

/** What a caller may set when a project is created. */
export interface CreateProjectInput {
  readonly ownerId: string;
  readonly title: string;
  readonly language?: string;
  readonly targetLength?: $Enums.TargetLength;
  readonly targetWordCount?: number | null;
  readonly targetAudience?: string;
  readonly freedomLevel?: $Enums.FreedomLevel;
}

/**
 * What a caller may change afterwards.
 *
 * `userId` is absent, and its absence is the point: a project cannot change
 * hands through this layer. The patch is also rebuilt field by field below
 * rather than spread, so a caller that reaches this function from untyped code
 * with an extra `userId` in the object does not move the row either.
 *
 * `status` is absent for the same kind of reason, since CAL-034: it is derived
 * from what the project holds, so there is nothing here for a caller to assert.
 * `./project-status` is the only writer, it recomputes rather than accepts, and
 * it refuses a move the transition table does not hold. Putting the field back
 * would not add an option, it would add the one way to make the column disagree
 * with the rows.
 */
export interface UpdateProjectInput {
  readonly title?: string;
  readonly language?: string;
  readonly targetLength?: $Enums.TargetLength;
  readonly targetWordCount?: number | null;
  readonly targetAudience?: string;
  readonly freedomLevel?: $Enums.FreedomLevel;
}

/** Prisma's "no row matched the where clause" on an update or a delete. */
function isMissingRow(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}

function notFound(cause?: unknown): NotFoundError {
  return new NotFoundError({ message: "no project with this id belongs to this owner", cause });
}

/**
 * One user's projects, most recently modified first — the dashboard's read
 * (CAL-065), served by the `[userId, updatedAt]` index.
 *
 * It takes an owner id and has no other form: there is no "list all projects".
 */
export async function listProjectsForOwner(ownerId: string) {
  assertOwnerId(ownerId);

  return getDatabaseClient().project.findMany({
    where: { [PROJECT_OWNER_FIELD]: ownerId },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * `Project.status` (CAL-032), re-exported under the repository's own name so
 * `apps/web` can type against it without importing `@prisma/client` — the
 * import the interface layer is never allowed to hold (CLAUDE.md §3.5).
 *
 * It is the state machine's type since CAL-034, not the generated enum's. The
 * two are proved to be the same list in `./project-status`; naming the machine's
 * here means a screen that types against a status is typing against the thing
 * that decides it.
 */
export type { ProjectStatus };

/** One row of the project dashboard (CAL-032). */
export interface ProjectDashboardRow {
  readonly id: string;
  readonly title: string;
  readonly status: ProjectStatus;
  readonly updatedAt: Date;
  /** Every chapter of the project's plan, written or not. Counted on read. */
  readonly plannedChapterCount: number;
  /** Chapters carrying at least one `ChapterRevision` — stored, maintained at write. */
  readonly writtenChapterCount: number;
  /** The sum of each written chapter's *latest* revision — stored, maintained at write. */
  readonly totalWordCount: number;
}

/**
 * The dashboard's read (CAL-032): one user's projects, most recently modified
 * first, each carrying its chapter and word-count aggregates.
 *
 * Two of the three come off the row itself. `writtenChapterCount` and
 * `totalWordCount` are maintained by the write that moved them (CAL-033,
 * `./aggregates`), so displaying them costs a column rather than a join and a
 * sum over every revision of every chapter of every project.
 *
 * `plannedChapterCount` is still counted, and deliberately: a chapter is
 * *created* by the outline domain, which E10 has not written yet, and a
 * denormalised counter no write path maintains is worse than a computed one —
 * it is wrong silently. It is a `_count` rather than a row set, so nothing but
 * the number crosses the wire.
 *
 * Still one `findMany`, still `relationLoadStrategy: "join"`, so the whole
 * dashboard is one SQL statement — asserted by
 * `test/integration/project-dashboard.integration.test.ts`, not assumed.
 */
export async function listProjectDashboardRows(ownerId: string): Promise<ProjectDashboardRow[]> {
  assertOwnerId(ownerId);

  const projects = await getDatabaseClient().project.findMany({
    where: { [PROJECT_OWNER_FIELD]: ownerId },
    orderBy: { updatedAt: "desc" },
    relationLoadStrategy: "join",
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      writtenChapterCount: true,
      totalWordCount: true,
      outline: { select: { _count: { select: { chapters: true } } } },
    },
  });

  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    status: project.status,
    updatedAt: project.updatedAt,
    plannedChapterCount: project.outline?._count.chapters ?? 0,
    writtenChapterCount: project.writtenChapterCount,
    totalWordCount: project.totalWordCount,
  }));
}

export async function getProjectForOwner(input: { ownerId: string; projectId: string }) {
  assertOwnerId(input.ownerId);

  const project = await getDatabaseClient().project.findFirst({
    where: { id: input.projectId, [PROJECT_OWNER_FIELD]: input.ownerId },
  });

  return project === null ? fail(notFound()) : succeed(project);
}

/**
 * Creates a project owned by `ownerId`.
 *
 * The caller must be inside an actor scope (`runWithActor`, CAL-022) — the
 * write is refused otherwise, loudly, rather than landing unattributed. Owner
 * and author are separate on purpose: the worker writes on behalf of the author
 * who asked for a generation, and the row still belongs to the project's owner.
 */
export async function createProject(input: CreateProjectInput) {
  assertOwnerId(input.ownerId);

  return getDatabaseClient().project.create({
    data: {
      [PROJECT_OWNER_FIELD]: input.ownerId,
      title: input.title,
      ...(input.language === undefined ? {} : { language: input.language }),
      ...(input.targetLength === undefined ? {} : { targetLength: input.targetLength }),
      ...(input.targetWordCount === undefined ? {} : { targetWordCount: input.targetWordCount }),
      ...(input.targetAudience === undefined ? {} : { targetAudience: input.targetAudience }),
      ...(input.freedomLevel === undefined ? {} : { freedomLevel: input.freedomLevel }),
    },
  });
}

/**
 * Updates a project the scope already proved is the owner's.
 *
 * The ownership clause is repeated in the `where` even so. The scope is a
 * receipt of a check that happened earlier — possibly several awaits ago — and
 * what actually protects the row is the statement that touches it.
 */
export async function updateProject(scope: ProjectScope, patch: UpdateProjectInput) {
  assertProjectScope(scope);

  try {
    const project = await getDatabaseClient().project.update({
      where: { id: scope.projectId, [PROJECT_OWNER_FIELD]: scope.ownerId },
      data: {
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.language === undefined ? {} : { language: patch.language }),
        ...(patch.targetLength === undefined ? {} : { targetLength: patch.targetLength }),
        ...(patch.targetWordCount === undefined ? {} : { targetWordCount: patch.targetWordCount }),
        ...(patch.targetAudience === undefined ? {} : { targetAudience: patch.targetAudience }),
        ...(patch.freedomLevel === undefined ? {} : { freedomLevel: patch.freedomLevel }),
      },
    });

    return succeed(project);
  } catch (error: unknown) {
    if (isMissingRow(error)) return fail(notFound(error));

    throw error;
  }
}

export async function deleteProject(scope: ProjectScope): Promise<Result<void>> {
  assertProjectScope(scope);

  try {
    await getDatabaseClient().project.delete({
      where: { id: scope.projectId, [PROJECT_OWNER_FIELD]: scope.ownerId },
    });

    return succeed();
  } catch (error: unknown) {
    if (isMissingRow(error)) return fail(notFound(error));

    throw error;
  }
}

/**
 * The guard the three owner-taking functions share. An empty owner is a caller
 * that never established who is asking, and the query it would run — every
 * project of nobody — returns an empty list that reads exactly like a user with
 * no projects.
 */
function assertOwnerId(ownerId: string): void {
  if (ownerId !== "") return;

  throw new InternalError({
    code: "PROJECT_SCOPE_REQUIRED",
    message: "a project repository was reached without an owner",
  });
}
