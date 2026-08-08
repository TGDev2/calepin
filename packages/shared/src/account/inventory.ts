/**
 * The census of what one account holds (CAL-031) — read before the deletion
 * screen asks for a confirmation, so the confirmation is informed.
 *
 * It counts and it names nothing. Every figure here is a count or an
 * identifier, the two things §9 allows out of the narrative layer: how many
 * chapters, never their titles.
 *
 * It takes the owner id explicitly and filters every query on it, which is the
 * invariant §3.5 actually asks for — the `ProjectScope` of `openProjectScope`
 * proves *one* project belongs to a user, and an account spans all of them.
 */

import type { $Enums } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import { InternalError, NotFoundError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";

/**
 * The generation states whose queued work may still be live, and therefore the
 * ones whose jobs a deletion has to cancel. A `SUCCEEDED`, `FAILED` or
 * `CANCELLED` generation has no job left to cancel.
 */
export const LIVE_GENERATION_STATUSES = [
  "QUEUED",
  "RUNNING",
] as const satisfies readonly $Enums.GenerationStatus[];

/** What an account holds, in counts. Nothing here is readable as prose. */
export interface AccountInventory {
  readonly userId: string;
  /** The stored address — what a deletion confirmation is matched against. */
  readonly email: string;
  readonly projects: number;
  readonly chapters: number;
  /** Chapter revisions — the versioned history of the manuscript. */
  readonly revisions: number;
  readonly generations: number;
  /** Of those, the ones still `QUEUED` or `RUNNING`: work to cancel. */
  readonly queuedGenerations: number;
  readonly exports: number;
  readonly publications: number;
  /** Files in the private bucket: export payloads and publication covers. */
  readonly storedObjects: number;
}

/** Every project-owned query below hangs off this one clause. */
function ownedBy(userId: string) {
  return { project: { userId } };
}

export async function collectAccountInventory(userId: string): Promise<Result<AccountInventory>> {
  assertAccountId(userId);

  const client = getDatabaseClient();

  const user = await client.user.findUnique({ where: { id: userId }, select: { email: true } });

  if (user === null) {
    return fail(new NotFoundError({ message: "no account carries this id" }));
  }

  const [
    projects,
    chapters,
    revisions,
    generations,
    queuedGenerations,
    exports,
    publications,
    exportObjects,
    coverObjects,
  ] = await Promise.all([
    client.project.count({ where: { userId } }),
    // The relation path each model takes to reach `projects` is the one
    // `PROJECT_OWNED_MODELS` registers; a chapter reaches it through its
    // outline, a revision through its chapter.
    client.chapter.count({ where: { outline: ownedBy(userId) } }),
    client.chapterRevision.count({ where: { chapter: { outline: ownedBy(userId) } } }),
    client.generation.count({ where: ownedBy(userId) }),
    client.generation.count({
      where: { ...ownedBy(userId), status: { in: [...LIVE_GENERATION_STATUSES] } },
    }),
    client.export.count({ where: ownedBy(userId) }),
    client.publication.count({ where: ownedBy(userId) }),
    client.export.count({ where: { ...ownedBy(userId), storageKey: { not: null } } }),
    client.publication.count({ where: { ...ownedBy(userId), coverStorageKey: { not: null } } }),
  ]);

  return succeed({
    userId,
    email: user.email,
    projects,
    chapters,
    revisions,
    generations,
    queuedGenerations,
    exports,
    publications,
    storedObjects: exportObjects + coverObjects,
  });
}

/**
 * The same guard `listProjectsForOwner` uses, for the same reason: an owner id
 * that was never established would count the projects of nobody, and zero reads
 * exactly like an account with nothing in it.
 */
export function assertAccountId(userId: string): void {
  if (userId !== "") return;

  throw new InternalError({
    code: "PROJECT_SCOPE_REQUIRED",
    message: "an account inventory was reached without an owner",
  });
}
