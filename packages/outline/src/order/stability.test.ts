/**
 * The acceptance criterion of CAL-019, as a test: reordering, merging or
 * splitting a chapter breaks no reference.
 *
 * The four operations are modelled here rather than imported, because CAL-105,
 * CAL-106 and CAL-107 own them and they do not exist yet. What is under test is
 * the property they all rest on and that this task delivers — **one operation
 * writes one row** — plus what that property buys: a numbering that stays
 * contiguous, ids that never change, and references that keep resolving to the
 * same chapter.
 *
 * Every fixture is technical. §9 forbids literary content in a committed
 * artefact, and an ordering suite needs none: what is under test is where a
 * chapter sits, never what happens in it.
 */

import { describe, expect, it } from "vitest";

import { compareOrderKeys, isOrderKey, orderKeysBetween } from "./key";
import { moveOrderKey, orderKeyAt } from "./position";
import { resolveOutline } from "./resolve";
import type { OrderedPart } from "./types";

interface Row {
  id: string;
  partId: string;
  orderKey: string;
  /** Fixed at creation and never rewritten: it is what proves an id still
   * names the same chapter after a hundred operations. */
  marker: string;
}

interface Plan {
  parts: OrderedPart[];
  chapters: Row[];
}

/** A reference held by something outside the plan — a thread, a fact, a note. */
interface Reference {
  chapterId: string;
  expectedMarker: string;
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected a value, got ${result.error.code}`);

  return result.value;
}

function siblingsOf(plan: Plan, partId: string): Row[] {
  return plan.chapters
    .filter((row) => row.partId === partId)
    .sort((left, right) => compareOrderKeys(left.orderKey, right.orderKey));
}

/** Every row's placement, by id — the thing an operation must not disturb. */
function placements(plan: Plan): Map<string, string> {
  return new Map(plan.chapters.map((row) => [row.id, `${row.partId}/${row.orderKey}`]));
}

function build(partCount: number, chaptersPerPart: number): Plan {
  const partKeys = unwrap(orderKeysBetween(null, null, partCount));
  const parts = partKeys.map((orderKey, index) => ({ id: `part-${index}`, orderKey }));
  const chapters = parts.flatMap((part) =>
    unwrap(orderKeysBetween(null, null, chaptersPerPart)).map((orderKey, index) => ({
      id: `${part.id}-chapter-${index}`,
      partId: part.id,
      orderKey,
      marker: `${part.id}-chapter-${index}-marker`,
    })),
  );

  return { parts, chapters };
}

// --- the four operations, each written to touch exactly one row -------------

function insert(plan: Plan, partId: string, index: number, id: string): void {
  const orderKey = unwrap(
    orderKeyAt(
      siblingsOf(plan, partId).map((row) => row.orderKey),
      index,
    ),
  );

  plan.chapters.push({ id, partId, orderKey, marker: `${id}-marker` });
}

function move(plan: Plan, id: string, toPartId: string, toIndex: number): void {
  const row = plan.chapters.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error("no such chapter");

  if (row.partId === toPartId) {
    const siblings = siblingsOf(plan, toPartId).map((sibling) => sibling.orderKey);
    row.orderKey = unwrap(moveOrderKey(siblings, siblings.indexOf(row.orderKey), toIndex));
    return;
  }

  const target = siblingsOf(plan, toPartId).map((sibling) => sibling.orderKey);
  row.orderKey = unwrap(orderKeyAt(target, toIndex));
  row.partId = toPartId;
}

/** A split keeps the source chapter and adds a second one right after it. */
function split(plan: Plan, id: string, newId: string): void {
  const row = plan.chapters.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error("no such chapter");

  const siblings = siblingsOf(plan, row.partId).map((sibling) => sibling.orderKey);
  const orderKey = unwrap(orderKeyAt(siblings, siblings.indexOf(row.orderKey) + 1));

  plan.chapters.push({ id: newId, partId: row.partId, orderKey, marker: `${newId}-marker` });
}

/**
 * A merge absorbs the next chapter of the same part into this one and returns
 * the absorbed id, so the caller can repoint what pointed at it — the only
 * repointing any of the four operations needs, and CAL-106's own job.
 */
function merge(plan: Plan, id: string): string | null {
  const siblings = siblingsOf(plan, partOf(plan, id));
  const index = siblings.findIndex((row) => row.id === id);
  const absorbed = siblings[index + 1];
  if (absorbed === undefined) return null;

  plan.chapters = plan.chapters.filter((row) => row.id !== absorbed.id);

  return absorbed.id;
}

function partOf(plan: Plan, id: string): string {
  const row = plan.chapters.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error("no such chapter");

  return row.partId;
}

// --- the invariants ---------------------------------------------------------

function expectOnlyTouched(
  before: Map<string, string>,
  after: Map<string, string>,
  touched: string[],
) {
  for (const [id, placement] of before) {
    if (touched.includes(id) || !after.has(id)) continue;
    expect(after.get(id)).toBe(placement);
  }
}

function expectContiguousNumbering(plan: Plan): void {
  const resolved = unwrap(resolveOutline(plan.parts, plan.chapters));

  expect(resolved.chapters.map(({ number }) => number)).toEqual(
    plan.chapters.map((_, index) => index + 1),
  );
  expect(plan.chapters.every((row) => isOrderKey(row.orderKey))).toBe(true);

  // Within a part the placement must stay unique, which is what the database's
  // @@unique([partId, orderKey]) enforces on the other side.
  for (const part of plan.parts) {
    const keys = siblingsOf(plan, part.id).map((row) => row.orderKey);
    expect(new Set(keys).size).toBe(keys.length);
  }
}

function expectReferencesResolve(plan: Plan, references: readonly Reference[]): void {
  for (const reference of references) {
    const target = plan.chapters.find((row) => row.id === reference.chapterId);

    expect(target).toBeDefined();
    expect(target?.marker).toBe(reference.expectedMarker);
  }
}

/** A deterministic generator: a seeded sequence is reproducible, a random one
 * is a test that fails on someone else's machine. */
function sequence(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe("ordering under insertion", () => {
  it("writes one row and leaves every other key byte-identical, at every position", () => {
    for (let index = 0; index <= 5; index += 1) {
      const plan = build(1, 5);
      const before = placements(plan);

      insert(plan, "part-0", index, "inserted");

      expectOnlyTouched(before, placements(plan), ["inserted"]);
      expect(placements(plan).size).toBe(before.size + 1);
      expectContiguousNumbering(plan);
    }
  });

  it("puts the new chapter exactly where it was asked for", () => {
    const plan = build(1, 5);

    insert(plan, "part-0", 2, "inserted");

    const resolved = unwrap(resolveOutline(plan.parts, plan.chapters));
    expect(resolved.chapters[2]?.chapter.id).toBe("inserted");
    expect(resolved.chapters[2]?.number).toBe(3);
  });

  it("survives fifty insertions into the same gap without renumbering anything", () => {
    const plan = build(1, 2);
    const original = placements(plan);

    for (let index = 0; index < 50; index += 1) {
      insert(plan, "part-0", 1, `inserted-${index}`);
    }

    expectOnlyTouched(original, placements(plan), []);
    expect(plan.chapters).toHaveLength(52);
    expectContiguousNumbering(plan);
  });
});

describe("ordering under a move", () => {
  it("writes exactly one row, from every position to every position", () => {
    for (let from = 0; from < 5; from += 1) {
      for (let to = 0; to < 5; to += 1) {
        const plan = build(1, 5);
        const before = placements(plan);
        const moved = `part-0-chapter-${from}`;

        move(plan, moved, "part-0", to);

        expectOnlyTouched(before, placements(plan), [moved]);
        expectContiguousNumbering(plan);

        const resolved = unwrap(resolveOutline(plan.parts, plan.chapters));
        expect(resolved.chapters[to]?.chapter.id).toBe(moved);
      }
    }
  });

  it("writes one row when a chapter changes part", () => {
    const plan = build(2, 4);
    const before = placements(plan);

    move(plan, "part-0-chapter-1", "part-1", 0);

    expectOnlyTouched(before, placements(plan), ["part-0-chapter-1"]);
    expectContiguousNumbering(plan);

    const resolved = unwrap(resolveOutline(plan.parts, plan.chapters));
    // Three chapters left in the first part, so the moved one is now fourth.
    expect(resolved.chapters[3]?.chapter.id).toBe("part-0-chapter-1");
    expect(resolved.parts[1]?.chapters[0]?.chapter.id).toBe("part-0-chapter-1");
  });

  it("writes nothing at all when a chapter is moved where it already is", () => {
    const plan = build(1, 5);
    const before = placements(plan);

    move(plan, "part-0-chapter-2", "part-0", 2);

    expect(placements(plan)).toEqual(before);
  });
});

describe("ordering under a split", () => {
  it("writes one new row, between the source chapter and the next", () => {
    const plan = build(1, 5);
    const before = placements(plan);

    split(plan, "part-0-chapter-2", "split-off");

    expectOnlyTouched(before, placements(plan), ["split-off"]);
    expectContiguousNumbering(plan);

    const resolved = unwrap(resolveOutline(plan.parts, plan.chapters));
    expect(resolved.chapters.map(({ chapter }) => chapter.id)).toEqual([
      "part-0-chapter-0",
      "part-0-chapter-1",
      "part-0-chapter-2",
      "split-off",
      "part-0-chapter-3",
      "part-0-chapter-4",
    ]);
  });

  it("splits the last chapter of a part without reaching into the next one", () => {
    const plan = build(2, 3);
    const before = placements(plan);

    split(plan, "part-0-chapter-2", "split-off");

    expectOnlyTouched(before, placements(plan), ["split-off"]);
    expect(unwrap(resolveOutline(plan.parts, plan.chapters)).parts[0]?.chapters).toHaveLength(4);
  });
});

describe("ordering under a merge", () => {
  it("removes one row and rewrites none", () => {
    const plan = build(1, 5);
    const before = placements(plan);

    const absorbed = merge(plan, "part-0-chapter-1");

    expect(absorbed).toBe("part-0-chapter-2");
    expectOnlyTouched(before, placements(plan), []);
    expect(plan.chapters).toHaveLength(4);
    expectContiguousNumbering(plan);
  });

  it("has nothing to absorb at the end of a part", () => {
    const plan = build(2, 3);

    expect(merge(plan, "part-0-chapter-2")).toBeNull();
  });

  // Merging is the one operation that removes an id, so it is the one operation
  // with references to repoint. The schema makes that visible rather than
  // silent: nothing can point at a chapter that is gone.
  it("leaves the absorbed chapter's references to be repointed, and no others", () => {
    const plan = build(1, 5);
    const references: Reference[] = plan.chapters.map((row) => ({
      chapterId: row.id,
      expectedMarker: row.marker,
    }));

    const absorbed = merge(plan, "part-0-chapter-1");

    const dangling = references.filter(
      (reference) => !plan.chapters.some((row) => row.id === reference.chapterId),
    );
    expect(dangling.map((reference) => reference.chapterId)).toEqual([absorbed]);

    expectReferencesResolve(
      plan,
      references.filter((reference) => reference.chapterId !== absorbed),
    );
  });
});

describe("a long mixed sequence", () => {
  it("keeps the numbering contiguous, the ids stable and every reference resolving", () => {
    const plan = build(3, 6);
    const references: Reference[] = plan.chapters.map((row) => ({
      chapterId: row.id,
      expectedMarker: row.marker,
    }));
    const next = sequence(20_260_819);
    let created = 0;
    let merges = 0;
    let splits = 0;
    let moves = 0;
    let inserts = 0;

    for (let step = 0; step < 400; step += 1) {
      const before = placements(plan);
      const partIndex = Math.floor(next() * plan.parts.length);
      const part = plan.parts[partIndex];
      if (part === undefined) continue;

      const siblings = siblingsOf(plan, part.id);
      const operation = Math.floor(next() * 4);

      if (operation === 0 || siblings.length === 0) {
        const index = Math.floor(next() * (siblings.length + 1));
        created += 1;
        inserts += 1;
        const id = `added-${created}`;
        insert(plan, part.id, index, id);
        references.push({ chapterId: id, expectedMarker: `${id}-marker` });
        expectOnlyTouched(before, placements(plan), [id]);
      } else if (operation === 1) {
        const fromIndex = Math.floor(next() * siblings.length);
        const source = siblings[fromIndex];
        if (source === undefined) continue;

        const targetPart = plan.parts[Math.floor(next() * plan.parts.length)];
        if (targetPart === undefined) continue;

        const targetSize = siblingsOf(plan, targetPart.id).length;
        const bound = targetPart.id === source.partId ? targetSize - 1 : targetSize;
        moves += 1;
        move(plan, source.id, targetPart.id, Math.floor(next() * (bound + 1)));
        expectOnlyTouched(before, placements(plan), [source.id]);
      } else if (operation === 2) {
        const source = siblings[Math.floor(next() * siblings.length)];
        if (source === undefined) continue;

        created += 1;
        splits += 1;
        const id = `added-${created}`;
        split(plan, source.id, id);
        references.push({ chapterId: id, expectedMarker: `${id}-marker` });
        expectOnlyTouched(before, placements(plan), [id]);
      } else {
        const source = siblings[Math.floor(next() * siblings.length)];
        if (source === undefined) continue;

        const absorbed = merge(plan, source.id);
        if (absorbed === null) continue;

        merges += 1;
        // What CAL-106 does with the attributes is its own decision; what it
        // must do with the references is this, and nothing else.
        for (const reference of references) {
          if (reference.chapterId === absorbed) {
            reference.chapterId = source.id;
            reference.expectedMarker = source.marker;
          }
        }
        expectOnlyTouched(before, placements(plan), []);
      }

      expectContiguousNumbering(plan);
      expectReferencesResolve(plan, references);
    }

    // The sequence has to have exercised all four, or the run proves nothing.
    expect(inserts).toBeGreaterThan(20);
    expect(moves).toBeGreaterThan(20);
    expect(splits).toBeGreaterThan(20);
    expect(merges).toBeGreaterThan(20);

    // And the keys have to have stayed usable, not crept towards the length of
    // a paragraph over four hundred operations.
    const longest = Math.max(...plan.chapters.map((row) => row.orderKey.length));
    expect(longest).toBeLessThan(12);
  });
});
