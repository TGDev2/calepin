/**
 * Setting, lifting and reading the lock on one element of the bible (CAL-095).
 *
 * The columns have existed since CAL-016 to CAL-018 and every one of them names
 * this task; what did not exist is a way to write one. Until now every lock in
 * the repository was set by a raw `prisma.*.update` in a test, which is another
 * way of saying the specification's *l'utilisateur peut verrouiller un fait*
 * was a column and not a feature.
 *
 * `relationship.ts`' shape, one concept wider: `assertProjectScope`, then
 * `withProjectTransaction`, then `scopedWhere` on every statement naming an
 * existing row. Every writer must be inside `runWithActor` — no statement names
 * `updatedById`, and the CAL-022 extension is what fills it, which is also what
 * records *who* locked a row without a `lockedById` column of its own
 * (`CreativeDirection.discardedAt`'s reasoning).
 *
 * **One delegate cast, confined here.** Nine models carry the same two columns,
 * and the alternative to reaching them by name is nine copies of every function
 * below, of which one will eventually read the wrong column. It is the trade
 * `scope.ts`'s own `delegateOf` documents, with the one difference that these
 * statements must run on a caller's client: the gate is read inside the
 * transaction `claimGenerationAttempt` already holds, and a read that used the
 * ambient client there would answer from outside the lock.
 *
 * **Locking moves `updatedAt`, and that is deliberate.** `SourceTextObsolescence`
 * judges a stage by whether its own row has moved since the version it was built
 * on, so locking an element takes it out of doubt — which is exactly what
 * `editAnalysisSection` decided for a hand-edited section: it is the author's
 * call and nobody else's, and settling an element is a stronger statement about
 * it than editing one.
 */

import type { $Enums } from "@prisma/client";

