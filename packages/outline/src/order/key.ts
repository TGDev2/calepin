/**
 * Order keys — what keeps the plan ordered under insertion, move, merge and
 * split without renumbering anything (CAL-019).
 *
 * A key is a fraction between 0 and 1 written in base 36 with no `0.` in front
 * of it, so that comparing two keys as text compares the two fractions. Between
 * any two distinct fractions there is another one, which is the whole point: a
 * chapter is inserted by minting a key strictly between its two neighbours', and
 * no other row is written. An integer column would have to rewrite every row
 * after the insertion point, and — worse — the number would become an identity
 * that anything citing "chapter 7" silently follows to the wrong chapter after
 * one move.
 *
 * One invariant carries the construction: **a key never ends in `0`**. `a1` and
 * `a10` are the same fraction, so no key sits strictly between them and an
 * insertion would have nowhere to go. `isOrderKey` is that invariant, and
 * `parts_order_key_check` and `chapters_order_key_check` are the same invariant
 * in the database, where a direct SQL insert cannot escape it either.
 */

import { fail, type Result, succeed, ValidationError } from "@calepin/shared/errors";

/**
 * The digits a key is written with, in ascending order.
 *
 * Digits before letters and lowercase only, which is not decoration: the
 * database sorts this column, and a mixed-case alphabet is where a collation
 * stops agreeing with a character-by-character comparison. Over this alphabet
 * PostgreSQL's `ORDER BY` and `compareOrderKeys` return the same order, and the
 * integration suite asserts it against the real server rather than trusting it.
 */
export const ORDER_KEY_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

const BASE = ORDER_KEY_ALPHABET.length;

/**
 * Non-empty, drawn from the alphabet, and not ending in the first digit.
 *
 * A range is safe here — JavaScript reads `[0-9a-z]` by code point. The SQL
 * twin spells the alphabet out instead, because a range inside a PostgreSQL
 * bracket expression is interpreted through the database's collation.
 */
const ORDER_KEY_SHAPE = /^[0-9a-z]*[1-9a-z]$/;

const MALFORMED_MESSAGE = "order key is malformed";
const OUT_OF_ORDER_MESSAGE = "order key bounds are not in ascending order";
const NEGATIVE_COUNT_MESSAGE = "order key count is not a non-negative integer";

/**
 * The French message every failure here carries. The three failures are the
 * same event seen from the reader's side — the plan on screen no longer matches
 * the plan in the database, because something else moved a chapter first.
 */
const STALE_PLAN_MESSAGE =
  "Le plan a changé depuis son affichage. Rechargez-le avant de déplacer ce chapitre.";

export function isOrderKey(value: string): boolean {
  return ORDER_KEY_SHAPE.test(value);
}

/** Ascending order, character by character — the order the database returns. */
export function compareOrderKeys(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * A key strictly between the two given ones.
 *
 * `null` stands for the end of the range rather than for a missing value:
 * `before` null means "at the head", `after` null means "at the tail", both
 * null means "the first key of an empty collection".
 *
 * The failures are values (§7) rather than throws, because the bounds are read
 * from the database and a concurrent move can make them stale between the read
 * and the write.
 */
export function orderKeyBetween(
  before: string | null,
  after: string | null,
): Result<string, ValidationError> {
  if (before !== null && !isOrderKey(before)) return fail(malformed("before"));
  if (after !== null && !isOrderKey(after)) return fail(malformed("after"));
  if (before !== null && after !== null && before >= after) {
    return fail(
      new ValidationError({
        message: OUT_OF_ORDER_MESSAGE,
        fieldPath: "orderKey",
        userMessage: STALE_PLAN_MESSAGE,
      }),
    );
  }

  return succeed(midpoint(before ?? "", after));
}

/**
 * `count` keys strictly between the two bounds, in ascending order — one call
 * for a whole part's worth of chapters (CAL-102) instead of a chain of
 * single-key calls, which would crowd every key against `after`.
 */
export function orderKeysBetween(
  before: string | null,
  after: string | null,
  count: number,
): Result<string[], ValidationError> {
  if (!Number.isInteger(count) || count < 0) {
    return fail(new ValidationError({ message: NEGATIVE_COUNT_MESSAGE, fieldPath: "count" }));
  }

  const bounds = orderKeyBetween(before, after);
  if (!bounds.ok) return bounds;

  return succeed(spread(before, after, count));
}

function malformed(bound: string): ValidationError {
  return new ValidationError({
    message: MALFORMED_MESSAGE,
    fieldPath: `orderKey.${bound}`,
    userMessage: STALE_PLAN_MESSAGE,
  });
}

/**
 * The fraction halfway between `lower` and `upper`, `upper` null meaning 1.
 *
 * Total on bounds `orderKeyBetween` has already checked, which is why it
 * returns a string rather than a `Result`. It walks the shared prefix first,
 * then places one digit in the gap the two keys leave; when the gap is a single
 * digit — `a` and `b` have nothing between them at one character — it descends
 * into the next position instead of failing, which is what makes the number of
 * insertions between two given keys unbounded.
 */
function midpoint(lower: string, upper: string | null): string {
  if (upper !== null) {
    let shared = 0;
    while (shared < upper.length && digitAt(lower, shared) === upper.charAt(shared)) shared += 1;
    if (shared > 0) {
      return upper.slice(0, shared) + midpoint(lower.slice(shared), upper.slice(shared));
    }
  }

  const low = lower.length > 0 ? ORDER_KEY_ALPHABET.indexOf(lower.charAt(0)) : 0;
  const high =
    upper !== null && upper.length > 0 ? ORDER_KEY_ALPHABET.indexOf(upper.charAt(0)) : BASE;

  // Room for a digit of their own between the two.
  if (high - low > 1) return ORDER_KEY_ALPHABET.charAt(Math.round((low + high) / 2));
  // Consecutive digits, and `upper` says more after its first: everything that
  // starts with that digit alone is below it, and above `lower`.
  if (upper !== null && upper.length > 1) return upper.slice(0, 1);
  // Consecutive digits with nothing more to read: keep `lower`'s digit and find
  // room in the position after it, where the range runs all the way up to 1.
  return ORDER_KEY_ALPHABET.charAt(low) + midpoint(lower.slice(1), null);
}

/** A key's digit at `index`, or the trailing zero every key implicitly has. */
function digitAt(key: string, index: number): string {
  return key.charAt(index) || "0";
}

/**
 * `count` keys spread between the bounds. Appending and prepending walk in
 * their own direction — the cheap cases, and the ones CAL-102 runs; the general
 * case bisects, so a batch of keys stays as short as the gap allows instead of
 * piling one against a single end.
 */
function spread(before: string | null, after: string | null, count: number): string[] {
  if (count === 0) return [];
  if (count === 1) return [midpoint(before ?? "", after)];

  if (after === null) {
    const keys: string[] = [];
    let previous = before;
    for (let index = 0; index < count; index += 1) {
      previous = midpoint(previous ?? "", null);
      keys.push(previous);
    }
    return keys;
  }

  if (before === null) {
    const keys: string[] = [];
    let next = after;
    for (let index = 0; index < count; index += 1) {
      next = midpoint("", next);
      keys.unshift(next);
    }
    return keys;
  }

  const half = Math.floor(count / 2);
  const middle = midpoint(before, after);

  return [...spread(before, middle, half), middle, ...spread(middle, after, count - half - 1)];
}
