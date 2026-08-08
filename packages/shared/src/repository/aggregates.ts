/**
 * The project aggregates (CAL-033) — two counters stored on `projects`, and the
 * only sanctioned way to move them.
 *
 * **What they are.** `writtenChapterCount` is the number of chapters carrying at
 * least one `ChapterRevision`; `totalWordCount` is the sum of each of those
 * chapters' *latest* revision. Both are read straight off the row by the
 * dashboard (CAL-032) instead of being joined and summed on every display.
 *
 * **Rewritten from truth, never adjusted by a delta.** Every maintenance path
 * recomputes both numbers from `chapters` and `chapter_revisions` inside the
 * same transaction as the write that moved them. That is the whole design, and
 * it is what makes the hard case of this task — restoring an earlier revision —
 * require no special case at all: a restoration appends a revision like any
 * other write, the recomputation reads the new latest one, and the counter is
 * right. Delta arithmetic would need to know what the *previous* latest revision
 * was worth, at four call sites, and the one that eventually gets it wrong
 * leaves a number nothing ever contradicts.
 *
 * **Serialised per project, by a row lock.** `withProjectAggregates` takes
 * `FOR UPDATE` on the project row before anything else. Two concurrent chapter
 * writes would otherwise each recompute from a snapshot taken before the other
 * committed, and the second would overwrite the first's contribution with a
 * total that never included it — a lost update that no constraint can see. The
 * lock costs nothing a novel-writing application will notice: it serialises
 * writes to one project, not to the table.
 *
 * **Written with raw SQL, deliberately.** The counters are derived state, so
 * they stay outside the audit block: this write names no author and does not
 * bump `Project.version`, which is the optimistic-concurrency token for the
 * project's own attributes and would otherwise make a chapter generation
 * collide with an unrelated rename. `updatedAt` is left alone for the same
 * reason — a counter has no author and no new state to date. The Prisma client
 * cannot express any of that (`@updatedAt` and the audit extension both fire on
 * an `update`), so the statement is written out. It still names the owner in its
 * `WHERE`, exactly as every other statement in this layer does.
 */

import { getDatabaseClient, type TransactionClient } from "../database/client";
import { type AppError, InternalError, NotFoundError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import { assertProjectScope, type ProjectScope } from "./scope";

/** The two denormalised counters, as they are stored and as they are computed. */
export interface ProjectAggregates {
  /** Chapters carrying at least one revision. */
  readonly writtenChapterCount: number;
  /** The sum of each written chapter's latest revision — never every revision. */
  readonly totalWordCount: number;
}

/**
 * A client inside the aggregate transaction. Re-exported under the repository's
 * own name so a domain repository can type its mutation without importing the
 * database seam (CLAUDE.md §3.5).
 */
export type { TransactionClient };

/**
 * Carries a domain failure out of an interactive transaction.
 *
 * Prisma rolls back on a throw and on nothing else, so a `Result` returned from
 * the callback would commit the partial write it was reporting. The signal is
 * thrown, caught by `withProjectAggregates` itself, and turned back into the
 * failure the caller asked for. It never escapes this module.
 */
class RollbackSignal extends Error {
  constructor(readonly failure: AppError) {
    super("the project aggregate transaction was rolled back");
    this.name = "RollbackSignal";
  }
}

function notFound(): NotFoundError {
  return new NotFoundError({ message: "no project with this id belongs to this owner" });
}

/**
 * The definition of both counters, in one statement.
 *
 * Anchored on `projects` rather than on `chapters`, and grouped by the project,
 * so the query answers with exactly one row when the project belongs to the
 * owner and with none when it does not. Aggregating from `chapters` instead
 * would answer `0, 0` for a project that does not exist, which reads as an empty
 * project and would let a caller reconcile someone else's row to zero.
 *
 * The inner `LIMIT 1` is what makes "latest revision only" true: a chapter
 * regenerated three times contributes its third revision, never the sum of the
 * three. `COUNT` over that column counts the chapters a revision was found for,
 * so a chapter whose latest revision holds no word at all still counts as
 * written — it has text, the text is empty, and those are different facts.
 */
async function selectAggregates(
  client: TransactionClient,
  scope: ProjectScope,
): Promise<ProjectAggregates | undefined> {
  const rows = await client.$queryRaw`
    SELECT COUNT(latest."wordCount")::int AS "writtenChapterCount",
           COALESCE(SUM(latest."wordCount"), 0)::int AS "totalWordCount"
    FROM "projects" p
    LEFT JOIN "outlines" o ON o."projectId" = p."id"
    LEFT JOIN "chapters" c ON c."outlineId" = o."id"
    LEFT JOIN LATERAL (
      SELECT r."wordCount"
      FROM "chapter_revisions" r
      WHERE r."chapterId" = c."id"
      ORDER BY r."revisionNumber" DESC
      LIMIT 1
    ) latest ON TRUE
    WHERE p."id" = ${scope.projectId} AND p."userId" = ${scope.ownerId}
    GROUP BY p."id"
  `;

  return toAggregates(rows);
}

/**
 * A raw result is untrusted input like any other (CLAUDE.md §6): the column
 * types are the migration's business, not this module's, and a cast would turn a
 * schema change into a `NaN` on a dashboard rather than a failure.
 */
function toAggregates(rows: unknown): ProjectAggregates | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;

  const row: unknown = rows[0];

  if (
    typeof row !== "object" ||
    row === null ||
    !("writtenChapterCount" in row) ||
    !("totalWordCount" in row)
  ) {
    throw new InternalError({
      message: "the aggregate query returned a row of an unexpected shape",
    });
  }

  const written: unknown = row.writtenChapterCount;
  const words: unknown = row.totalWordCount;

  if (typeof written !== "number" || typeof words !== "number") {
    throw new InternalError({
      message: "the aggregate query returned a column of an unexpected type",
      fieldPath: typeof written === "number" ? "totalWordCount" : "writtenChapterCount",
    });
  }

  return { writtenChapterCount: written, totalWordCount: words };
}

