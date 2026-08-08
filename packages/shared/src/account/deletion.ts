/**
 * Account deletion (CAL-031) — irreversible, and the one operation in this
 * codebase whose failure mode is silent non-compliance rather than a visible
 * error. A deletion that half-runs leaves data nobody can see and nobody
 * deletes, so the shape below is chosen for what survives a partial failure,
 * not for how it reads.
 *
 * **Everything a user owns hangs off `Project.userId`** (§3.5), so one
 * `deleteMany` on `projects` cascades through all thirty-five project-owned
 * tables. Two things it does not reach: `Account` and `Session`, which cascade
 * from `users` instead, and `VerificationToken` / `EmailSignInRequest`, which
 * are keyed by a bare address with no foreign key at all and would otherwise
 * outlive the account still naming it.
 *
 * **The order of the two deletes is load-bearing.** Probed against the real
 * schema before it was written: `DELETE FROM users` in a single statement fails
 * with `23503` on `source_text_versions_editedById_fkey`, because PostgreSQL
 * checks an `ON DELETE RESTRICT` *before* running the cascade that would have
 * emptied the referencing table — the rows blocking the delete are the ones the
 * same statement was about to remove. `SET CONSTRAINTS ALL DEFERRED` does not
 * rescue it either: a `RESTRICT` constraint is not `DEFERRABLE`. Seven author
 * columns are in that position (`SourceTextVersion.editedById`,
 * `Analysis.validatedById`, `AnalysisSectionRevision.createdById`,
 * `AnalysisAnnotation.authorId`, `Bible.validatedById`,
 * `ChapterRevision.createdById`, `Export.requestedById`). The twenty-six
 * `updatedById` columns are the opposite case — `NO ACTION … DEFERRABLE
 * INITIALLY DEFERRED` (CAL-022) — which is exactly what lets them survive the
 * gap between the two statements inside one transaction.
 *
 * Weakening those seven keys would have made one statement enough. It would
 * also have reopened them for every other delete path in the codebase, to save
 * one line here.
 *
 * **The database is atomic; the bucket and the queue are not.** They are
 * injected ports (`ports.ts`), called after the commit, and a failure there is
 * counted and logged rather than propagated: an object no row points at is
 * already unreachable, and a bucket outage must never be a reason to keep a
 * deleted account alive.
 */

import { getDatabaseClient } from "../database/client";
import { NotFoundError, ValidationError } from "../errors/app-error";
import { errorLogFields } from "../errors/log-fields";
import { fail, type Result, succeed } from "../errors/result";
import { logger } from "../logging/logger";
import { matchesDeletionConfirmation } from "./confirmation";
import { assertAccountId, LIVE_GENERATION_STATUSES } from "./inventory";
import type { QueueCancellation, StoragePurge } from "./ports";

/**
 * Longer than Prisma's five-second default, because this transaction is one
 * cascade over every table an account touches and it runs exactly once per
 * account. A timeout here rolls the whole deletion back, which is the right
 * outcome — but not one worth provoking on a large manuscript.
 */
const DELETION_TIMEOUT_MS = 30_000;

const MISMATCHED_CONFIRMATION_MESSAGE =
  "L'adresse saisie ne correspond pas à celle de votre compte. Aucune donnée n'a été supprimée.";

export interface DeleteAccountInput {
  readonly userId: string;
  /** What the account holder typed, matched against the stored address. */
  readonly confirmation: string;
  readonly storage: StoragePurge;
  readonly queue: QueueCancellation;
  /** Injected so a test measures without a clock (§8). */
  readonly now?: () => number;
}

/**
 * What was destroyed. Counts and one identifier — nothing a reader could read
 * as part of a novel (§9), which is asserted rather than trusted: the
 * integration suite fails if a later field carries a string that is not the
 * user id.
 */
export interface AccountDeletionReport {
  readonly userId: string;
  readonly projects: number;
  readonly cancelledJobs: number;
  /** Jobs a failed cancellation left running — an operator's follow-up. */
  readonly uncancelledJobs: number;
  readonly purgedObjects: number;
  /** Objects a failed purge left in the bucket. Same follow-up, same reason. */
  readonly orphanedObjects: number;
  readonly durationMs: number;
}

interface Attempted {
  readonly done: number;
  readonly left: number;
}

