import { describe, expect, it } from "vitest";

import { orderKeysBetween } from "./key";
import { resolveOutline } from "./resolve";
import type { OrderedChapter, OrderedPart } from "./types";

function keys(count: number): string[] {
  const result = orderKeysBetween(null, null, count);
  if (!result.ok) throw new Error("expected keys");

  return result.value;
}

/** Two parts of three and two chapters, built in the order they will read in. */
function plan(): { parts: OrderedPart[]; chapters: OrderedChapter[] } {
  const [firstPart, secondPart] = keys(2);
  if (firstPart === undefined || secondPart === undefined) throw new Error("expected two parts");

  const parts: OrderedPart[] = [
    { id: "part-1", orderKey: firstPart },
    { id: "part-2", orderKey: secondPart },
  ];
  const chapters: OrderedChapter[] = [
    ...keys(3).map((orderKey, index) => ({ id: `c-1-${index}`, partId: "part-1", orderKey })),
    ...keys(2).map((orderKey, index) => ({ id: `c-2-${index}`, partId: "part-2", orderKey })),
  ];

  return { parts, chapters };
}

function numbersOf(parts: OrderedPart[], chapters: OrderedChapter[]): [string, number][] {
  const result = resolveOutline(parts, chapters);
  if (!result.ok) throw new Error(`expected a plan, got ${result.error.code}`);

  return result.value.chapters.map(({ chapter, number }) => [chapter.id, number]);
}

describe("resolveOutline", () => {
  it("numbers the chapters across the whole novel, part by part", () => {
    const { parts, chapters } = plan();

    expect(numbersOf(parts, chapters)).toEqual([
      ["c-1-0", 1],
      ["c-1-1", 2],
      ["c-1-2", 3],
      ["c-2-0", 4],
      ["c-2-1", 5],
    ]);
  });

  it("reads the same plan the same way whatever order the rows arrive in", () => {
    const { parts, chapters } = plan();
    const shuffled = [...chapters].reverse();

    expect(numbersOf([...parts].reverse(), shuffled)).toEqual(numbersOf(parts, chapters));
  });

  it("groups the chapters under their part, in order", () => {
    const { parts, chapters } = plan();
    const result = resolveOutline(parts, chapters);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.parts.map(({ part }) => part.id)).toEqual(["part-1", "part-2"]);
    expect(result.value.parts.map(({ chapters: held }) => held.length)).toEqual([3, 2]);
    expect(result.value.parts[1]?.chapters.map(({ number }) => number)).toEqual([4, 5]);
  });

  it("keeps the caller's own row type, extra fields and all", () => {
    const parts = [{ id: "part-1", orderKey: "i", title: "opening" }];
    const chapters = [{ id: "c-1", partId: "part-1", orderKey: "i", status: "PLANNED" as const }];

    const result = resolveOutline(parts, chapters);

    expect(result.ok && result.value.chapters[0]?.chapter.status).toBe("PLANNED");
    expect(result.ok && result.value.parts[0]?.part.title).toBe("opening");
  });

  it("holds an empty part rather than dropping it", () => {
    const result = resolveOutline([{ id: "part-1", orderKey: "i" }], []);

    expect(result.ok && result.value.parts).toHaveLength(1);
    expect(result.ok && result.value.chapters).toEqual([]);
  });

  // A partial plan would otherwise number the chapters it happens to know
  // about, and the numbering would silently skip the ones it does not.
  it("refuses a chapter whose part is absent from the plan", () => {
    const result = resolveOutline(
      [{ id: "part-1", orderKey: "i" }],
      [{ id: "c-1", partId: "part-9", orderKey: "i" }],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fieldPath).toBe("chapter.partId");
  });

  // The database forbids the tie; the fallback is what keeps a hand-built list
  // — a test fixture, a preview of an edit — from rendering differently twice.
  it("separates two rows the keys cannot separate by their id", () => {
    const parts = [{ id: "part-1", orderKey: "i" }];
    const chapters = [
      { id: "b", partId: "part-1", orderKey: "i" },
      { id: "a", partId: "part-1", orderKey: "i" },
    ];

    expect(numbersOf(parts, chapters)).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});