/**
 * Takes the project row for the rest of the transaction, and confirms it is the
 * scope's owner's while doing it.
 *
 * One statement does both on purpose. The lock is what serialises concurrent
 * recomputations, and the `userId` in its `WHERE` is what makes a forged scope
 * find nothing to lock — so a mutation running under one never starts.
 */
async function lockProject(client: TransactionClient, scope: ProjectScope): Promise<void> {
  const rows = await client.$queryRaw`
    SELECT "id" FROM "projects"
    WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
    FOR UPDATE
  `;

  if (!Array.isArray(rows) || rows.length === 0) throw new RollbackSignal(notFound());
}

/** Recomputes both counters and stores them. The project row is already locked. */
async function writeAggregates(
  client: TransactionClient,
  scope: ProjectScope,
): Promise<ProjectAggregates> {
  const aggregates = await selectAggregates(client, scope);

  // Unreachable behind `lockProject`, which already refused a project the scope
  // does not own. A throw rather than a silent zero: were it ever reached, the
  // alternative would be storing "no chapters" for a project full of them.
  if (aggregates === undefined) throw new RollbackSignal(notFound());

  await client.$executeRaw`
    UPDATE "projects"
    SET "writtenChapterCount" = ${aggregates.writtenChapterCount},
        "totalWordCount" = ${aggregates.totalWordCount}
    WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
  `;

  return aggregates;
}

/**
 * One transaction, holding the project's row lock, around whatever the caller
 * has to do under it. The single place a `RollbackSignal` is turned back into
 * the failure it carries.
 */
async function runLocked<T>(
  scope: ProjectScope,
  body: (client: TransactionClient) => Promise<Result<T>>,
): Promise<Result<T>> {
  assertProjectScope(scope);

  try {
    return await getDatabaseClient().$transaction(async (tx) => {
      await lockProject(tx, scope);

      return await body(tx);
    });
  } catch (error: unknown) {
    if (error instanceof RollbackSignal) return fail(error.failure);

    throw error;
  }
}

/**
 * Runs a write against a project's chapters and leaves its counters exact.
 *
 * The sequence is fixed, and every maintenance path in the product is expected
 * to be one call to this function:
 *
 *   lock the project ──► the caller's write ──► recompute and store
 *
 * all inside one transaction. A failure anywhere — the mutation returning a
 * `Result` failure, the mutation throwing, the recomputation failing — rolls the
 * whole thing back, so a counter never records a write that did not happen and a
 * write never lands without its counter.
 *
 * The mutation receives the transaction client and must use it. A write issued
 * against the ambient client instead runs outside the transaction and outside
 * the lock, which is the one way to defeat this that the type system cannot see.
 */
export async function withProjectAggregates<T>(
  scope: ProjectScope,
  mutate: (client: TransactionClient) => Promise<Result<T>>,
): Promise<Result<T>> {
  return runLocked(scope, async (tx) => {
    const mutated = await mutate(tx);
    if (!mutated.ok) throw new RollbackSignal(mutated.error);

    await writeAggregates(tx, scope);

    return succeed(mutated.value);
  });
}

/**
 * The counters as the rows themselves say they are — the oracle the stored ones
 * are supposed to equal.
 *
 * Reads nothing but truth and writes nothing, so it is what an operations view
 * (CAL-067) reports drift with, and what a test compares against after every
 * write.
 */
export async function computeProjectAggregates(
  scope: ProjectScope,
): Promise<Result<ProjectAggregates>> {
  assertProjectScope(scope);

  const aggregates = await selectAggregates(getDatabaseClient(), scope);

  return aggregates === undefined ? fail(notFound()) : succeed(aggregates);
}

/**
 * Rewrites the stored counters from truth, outside of any write of its own.
 *
 * The repair path, and the backfill one: a project whose chapters were written
 * before CAL-033 existed, a fixture that seeded rows directly, a row a future
 * bug left behind. It takes the same lock and runs the same recomputation as a
 * real write, so it cannot itself race one.
 */
export async function reconcileProjectAggregates(
  scope: ProjectScope,
): Promise<Result<ProjectAggregates>> {
  return runLocked(scope, async (tx) => succeed(await writeAggregates(tx, scope)));
}
