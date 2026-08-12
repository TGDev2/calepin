/**
 * The canonical facts of a project's bible, written one at a time (CAL-098).
 *
 * `relationship.ts`'s shape, one table over: `assertProjectScope`, then
 * `withProjectTransaction`, then `scopedWhere` on every statement naming an
 * existing row and `requireOwnedRow` on every foreign key a caller supplied.
 * The read is `getBibleOverview`'s and there is deliberately no second one —
 * the editor needs the facts, the cast, the places and the chronology, which is
 * exactly what the overview already returns.
 *
 * **A fact has three dimensions and therefore three tables.** `CanonFact` holds
 * the statement, its truth and its temporal scope; `CanonFactBelief` holds one
 * character's stance; `CanonFactSubject` holds what it is about. All three move
 * inside one transaction, because a fact whose stances were written and whose
 * statement was not is not a weaker fact — it is a different one.
 *
 * **The children are written by `createMany`, never nested under the parent.**
 * A Prisma client extension sees top-level operations only, so a nested
 * `beliefs: { create: [...] }` would reach the database with no `updatedById`
 * and be refused by the column instead of stamped by the extension (CAL-022,
 * decision 4). Two statements, both stamped.
 *
 * **`source` and `status` are written here, never chosen by a caller.** A fact
 * typed into this screen is `USER`-sourced by construction, and it is born
 * `CONFIRMED` rather than `PROPOSED`: `PROPOSED` means *waiting for the author
 * to arbitrate*, and the author is the one writing. `setCanonFactStatus` is
 * where a status moves afterwards, and `REJECTED` is what retiring a fact
 * means — the row survives, which is what keeps CAL-094's deduplication able to
 * recognise it (`CanonFactStatus`'s own doc comment).
 *
 * **Nothing here parses.** What a fact may say is `parseCanonFactContent`'s, in
 * `@calepin/bible`, and `@calepin/shared` may not import a domain (§3.2) — the
 * caller parses before reaching here, the division `editRelationship` and
 * `editCharacter` already draw. Deduplication is the caller's too, for the same
 * reason: `canonFactKey` lives in the domain.
 *
 * Every writer must be inside `runWithActor`: no statement names
 * `updatedById`, and the CAL-022 extension is what fills it.
 */

import type { $Enums } from "@prisma/client";