export async function deleteAccount(
  input: DeleteAccountInput,
): Promise<Result<AccountDeletionReport>> {
  const { userId, confirmation, storage, queue } = input;
  const now = input.now ?? Date.now;

  assertAccountId(userId);

  const startedAt = now();
  logger.info("account.deletion-requested", { userId });

  const client = getDatabaseClient();
  const account = await client.user.findUnique({ where: { id: userId }, select: { email: true } });

  if (account === null) {
    return refuse(userId, new NotFoundError({ message: "no account carries this id" }));
  }

  // Against the stored address, never the session's copy of it — one fewer way
  // for the two to skew. The session already established who is asking; this
  // establishes that they mean it.
  if (!matchesDeletionConfirmation(confirmation, account.email)) {
    return refuse(
      userId,
      new ValidationError({
        message: "the typed confirmation does not match the stored address",
        userMessage: MISMATCHED_CONFIRMATION_MESSAGE,
        fieldPath: "confirmation",
      }),
    );
  }

  const removed = await client.$transaction(
    async (tx) => {
      // Read inside the transaction, so an export created between the read and
      // the delete cannot leave its object behind with no row to find it by.
      const [exportObjects, coverObjects, live] = await Promise.all([
        tx.export.findMany({
          where: { project: { userId }, storageKey: { not: null } },
          select: { storageKey: true },
        }),
        tx.publication.findMany({
          where: { project: { userId }, coverStorageKey: { not: null } },
          select: { coverStorageKey: true },
        }),
        tx.generation.findMany({
          where: { project: { userId }, status: { in: [...LIVE_GENERATION_STATUSES] } },
          select: { id: true },
        }),
      ]);

      // Projects first — see the header. This one statement is what empties the
      // thirty-five project-owned tables, including the seven that reference
      // `users` with RESTRICT.
      const projects = await tx.project.deleteMany({ where: { userId } });

      // And now the user, which cascades `accounts` and `sessions` with it.
      // Every live session of this account dies here, in the database, rather
      // than in a browser that could still be holding the cookie.
      const deleted = await tx.user.delete({ where: { id: userId }, select: { email: true } });

      // Neither of these two has a foreign key to `users`, so no cascade
      // reaches them: a pending sign-in link and the rate-limit trail would
      // survive the account and keep naming the address. Both spellings,
      // because `@auth/core` writes an identifier as
      // `email.normalize("NFKC").toLowerCase().trim()` while an account created
      // through an OAuth provider keeps the address as the provider spelled it.
      const identifiers = [
        ...new Set([deleted.email, deleted.email.normalize("NFKC").toLowerCase().trim()]),
      ];
      await tx.verificationToken.deleteMany({ where: { identifier: { in: identifiers } } });
      await tx.emailSignInRequest.deleteMany({ where: { identifier: { in: identifiers } } });

      return {
        projects: projects.count,
        storageKeys: [
          ...exportObjects.map((row) => row.storageKey),
          ...coverObjects.map((row) => row.coverStorageKey),
        ].filter((key): key is string => key !== null),
        generationIds: live.map((row) => row.id),
      };
    },
    { timeout: DELETION_TIMEOUT_MS },
  );

  logger.info("account.rows-deleted", { userId, itemCount: removed.projects });

  // Only now, outside the transaction. Cancelling first would stop the work
  // sooner but hold database locks across someone else's network.
  const cancelled = await attempt(
    () => queue.cancelGenerations(removed.generationIds),
    removed.generationIds.length,
    { userId, done: "account.jobs-cancelled", failed: "account.jobs-not-cancelled" },
  );

  const purged = await attempt(
    () => storage.purgeObjects(removed.storageKeys),
    removed.storageKeys.length,
    { userId, done: "account.objects-purged", failed: "account.objects-not-purged" },
  );

  const report: AccountDeletionReport = {
    userId,
    projects: removed.projects,
    cancelledJobs: cancelled.done,
    uncancelledJobs: cancelled.left,
    purgedObjects: purged.done,
    orphanedObjects: purged.left,
    durationMs: now() - startedAt,
  };

  logger.info("account.deleted", {
    userId,
    itemCount: report.projects,
    durationMs: report.durationMs,
  });

  return succeed(report);
}

/** A refusal writes nothing, and says so in one event rather than two. */
function refuse(userId: string, error: NotFoundError | ValidationError): Result<never> {
  logger.warn("account.deletion-refused", { userId, ...errorLogFields(error) });

  return fail(error);
}

/**
 * Runs one external cleanup and reports what it managed, never throwing.
 *
 * The account is already gone by the time either of these runs. Rethrowing
 * would turn a bucket outage into "your account could not be deleted" for an
 * account that no longer exists — the one answer that is certainly wrong.
 */
async function attempt(
  run: () => Promise<number>,
  requested: number,
  events: { userId: string; done: string; failed: string },
): Promise<Attempted> {
  if (requested === 0) return { done: 0, left: 0 };

  try {
    const done = await run();
    logger.info(events.done, { userId: events.userId, itemCount: done });

    return { done, left: Math.max(0, requested - done) };
  } catch (error: unknown) {
    logger.error(events.failed, {
      userId: events.userId,
      itemCount: requested,
      ...errorLogFields(error),
    });

    return { done: 0, left: requested };
  }
}
