import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CHAPTER_TARGET_WORD_COUNT_RANGE,
  PART_CHAPTER_COUNT_RANGE,
} from "../target-length/calibrate";
import { aChapterOutlineBatch, aChapterOutlineBatchInput } from "./fixtures";
import {
  CHAPTER_CHAR_CEILINGS,
  CHAPTER_WORD_TARGETS,
  chapterOutlineBatchInputSchema,
  chapterOutlineBatchSchema,
  type PlannedChapter,
} from "./schema";

/**
 * The walker `timeline/schema.test.ts` uses — a numeric field anywhere in the
 * answer is a score waiting to be asked for, so every path is enumerated and
 * pinned.
 */
function numericPaths(schema: unknown, path: string): string[] {
  if (schema instanceof z.ZodNumber) return [path];
  if (schema instanceof z.ZodNullable) return numericPaths(schema.unwrap(), path);
  if (schema instanceof z.ZodArray) return numericPaths(schema.element, `${path}[]`);
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([key, member]) =>
      numericPaths(member, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

function chapterAt(batch: { chapters: PlannedChapter[] }, index: number): PlannedChapter {
  const chapter = batch.chapters[index];

  if (chapter === undefined) throw new Error("the fixture holds no such chapter");

  return chapter;
}

describe("chapterOutlineBatchSchema", () => {
  it("accepts a complete chapter batch", () => {
    expect(chapterOutlineBatchSchema.safeParse(aChapterOutlineBatch()).success).toBe(true);
  });

  /**
   * **No score, structurally** (cahier des charges 1195–1199), with the
   * carve-outs that are not one: every numeric path is a position in a list,
   * a day on the chronology's axis, or a length in words — nothing measures
   * quality.
   */
  it("holds no number that is not a position, a day or a length", () => {
    expect(numericPaths(chapterOutlineBatchSchema, "")).toEqual([
      "chapters[].targetWordCount",
      "chapters[].period.startDay",
      "chapters[].period.endDay",
      "chapters[].revelation.preparedByBatchChapterIndex",
      "chapters[].revelation.preparedByPrecedingChapterIndex",
      "chapters[].opensThreadIndexes[]",
      "chapters[].continuesThreadIndexes[]",
      "chapters[].closesThreadIndexes[]",
      "chapters[].factIndexes[]",
    ]);
  });

  // The subset discipline: every numeric bound of ours is a `.check()`, so
  // the only `minimum` and `maximum` keywords in the derived JSON Schema are
  // the safe-integer bounds `z.int()` itself declares — none of ours entered
  // untested (CAL-090's move) — and no `pattern` anywhere (CAL-088's).
  it("derives a JSON Schema with no bound of ours and no pattern keyword", () => {
    const derived = JSON.stringify(z.toJSONSchema(chapterOutlineBatchSchema));

    expect(derived).not.toContain('"pattern"');
    const minimums = [...derived.matchAll(/"minimum":(-?\d+)/gu)].map((match) => match[1]);
    expect(new Set(minimums)).toEqual(new Set(["-9007199254740991"]));
    const maximums = [...derived.matchAll(/"maximum":(-?\d+)/gu)].map((match) => match[1]);
    expect(new Set(maximums)).toEqual(new Set(["9007199254740991"]));
  });

  it("derives every character ceiling from its word target, once", () => {
    for (const field of Object.keys(
      CHAPTER_WORD_TARGETS,
    ) as (keyof typeof CHAPTER_WORD_TARGETS)[]) {
      expect(CHAPTER_CHAR_CEILINGS[field]).toBe(Math.ceil(CHAPTER_WORD_TARGETS[field] * 7 * 2));
    }
  });

  it("bounds the chapters by the calibration's own envelope", () => {
    const batch = aChapterOutlineBatch();

    const single = { chapters: batch.chapters.slice(0, PART_CHAPTER_COUNT_RANGE.min - 1) };
    expect(chapterOutlineBatchSchema.safeParse(single).success).toBe(false);

    const first = chapterAt(batch, 0);
    const crowded = {
      chapters: Array.from({ length: PART_CHAPTER_COUNT_RANGE.max + 1 }, (unused, index) => ({
        ...first,
        workingTitle: `Chapitre ${String(index)}`,
      })),
    };
    expect(chapterOutlineBatchSchema.safeParse(crowded).success).toBe(false);
  });

  it("refuses a chapter without a dramatic function or a consequence", () => {
    // The MVP's own bar, as shape: the columns are nullable, the mission owes
    // the fields.
    const withoutFunction = aChapterOutlineBatch();
    chapterAt(withoutFunction, 0).dramaticFunction = " ";
    expect(chapterOutlineBatchSchema.safeParse(withoutFunction).success).toBe(false);

    const withoutConsequence = aChapterOutlineBatch();
    chapterAt(withoutConsequence, 0).consequence = " ";
    expect(chapterOutlineBatchSchema.safeParse(withoutConsequence).success).toBe(false);
  });

  it("refuses a negative thread or fact index", () => {
    const negativeThread = aChapterOutlineBatch();
    chapterAt(negativeThread, 0).continuesThreadIndexes = [-1];
    expect(chapterOutlineBatchSchema.safeParse(negativeThread).success).toBe(false);

    const negativeFact = aChapterOutlineBatch();
    chapterAt(negativeFact, 0).factIndexes = [-1];
    expect(chapterOutlineBatchSchema.safeParse(negativeFact).success).toBe(false);
  });

  it("refuses one thread acted on twice — opened and closed in one chapter included", () => {
    const twiceInOneList = aChapterOutlineBatch();
    chapterAt(twiceInOneList, 0).continuesThreadIndexes = [0, 0];
    expect(chapterOutlineBatchSchema.safeParse(twiceInOneList).success).toBe(false);

    const openedAndClosed = aChapterOutlineBatch();
    chapterAt(openedAndClosed, 1).opensThreadIndexes = [1];
    chapterAt(openedAndClosed, 1).closesThreadIndexes = [1];
    expect(chapterOutlineBatchSchema.safeParse(openedAndClosed).success).toBe(false);
  });

  it("refuses the same fact cited twice by one chapter", () => {
    const batch = aChapterOutlineBatch();
    chapterAt(batch, 0).factIndexes = [0, 0];

    expect(chapterOutlineBatchSchema.safeParse(batch).success).toBe(false);
  });

  it("refuses a focal character absent from the present list", () => {
    const batch = aChapterOutlineBatch();
    chapterAt(batch, 0).focalCharacterName = "Horace Ferrand";
    chapterAt(batch, 0).presentCharacterNames = ["Meida"];

    expect(chapterOutlineBatchSchema.safeParse(batch).success).toBe(false);
  });

  it("refuses a period ending before it starts", () => {
    const batch = aChapterOutlineBatch();
    chapterAt(batch, 0).period = { ...chapterAt(batch, 0).period, startDay: 40, endDay: 31 };

    expect(chapterOutlineBatchSchema.safeParse(batch).success).toBe(false);
  });

  it("refuses a declared target outside the admissible chapter length", () => {
    const tooShort = aChapterOutlineBatch();
    chapterAt(tooShort, 0).targetWordCount = CHAPTER_TARGET_WORD_COUNT_RANGE.min - 1;
    expect(chapterOutlineBatchSchema.safeParse(tooShort).success).toBe(false);

    const tooLong = aChapterOutlineBatch();
    chapterAt(tooLong, 0).targetWordCount = CHAPTER_TARGET_WORD_COUNT_RANGE.max + 1;
    expect(chapterOutlineBatchSchema.safeParse(tooLong).success).toBe(false);
  });

  it("refuses a revelation naming two preparing chapters, or none", () => {
    const both = aChapterOutlineBatch();
    chapterAt(both, 2).revelation = {
      ...(chapterAt(both, 2).revelation ?? { content: "x", preparation: "y" }),
      preparedByBatchChapterIndex: 0,
      preparedByPrecedingChapterIndex: 0,
    };
    expect(chapterOutlineBatchSchema.safeParse(both).success).toBe(false);

    const neither = aChapterOutlineBatch();
    chapterAt(neither, 2).revelation = {
      ...(chapterAt(neither, 2).revelation ?? { content: "x", preparation: "y" }),
      preparedByBatchChapterIndex: null,
      preparedByPrecedingChapterIndex: null,
    };
    expect(chapterOutlineBatchSchema.safeParse(neither).success).toBe(false);
  });

  it("refuses a revelation prepared by itself or by a later chapter of the batch", () => {
    const bySelf = aChapterOutlineBatch();
    chapterAt(bySelf, 2).revelation = {
      ...(chapterAt(bySelf, 2).revelation ?? { content: "x", preparation: "y" }),
      preparedByBatchChapterIndex: 2,
      preparedByPrecedingChapterIndex: null,
    };
    expect(chapterOutlineBatchSchema.safeParse(bySelf).success).toBe(false);

    const byLater = aChapterOutlineBatch();
    chapterAt(byLater, 0).revelation = {
      content: "Ce que la fresque cachait.",
      preparation: "La lézarde ouverte au chapitre suivant.",
      preparedByBatchChapterIndex: 2,
      preparedByPrecedingChapterIndex: null,
    };
    expect(chapterOutlineBatchSchema.safeParse(byLater).success).toBe(false);
  });

  it("accepts null as the answer for the place and the revelation", () => {
    const batch = aChapterOutlineBatch();
    chapterAt(batch, 0).placeName = null;
    chapterAt(batch, 0).revelation = null;

    expect(chapterOutlineBatchSchema.safeParse(batch).success).toBe(true);
  });

  it("refuses an unknown key", () => {
    expect(
      chapterOutlineBatchSchema.safeParse({ ...aChapterOutlineBatch(), score: 5 }).success,
    ).toBe(false);
  });
});

describe("chapterOutlineBatchInputSchema", () => {
  it("accepts the canonical ask", () => {
    expect(chapterOutlineBatchInputSchema.safeParse(aChapterOutlineBatchInput()).success).toBe(
      true,
    );
  });

  it("refuses a part placed outside its own count", () => {
    const input = { ...aChapterOutlineBatchInput(), partIndex: 3 };

    expect(chapterOutlineBatchInputSchema.safeParse(input).success).toBe(false);
  });

  it("refuses a thread offered twice", () => {
    const input = aChapterOutlineBatchInput();
    const first = input.threads[0];
    if (first === undefined) throw new Error("the fixture holds no thread");
    input.threads = [...input.threads, { ...first }];

    expect(chapterOutlineBatchInputSchema.safeParse(input).success).toBe(false);
  });

  it("refuses an assignment that is not strictly ascending", () => {
    const input = aChapterOutlineBatchInput();
    const first = input.threads[0];
    if (first === undefined) throw new Error("the fixture holds no thread");
    input.threads = [{ ...first, assignedPartIndexes: [1, 0] }, ...input.threads.slice(1)];

    expect(chapterOutlineBatchInputSchema.safeParse(input).success).toBe(false);
  });

  it("refuses an assignment pointing outside the plan", () => {
    const input = aChapterOutlineBatchInput();
    const first = input.threads[0];
    if (first === undefined) throw new Error("the fixture holds no thread");
    input.threads = [{ ...first, assignedPartIndexes: [0, 5] }, ...input.threads.slice(1)];

    expect(chapterOutlineBatchInputSchema.safeParse(input).success).toBe(false);
  });

  it("refuses an ask assigning a closed thread to the part", () => {
    const input = aChapterOutlineBatchInput();
    input.threads = input.threads.map((thread, index) =>
      index === 2 ? { ...thread, assignedPartIndexes: [0, 1] } : thread,
    );

    expect(chapterOutlineBatchInputSchema.safeParse(input).success).toBe(false);
  });

  it("refuses a character, place or fact offered twice", () => {
    const doubledCharacter = aChapterOutlineBatchInput();
    const member = doubledCharacter.cast[0];
    if (member === undefined) throw new Error("the fixture holds no character");
    doubledCharacter.cast = [...doubledCharacter.cast, { ...member }];
    expect(chapterOutlineBatchInputSchema.safeParse(doubledCharacter).success).toBe(false);

    const doubledPlace = aChapterOutlineBatchInput();
    const place = doubledPlace.places[0];
    if (place === undefined) throw new Error("the fixture holds no place");
    doubledPlace.places = [...doubledPlace.places, { ...place }];
    expect(chapterOutlineBatchInputSchema.safeParse(doubledPlace).success).toBe(false);

    const doubledFact = aChapterOutlineBatchInput();
    const fact = doubledFact.canonFacts[0];
    if (fact === undefined) throw new Error("the fixture holds no fact");
    doubledFact.canonFacts = [...doubledFact.canonFacts, { ...fact }];
    expect(chapterOutlineBatchInputSchema.safeParse(doubledFact).success).toBe(false);
  });

  it("refuses a non-positive part target word count", () => {
    expect(
      chapterOutlineBatchInputSchema.safeParse({
        ...aChapterOutlineBatchInput(),
        partTargetWordCount: 0,
      }).success,
    ).toBe(false);
  });
});
