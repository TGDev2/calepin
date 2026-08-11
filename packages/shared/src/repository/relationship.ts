/**
 * The relationship graph of a project's bible: read whole, written one edge at
 * a time (CAL-091).
 *
 * The first write path this repository has ever had into the bible, so it sets
 * the shape the sections after it follow — and it is `direction.ts`'s shape,
 * one level deeper: `assertProjectScope`, then `withProjectTransaction`, then
 * `scopedWhere` on every statement that names an existing row and
 * `requireOwnedRow` on every foreign key a caller supplied.
 *
 * **Three `requireOwnedRow` calls on a create, not one.** A `Relationship`
 * names a bible and two characters, and all three ids arrive from the caller.
 * `scopedWhere` protects a read, an update and a delete; it cannot protect an
 * insert, because there is no existing row to filter — which is exactly the
 * case `requireOwnedRow`'s own doc comment describes. Both character ids go
 * through it too: the composite foreign keys make a cross-bible edge
 * unstorable, but they would answer with a `P2003` naming a constraint, and
 * *not yours* must answer `NOT_FOUND` like everything else (§3.5).
 *
 * **`getRelationshipGraph` reads as a value, not a `Result`.** A project with
 * no bible is a legitimate, expected state — nothing in the product creates a
 * `Bible` row yet (CLAUDE.md §13) — so it answers `null`, `getAnalysis`'s
 * convention. The cast is returned whole beside the edges, including the
 * characters no edge touches: a screen that only listed related characters
 * could never offer the author the pair they have not linked yet.
 *
 * **Both directions come back, and neither is filtered.** One row per
 * direction is CAL-016's decision on CAL-099's behalf, and this read is what
 * makes it visible: `resolveRelationshipGraph` in `@calepin/bible` classifies
 * the pairs, the caller renders the classification. Filtering or pairing here
 * would make *un lien à sens unique* and *un lien absent* the same answer to a
 * screen whose whole job is telling them apart.
 *
 * **The content travels typed but unvalidated by this layer.** `label` and
 * `description` are bounded by `@calepin/bible`'s `relationshipContentSchema`,
 * and `@calepin/shared` may not import a domain (§3.2) — the caller parses
 * with `parseRelationshipContent` before reaching here, the division
 * `editDirection` and `editAnalysisSection` already draw. `type` is the Prisma
 * enum, which this layer may name.
 *
 * Every writer must be inside `runWithActor`: no statement names
 * `updatedById`, and the CAL-022 extension is what fills it.
 */

