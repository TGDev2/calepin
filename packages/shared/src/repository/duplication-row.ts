/**
 * The rewrite of one row into its copy (CAL-035) — the whole of the remapping
 * rule, as a pure function, so it is tested exhaustively without a database
 * (CLAUDE.md §8).
 *
 * Three things happen to a row and nothing else does:
 *
 *   - the five columns of `NEVER_COPIED_COLUMNS` are dropped, and the row is
 *     given the identifier the copier allocated for it;
 *   - every reference the plan declares is rewritten through the identity map,
 *     nulled when it names a model the copy leaves behind, or kept when it
 *     names a `User` — an author is the same account on both sides;
 *   - everything else is carried verbatim. That is the narrative.
 *
 * **A reference the map does not hold is a failure, never a value.** It means
 * the row points at something outside the project being copied, and writing it
 * through would be precisely the cross reference this task forbids. The copy is
 * one transaction, so the throw rolls the whole of it back and no half-copied
 * project is left behind (CLAUDE.md §6: never write partial data).
 */

import { InternalError } from "../errors/app-error";
import {
  type DuplicationTarget,
  isUnduplicatedModel,
  NEVER_COPIED_COLUMNS,
} from "./duplication-plan";

export interface RemapCopiedRowInput {
  /** The model being copied — the first half of the `fieldPath` a failure carries. */
  readonly model: string;
  /** One row as the scoped read returned it: scalar columns only. */
  readonly row: Readonly<Record<string, unknown>>;
  /** The model's reference columns, from the duplication plan. */
  readonly references: Readonly<Record<string, DuplicationTarget>>;
  /** The identifier allocated for this row's copy. */
  readonly newId: string;
  /**
   * Every identifier already allocated, source id to copy id — including the
   * project's own, and including this model's other rows, which is what lets a
   * self-reference resolve in the same pass.
   */
  readonly newIdsBySourceId: ReadonlyMap<string, string>;
}

export function remapCopiedRow(input: RemapCopiedRowInput): Record<string, unknown> {
  const { model, row, references, newId, newIdsBySourceId } = input;

  const dropped = new Set<string>(NEVER_COPIED_COLUMNS);
  const copy: Record<string, unknown> = {};

  // Built by keeping rather than by deleting: the row is the caller's, and a
  // copy that starts empty cannot carry a column this rule never considered.
  for (const [column, value] of Object.entries(row)) {
    if (!dropped.has(column)) copy[column] = value;
  }

  copy["id"] = newId;

  for (const [column, target] of Object.entries(references)) {
    // An absent column is not the same as a null one, but both mean the row
    // names nothing here, and a copy of nothing is nothing.
    if (!Object.hasOwn(copy, column)) continue;

    copy[column] = remapReference({ model, column, target, value: copy[column], newIdsBySourceId });
  }

  return copy;
}

function remapReference(input: {
  readonly model: string;
  readonly column: string;
  readonly target: DuplicationTarget;
  readonly value: unknown;
  readonly newIdsBySourceId: ReadonlyMap<string, string>;
}): unknown {
  const { model, column, target, value, newIdsBySourceId } = input;

  if (value === null || value === undefined) return null;

  if (typeof value !== "string") {
    throw new InternalError({
      message: "a reference column of a copied row holds a value that is not an identifier",
      fieldPath: `${model}.${column}`,
    });
  }

  // The author of the original text is the author of its copy: a duplication
  // never changes hands, so the account this names is the one asking for it.
  if (target === "User") return value;

  // The copy has no generations, no exports and no publications, so a column
  // pointing at one names nothing on this side. The plan's schema test proves
  // every such column is nullable, which is what makes this legal rather than a
  // write error at the end of a long transaction.
  if (isUnduplicatedModel(target)) return null;

  const mapped = newIdsBySourceId.get(value);

  if (mapped === undefined) {
    throw new InternalError({
      code: "PROJECT_DUPLICATION_INCOMPLETE",
      message: "a copied row references a row outside the project being copied",
      fieldPath: `${model}.${column}`,
    });
  }

  return mapped;
}
