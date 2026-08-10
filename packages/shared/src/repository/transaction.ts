/**
 * The scoped transaction a domain repository writes inside (CAL-055).
 *
 * Until now the kernel handed out exactly two transactions, `withProjectAggregates`
 * and `withProjectStatus`, and both do more than open one: they take the project
 * row's lock and rewrite a derived column from the rows underneath it. That is
 * right for a write that *moves* derived state, and wrong for one that does not.
 * Appending a summary moves neither counter nor status, so running it under
 * `withProjectAggregates` would serialise it against every unrelated write to the
 * same project and burn a recomputation to store the number it already held.
 *
 * The alternative was for the domain package to hold a client of its own, and
 * that is the boundary §3.5 exists to keep closed: `@calepin/shared/database` is
 * a process shell's import. So the seam is here, the client stays here, and a
 * domain repository receives a `TransactionClient` it cannot obtain by itself.
 *
 * **No lock, deliberately.** Nothing this serves recomputes anything, and the
 * one race it does have — two summarising passes over the same chapter both
 * reading the same highest `revisionNumber` — is settled by the unique key on
 * `(chapterId, revisionNumber)`, which turns it into a visible constraint
 * violation instead of a silently lost revision. That is the same answer
 * `ChapterRevision` already gives to the same question, and a lock would only
 * move the collision earlier without making either write more correct.
 *
 * **The project is confirmed, though.** What protects a row is still the
 * `scopedWhere` on the statement that touches it — that has not changed, and a
 * create still resolves its parent through `requireOwnedRow`. But the other two
 * wrappers refuse a scope whose `(ownerId, projectId)` pair does not exist,
 * because their `FOR UPDATE` names the owner, and a seam that opened a
 * transaction where they refuse one would be the odd wrapper out: every future
 * domain repository is written inside this, and "the body simply reaches
 * nothing" is a guarantee that depends on the body. The cost is one indexed
 * lookup in a transaction that is about to issue several, and it turns *not
 * yours* into a `NOT_FOUND` at the top instead of an empty read three
 * statements deep.
 */

import { getDatabaseClient, type TransactionClient } from "../database/client";
import { fail, type Result } from "../errors/result";
import { projectNotFound, RollbackSignal } from "./project-lock";
import { assertProjectScope, type ProjectScope } from "./scope";

/**
 * One transaction, scoped to a project, around a body that returns a `Result`.
 *
 * A failing `Result` rolls the transaction back rather than committing it —
 * Prisma rolls back on a throw and on nothing else, so the failure travels out
 * as a `RollbackSignal` and is turned back into the value the caller asked for.
 * That is the same mechanism `withProjectAggregates` uses, and it is what keeps
 * "a response that fails validation writes nothing at all" (§6) true of a body
 * that writes more than one row.
 *
 * The body receives the transaction client and must use it. A write issued
 * against the ambient client instead runs outside the transaction, which is the
 * one way to defeat this that the type system cannot see.
 */
export async function withProjectTransaction<T>(
  scope: ProjectScope,
  body: (client: TransactionClient) => Promise<Result<T>>,
): Promise<Result<T>> {
  assertProjectScope(scope);

  try {
    return await getDatabaseClient().$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        SELECT "id" FROM "projects"
        WHERE "id" = ${scope.projectId} AND "userId" = ${scope.ownerId}
      `;

      if (!Array.isArray(rows) || rows.length === 0) throw new RollbackSignal(projectNotFound());

      const result = await body(tx);
      if (!result.ok) throw new RollbackSignal(result.error);

      return result;
    });
  } catch (error: unknown) {
    if (error instanceof RollbackSignal) return fail(error.failure);

    throw error;
  }
}
