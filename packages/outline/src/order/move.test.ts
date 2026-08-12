/**
 * CAL-105's acceptance criterion at the arithmetic level: a chapter moves where
 * the gesture pointed, and a series of moves breaks no reference.
 *
 * Every fixture is technical. §9 forbids literary content in a committed
 * artefact, and a reordering suite needs none: what is under test is where a
 * chapter sits, never what happens in it.
 */

import { describe, expect, it } from "vitest";

import { orderKeysBetween } from "./key";
import { parseChapterMoveRequest, planChapterMove } from "./move";
import { STALE_PLAN_MESSAGE } from "./position";
import { resolveOutline } from "./resolve";
import type { OrderedChapter, OrderedPart } from "./types";

interface Chapter extends OrderedChapter {
  /**
   * Fixed at creation and never rewritten: it is what proves an id still names
   * the same chapter after a hundred moves.
   */
  readonly marker: string;
}

/** A reference held by something outside the plan — a thread, a fact, a sheet. */
interface Reference {
  readonly chapterId: string;
  readonly expectedMarker: string;
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected a value, got ${result.error.code}`);

  return result.value;
}

function build(partCount: number, chaptersPerPart: number) {
  const partKeys = unwrap(orderKeysBetween(null, null, partCount));
  const parts: OrderedPart[] = partKeys.map((orderKey, index) => ({
    id: `part-${String(index)}`,
    orderKey,
  }));
  const chapters: Chapter[] = parts.flatMap((part) =>
    unwrap(orderKeysBetween(null, null, chaptersPerPart)).map((orderKey, index) => ({
      id: `${part.id}-chapter-${String(index)}`,
      partId: part.id,
      orderKey,
      marker: `${part.id}-chapter-${String(index)}-marker`,
    })),
  );

  return { parts, chapters };
}

/** The reading order of the whole plan, which is what a number is derived from. */
function reading(parts: readonly OrderedPart[], chapters: readonly Chapter[]): string[] {
  return unwrap(resolveOutline(parts, chapters)).chapters.map((entry) => entry.chapter.id);
}

/** Applies a plan the way the repository does: one row, two columns. */
function apply(chapters: Chapter[], plan: { chapterId: string; partId: string; orderKey: string }) {
  const index = chapters.findIndex((chapter) => chapter.id === plan.chapterId);
  const current = chapters[index];
  if (current === undefined) throw new Error("the plan names a chapter that is not there");

  chapters[index] = { ...current, partId: plan.partId, orderKey: plan.orderKey };
}

/** Every row's placement, by id — what a move must disturb for exactly one row. */
function placements(chapters: readonly Chapter[]): Map<string, string> {
  return new Map(chapters.map((row) => [row.id, `${row.partId}/${row.orderKey}`]));
}

function countMoved(before: Map<string, string>, after: Map<string, string>): number {
  let moved = 0;
  for (const [id, placement] of after) {
    if (before.get(id) !== placement) moved += 1;
  }

  return moved;
}

describe("planChapterMove", () => {
  it("lands the chapter behind the anchor, at every position of its part", () => {
    const { parts, chapters } = build(1, 5);
    const [part] = parts;
    if (part === undefined) throw new Error("no part");

    // Chapter 0 to every position: behind nothing, then behind each of the four
    // chapters it leaves behind.
    const anchors = [
      null,
      "part-0-chapter-1",
      "part-0-chapter-2",
      "part-0-chapter-3",
      "part-0-chapter-4",
    ];

    anchors.forEach((afterChapterId, expectedIndex) => {
      const working = [...chapters];
      const plan = unwrap(
        planChapterMove(
          { chapterId: "part-0-chapter-0", targetPartId: part.id, afterChapterId },
          working,
        ),
      );

      apply(working, plan);

      expect(reading(parts, working).indexOf("part-0-chapter-0")).toBe(expectedIndex);
    });
  });

  it("moves a chapter upwards, past the one that was above it", () => {
    const { parts, chapters } = build(1, 5);
    const working = [...chapters];

    const plan = unwrap(
      planChapterMove(
        // Chapter 3 goes behind chapter 1, i.e. one notch up.
        {
          chapterId: "part-0-chapter-3",
          targetPartId: "part-0",
          afterChapterId: "part-0-chapter-1",
        },
        working,
      ),
    );
    apply(working, plan);

    expect(reading(parts, working)).toEqual([
      "part-0-chapter-0",
      "part-0-chapter-1",
      "part-0-chapter-3",
      "part-0-chapter-2",
      "part-0-chapter-4",
    ]);
  });

  it("writes nothing when the chapter is already there", () => {
    const { chapters } = build(1, 5);

    const inPlace = unwrap(
      planChapterMove(
        {
          chapterId: "part-0-chapter-2",
          targetPartId: "part-0",
          afterChapterId: "part-0-chapter-1",
        },
        chapters,
      ),
    );
    expect(inPlace.moved).toBe(false);
    expect(inPlace.orderKey).toBe(chapters[2]?.orderKey);

    const first = unwrap(
      planChapterMove(
        { chapterId: "part-0-chapter-0", targetPartId: "part-0", afterChapterId: null },
        chapters,
      ),
    );
    expect(first.moved).toBe(false);
  });

  it("moves a chapter into another part, head and tail alike", () => {
    const { parts, chapters } = build(2, 3);

    const head = [...chapters];
    apply(
      head,
      unwrap(
        planChapterMove(
          { chapterId: "part-0-chapter-2", targetPartId: "part-1", afterChapterId: null },
          head,
        ),
      ),
    );
    expect(reading(parts, head)).toEqual([
      "part-0-chapter-0",
      "part-0-chapter-1",
      "part-0-chapter-2",
      "part-1-chapter-0",
      "part-1-chapter-1",
      "part-1-chapter-2",
    ]);
    expect(head.find((row) => row.id === "part-0-chapter-2")?.partId).toBe("part-1");

    const tail = [...chapters];
    apply(
      tail,
      unwrap(
        planChapterMove(
          {
            chapterId: "part-1-chapter-0",
            targetPartId: "part-0",
            afterChapterId: "part-0-chapter-2",
          },
          tail,
        ),
      ),
    );
    expect(reading(parts, tail)).toEqual([
      "part-0-chapter-0",
      "part-0-chapter-1",
      "part-0-chapter-2",
      "part-1-chapter-0",
      "part-1-chapter-1",
      "part-1-chapter-2",
    ]);
    expect(tail.find((row) => row.id === "part-1-chapter-0")?.partId).toBe("part-0");
  });

  it("moves a chapter into an empty part", () => {
    const { parts, chapters } = build(2, 2);
    const emptied = chapters.filter((row) => row.partId === "part-0");

    const plan = unwrap(
      planChapterMove(
        { chapterId: "part-0-chapter-0", targetPartId: "part-1", afterChapterId: null },
        emptied,
      ),
    );
    apply(emptied, plan);

    expect(reading(parts, emptied)).toEqual(["part-0-chapter-1", "part-0-chapter-0"]);
  });

  it("takes the siblings in key order however they arrive", () => {
    const { chapters } = build(1, 5);
    const shuffled = [chapters[3], chapters[0], chapters[4], chapters[1], chapters[2]].filter(
      (row): row is Chapter => row !== undefined,
    );

    const fromOrdered = unwrap(
      planChapterMove(
        {
          chapterId: "part-0-chapter-4",
          targetPartId: "part-0",
          afterChapterId: "part-0-chapter-0",
        },
        chapters,
      ),
    );
    const fromShuffled = unwrap(
      planChapterMove(
        {
          chapterId: "part-0-chapter-4",
          targetPartId: "part-0",
          afterChapterId: "part-0-chapter-0",
        },
        shuffled,
      ),
    );

    expect(fromShuffled).toEqual(fromOrdered);
  });

  it("refuses a chapter that is not in the plan", () => {
    const { chapters } = build(1, 3);

    const result = planChapterMove(
      { chapterId: "absent", targetPartId: "part-0", afterChapterId: null },
      chapters,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("chapterId");
    expect(result.error.userMessage).toBe(STALE_PLAN_MESSAGE);
  });

  it("refuses an anchor that has left the destination part", () => {
    const { chapters } = build(2, 3);

    for (const afterChapterId of [
      "absent",
      // A chapter of the *other* part is not a position in this one.
      "part-1-chapter-0",
      // Behind itself is not a position any gesture produces.
      "part-0-chapter-0",
    ]) {
      const result = planChapterMove(
        { chapterId: "part-0-chapter-0", targetPartId: "part-0", afterChapterId },
        chapters,
      );

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.fieldPath).toBe("afterChapterId");
      expect(result.error.userMessage).toBe(STALE_PLAN_MESSAGE);
    }
  });

  it("refuses siblings the database could not have produced", () => {
    const result = planChapterMove(
      { chapterId: "a", targetPartId: "part-0", afterChapterId: null },
      [
        { id: "a", partId: "part-0", orderKey: "i" },
        // A key ending in `0` is refused by `chapters_order_key_check`; reaching
        // this function it can only mean a hand-written row or a bad read.
        { id: "b", partId: "part-0", orderKey: "r0" },
      ],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("siblings");
  });

  /**
   * The criterion the backlog states, at this level: *déplacer un chapitre ne
   * casse ni les fils narratifs ni les références aux faits canoniques*.
   *
   * The references here stand for all of them, because the schema gives them
   * one shape: `Thread.openingChapterId`, `Thread.closingChapterId`,
   * `ThreadContinuation.chapterId`, `ChapterOutline.chapterId` and, behind it,
   * `ChapterOutlineCharacter` and `ChapterOutlineFact` all name a chapter by
   * its id. `chapter-move.integration.test.ts` runs the same property over the
   * real rows; this one runs it over a long series no database test could
   * afford.
   */
  it("keeps every reference resolving through a long series of moves", () => {
    const { parts, chapters } = build(3, 6);
    const working = [...chapters];
    const references: Reference[] = chapters.map((row) => ({
      chapterId: row.id,
      expectedMarker: row.marker,
    }));
    const identities = new Set(chapters.map((row) => row.id));

    // Deterministic rather than random: a suite that fails once in fifty runs
    // teaches a team to re-run it.
    let cursor = 7;
    const next = (bound: number) => {
      cursor = (cursor * 31 + 17) % 1009;
      return cursor % bound;
    };

    for (let step = 0; step < 60; step += 1) {
      const before = placements(working);
      const moving = working[next(working.length)];
      const targetPart = parts[next(parts.length)];
      if (moving === undefined || targetPart === undefined) throw new Error("empty plan");

      const landing = working.filter((row) => row.partId === targetPart.id && row.id !== moving.id);
      const anchorIndex = next(landing.length + 1) - 1;
      const afterChapterId = anchorIndex < 0 ? null : (landing[anchorIndex]?.id ?? null);

      const plan = unwrap(
        planChapterMove(
          { chapterId: moving.id, targetPartId: targetPart.id, afterChapterId },
          working,
        ),
      );
      apply(working, plan);

      // One operation writes one row — or none, when the chapter was already
      // exactly there.
      expect(countMoved(before, placements(working))).toBe(plan.moved ? 1 : 0);

      // No chapter appeared, disappeared or changed identity.
      expect(new Set(working.map((row) => row.id))).toEqual(identities);

      // Every reference still resolves, and to the same chapter it named.
      for (const reference of references) {
        const target = working.find((row) => row.id === reference.chapterId);
        expect(target).toBeDefined();
        expect(target?.marker).toBe(reference.expectedMarker);
      }

      // And the derived numbering stays a contiguous 1..N over the whole novel.
      const numbered = unwrap(resolveOutline(parts, working)).chapters;
      expect(numbered.map((entry) => entry.number)).toEqual(
        Array.from({ length: working.length }, (_, index) => index + 1),
      );
    }
  });
});

describe("parseChapterMoveRequest", () => {
  it("accepts a well-formed request, with or without an anchor", () => {
    expect(
      parseChapterMoveRequest({ chapterId: "a", targetPartId: "p", afterChapterId: "b" }).ok,
    ).toBe(true);
    expect(
      parseChapterMoveRequest({ chapterId: "a", targetPartId: "p", afterChapterId: null }).ok,
    ).toBe(true);
  });

  it("refuses anything else, with one French sentence and no field named", () => {
    for (const submitted of [
      undefined,
      null,
      "a",
      {},
      { chapterId: "a", targetPartId: "p" },
      { chapterId: "", targetPartId: "p", afterChapterId: null },
      { chapterId: "a", targetPartId: "p", afterChapterId: 3 },
      { chapterId: "a", targetPartId: "p", afterChapterId: null, extra: true },
    ]) {
      const result = parseChapterMoveRequest(submitted);

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.category).toBe("validation");
      expect(result.error.userMessage).toBe(
        "Ce déplacement n'a pas pu être interprété. Rechargez le plan.",
      );
    }
  });
});
