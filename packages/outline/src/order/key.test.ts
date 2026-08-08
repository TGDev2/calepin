import { describe, expect, it } from "vitest";

import {
  compareOrderKeys,
  isOrderKey,
  ORDER_KEY_ALPHABET,
  orderKeyBetween,
  orderKeysBetween,
} from "./key";

function between(before: string | null, after: string | null): string {
  const result = orderKeyBetween(before, after);
  if (!result.ok) throw new Error(`expected a key, got ${result.error.code}`);

  return result.value;
}

describe("the order key alphabet", () => {
  it("holds thirty-six distinct digits", () => {
    expect(ORDER_KEY_ALPHABET).toHaveLength(36);
    expect(new Set(ORDER_KEY_ALPHABET).size).toBe(36);
  });

  // The database sorts this column. If the alphabet were not ascending by code
  // point, a key comparison in the domain and an ORDER BY would disagree, and
  // the plan would render in one order and be written in another.
  it("ascends by code point, digits before lowercase letters", () => {
    const sorted = [...ORDER_KEY_ALPHABET].sort();

    expect(sorted.join("")).toBe(ORDER_KEY_ALPHABET);
    expect(ORDER_KEY_ALPHABET).not.toMatch(/[A-Z]/);
  });
});

describe("isOrderKey", () => {
  it("accepts a key drawn from the alphabet", () => {
    for (const key of ["i", "a", "z", "0i", "09", "a1i", "zzzz1"]) {
      expect(isOrderKey(key)).toBe(true);
    }
  });

  // The invariant the whole construction rests on: `a1` and `a10` are the same
  // fraction, so nothing sits strictly between them.
  it("refuses a key ending in the first digit, which has no room after it", () => {
    for (const key of ["0", "a0", "a10", "zzz0"]) {
      expect(isOrderKey(key)).toBe(false);
    }
  });

  it("refuses an empty key and anything outside the alphabet", () => {
    for (const key of ["", "A", "aI", "a-", "a b", "a.b", "é", "a\n"]) {
      expect(isOrderKey(key)).toBe(false);
    }
  });
});

describe("compareOrderKeys", () => {
  it("orders by prefix, the shorter first", () => {
    expect(compareOrderKeys("a", "ai")).toBe(-1);
    expect(compareOrderKeys("ai", "a")).toBe(1);
    expect(compareOrderKeys("a", "a")).toBe(0);
  });

  it("orders digits before letters", () => {
    expect(compareOrderKeys("9", "a")).toBe(-1);
    expect(compareOrderKeys("0i", "1")).toBe(-1);
  });
});

describe("orderKeyBetween", () => {
  it("mints a first key when there is nothing to sit between", () => {
    const first = between(null, null);

    expect(isOrderKey(first)).toBe(true);
  });

  it("mints a key strictly between two neighbours", () => {
    const pairs: [string, string][] = [
      ["a", "b"],
      ["a", "z"],
      ["1", "2"],
      ["a1", "a2"],
      ["a", "ab"],
      ["az", "b"],
      ["0i", "1"],
      ["a", "a1i"],
      ["yzzzzz", "z"],
    ];

    for (const [before, after] of pairs) {
      const key = between(before, after);

      expect(isOrderKey(key)).toBe(true);
      expect(compareOrderKeys(before, key)).toBe(-1);
      expect(compareOrderKeys(key, after)).toBe(-1);
    }
  });

  it("mints a key above a bound and a key below one", () => {
    const above = between("a", null);
    const below = between(null, "a");

    expect(compareOrderKeys("a", above)).toBe(-1);
    expect(compareOrderKeys(below, "a")).toBe(-1);
    expect(isOrderKey(above)).toBe(true);
    expect(isOrderKey(below)).toBe(true);
  });

  it("refuses bounds that are equal or the wrong way round", () => {
    for (const [before, after] of [
      ["b", "a"],
      ["a", "a"],
      ["ai", "a"],
    ]) {
      const result = orderKeyBetween(before ?? null, after ?? null);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.fieldPath).toBe("orderKey");
    }
  });

  it("refuses a malformed bound rather than producing a key from it", () => {
    for (const bounds of [
      ["a0", null],
      [null, "A"],
      ["", null],
      [null, "a b"],
    ] as const) {
      const result = orderKeyBetween(bounds[0], bounds[1]);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.fieldPath).toMatch(/^orderKey\.(before|after)$/);
    }
  });

  // The claim the whole design rests on: the number of insertions between two
  // fixed neighbours is unbounded. An integer column runs out at the first one.
  it("never runs out of room in the same gap", () => {
    const attempts = 500;
    let upper = between("a", "b");
    let longest = upper.length;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const key = between("a", upper);

      expect(isOrderKey(key)).toBe(true);
      expect(compareOrderKeys("a", key)).toBe(-1);
      expect(compareOrderKeys(key, upper)).toBe(-1);

      upper = key;
      longest = Math.max(longest, key.length);
    }

    // Worst case: every insertion lands in the same gap, immediately after the
    // same neighbour. The key grows by one character every few insertions and
    // never faster, which is what "unbounded" costs.
    expect(longest).toBeLessThan(attempts / 4);
  });

  it("keeps a long run of appends and a long run of prepends in order", () => {
    const appended: string[] = [];
    const prepended: string[] = [];

    for (let index = 0; index < 500; index += 1) {
      appended.push(between(appended.at(-1) ?? null, null));
      prepended.unshift(between(null, prepended[0] ?? null));
    }

    for (const keys of [appended, prepended]) {
      expect(keys.every(isOrderKey)).toBe(true);
      expect([...keys].sort()).toEqual(keys);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("orderKeysBetween", () => {
  it("returns nothing for a count of zero", () => {
    const result = orderKeysBetween(null, null, 0);

    expect(result.ok && result.value).toEqual([]);
  });

  it("spreads a whole part's chapters between two bounds, in order", () => {
    for (const bounds of [
      [null, null],
      ["a", null],
      [null, "a"],
      ["a", "b"],
    ] as const) {
      const result = orderKeysBetween(bounds[0], bounds[1], 40);

      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      const keys = result.value;
      expect(keys).toHaveLength(40);
      expect(keys.every(isOrderKey)).toBe(true);
      expect([...keys].sort()).toEqual(keys);
      expect(new Set(keys).size).toBe(40);

      const [first] = keys;
      const last = keys.at(-1);
      if (bounds[0] !== null && first !== undefined) {
        expect(compareOrderKeys(bounds[0], first)).toBe(-1);
      }
      if (bounds[1] !== null && last !== undefined) {
        expect(compareOrderKeys(last, bounds[1])).toBe(-1);
      }
    }
  });

  it("refuses a count that is not a whole number of rows", () => {
    for (const count of [-1, 1.5, Number.NaN]) {
      const result = orderKeysBetween(null, null, count);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.fieldPath).toBe("count");
    }
  });

  it("refuses bounds the single-key form would refuse", () => {
    expect(orderKeysBetween("b", "a", 3).ok).toBe(false);
    expect(orderKeysBetween("a0", null, 3).ok).toBe(false);
  });
});