import {
  type BibleLockableModel,
  type BibleLockedElement,
  type BibleLockGate,
  CHARACTER_LOCK_FIELDS,
  type CharacterLockField,
  checkBibleLocks,
  FIELD_LOCKABLE_MODEL,
  isBibleLockableModel,
  isCharacterLockField,
  missionLockScope,
} from "../bible-lock";
import { getDatabaseClient, type TransactionClient } from "../database/client";
import { ConflictError, InternalError, NotFoundError, ValidationError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import { delegateName } from "./owned-models";
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";
import { withProjectTransaction } from "./transaction";

type GenerationMission = $Enums.GenerationMission;

/** The four operations this module needs of a delegate, and no others. */
interface LockDelegate {
  findFirst: (args: { where: object; select: object }) => Promise<LockRow | null>;
  findMany: (args: { where: object; select: object }) => Promise<LockRow[]>;
  update: (args: { where: { id: string }; data: object }) => Promise<unknown>;
}

/** What a lock statement ever selects: an id, the two lock columns, one parent. */
interface LockRow {
  readonly id: string;
  readonly lockedAt?: Date | null;
  readonly lockedFields?: CharacterLockField[];
  readonly fromCharacterId?: string;
}

/** Anything that can serve a statement — the ambient client or a transaction. */
export type LockClient = TransactionClient;

function lockDelegate(client: LockClient, model: BibleLockableModel): LockDelegate {
  const delegate = (client as unknown as Record<string, LockDelegate | undefined>)[
    delegateName(model)
  ];

  if (delegate === undefined) {
    throw new InternalError({
      message: "the registered client exposes no delegate for a lockable bible model",
      fieldPath: model,
    });
  }

  return delegate;
}

/**
 * What a locked-element read asks of each model.
 *
 * Three shapes, not nine. A `Character` is the only model whose lock has two
 * sources, and a `Relationship` is the only one that hangs off a character a
 * narrowed mission has to compare against — the edge's *source*, because that
 * is the end `create-character-sheet` declares its edges from (CAL-090).
 */
interface LockReadShape {
  readonly where: object;
  readonly select: Record<string, true>;
  readonly characterIdField: "id" | "fromCharacterId" | null;
}

const LOCKED_ROW = { lockedAt: { not: null } };

function readShape(model: BibleLockableModel): LockReadShape {
  if (model === FIELD_LOCKABLE_MODEL) {
    return {
      where: { OR: [LOCKED_ROW, { lockedFields: { isEmpty: false } }] },
      select: { id: true, lockedAt: true, lockedFields: true },
      characterIdField: "id",
    };
  }

  if (model === "Relationship") {
    return {
      where: LOCKED_ROW,
      select: { id: true, fromCharacterId: true },
      characterIdField: "fromCharacterId",
    };
  }

  return { where: LOCKED_ROW, select: { id: true }, characterIdField: null };
}

/**
 * Every locked element of the models a mission would rebuild, on one client.
 *
 * Not exported through the barrel: `reserveGeneration` and
 * `claimGenerationAttempt` are the two callers that need it on *their* client,
 * and `readBibleLockGate` below is the one a screen reaches for.
 */
export async function readBibleLocksFor(
  client: LockClient,
  scope: ProjectScope,
  mission: GenerationMission,
  targetId: string | null,
): Promise<BibleLockGate> {
  const models = missionLockScope(mission);

  // A mission that rebuilds nothing cannot meet a lock, so it costs no query.
  // Fourteen of the twenty-two are in that position, `write-scene` included.
  if (models.length === 0) return checkBibleLocks({ mission, targetId, locks: [] });

  const locks: BibleLockedElement[] = [];

  for (const model of models) {
    const shape = readShape(model);
    const rows = await lockDelegate(client, model).findMany({
      where: scopedWhere(model, scope, shape.where),
      select: shape.select,
    });

    for (const row of rows) {
      locks.push({
        model,
        id: row.id,
        fields: row.lockedFields ?? [],
        characterId: shape.characterIdField === null ? null : (row[shape.characterIdField] ?? null),
      });
    }
  }

  return checkBibleLocks({ mission, targetId, locks });
}

export interface ReadBibleLockGateInput {
  readonly mission: GenerationMission;
  /** `Generation.targetId`, which for `CREATE_CHARACTER_SHEET` names a character. */
  readonly targetId?: string | null;
}

/**
 * What stands between this mission and its own output, before anything is
 * asked of it.
 *
 * The *signale avant la génération* half of §6.5, as a value a caller reads —
 * `readCanonicalDirectionObsolescence`'s arrangement, beside the write that
 * refuses. It is deliberately not a `Result` failure: a caller wants the list
 * of locks to show, and the same list is what the refusal is built from, so a
 * screen and the statement that stops the work cannot disagree about who is in
 * the way.
 */
export async function readBibleLockGate(
  scope: ProjectScope,
  input: ReadBibleLockGateInput,
): Promise<Result<BibleLockGate>> {
  assertProjectScope(scope);

  const gate = await readBibleLocksFor(
    getDatabaseClient(),
    scope,
    input.mission,
    input.targetId ?? null,
  );

  return succeed(gate);
}

export interface BibleElementLockInput {
  readonly model: BibleLockableModel;
  readonly id: string;
  /**
   * The sheet field to lock, or null for the whole element.
   *
   * Required-but-nullable, CAL-077's discipline: a composer decides rather than
   * forgets, and *the whole element* is written rather than elided. Non-null is
   * refused for the eight models that carry no `lockedFields` column.
   */
  readonly field: CharacterLockField | null;
}

/** The element's lock state after the write — both columns, so neither is guessed. */
export interface BibleElementLockState {
  readonly lockedAt: Date | null;
  readonly lockedFields: readonly CharacterLockField[];
}

function invalidTarget(model: string, field: string | null): ValidationError {
  if (!isBibleLockableModel(model)) {
    return new ValidationError({
      message: "no element of this model can be locked",
      userMessage: "Cet élément ne peut pas être verrouillé.",
      fieldPath: "model",
    });
  }

  return new ValidationError({
    message:
      field !== null && isCharacterLockField(field)
        ? "only a character sheet is locked field by field"
        : "no sheet field answers to this name",
    userMessage: "Ce champ ne peut pas être verrouillé.",
    fieldPath: "field",
  });
}

/** Whether the pair a caller handed in is one the schema can carry. */
function checkTarget(input: BibleElementLockInput): Result<void> {
  if (!isBibleLockableModel(input.model)) return fail(invalidTarget(input.model, input.field));

  if (input.field === null) return succeed();

  if (input.model !== FIELD_LOCKABLE_MODEL || !isCharacterLockField(input.field)) {
    return fail(invalidTarget(input.model, input.field));
  }

  return succeed();
}

/** Keeps a sheet's locked fields in the column's own order, so it never churns. */
function orderFields(fields: readonly CharacterLockField[]): CharacterLockField[] {
  return CHARACTER_LOCK_FIELDS.filter((field) => fields.includes(field));
}

async function readLockable(
  client: LockClient,
  scope: ProjectScope,
  input: BibleElementLockInput,
): Promise<LockRow | null> {
  const select =
    input.model === FIELD_LOCKABLE_MODEL
      ? { id: true, lockedAt: true, lockedFields: true }
      : { id: true, lockedAt: true };

  return lockDelegate(client, input.model).findFirst({
    where: scopedWhere(input.model, scope, { id: input.id }),
    select,
  });
}

function stateOf(row: LockRow, lockedAt: Date | null): BibleElementLockState {
  return { lockedAt, lockedFields: row.lockedFields ?? [] };
}

const NOT_HERE = "no such lockable bible element in this project";

/**
 * Settles one element, or one field of a character sheet.
 *
 * **A no-op refuses.** Locking what is already locked answers `CONFLICT` rather
 * than succeeding quietly — `discardDirection`'s reading of the same situation:
 * the author is looking at a stale screen, and the answer is to look again, not
 * to write again. Writing again would also move `updatedAt` on a row nothing
 * changed about, which is a timestamp several derivations read.
 *
 * **A field lock is refused under a locked sheet.** The row lock already covers
 * every field, so accepting one would store a statement with no effect and
 * leave the author believing the field is what they protected.
 *
 * *Not there* and *not yours* stay one answer (`NOT_FOUND`, §3.5).
 */
export async function lockBibleElement(
  scope: ProjectScope,
  input: BibleElementLockInput,
): Promise<Result<BibleElementLockState>> {
  assertProjectScope(scope);

  const target = checkTarget(input);
  if (!target.ok) return target;

  return withProjectTransaction<BibleElementLockState>(scope, async (tx) => {
    const row = await readLockable(tx, scope, input);

    if (row === null) return fail(new NotFoundError({ message: NOT_HERE }));

    const lockedAt = row.lockedAt ?? null;

    if (input.field === null) {
      if (lockedAt !== null) {
        return fail(
          new ConflictError({
            message: "the element is already locked",
            userMessage: "Cet élément est déjà verrouillé.",
            fieldPath: input.model,
          }),
        );
      }

      const now = new Date();

      await lockDelegate(tx, input.model).update({
        where: { id: row.id },
        data: { lockedAt: now },
      });

      return succeed(stateOf(row, now));
    }

    if (lockedAt !== null) {
      return fail(
        new ConflictError({
          message: "the whole sheet is locked, so a field lock would state nothing",
          userMessage: "Cette fiche est verrouillée entièrement : le champ l'est déjà.",
          fieldPath: "field",
        }),
      );
    }

    const fields = row.lockedFields ?? [];

    if (fields.includes(input.field)) {
      return fail(
        new ConflictError({
          message: "the field is already locked",
          userMessage: "Ce champ est déjà verrouillé.",
          fieldPath: "field",
        }),
      );
    }

    const lockedFields = orderFields([...fields, input.field]);

    await lockDelegate(tx, input.model).update({ where: { id: row.id }, data: { lockedFields } });

    return succeed({ lockedAt: null, lockedFields });
  });
}

/**
 * Lifts the lock, which is the only way past the gate.
 *
 * There is deliberately no *proceed anyway*: a generation is refused from the
 * locks that exist when it runs, so the answer to *demander si le verrou doit
 * être levé* (§6.5) is a write the author makes, attributed by the audit block,
 * rather than a box they tick. A confirmation token would also go stale — the
 * failure mode `acceptOperationEstimate` exists to catch — while a state read
 * at the moment of the decision cannot.
 *
 * Lifting the row's own lock leaves any field locks standing: they are two
 * statements about two things, and clearing one from the other would delete a
 * decision nobody revisited.
 */
export async function unlockBibleElement(
  scope: ProjectScope,
  input: BibleElementLockInput,
): Promise<Result<BibleElementLockState>> {
  assertProjectScope(scope);

  const target = checkTarget(input);
  if (!target.ok) return target;

  return withProjectTransaction<BibleElementLockState>(scope, async (tx) => {
    const row = await readLockable(tx, scope, input);

    if (row === null) return fail(new NotFoundError({ message: NOT_HERE }));

    const lockedAt = row.lockedAt ?? null;

    if (input.field === null) {
      if (lockedAt === null) {
        return fail(
          new ConflictError({
            message: "the element is not locked",
            userMessage: "Cet élément n'est pas verrouillé.",
            fieldPath: input.model,
          }),
        );
      }

      await lockDelegate(tx, input.model).update({
        where: { id: row.id },
        data: { lockedAt: null },
      });

      return succeed(stateOf(row, null));
    }

    const fields = row.lockedFields ?? [];

    if (!fields.includes(input.field)) {
      return fail(
        new ConflictError({
          message: "the field is not locked",
          userMessage: "Ce champ n'est pas verrouillé.",
          fieldPath: "field",
        }),
      );
    }

    const lockedFields = orderFields(fields.filter((field) => field !== input.field));

    await lockDelegate(tx, input.model).update({ where: { id: row.id }, data: { lockedFields } });

    return succeed({ lockedAt, lockedFields });
  });
}
