/**
 * The bible's savepoint table — generic persistence only (CAL-100).
 *
 * `BibleVersion.content` is a JSON blob because it is a whole-bible snapshot,
 * never queried by field, only ever handed whole to whatever reads "the
 * reference bible" later. What that blob actually contains is
 * `@calepin/bible`'s business to shape (`BibleVersionContent`,
 * `buildBibleVersionContent`) — this file only writes and reads the column, the
 * same division `quality-issue.ts` already draws between generic persistence
 * (`shared`) and the narrative meaning of what is persisted (the domain).
 * `content` is typed `Prisma.InputJsonValue`/`Prisma.JsonValue` here rather
 * than the domain's own type, because this package may not import a domain
 * (§3.2) — the round trip back to `BibleVersionContent` is
 * `@calepin/bible/repository`'s single, documented cast.
 *
 * `mintBibleVersion` is called from inside `validateBible`'s own locked
 * transaction (`@calepin/bible`), which is why it takes a `TransactionClient`
 * rather than opening its own — the version and the `Bible.validatedAt` stamp
 * commit together or not at all.
 */

import type { Prisma } from "@prisma/client";

import { getDatabaseClient, type TransactionClient } from "../database/client";
import { fail, type Result, succeed } from "../errors/result";
import { assertProjectScope, type ProjectScope, requireOwnedRow, scopedWhere } from "./scope";

export interface MintBibleVersionInput {
  readonly bibleId: string;
  readonly createdById: string;
  /**
   * The domain's own content value (`@calepin/bible`'s `BibleVersionContent`,
   * built field-by-field with `readonly` arrays throughout). Typed `unknown`
   * rather than `Prisma.InputJsonValue` here — the domain has no
   * `@prisma/client` dependency to produce that exact shape from, and a
   * `readonly` array is not structurally a `Prisma.InputJsonValue` one. The
   * cast to what Prisma actually needs happens once, below.
   */
  readonly content: unknown;
}

export interface BibleVersionMinted {
  readonly id: string;
  readonly versionNumber: number;
  readonly createdAt: Date;
}

/**
 * Mints the next savepoint for a bible.
 *
 * `requireOwnedRow` resolves `bibleId` first — `writeCanonFact`'s own reason:
 * the parent id of a new child row is a value the caller supplied, and no
 * `where` on a `create` can constrain it. `versionNumber` is the count of
 * existing versions plus one rather than a hard-coded `1` — `validateBible`
 * refuses a second validation outright today, so there is only ever one row in
 * practice, but nothing here has to change if a re-validation path is ever
 * added. Counting rather than reading `MAX` is safe for the same reason
 * `SourceTextVersion` may: this runs inside the caller's own locked
 * transaction, so nothing else can insert a competing version underneath it.
 */
export async function mintBibleVersion(
  client: TransactionClient,
  scope: ProjectScope,
  input: MintBibleVersionInput,
): Promise<Result<BibleVersionMinted>> {
  assertProjectScope(scope);

  const owned = await requireOwnedRow("Bible", input.bibleId, scope);
  if (!owned.ok) return fail(owned.error);

  const existing = await client.bibleVersion.count({
    where: scopedWhere("BibleVersion", scope, { bibleId: input.bibleId }),
  });

  const minted = await client.bibleVersion.create({
    data: {
      bibleId: input.bibleId,
      versionNumber: existing + 1,
      content: input.content as Prisma.InputJsonValue,
      createdById: input.createdById,
    },
    select: { id: true, versionNumber: true, createdAt: true },
  });

  return succeed(minted);
}

export interface BibleVersionReference {
  readonly bibleId: string;
  readonly versionNumber: number;
  readonly createdAt: Date;
  readonly content: Prisma.JsonValue;
}

/**
 * The latest savepoint of the project's bible, or `null` when none exists yet
 * — no bible, or a bible not yet validated. The same "expected state, not a
 * fault" convention `getBibleOverview` already uses for an absent bible.
 */
export async function getReferenceBibleVersion(
  scope: ProjectScope,
  client?: TransactionClient,
): Promise<BibleVersionReference | null> {
  assertProjectScope(scope);

  const database = client ?? getDatabaseClient();

  const bible = await database.bible.findFirst({
    where: scopedWhere("Bible", scope),
    select: { id: true },
  });
  if (bible === null) return null;

  return database.bibleVersion.findFirst({
    where: scopedWhere("BibleVersion", scope, { bibleId: bible.id }),
    orderBy: { versionNumber: "desc" },
    select: { bibleId: true, versionNumber: true, createdAt: true, content: true },
  });
}
