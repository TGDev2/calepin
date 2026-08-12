/**
 * Running the bible's checks against the database, and writing what they found
 * (CAL-099).
 *
 * A **domain repository built on the kernel** — §3.5's own words, and the
 * arrangement `@calepin/manuscript/src/summary/repository.ts` already uses.
 * It has to live here rather than in `@calepin/shared/repository` for one
 * reason, and the reason is the gate: `packages/shared` may import no
 * `@calepin/*` package, so a `validateBible` written there could not run a
 * single narrative rule. It would have to take the findings from its caller and
 * trust them — and a gate that trusts its caller is a suggestion.
 *
 * So the read, the checks and the write are one chain in one place, and
 * `validateBible` (`./validate`) runs it inside its own transaction.
 */

import {
  BIBLE_COHERENCE_CHECKS,
  type CoherenceRunReport,
  isBlockingIssue,
} from "@calepin/shared/coherence";
import { fail, NotFoundError, type Result, succeed } from "@calepin/shared/errors";
import {
  getBibleOverview,
  listQualityIssues,
  listQualityIssuesWithin,
  type ProjectScope,
  type QualityIssueRow,
  reconcileQualityIssuesWithin,
  type TransactionClient,
  withProjectTransaction,
} from "@calepin/shared/repository";

import { buildBibleCoherenceSubject } from "./subject";
import { BIBLE_SUITE_CHECK_IDS, checkBibleCoherence } from "./suite";

/** Every check the bible answers to — what the validation gate reads. */
export const BIBLE_COHERENCE_CHECK_IDS = BIBLE_COHERENCE_CHECKS;

export interface BibleCoherenceReport {
  readonly bibleId: string;
  readonly validatedAt: Date | null;
  /** Every issue the bible's checks have on file, model-backed ones included. */
  readonly issues: readonly QualityIssueRow[];
  /** The subset standing between the bible and its validation. */
  readonly blocking: readonly QualityIssueRow[];
  /** Counts and identifiers only — safe to log (§9). */
  readonly run: CoherenceRunReport;
}

function missingBible(): NotFoundError {
  return new NotFoundError({ message: "bible not found", fieldPath: "bible" });
}

/**
 * Recompute the calculable checks, write the difference, and read back
 * everything the gate will look at.
 *
 * The read is deliberately wider than the write: the run reconciles the four
 * checks it performed, and the report lists all six — a contradiction a model
 * found last week still blocks a validation today, and a pass that never asked
 * that question has no business closing it.
 */
export async function runBibleCoherenceCheckWithin(
  client: TransactionClient,
  scope: ProjectScope,
): Promise<Result<BibleCoherenceReport>> {
  const overview = await getBibleOverview(scope, client);
  if (overview === null) return fail(missingBible());

  const run = checkBibleCoherence(buildBibleCoherenceSubject(overview));

  await reconcileQualityIssuesWithin(client, scope, {
    checkIds: BIBLE_SUITE_CHECK_IDS,
    findings: run.findings,
  });

  const issues = await listQualityIssuesWithin(client, scope, {
    checkIds: BIBLE_COHERENCE_CHECKS,
  });

  return succeed({
    bibleId: overview.bibleId,
    validatedAt: overview.validatedAt,
    issues,
    blocking: issues.filter(isBlockingIssue),
    run: run.report,
  });
}

/** The author pressing *lancer le contrôle*. */
export async function runBibleCoherenceCheck(
  scope: ProjectScope,
): Promise<Result<BibleCoherenceReport>> {
  return withProjectTransaction(scope, async (client) =>
    runBibleCoherenceCheckWithin(client, scope),
  );
}

/**
 * What is already on file, with nothing recomputed.
 *
 * The screen's first paint: showing the last run costs one query, while
 * recomputing on every render would run four checks over the whole bible each
 * time somebody opened a page.
 */
export async function readBibleCoherenceIssues(
  scope: ProjectScope,
): Promise<Result<readonly QualityIssueRow[]>> {
  return listQualityIssues(scope, { checkIds: BIBLE_COHERENCE_CHECKS });
}
