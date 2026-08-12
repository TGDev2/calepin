/**
 * Validating the bible, and the gate in front of it (CAL-099).
 *
 * *Une bible contenant une contradiction ne peut pas être validée sans
 * arbitrage explicite de l'utilisateur.* The sentence is an acceptance
 * criterion about a **write**, so this is where it is enforced — not on a
 * screen, and not in a caller that remembers to ask.
 *
 * Three things happen in one transaction, in this order, and the order is the
 * argument:
 *
 *   1. the calculable checks run against the rows as they stand;
 *   2. what they found is reconciled with what is on file, so an arbitration
 *      the author made earlier survives and a contradiction they fixed closes;
 *   3. the stamp is written, or refused.
 *
 * Running the checks *inside* the transaction is what removes staleness from
 * the problem entirely. The alternative — a stored report plus a freshness
 * column — was considered and rejected: it needs a second column, a comparison
 * against ten tables, and it still answers *the report was fresh when I looked*
 * rather than *the bible is coherent now*.
 *
 * There is deliberately no *valider quand même*. `unlockBibleElement` settled
 * that doctrine one task earlier: the answer to a refusal the author disagrees
 * with is a write they make — accept the contradiction, set it aside, or change
 * the bible — attributed by the audit block, not a flag they pass. A flag would
 * also go stale between the screen and the statement, which is the failure
 * `acceptOperationEstimate` exists to catch.
 *
 * CAL-100 owns what comes after: the named version, the transition of the
 * project's own status beyond what `withProjectStatus` already derives, and the
 * composer switching to the validated bible.
 */

import { isBlockingIssue } from "@calepin/shared/coherence";
import { ConflictError, fail, NotFoundError, type Result, succeed } from "@calepin/shared/errors";
import {
  listQualityIssuesWithin,
  type ProjectScope,
  type QualityIssueRow,
  scopedWhere,
  withProjectStatus,
} from "@calepin/shared/repository";

import { BIBLE_COHERENCE_CHECK_IDS, runBibleCoherenceCheck } from "./repository";

export interface BibleValidated {
  readonly bibleId: string;
  readonly validatedAt: Date;
}

function alreadyValidated(): ConflictError {
  return new ConflictError({
    message: "bible already validated",
    userMessage: "Cette bible est déjà validée.",
    fieldPath: "validatedAt",
  });
}

/**
 * The refusal names how many contradictions stand, never what they say.
 *
 * A count is safe to log and safe to put in an error payload; the sentences are
 * on the screen already, read from the rows the same transaction just wrote
 * (§9, §7).
 */
function notCoherent(blocking: readonly QualityIssueRow[]): ConflictError {
  return new ConflictError({
    code: "BIBLE_NOT_COHERENT",
    message: "bible holds unarbitrated contradictions",
    userMessage:
      blocking.length === 1
        ? "La bible contient une contradiction sur laquelle vous ne vous êtes pas encore prononcé."
        : `La bible contient ${String(blocking.length)} contradictions sur lesquelles vous ne vous êtes pas encore prononcé.`,
    fieldPath: "coherence",
  });
}

/**
 * Two transactions, and the split is the point.
 *
 * The check runs first, in its own, **so a refusal leaves the findings on
 * file**. Folding it into the second one looks tidier and is wrong: a failing
 * `Result` rolls the transaction back, so the author would be told that three
 * contradictions stand and then be shown a screen with none — the refusal would
 * destroy its own evidence.
 *
 * The gate then re-reads inside the locked transaction rather than trusting
 * what the first one returned. That is what makes an arbitration racing the
 * validation land on the right side of it: the decision is a write, and the
 * write the gate reads is the one that committed.
 */
export async function validateBible(scope: ProjectScope): Promise<Result<BibleValidated>> {
  const checked = await runBibleCoherenceCheck(scope);
  if (!checked.ok) return fail(checked.error);

  return withProjectStatus(scope, async (client) => {
    const bible = await client.bible.findFirst({
      where: scopedWhere("Bible", scope),
      select: { id: true, validatedAt: true },
    });
    if (bible === null) {
      return fail(new NotFoundError({ message: "bible not found", fieldPath: "bible" }));
    }
    if (bible.validatedAt !== null) return fail(alreadyValidated());

    const issues = await listQualityIssuesWithin(client, scope, {
      checkIds: BIBLE_COHERENCE_CHECK_IDS,
    });
    const blocking = issues.filter(isBlockingIssue);
    if (blocking.length > 0) return fail(notCoherent(blocking));

    const validatedAt = new Date();
    // Conditional on the bible still being unvalidated, so two clicks racing
    // each other settle on one timestamp instead of moving it.
    const written = await client.bible.updateMany({
      where: scopedWhere("Bible", scope, { id: bible.id, validatedAt: null }),
      data: { validatedAt, validatedById: scope.ownerId },
    });

    if (written.count === 0) return fail(alreadyValidated());

    return succeed({ bibleId: bible.id, validatedAt });
  });
}
