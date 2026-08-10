/**
 * The idempotency key of a generation (CAL-058).
 *
 * **What it identifies is an *ask*.** The mission that was asked for, the
 * project it was asked in, the entity it targets, and the inputs it was asked
 * with. Two requests carrying the same four are the same request, however many
 * times a queue, a browser or a retried action delivers them — and the whole
 * point of naming that is that the second delivery must not be paid for twice.
 *
 * **"The version of the inputs" is the inputs' own digest.** Content-addressed
 * rather than counted: it moves exactly when an input moves, and never because
 * a counter was forgotten. The consequence is a contract on the caller, and it
 * is the one thing to get right when a mission's ask is built — *the replay
 * payload names the versions it is built on*. A regeneration that starts from
 * the chapter's current `ChapterRevision` says so by naming that revision, and
 * is therefore a different ask from the one before it; a regeneration that
 * names nothing is, correctly, the same ask as the one before it and joins it.
 *
 * **A digest, never a rendering.** `Generation.input` may carry the author's
 * own instruction to the system, which CLAUDE.md §9 counts as literary content.
 * A key built by concatenating its parts would carry that instruction into an
 * index, into every error payload quoting a unique violation, and into any log
 * line that ever names the key. A SHA-256 carries nothing.
 *
 * **The derivation is itself versioned.** The namespace below is part of the
 * hashed material, so a future change to the canonical form produces a
 * different key for the same ask instead of silently aliasing two derivations —
 * which would be the one way to make an old row collide with a new one.
 */

import { createHash } from "node:crypto";

import { InternalError } from "../errors";

/**
 * Prefixed into the hashed material. Bump it when the canonical form below
 * changes, never when a mission or a payload does.
 */
const GENERATION_KEY_NAMESPACE = "calepin.generation.v1";

/**
 * The shape a key has, and the shape the database enforces —
 * `generations_idempotency_key_check` states the same thing in SQL, which is
 * what stops a row written by anything other than `reserveGeneration` from
 * carrying something else.
 */
export const GENERATION_KEY_PATTERN = /^[0-9a-f]{64}$/;

export interface GenerationKeyInput {
  /** `GenerationMission`, as the column spells it. */
  readonly mission: string;
  readonly projectId: string;
  /** Null for a mission that targets the project as a whole. */
  readonly targetId?: string | null;
  /** The mission's resolved input — the replay payload, never a prompt. */
  readonly input: unknown;
}

export function isGenerationIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && GENERATION_KEY_PATTERN.test(value);
}

/**
 * The key for an ask. Deterministic across processes, restarts and machines:
 * that is what makes it usable as a unique index rather than as a hint.
 */
export function generationIdempotencyKey(input: GenerationKeyInput): string {
  // Every part is written as JSON, so every one of them is either quoted or a
  // literal — and a quoted JSON string cannot hold a raw newline. The join is
  // therefore injective: no combination of mission, ids and payload can be
  // rearranged into another combination's material.
  const material = [
    JSON.stringify(GENERATION_KEY_NAMESPACE),
    JSON.stringify(input.mission),
    JSON.stringify(input.projectId),
    JSON.stringify(input.targetId ?? null),
    canonicalise(input.input, "input"),
  ].join("\n");

  return createHash("sha256").update(material, "utf8").digest("hex");
}

/**
 * JSON with one thing added: object keys are written in sorted order.
 *
 * `JSON.stringify` is not enough on its own. It preserves insertion order, so
 * the same payload built by two call sites in two orders would hash to two keys
 * and the ask would be enqueued twice — the exact failure this module exists to
 * prevent, reintroduced by a property nobody looks at.
 *
 * Everything JSON cannot hold throws. A `Date`, a `Map`, a class instance or a
 * `bigint` cannot be stored in `Generation.input` either, so a payload carrying
 * one is a call-site bug (§7) and fails here rather than at the write. The
 * field path says where; it never says what — the value is the author's (§9).
 */
function canonicalise(value: unknown, path: string): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw unhashable(path);
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw unhashable(path);
  }

  if (Array.isArray(value)) {
    // An array's order *is* information: two payloads listing the same
    // identifiers in two orders are two different asks, and sorting here would
    // merge them.
    return `[${value
      .map((item, index) =>
        // `JSON.stringify` writes a hole and an explicit `undefined` alike as
        // `null`; the canonical form says the same thing rather than inventing
        // a third spelling for it.
        item === undefined ? "null" : canonicalise(item, `${path}[${index}]`),
      )
      .join(",")}]`;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) throw unhashable(path);

  const entries = Object.entries(value as Record<string, unknown>)
    // Dropped rather than written, exactly as `JSON.stringify` drops them and
    // exactly as Prisma stores them: `{ a: 1 }` and `{ a: 1, b: undefined }`
    // are stored as the same JSON and so are the same ask.
    .filter(([, item]) => item !== undefined)
    .sort(compareKeys);

  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalise(item, `${path}.${key}`)}`)
    .join(",")}}`;
}

/** Code-unit order, so the sort is the same one everywhere it ever runs. */
function compareKeys([left]: [string, unknown], [right]: [string, unknown]): number {
  if (left < right) return -1;

  return left > right ? 1 : 0;
}

function unhashable(path: string): InternalError {
  return new InternalError({
    message: "a generation input holds a value JSON cannot represent",
    fieldPath: path,
  });
}
