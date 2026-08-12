/**
 * Reading the reference bible — the composer switch CAL-100 exists for.
 *
 * `getReferenceBibleVersion` (`@calepin/shared/repository`) hands back the
 * latest savepoint with its content untyped, because `shared` may not import
 * a domain to know its shape (§3.2). This is the one place that round trip
 * closes: the cast back to `BibleVersionContent` is safe because the column
 * is written exclusively by `mintBibleVersion` from a value of that exact
 * type (`validateBible`, via `buildBibleVersionContent`) — never from
 * external input or a model's answer, so §6's "never trust the model" does
 * not apply to it.
 *
 * This is what a future generation reads instead of `getBibleOverview`: the
 * bible as it stood when it was last validated, not as the author is
 * currently editing it. No caller exists yet (CAL-101, CAL-107 are unbuilt),
 * which is why this function is proven by test rather than by a real one.
 */

import { getReferenceBibleVersion, type ProjectScope, type TransactionClient } from "@calepin/shared/repository";

import type { BibleVersionContent } from "./content";

export interface ReferenceBible {
  readonly bibleId: string;
  readonly versionNumber: number;
  readonly createdAt: Date;
  readonly content: BibleVersionContent;
}

/** The validated bible, or `null` before a first validation ever ran. */
export async function getReferenceBible(
  scope: ProjectScope,
  client?: TransactionClient,
): Promise<ReferenceBible | null> {
  const version = await getReferenceBibleVersion(scope, client);
  if (version === null) return null;

  return {
    bibleId: version.bibleId,
    versionNumber: version.versionNumber,
    createdAt: version.createdAt,
    content: version.content as unknown as BibleVersionContent,
  };
}
