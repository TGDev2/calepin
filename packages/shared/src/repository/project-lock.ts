/**
 * The project row lock, and the way a domain failure escapes a transaction.
 *
 * Extracted from `./aggregates` when CAL-034 added a second writer of derived
 * state. Both the counters and the status are recomputed from the rows they
 * summarise, and both have to be recomputed under the same lock as the write
 * that moved those rows: two locks, taken by two modules, are two chances for
 * one of them to be forgotten or to disagree about what it serialises.
 *
 * **Why a lock at all.** Two concurrent writes would otherwise each recompute
 * from a snapshot taken before the other committed, and the second would
 * overwrite the first's contribution with a total that never included it — a
 * lost update no constraint can see. It costs nothing a novel-writing
 * application will notice: it serialises writes to one project, not to the
 * table.
 */

import { getDatabaseClient, type TransactionClient } from "../database/client";
import { type AppError, NotFoundError } from "../errors/app-error";
import { fail, type Result } from "../errors/result";
import { assertProjectScope, type ProjectScope } from "./scope";

export type { TransactionClient };

/**
 * Carries a domain failure out of an interactive transaction.
 *
 * Prisma rolls back on a throw and on nothing else, so a `Result` returned from
 * the callback would commit the partial write it was reporting. The signal is
 * thrown, caught by `runLockedOnProject` itself, and turned back into the
 * failure the caller asked for. It never escapes this module's callers.
 */
export class RollbackSignal extends Error {
  constructor(readonly failure: AppError) {
    super("a locked project transaction was rolled back");
    this.name = "RollbackSignal";
  }
}

export function projectNotFound(): NotFoundError {
  return new NotFoundError({ message: "no project with this id belongs to this owner" });
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

  if (!Array.isArray(rows) || rows.length === 0) throw new RollbackSignal(projectNotFound());
}

/**
 * One transaction, holding the project's row lock, around whatever the caller
 * has to do under it. The single place a `RollbackSignal` is turned back into
 * the failure it carries.
 */
export async function runLockedOnProject<T>(
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