import { bibleElementLockedError, isBibleElementLocked } from "../bible-lock";
import type { TransactionClient } from "../database/client";
import { ConflictError, NotFoundError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import { assertProjectScope, type ProjectScope, requireOwnedRow, scopedWhere } from "./scope";
import { withProjectTransaction } from "./transaction";

/** One end of a period, as the column stores it. */
export interface CanonFactBoundRow {
  readonly day: number | null;
  readonly precision: $Enums.TimelinePrecision | null;
  readonly label: string | null;
}

/** One character's stance on the statement. */
export interface CanonFactBeliefRow {
  readonly characterId: string;
  readonly state: $Enums.CanonFactBeliefState;
}

/** What the fact is about — a character or a place, never both. */
export interface CanonFactSubjectRow {
  readonly kind: "character" | "place";
  readonly id: string;
}

/**
 * One fact's content, already parsed by `parseCanonFactContent` in
 * `@calepin/bible`. The three columns this layer decides — `source`, `status`
 * and the audit block — are deliberately absent.
 */
export interface CanonFactContentInput {
  readonly statement: string;
  readonly isTrue: boolean;
  readonly validity: $Enums.CanonFactValidity;
  readonly validFrom: CanonFactBoundRow | null;
  readonly validUntil: CanonFactBoundRow | null;
  readonly invalidatedByEventId: string | null;
  readonly beliefs: readonly CanonFactBeliefRow[];
  readonly subjects: readonly CanonFactSubjectRow[];
}

export interface WriteCanonFactInput extends CanonFactContentInput {
  readonly bibleId: string;
}

export interface CanonFactWritten {
  readonly id: string;
}

export interface EditCanonFactInput extends CanonFactContentInput {
  readonly factId: string;
}

export interface CanonFactEdited {
  readonly updated: boolean;
}

export interface SetCanonFactStatusInput {
  readonly factId: string;
  readonly status: $Enums.CanonFactStatus;
}

/** The six bound columns, spread from the two bounds the caller submitted. */
function boundColumns(input: CanonFactContentInput) {
  return {
    validFromDay: input.validFrom?.day ?? null,
    validFromPrecision: input.validFrom?.precision ?? null,
    validFromLabel: input.validFrom?.label ?? null,
    validUntilDay: input.validUntil?.day ?? null,
    validUntilPrecision: input.validUntil?.precision ?? null,
    validUntilLabel: input.validUntil?.label ?? null,
  };
}

/**
 * Every row the caller named, so each one can be proved owned before a child
 * row points at it.
 *
 * The composite foreign keys already make a cross-bible belief unstorable, but
 * they answer with a `P2003` naming a constraint, and *not yours* must answer
 * `NOT_FOUND` like everything else (§3.5) — `writeRelationship`'s reasoning,
 * with more ids to walk.
 */
function referencedRows(
  input: CanonFactContentInput,
): readonly (readonly ["Character" | "Place" | "TimelineEvent", string])[] {
  const rows: (readonly ["Character" | "Place" | "TimelineEvent", string])[] = [];

  if (input.invalidatedByEventId !== null) {
    rows.push(["TimelineEvent", input.invalidatedByEventId]);
  }

  for (const belief of input.beliefs) {
    rows.push(["Character", belief.characterId]);
  }

  for (const subject of input.subjects) {
    rows.push([subject.kind === "character" ? "Character" : "Place", subject.id]);
  }

  return rows;
}

async function requireReferencedRows(
  input: CanonFactContentInput,
  scope: ProjectScope,
): Promise<Result<null>> {
  for (const [model, id] of referencedRows(input)) {
    const owned = await requireOwnedRow(model, id, scope);

    if (!owned.ok) {
      return fail(owned.error);
    }
  }

  return succeed(null);
}

/** The children of one fact, written in the two statements the extension sees. */
async function writeChildren(
  tx: TransactionClient,
  bibleId: string,
  factId: string,
  input: CanonFactContentInput,
): Promise<void> {
  if (input.beliefs.length > 0) {
    await tx.canonFactBelief.createMany({
      data: input.beliefs.map((belief) => ({
        bibleId,
        factId,
        characterId: belief.characterId,
        state: belief.state,
      })),
    });
  }

  if (input.subjects.length > 0) {
    await tx.canonFactSubject.createMany({
      data: input.subjects.map((subject) => ({
        bibleId,
        factId,
        characterId: subject.kind === "character" ? subject.id : null,
        placeId: subject.kind === "place" ? subject.id : null,
      })),
    });
  }
}

/**
 * Adds one fact to the canon.
 *
 * `status: "CONFIRMED"` and `source: "USER"` are the two columns this statement
 * decides rather than accepts — see the module header. Everything else arrives
 * parsed, and the four CHECK constraints on `canon_facts` are the last word:
 * `canonFactContentSchema` mirrors them so an author reads a French sentence,
 * and the table is what makes the guarantee unconditional.
 */
export async function writeCanonFact(
  scope: ProjectScope,
  input: WriteCanonFactInput,
): Promise<Result<CanonFactWritten>> {
  assertProjectScope(scope);

  return withProjectTransaction<CanonFactWritten>(scope, async (tx) => {
    const bible = await requireOwnedRow("Bible", input.bibleId, scope);

    if (!bible.ok) {
      return fail(bible.error);
    }

    const referenced = await requireReferencedRows(input, scope);

    if (!referenced.ok) {
      return fail(referenced.error);
    }

    const created = await tx.canonFact.create({
      data: {
        bibleId: input.bibleId,
        statement: input.statement,
        isTrue: input.isTrue,
        validity: input.validity,
        ...boundColumns(input),
        invalidatedByEventId: input.invalidatedByEventId,
        source: "USER",
        status: "CONFIRMED",
      },
      select: { id: true },
    });

    await writeChildren(tx, input.bibleId, created.id, input);

    return succeed(created);
  });
}

/** `characterId` alone, since one character holds one stance on one fact. */
function beliefKey(belief: CanonFactBeliefRow): string {
  return belief.characterId;
}

function subjectKey(subject: CanonFactSubjectRow): string {
  return `${subject.kind}:${subject.id}`;
}

/**
 * Whether the submission says exactly what the row already says.
 *
 * The two child lists are compared as **sets**, because their order carries
 * nothing: `CanonFactBelief` is keyed by `(factId, characterId)` and the screen
 * renders the cast in its own order. A comparison by index would report a
 * change every time a character was renamed above another one.
 */
function isSameCanonFact(
  current: {
    statement: string;
    isTrue: boolean;
    validity: $Enums.CanonFactValidity;
    validFromDay: number | null;
    validFromPrecision: $Enums.TimelinePrecision | null;
    validFromLabel: string | null;
    validUntilDay: number | null;
    validUntilPrecision: $Enums.TimelinePrecision | null;
    validUntilLabel: string | null;
    invalidatedByEventId: string | null;
    beliefs: readonly { characterId: string; state: $Enums.CanonFactBeliefState }[];
    subjects: readonly { characterId: string | null; placeId: string | null }[];
  },
  input: CanonFactContentInput,
): boolean {
  const bounds = boundColumns(input);

  if (
    current.statement !== input.statement ||
    current.isTrue !== input.isTrue ||
    current.validity !== input.validity ||
    current.invalidatedByEventId !== input.invalidatedByEventId ||
    current.validFromDay !== bounds.validFromDay ||
    current.validFromPrecision !== bounds.validFromPrecision ||
    current.validFromLabel !== bounds.validFromLabel ||
    current.validUntilDay !== bounds.validUntilDay ||
    current.validUntilPrecision !== bounds.validUntilPrecision ||
    current.validUntilLabel !== bounds.validUntilLabel
  ) {
    return false;
  }

  const heldBeliefs = new Map(current.beliefs.map((belief) => [belief.characterId, belief.state]));

  if (heldBeliefs.size !== input.beliefs.length) return false;

  for (const belief of input.beliefs) {
    if (heldBeliefs.get(beliefKey(belief)) !== belief.state) return false;
  }

  const heldSubjects = new Set(
    current.subjects.map((subject) =>
      subject.characterId === null ? `place:${String(subject.placeId)}` : `character:${subject.characterId}`,
    ),
  );

  if (heldSubjects.size !== input.subjects.length) return false;

  return input.subjects.every((subject) => heldSubjects.has(subjectKey(subject)));
}

/**
 * Rewrites one fact, its stances and its subjects.
 *
 * An identical resubmission writes nothing and answers `updated: false` —
 * `editRelationship`'s short circuit, and here it saves three statements rather
 * than one. A locked fact refuses `BIBLE_ELEMENT_LOCKED`, which is CAL-095's
 * whole point: *un élément verrouillé ne doit jamais être modifié
 * silencieusement*, and this is the statement that could do it.
 *
 * The children are reconciled rather than replaced wholesale: a stance that did
 * not move keeps its row, its `createdAt` and its version, so the audit trail
 * of *when the author decided that Nora does not know* is not reset by an
 * unrelated edit to the statement.
 */
export async function editCanonFact(
  scope: ProjectScope,
  input: EditCanonFactInput,
): Promise<Result<CanonFactEdited>> {
  assertProjectScope(scope);

  return withProjectTransaction<CanonFactEdited>(scope, async (tx) => {
    const fact = await tx.canonFact.findFirst({
      where: scopedWhere("CanonFact", scope, { id: input.factId }),
      select: {
        id: true,
        bibleId: true,
        statement: true,
        isTrue: true,
        validity: true,
        validFromDay: true,
        validFromPrecision: true,
        validFromLabel: true,
        validUntilDay: true,
        validUntilPrecision: true,
        validUntilLabel: true,
        invalidatedByEventId: true,
        lockedAt: true,
        beliefs: { select: { characterId: true, state: true } },
        subjects: { select: { characterId: true, placeId: true } },
      },
    });

    if (fact === null) {
      return fail(new NotFoundError({ message: "no such canon fact in this project" }));
    }

    if (isBibleElementLocked(fact)) {
      return fail(bibleElementLockedError("CanonFact", "modify"));
    }

    if (isSameCanonFact(fact, input)) {
      return succeed({ updated: false });
    }

    const referenced = await requireReferencedRows(input, scope);

    if (!referenced.ok) {
      return fail(referenced.error);
    }

    await tx.canonFact.update({
      where: { id: fact.id },
      data: {
        statement: input.statement,
        isTrue: input.isTrue,
        validity: input.validity,
        ...boundColumns(input),
        invalidatedByEventId: input.invalidatedByEventId,
      },
    });

    await reconcileBeliefs(tx, fact, input);
    await reconcileSubjects(tx, fact, input);

    return succeed({ updated: true });
  });
}

async function reconcileBeliefs(
  tx: TransactionClient,
  fact: {
    id: string;
    bibleId: string;
    beliefs: readonly { characterId: string; state: $Enums.CanonFactBeliefState }[];
  },
  input: CanonFactContentInput,
): Promise<void> {
  const submitted = new Map(input.beliefs.map((belief) => [beliefKey(belief), belief.state]));

  const dropped = fact.beliefs
    .filter((belief) => !submitted.has(belief.characterId))
    .map((belief) => belief.characterId);

  if (dropped.length > 0) {
    await tx.canonFactBelief.deleteMany({
      where: { factId: fact.id, characterId: { in: dropped } },
    });
  }

  const held = new Map(fact.beliefs.map((belief) => [belief.characterId, belief.state]));

  for (const belief of input.beliefs) {
    const current = held.get(belief.characterId);

    if (current === belief.state) continue;

    if (current === undefined) {
      await tx.canonFactBelief.create({
        data: {
          bibleId: fact.bibleId,
          factId: fact.id,
          characterId: belief.characterId,
          state: belief.state,
        },
      });
      continue;
    }

    await tx.canonFactBelief.updateMany({
      where: { factId: fact.id, characterId: belief.characterId },
      data: { state: belief.state },
    });
  }
}

async function reconcileSubjects(
  tx: TransactionClient,
  fact: {
    id: string;
    bibleId: string;
    subjects: readonly { characterId: string | null; placeId: string | null }[];
  },
  input: CanonFactContentInput,
): Promise<void> {
  const submitted = new Set(input.subjects.map(subjectKey));

  const droppedCharacters: string[] = [];
  const droppedPlaces: string[] = [];

  for (const subject of fact.subjects) {
    if (subject.characterId !== null) {
      if (!submitted.has(`character:${subject.characterId}`)) droppedCharacters.push(subject.characterId);
      continue;
    }

    if (subject.placeId !== null && !submitted.has(`place:${subject.placeId}`)) {
      droppedPlaces.push(subject.placeId);
    }
  }

  if (droppedCharacters.length > 0) {
    await tx.canonFactSubject.deleteMany({
      where: { factId: fact.id, characterId: { in: droppedCharacters } },
    });
  }

  if (droppedPlaces.length > 0) {
    await tx.canonFactSubject.deleteMany({
      where: { factId: fact.id, placeId: { in: droppedPlaces } },
    });
  }

  const held = new Set(
    fact.subjects.map((subject) =>
      subject.characterId === null ? `place:${String(subject.placeId)}` : `character:${subject.characterId}`,
    ),
  );

  const added = input.subjects.filter((subject) => !held.has(subjectKey(subject)));

  if (added.length > 0) {
    await tx.canonFactSubject.createMany({
      data: added.map((subject) => ({
        bibleId: fact.bibleId,
        factId: fact.id,
        characterId: subject.kind === "character" ? subject.id : null,
        placeId: subject.kind === "place" ? subject.id : null,
      })),
    });
  }
}

/**
 * Moves one fact between `PROPOSED`, `CONFIRMED` and `REJECTED`.
 *
 * Its own statement rather than a field of `editCanonFact`, because it is its
 * own decision: confirming a fact is one click on a fact the author has read,
 * not a resubmission of everything it says.
 *
 * Writing the status the row already holds refuses `CONFLICT` —
 * `discardDirection`'s reading: the screen is stale, the answer is to look
 * again rather than to write again, and writing anyway would move the audit
 * block for a decision nobody made.
 *
 * A locked fact refuses. `REJECTED` is what retiring a fact means and it is
 * deliberately not a delete: the row is what stops CAL-094 re-proposing the
 * same statement on the next extraction.
 */
export async function setCanonFactStatus(
  scope: ProjectScope,
  input: SetCanonFactStatusInput,
): Promise<Result<CanonFactEdited>> {
  assertProjectScope(scope);

  return withProjectTransaction<CanonFactEdited>(scope, async (tx) => {
    const fact = await tx.canonFact.findFirst({
      where: scopedWhere("CanonFact", scope, { id: input.factId }),
      select: { id: true, status: true, lockedAt: true },
    });

    if (fact === null) {
      return fail(new NotFoundError({ message: "no such canon fact in this project" }));
    }

    if (isBibleElementLocked(fact)) {
      return fail(bibleElementLockedError("CanonFact", "modify"));
    }

    if (fact.status === input.status) {
      return fail(
        new ConflictError({
          message: "the fact already holds this status",
          userMessage: "Ce fait est déjà dans cet état. Rechargez la page pour voir où il en est.",
        }),
      );
    }

    await tx.canonFact.update({ where: { id: fact.id }, data: { status: input.status } });

    return succeed({ updated: true });
  });
}

/**
 * Removes one fact the author wrote themselves.
 *
 * Three refusals, and each one has a remedy the interface can offer.
 *
 * A fact the product extracted (`source` other than `USER`) refuses: retiring
 * it is `setCanonFactStatus`'s `REJECTED`, which keeps the row and therefore
 * keeps CAL-094 able to recognise the statement instead of proposing it again.
 * Deleting one would be a repair that undoes itself at the next extraction.
 *
 * A locked fact refuses, as everywhere else.
 *
 * A fact a chapter plan already cites refuses. The foreign key cascades, so
 * without this read the delete would silently unlink the fact from every
 * `ChapterOutline` naming it — the *modification silencieuse* CAL-095 exists to
 * prevent, arriving through the one door that is not a lock.
 */
export async function deleteCanonFact(
  scope: ProjectScope,
  factId: string,
): Promise<Result<null>> {
  assertProjectScope(scope);

  return withProjectTransaction<null>(scope, async (tx) => {
    const fact = await tx.canonFact.findFirst({
      where: scopedWhere("CanonFact", scope, { id: factId }),
      select: { id: true, source: true, lockedAt: true, _count: { select: { chapterOutlines: true } } },
    });

    if (fact === null) {
      return fail(new NotFoundError({ message: "no such canon fact in this project" }));
    }

    if (isBibleElementLocked(fact)) {
      return fail(bibleElementLockedError("CanonFact", "modify"));
    }

    if (fact.source !== "USER") {
      return fail(
        new ConflictError({
          message: "only a hand-written fact may be deleted outright",
          userMessage:
            "Ce fait a été établi à partir de vos textes : écartez-le plutôt que de le supprimer.",
        }),
      );
    }

    if (fact._count.chapterOutlines > 0) {
      return fail(
        new ConflictError({
          message: "a fact a chapter plan cites cannot be deleted",
          userMessage:
            "Ce fait est utilisé par un plan de chapitre : écartez-le plutôt que de le supprimer.",
        }),
      );
    }

    await tx.canonFact.delete({ where: { id: fact.id } });

    return succeed(null);
  });
}