import type { $Enums } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import { ConflictError, NotFoundError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import { assertProjectScope, type ProjectScope, requireOwnedRow, scopedWhere } from "./scope";
import { withProjectTransaction } from "./transaction";

/** One character of the bible, as the graph screen needs them. */
export interface BibleCastMember {
  readonly id: string;
  readonly name: string;
  readonly importance: $Enums.CharacterImportance;
}

/** One directed edge, as it is stored. */
export interface BibleRelationship {
  readonly id: string;
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly type: $Enums.RelationshipType;
  readonly label: string;
  readonly description: string | null;
  readonly lockedAt: Date | null;
}

export interface BibleRelationshipGraph {
  readonly bibleId: string;
  /** Every character of the bible, related or not, by name. */
  readonly cast: readonly BibleCastMember[];
  /** Every edge of the bible, both directions, unfiltered. */
  readonly relationships: readonly BibleRelationship[];
}

/**
 * The whole graph of the project's one bible, or null when it has none.
 *
 * Two indexed reads rather than a nested include: `@@index([bibleId])` on
 * `relationships` exists precisely so *the whole graph of a bible* is one
 * query, and the cast is the other. Ordering is by name and then by id so the
 * screen's layout — which places nodes by index — is stable across reloads
 * rather than following whatever order the planner returned.
 */
export async function getRelationshipGraph(
  scope: ProjectScope,
): Promise<BibleRelationshipGraph | null> {
  assertProjectScope(scope);

  const database = getDatabaseClient();

  const bible = await database.bible.findFirst({
    where: scopedWhere("Bible", scope),
    select: { id: true },
  });

  if (bible === null) {
    return null;
  }

  const [cast, relationships] = await Promise.all([
    database.character.findMany({
      where: scopedWhere("Character", scope, { bibleId: bible.id }),
      select: { id: true, name: true, importance: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    database.relationship.findMany({
      where: scopedWhere("Relationship", scope, { bibleId: bible.id }),
      select: {
        id: true,
        fromCharacterId: true,
        toCharacterId: true,
        type: true,
        label: true,
        description: true,
        lockedAt: true,
      },
      orderBy: [{ fromCharacterId: "asc" }, { toCharacterId: "asc" }, { type: "asc" }],
    }),
  ]);

  return { bibleId: bible.id, cast, relationships };
}

/** The three columns a person or a mission writes, plus the two ends. */
export interface WriteRelationshipInput {
  readonly bibleId: string;
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  /** Already parsed by `parseRelationshipContent` in `@calepin/bible`. */
  readonly type: $Enums.RelationshipType;
  readonly label: string;
  readonly description: string | null;
}

export interface RelationshipWritten {
  readonly id: string;
}

/**
 * Adds one directed edge.
 *
 * **The mirror is not written.** Declaring that A holds something toward B
 * says nothing about what B holds toward A, and a create that helpfully
 * produced both would destroy the state CAL-099 exists to detect — CAL-016's
 * decision, honoured by the one statement that could break it.
 *
 * Two refusals. A self-relation is a `CONFLICT` refused here rather than left
 * to `relationships_distinct_characters_check`, so the author reads a sentence
 * instead of a constraint name. A `(from, to, type)` that already exists is a
 * `CONFLICT` too: the same tie, declared twice, is a stale screen — the answer
 * is to look again, not to write again, `discardDirection`'s reading. It is
 * detected by a read inside the transaction rather than by catching `P2002`,
 * because the unique index cannot tell a duplicate of *this* project's row
 * from anything else, and a caught driver error would have to guess.
 */
export async function writeRelationship(
  scope: ProjectScope,
  input: WriteRelationshipInput,
): Promise<Result<RelationshipWritten>> {
  assertProjectScope(scope);

  if (input.fromCharacterId === input.toCharacterId) {
    return fail(
      new ConflictError({
        message: "a relationship cannot leave and reach the same character",
        userMessage: "Un personnage ne peut pas être relié à lui-même.",
      }),
    );
  }

  return withProjectTransaction<RelationshipWritten>(scope, async (tx) => {
    for (const [model, id] of [
      ["Bible", input.bibleId],
      ["Character", input.fromCharacterId],
      ["Character", input.toCharacterId],
    ] as const) {
      const owned = await requireOwnedRow(model, id, scope);

      if (!owned.ok) {
        return fail(owned.error);
      }
    }

    const existing = await tx.relationship.findFirst({
      where: scopedWhere("Relationship", scope, {
        fromCharacterId: input.fromCharacterId,
        toCharacterId: input.toCharacterId,
        type: input.type,
      }),
      select: { id: true },
    });

    if (existing !== null) {
      return fail(
        new ConflictError({
          message: "this directed tie of this type already exists",
          userMessage: "Ce lien existe déjà entre ces deux personnages, dans ce sens.",
        }),
      );
    }

    const created = await tx.relationship.create({
      data: {
        bibleId: input.bibleId,
        fromCharacterId: input.fromCharacterId,
        toCharacterId: input.toCharacterId,
        type: input.type,
        label: input.label,
        description: input.description,
      },
      select: { id: true },
    });

    return succeed(created);
  });
}

export interface EditRelationshipInput {
  readonly relationshipId: string;
  /** Already parsed by `parseRelationshipContent` in `@calepin/bible`. */
  readonly type: $Enums.RelationshipType;
  readonly label: string;
  readonly description: string | null;
}

export interface RelationshipEdited {
  readonly updated: boolean;
}

/**
 * Rewrites one edge's three columns.
 *
 * An identical resubmission writes nothing and answers `updated: false` —
 * `editDirection`'s short circuit, and here it earns its place twice over:
 * the audit block would otherwise move and burn the row's optimistic
 * concurrency token for a submission that changed nothing.
 *
 * A locked edge refuses `CONFLICT`. `lockedAt` is CAL-095's element-level
 * lock, and honouring it in the one statement that could ignore it is cheaper
 * than remembering to check it in every caller.
 *
 * Changing an edge's *ends* is not an edit: it is another edge between another
 * pair, and it goes through `writeRelationship` and `deleteRelationship`.
 */
export async function editRelationship(
  scope: ProjectScope,
  input: EditRelationshipInput,
): Promise<Result<RelationshipEdited>> {
  assertProjectScope(scope);

  return withProjectTransaction<RelationshipEdited>(scope, async (tx) => {
    const relationship = await tx.relationship.findFirst({
      where: scopedWhere("Relationship", scope, { id: input.relationshipId }),
      select: {
        id: true,
        fromCharacterId: true,
        toCharacterId: true,
        type: true,
        label: true,
        description: true,
        lockedAt: true,
      },
    });

    if (relationship === null) {
      return fail(new NotFoundError({ message: "no such relationship in this project" }));
    }

    if (relationship.lockedAt !== null) {
      return fail(
        new ConflictError({
          message: "a locked relationship cannot be edited",
          userMessage: "Ce lien est verrouillé : déverrouillez-le pour le modifier.",
        }),
      );
    }

    if (
      relationship.type === input.type &&
      relationship.label === input.label &&
      relationship.description === input.description
    ) {
      return succeed({ updated: false });
    }

    // Retyping an edge onto a tie the pair already carries would collide with
    // `@@unique([fromCharacterId, toCharacterId, type])`. Read first, for
    // `writeRelationship`'s reason: a sentence rather than a constraint name.
    if (relationship.type !== input.type) {
      const clash = await tx.relationship.findFirst({
        where: scopedWhere("Relationship", scope, {
          fromCharacterId: relationship.fromCharacterId,
          toCharacterId: relationship.toCharacterId,
          type: input.type,
        }),
        select: { id: true },
      });

      if (clash !== null) {
        return fail(
          new ConflictError({
            message: "this directed tie of this type already exists",
            userMessage: "Ce lien existe déjà entre ces deux personnages, dans ce sens.",
          }),
        );
      }
    }

    await tx.relationship.update({
      where: { id: relationship.id },
      data: { type: input.type, label: input.label, description: input.description },
    });

    return succeed({ updated: true });
  });
}

export interface RelationshipDeleted {
  readonly deleted: boolean;
}

/**
 * Removes one edge.
 *
 * A delete rather than a timestamp, and the difference from `discardDirection`
 * is the point: a written-off direction must stay consultable because the
 * author's choice between three proposals is itself a record, while an edge
 * removed from a graph is a tie the author decided is not there — leaving a
 * tombstone would make the graph claim a relation nobody holds.
 *
 * Deleting one direction never touches the other: they are two rows, and the
 * pair becoming `one-sided` as a result is a *reading* of what is left
 * (`./graph`), recomputed on the next read.
 */
export async function deleteRelationship(
  scope: ProjectScope,
  relationshipId: string,
): Promise<Result<RelationshipDeleted>> {
  assertProjectScope(scope);

  return withProjectTransaction<RelationshipDeleted>(scope, async (tx) => {
    const relationship = await tx.relationship.findFirst({
      where: scopedWhere("Relationship", scope, { id: relationshipId }),
      select: { id: true, lockedAt: true },
    });

    if (relationship === null) {
      return fail(new NotFoundError({ message: "no such relationship in this project" }));
    }

    if (relationship.lockedAt !== null) {
      return fail(
        new ConflictError({
          message: "a locked relationship cannot be deleted",
          userMessage: "Ce lien est verrouillé : déverrouillez-le pour le supprimer.",
        }),
      );
    }

    await tx.relationship.delete({ where: { id: relationship.id } });

    return succeed({ deleted: true });
  });
}
