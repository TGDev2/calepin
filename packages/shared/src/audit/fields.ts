/**
 * The argument transform behind the audit extension, kept apart from it so it
 * can be tested exhaustively without a database or a generated client
 * (CLAUDE.md §8: a business rule ships with its test, and the test touches no
 * I/O).
 *
 * It never mutates the caller's arguments. Prisma hands the same object back to
 * a retry, and a `version: { increment: 1 }` written in place would compound on
 * the second attempt.
 */

import { InternalError } from "../errors/app-error";
import { AUDIT_AUTHOR_FIELD, AUDIT_VERSION_FIELD } from "./models";

/**
 * The operations that write a row. Closed, and matched exactly: a Prisma
 * version adding an operation must be a decision here, not something that
 * starts writing unstamped rows the day the dependency is bumped.
 */
export const AUDITED_WRITE_OPERATIONS = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
] as const;

export type AuditedWriteOperation = (typeof AUDITED_WRITE_OPERATIONS)[number];

/** The operations whose written rows are a second state of an existing row. */
const UPDATING_OPERATIONS = new Set<string>(["update", "updateMany", "updateManyAndReturn"]);

export function isAuditedWriteOperation(operation: string): operation is AuditedWriteOperation {
  return (AUDITED_WRITE_OPERATIONS as readonly string[]).includes(operation);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Stamps one `data` payload.
 *
 * An explicit `updatedById` wins over the ambient actor. That is not a hole:
 * the worker replays a generation on behalf of the author who requested it, and
 * a restore credits whoever performed it — both know the actor better than the
 * scope they happen to run in. What is refused is a write that names nobody.
 */
function stampData(data: unknown, actorId: string, isUpdate: boolean): unknown {
  if (!isPlainObject(data)) return data;

  const stamped: Record<string, unknown> = { ...data };

  stamped[AUDIT_AUTHOR_FIELD] ??= actorId;

  // The counter moves with the row, so it is bumped by the same write rather
  // than by a trigger: one statement, one new state, no window where the two
  // disagree. An explicit value is left alone — that is the restore path, which
  // sets an absolute version rather than counting from the current one.
  if (isUpdate && stamped[AUDIT_VERSION_FIELD] === undefined) {
    stamped[AUDIT_VERSION_FIELD] = { increment: 1 };
  }

  return stamped;
}

function stampPayload(payload: unknown, actorId: string, isUpdate: boolean): unknown {
  if (Array.isArray(payload)) {
    return payload.map((entry) => stampData(entry, actorId, isUpdate));
  }

  return stampData(payload, actorId, isUpdate);
}

/**
 * Returns `args` with the audit fields filled in, for one write on one audited
 * model.
 *
 * Only the top level of the payload is stamped. A nested write —
 * `project.create({ data: { bible: { create: ... } } })` — is invisible to a
 * Prisma client extension, which is exactly why `updatedById` is `NOT NULL` in
 * PostgreSQL: the extension gives the readable failure, the database makes the
 * guarantee unconditional (CAL-022, decision 4).
 */
export function applyAuditFields(
  model: string,
  operation: AuditedWriteOperation,
  args: unknown,
  actorId: string | undefined,
): unknown {
  if (actorId === undefined || actorId === "") {
    // The message stays constant and the location travels as `fieldPath`, the
    // invariant AppError documents: the message is the first line of the stack,
    // so it is never built from anything but developer-authored English. A model
    // name and an operation name are a path, which is what fieldPath is for.
    throw new InternalError({
      code: "AUDIT_ACTOR_REQUIRED",
      message: "an audited write ran with no actor in scope",
      fieldPath: `${model}.${operation}`,
    });
  }

  if (!isPlainObject(args)) return args;

  if (operation === "upsert") {
    return {
      ...args,
      create: stampPayload(args["create"], actorId, false),
      update: stampPayload(args["update"], actorId, true),
    };
  }

  return {
    ...args,
    data: stampPayload(args["data"], actorId, UPDATING_OPERATIONS.has(operation)),
  };
}
