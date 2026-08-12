/**
 * Placing a row among its siblings (CAL-019).
 *
 * `key.ts` answers "a key between these two"; this answers "the key for
 * position N", which is what the plan screen actually asks — insert a chapter
 * at position 3, drag chapter 7 to position 2, split chapter 4 in two. The
 * off-by-one a move hides is written once, here, instead of at every call site.
 *
 * Both functions take the siblings' keys in ascending order and return the key
 * for exactly one row. Nothing else is ever written, which is the property the
 * whole ordering exists for.
 */

import { fail, type Result, succeed, ValidationError } from "@calepin/shared/errors";

import { isOrderKey, orderKeyBetween } from "./key";

const UNSORTED_MESSAGE = "siblings are not in ascending order";
const OUT_OF_RANGE_MESSAGE = "position is outside the sibling range";

/**
 * The one sentence every stale-plan refusal ends in. Exported because `move.ts`
 * refuses on the same ground one level up — an anchor that has left the part
 * since the screen was drawn — and two wordings for one situation is how an
 * author learns that reloading sometimes helps and sometimes does not.
 */
export const STALE_PLAN_MESSAGE =
  "Le plan a changé depuis son affichage. Rechargez-le avant de déplacer ce chapitre.";

/**
 * The key of a new row landing at `index` among `siblings`.
 *
 * `index` is the position the row will occupy: 0 puts it first, `siblings.length`
 * puts it last. A split is this function at `indexOf(source) + 1`; a merge calls
 * nothing at all, since removing a row leaves every remaining key untouched.
 */
export function orderKeyAt(
  siblings: readonly string[],
  index: number,
): Result<string, ValidationError> {
  const ordered = assertAscending(siblings);
  if (!ordered.ok) return ordered;

  if (!Number.isInteger(index) || index < 0 || index > siblings.length) {
    return fail(
      new ValidationError({
        message: OUT_OF_RANGE_MESSAGE,
        fieldPath: "position",
        userMessage: STALE_PLAN_MESSAGE,
      }),
    );
  }

  return orderKeyBetween(siblings[index - 1] ?? null, siblings[index] ?? null);
}

/**
 * The key the row at `from` takes when it moves to `to`.
 *
 * `to` is the position the row occupies **once moved**, which is what a drag
 * means and what a keyboard reorder means: moving the first of five rows to 2
 * leaves it third. The row is therefore taken out of the list before the
 * position is read, and getting that order wrong is the classic way a move
 * lands one place short when it goes down and not when it goes up.
 *
 * Moving a row where it already is returns the key it already has, so the
 * caller writes nothing at all.
 */
export function moveOrderKey(
  siblings: readonly string[],
  from: number,
  to: number,
): Result<string, ValidationError> {
  const ordered = assertAscending(siblings);
  if (!ordered.ok) return ordered;

  const moved = siblings[from];
  if (moved === undefined || !Number.isInteger(from)) {
    return fail(outOfRange("from"));
  }
  if (!Number.isInteger(to) || to < 0 || to > siblings.length - 1) {
    return fail(outOfRange("to"));
  }

  if (from === to) return succeed(moved);

  const remaining = [...siblings.slice(0, from), ...siblings.slice(from + 1)];

  return orderKeyAt(remaining, to);
}

function outOfRange(bound: string): ValidationError {
  return new ValidationError({
    message: OUT_OF_RANGE_MESSAGE,
    fieldPath: `position.${bound}`,
    userMessage: STALE_PLAN_MESSAGE,
  });
}

/**
 * The siblings must already be sorted, and each one has to be a key.
 *
 * Not defensive noise: the caller reads them from the database, and a list that
 * arrives out of order — a query that forgot its `ORDER BY`, a page assembled
 * from two reads — would otherwise produce a key that looks valid and lands the
 * row in the wrong place, which is the one failure mode this module exists to
 * make impossible.
 */
function assertAscending(siblings: readonly string[]): Result<void, ValidationError> {
  let previous: string | undefined;

  for (const key of siblings) {
    if (!isOrderKey(key) || (previous !== undefined && key <= previous)) {
      return fail(
        new ValidationError({
          message: UNSORTED_MESSAGE,
          fieldPath: "siblings",
          userMessage: STALE_PLAN_MESSAGE,
        }),
      );
    }
    previous = key;
  }

  return succeed();
}
