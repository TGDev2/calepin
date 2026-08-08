import { describe, expect, it } from "vitest";

import { compareOrderKeys, isOrderKey, orderKeysBetween } from "./key";
import { moveOrderKey, orderKeyAt } from "./position";

function fiveSiblings(): string[] {
  const result = orderKeysBetween(null, null, 5);
  if (!result.ok) throw new Error("expected five keys");

  return result.value;
}

/** Where a key lands once the siblings are sorted again. */
function positionOf(siblings: readonly string[], key: string): number {
  return [...siblings, key].sort(compareOrderKeys).indexOf(key);
}

describe("orderKeyAt", () => {
  it("places a new row at every position, and only it moves", () => {
    const siblings = fiveSiblings();

    for (let index = 0; index <= siblings.length; index += 1) {
      const result = orderKeyAt(siblings, index);

      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      expect(isOrderKey(result.value)).toBe(true);
      expect(positionOf(siblings, result.value)).toBe(index);
      // The siblings are the caller's own array and the function is pure:
      // nothing but the returned key is written.
      expect(siblings).toEqual(fiveSiblings());
    }
  });

  it("mints the first key of an empty collection", () => {
    const result = orderKeyAt([], 0);

    expect(result.ok && isOrderKey(result.value)).toBe(true);
  });

  it("refuses a position outside the range", () => {
    const siblings = fiveSiblings();

    for (const index of [-1, siblings.length + 1, 1.5, Number.NaN]) {
      const result = orderKeyAt(siblings, index);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.fieldPath).toBe("position");
    }
  });

  // A list that arrives out of order means the caller read it without an
  // ORDER BY, or assembled it from two reads. Producing a plausible key from it
  // would put the row in the wrong place and look like it worked.
  it("refuses siblings that are not in ascending order", () => {
    const [first, second, third] = fiveSiblings();
    if (first === undefined || second === undefined || third === undefined) throw new Error("x");

    const result = orderKeyAt([first, third, second], 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fieldPath).toBe("siblings");
  });

  it("refuses siblings holding a malformed key", () => {
    expect(orderKeyAt(["a", "a0"], 1).ok).toBe(false);
    expect(orderKeyAt(["a", "a"], 1).ok).toBe(false);
  });
});

describe("moveOrderKey", () => {
  /** The plan as the reader sees it after the row at `from` moves to `to`. */
  function afterMove(siblings: readonly string[], from: number, to: number): string[] {
    const result = moveOrderKey(siblings, from, to);
    if (!result.ok) throw new Error(`expected a key, got ${result.error.code}`);

    const moved = siblings[from];
    if (moved === undefined) throw new Error("no row at that position");

    const others = siblings.filter((_, index) => index !== from);

    return [...others, result.value].sort(compareOrderKeys);
  }

  // The off-by-one this function exists to write once: `to` is the position the
  // row occupies afterwards, whichever direction it travelled.
  it("lands the row at the position it was asked for, moving down", () => {
    const siblings = fiveSiblings();
    const result = moveOrderKey(siblings, 0, 2);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(afterMove(siblings, 0, 2).indexOf(result.value)).toBe(2);
  });

  it("lands the row at the position it was asked for, moving up", () => {
    const siblings = fiveSiblings();
    const result = moveOrderKey(siblings, 4, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(afterMove(siblings, 4, 1).indexOf(result.value)).toBe(1);
  });

  it("lands the row at every position, from every position", () => {
    const siblings = fiveSiblings();

    for (let from = 0; from < siblings.length; from += 1) {
      for (let to = 0; to < siblings.length; to += 1) {
        const result = moveOrderKey(siblings, from, to);

        expect(result.ok).toBe(true);
        if (!result.ok) continue;

        expect(afterMove(siblings, from, to).indexOf(result.value)).toBe(to);
      }
    }
  });

  it("rewrites nothing when the row is moved where it already is", () => {
    const siblings = fiveSiblings();

    for (let index = 0; index < siblings.length; index += 1) {
      const result = moveOrderKey(siblings, index, index);

      expect(result.ok && result.value).toBe(siblings[index]);
    }
  });

  it("keeps every other key exactly as it was", () => {
    const siblings = fiveSiblings();
    const before = [...siblings];

    const result = moveOrderKey(siblings, 3, 0);

    expect(result.ok).toBe(true);
    expect(siblings).toEqual(before);
  });

  it("refuses a source or a destination outside the range", () => {
    const siblings = fiveSiblings();

    expect(moveOrderKey(siblings, -1, 0).ok).toBe(false);
    expect(moveOrderKey(siblings, siblings.length, 0).ok).toBe(false);
    expect(moveOrderKey(siblings, 0, -1).ok).toBe(false);
    expect(moveOrderKey(siblings, 0, siblings.length).ok).toBe(false);
  });
});
