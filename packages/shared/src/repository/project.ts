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
 */
export interface UpdateProjectInput {
  readonly title?: string;
  readonly language?: string;
  readonly targetLength?: $Enums.TargetLength;
  readonly targetWordCount?: number | null;
  readonly targetAudience?: string;
  readonly freedomLevel?: $Enums.FreedomLevel;
  readonly status?: $Enums.ProjectStatus;
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
 */
export type ProjectStatus = $Enums.ProjectStatus;

/** One row of the project dashboard (CAL-032). */
export interface ProjectDashboardRow {
  readonly id: string;
  readonly title: string;
  readonly status: ProjectStatus;
  readonly updatedAt: Date;
  /** Every chapter of the project's plan, written or not. */
  readonly plannedChapterCount: number;
  /** Chapters carrying at least one `ChapterRevision` — text actually drafted. */
  readonly writtenChapterCount: number;
  /** The sum of each written chapter's *latest* revision — never every revision. */
  readonly totalWordCount: number;
}

/**
 * The dashboard's read (CAL-032): one user's projects, most recently modified
 * first, each carrying its chapter and word-count aggregates.
 *
 * One `findMany`, `relationLoadStrategy: "join"` so the nested
 * `outline.chapters.revisions` read compiles to a single SQL statement (a
 * LATERAL join) rather than one query per relation or per row — there is no
 * second round trip to aggregate over. "Written" is derived from revision
 * presence rather than `ChapterStatus`, so the written count and the word sum
 * below are read from the exact same join and can never disagree with each
 * other.
 *
 * Live-computed, not stored: CAL-033 owns denormalized, write-time
 * aggregates. This is the naive, always-correct read they will replace.
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
      outline: {
        select: {
          chapters: {
            select: {
              revisions: {
                orderBy: { revisionNumber: "desc" },
                take: 1,
                select: { wordCount: true },
              },
            },
          },
        },
      },
    },
  });

  return projects.map((project) => {
    const chapters = project.outline?.chapters ?? [];
    const writtenChapters = chapters.filter((chapter) => chapter.revisions.length > 0);

    return {
      id: project.id,
      title: project.title,
      status: project.status,
      updatedAt: project.updatedAt,
      plannedChapterCount: chapters.length,
      writtenChapterCount: writtenChapters.length,
      totalWordCount: writtenChapters.reduce(
        (sum, chapter) => sum + (chapter.revisions[0]?.wordCount ?? 0),
        0,
      ),
    };
  });
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
        ...(patch.status === undefined ? {} : { status: patch.status }),
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
