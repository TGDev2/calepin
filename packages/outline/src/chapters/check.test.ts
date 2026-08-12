import { describe, expect, it } from "vitest";

import {
  type ChapterBatchCheckChapter,
  type ChapterBatchCheckInput,
  checkChapterOutlineBatch,
} from "./check";
import {
  aChapterOutlineBatch,
  aChapterOutlineBatchInput,
  aClosingChapterOutlineBatch,
  aFinalPartInput,
} from "./fixtures";
import type { ChapterOutlineBatch, ChapterOutlineBatchInput, PlannedChapter } from "./schema";

/** The same projection `verifyChapterOutlineBatch` performs, for direct checks. */
function checkInputOf(
  batch: ChapterOutlineBatch,
  input: ChapterOutlineBatchInput,
): ChapterBatchCheckInput {
  return {
    partTargetWordCount: input.partTargetWordCount,
    partIndex: input.partIndex,
    partCount: input.partCount,
    threads: input.threads.map((thread) => ({
      state: thread.state,
      assignedPartIndexes: thread.assignedPartIndexes,
    })),
    castNames: input.cast.map((member) => member.name),
    placeNames: input.places.map((place) => place.name),
    factCount: input.canonFacts.length,
    precedingChapters: input.precedingChapters.map((digest) => ({
      immediateGoal: digest.immediateGoal,
    })),
    chapters: batch.chapters.map((chapter) => ({
      workingTitle: chapter.workingTitle,
      targetWordCount: chapter.targetWordCount,
      focalCharacterName: chapter.focalCharacterName,
      presentCharacterNames: chapter.presentCharacterNames,
      placeName: chapter.placeName,
      immediateGoal: chapter.immediateGoal,
      revelationPreparation:
        chapter.revelation === null
          ? null
          : {
              preparedByBatchChapterIndex: chapter.revelation.preparedByBatchChapterIndex,
              preparedByPrecedingChapterIndex: chapter.revelation.preparedByPrecedingChapterIndex,
            },
      opensThreadIndexes: chapter.opensThreadIndexes,
      continuesThreadIndexes: chapter.continuesThreadIndexes,
      closesThreadIndexes: chapter.closesThreadIndexes,
      factIndexes: chapter.factIndexes,
    })),
  };
}

function chapterAt(batch: ChapterOutlineBatch, index: number): PlannedChapter {
  const chapter = batch.chapters[index];

  if (chapter === undefined) throw new Error("the fixture holds no such chapter");

  return chapter;
}

function defectKindsOf(input: ChapterBatchCheckInput): string[] {
  return checkChapterOutlineBatch(input).defects.map((defect) => defect.kind);
}

describe("checkChapterOutlineBatch", () => {
  it("accepts the fixture batch whole", () => {
    const report = checkChapterOutlineBatch(
      checkInputOf(aChapterOutlineBatch(), aChapterOutlineBatchInput()),
    );

    expect(report).toEqual({
      acceptable: true,
      chapters: 3,
      threads: 3,
      defects: [],
      advisories: [],
    });
  });

  // CAL-102's adaptation gate: the same batch is admissible for one part size
  // and refused for another, with no model in the room — the range re-derived
  // from the input's own target by the calibration the prompt reads.
  it("refuses the same batch when the part's own target makes three chapters too few or too many", () => {
    const batch = aChapterOutlineBatch();

    const bigger = { ...aChapterOutlineBatchInput(), partTargetWordCount: 18_000 };
    expect(defectKindsOf(checkInputOf(batch, bigger))).toContain("chapter-count-out-of-range");

    const smaller = { ...aChapterOutlineBatchInput(), partTargetWordCount: 3_000 };
    expect(defectKindsOf(checkInputOf(batch, smaller))).toContain("chapter-count-out-of-range");
  });

  it("refuses two chapters sharing a working title, whatever the typography", () => {
    const batch = aChapterOutlineBatch();
    chapterAt(batch, 2).workingTitle = "LES ARCHIVES !";

    const report = checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput()));

    expect(report.defects).toContainEqual({
      kind: "duplicate-working-title",
      chapterIndex: 2,
      firstChapterIndex: 0,
    });
  });

  it("refuses a focal character absent from the present list, through the same reduction", () => {
    const batch = aChapterOutlineBatch();
    chapterAt(batch, 2).focalCharacterName = "Horace Ferrand";

    const report = checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput()));

    expect(report.defects).toContainEqual({ kind: "focal-not-present", chapterIndex: 2 });
  });

  it("accepts a typography variant of an offered name, and writes no defect for it", () => {
    const batch = aChapterOutlineBatch();
    chapterAt(batch, 2).focalCharacterName = "MEIDA";
    chapterAt(batch, 2).presentCharacterNames = ["MEIDA"];

    expect(
      checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput())).acceptable,
    ).toBe(true);
  });

  it("refuses a present character the ask does not offer, and one present twice", () => {
    const unknown = aChapterOutlineBatch();
    chapterAt(unknown, 0).presentCharacterNames = ["Meida", "Inconnue"];
    expect(
      checkChapterOutlineBatch(checkInputOf(unknown, aChapterOutlineBatchInput())).defects,
    ).toContainEqual({ kind: "unknown-character", chapterIndex: 0, index: 1 });

    const doubled = aChapterOutlineBatch();
    chapterAt(doubled, 0).presentCharacterNames = ["Meida", "meida"];
    expect(
      checkChapterOutlineBatch(checkInputOf(doubled, aChapterOutlineBatchInput())).defects,
    ).toContainEqual({ kind: "duplicate-character", chapterIndex: 0, index: 1, firstIndex: 0 });
  });

  it("refuses a place the ask does not offer", () => {
    const batch = aChapterOutlineBatch();
    chapterAt(batch, 0).placeName = "Nulle part";

    expect(
      checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput())).defects,
    ).toContainEqual({ kind: "unknown-place", chapterIndex: 0 });
  });

  it("refuses a fact reference outside the ask, and one cited twice", () => {
    const unknown = aChapterOutlineBatch();
    chapterAt(unknown, 0).factIndexes = [7];
    expect(
      checkChapterOutlineBatch(checkInputOf(unknown, aChapterOutlineBatchInput())).defects,
    ).toContainEqual({ kind: "unknown-fact-index", chapterIndex: 0, index: 0 });

    const doubled = aChapterOutlineBatch();
    chapterAt(doubled, 0).factIndexes = [0, 0];
    expect(
      checkChapterOutlineBatch(checkInputOf(doubled, aChapterOutlineBatchInput())).defects,
    ).toContainEqual({
      kind: "duplicate-fact-reference",
      chapterIndex: 0,
      index: 1,
      firstIndex: 0,
    });
  });

  it("refuses a thread index outside the ask, naming the list it sits in", () => {
    const batch = aChapterOutlineBatch();
    chapterAt(batch, 0).opensThreadIndexes = [5];

    expect(
      checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput())).defects,
    ).toContainEqual({ kind: "unknown-thread-index", chapterIndex: 0, list: "opens", index: 0 });
  });

  it("refuses one thread acted on twice by one chapter — the schema's rule, re-held for rows", () => {
    const batch = aChapterOutlineBatch();
    chapterAt(batch, 0).continuesThreadIndexes = [0, 0];

    expect(
      checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput())).defects,
    ).toContainEqual({ kind: "duplicate-thread-action", chapterIndex: 0, threadIndex: 0 });
  });

  describe("the choreography", () => {
    it("refuses opening a thread already open", () => {
      const batch = aChapterOutlineBatch();
      chapterAt(batch, 0).opensThreadIndexes = [0];
      chapterAt(batch, 0).continuesThreadIndexes = [];

      expect(
        checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput())).defects,
      ).toContainEqual({ kind: "reopened-thread", chapterIndex: 0, threadIndex: 0 });
    });

    it("refuses any action on a thread already closed", () => {
      const batch = aChapterOutlineBatch();
      chapterAt(batch, 0).continuesThreadIndexes = [0, 2];

      expect(
        checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput())).defects,
      ).toContainEqual({ kind: "thread-already-closed", chapterIndex: 0, threadIndex: 2 });
    });

    it("refuses continuing or closing a thread nothing has opened", () => {
      const batch = aChapterOutlineBatch();
      chapterAt(batch, 0).continuesThreadIndexes = [0, 1];

      expect(
        checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput())).defects,
      ).toContainEqual({
        kind: "unopened-thread-action",
        chapterIndex: 0,
        threadIndex: 1,
        list: "continues",
      });
    });

    it("refuses an action on a thread the part is not assigned", () => {
      const input = aChapterOutlineBatchInput();
      input.threads = input.threads.map((thread, index) =>
        index === 0 ? { ...thread, assignedPartIndexes: [0, 2] } : thread,
      );

      const report = checkChapterOutlineBatch(checkInputOf(aChapterOutlineBatch(), input));

      expect(report.defects).toContainEqual({
        kind: "undeclared-thread-action",
        chapterIndex: 0,
        threadIndex: 0,
      });
    });

    it("refuses a batch leaving an assigned thread untouched", () => {
      const batch = aChapterOutlineBatch();
      chapterAt(batch, 1).opensThreadIndexes = [];
      chapterAt(batch, 2).continuesThreadIndexes = [0];

      const report = checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput()));

      expect(report.defects).toContainEqual({ kind: "unaddressed-part-thread", threadIndex: 1 });
    });

    it("refuses closing a thread whose assignment extends past this part", () => {
      // Thread 0 runs to part 2; closing it here would make part 2's ask
      // self-contradictory (a closed thread cannot be assigned).
      const batch = aChapterOutlineBatch();
      chapterAt(batch, 0).continuesThreadIndexes = [];
      chapterAt(batch, 0).closesThreadIndexes = [0];
      chapterAt(batch, 2).continuesThreadIndexes = [1];

      const report = checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput()));

      expect(report.defects).toContainEqual({
        kind: "premature-thread-close",
        chapterIndex: 0,
        threadIndex: 0,
      });
    });

    it("refuses a batch leaving open a thread whose last assigned part this is", () => {
      const input = aChapterOutlineBatchInput();
      input.threads = input.threads.map((thread, index) =>
        index === 0 ? { ...thread, assignedPartIndexes: [0, 1] } : thread,
      );

      const report = checkChapterOutlineBatch(checkInputOf(aChapterOutlineBatch(), input));

      expect(report.defects).toContainEqual({ kind: "thread-left-open", threadIndex: 0 });
    });

    // The imperative itself, both ways: the last part must close everything
    // still open, and a batch that does is accepted whole.
    it("refuses the final part leaving any thread open, and accepts the one that closes them", () => {
      const leftOpen = checkChapterOutlineBatch(
        checkInputOf(aChapterOutlineBatch(), aFinalPartInput()),
      );

      expect(leftOpen.defects.map((defect) => defect.kind)).toContain("final-part-open-thread");

      const closing = checkChapterOutlineBatch(
        checkInputOf(aClosingChapterOutlineBatch(), aFinalPartInput()),
      );

      expect(closing.acceptable).toBe(true);
      expect(closing.defects).toEqual([]);
    });
  });

  it("refuses a preparation reference outside the ask's preceding list", () => {
    const batch = aChapterOutlineBatch();
    const revelation = chapterAt(batch, 0).revelation;
    if (revelation === null) throw new Error("the fixture chapter holds no revelation");
    chapterAt(batch, 0).revelation = { ...revelation, preparedByPrecedingChapterIndex: 5 };

    expect(
      checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput())).defects,
    ).toContainEqual({ kind: "unknown-preparation-reference", chapterIndex: 0 });
  });

  it("refuses a chapter target outside the envelope, inside a sum still in tolerance", () => {
    const batch = aChapterOutlineBatch();
    chapterAt(batch, 0).targetWordCount = 900;
    chapterAt(batch, 1).targetWordCount = 4_550;
    chapterAt(batch, 2).targetWordCount = 4_550;

    const report = checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput()));

    expect(report.defects).toEqual([
      {
        kind: "chapter-target-out-of-envelope",
        chapterIndex: 0,
        targetWordCount: 900,
        minWords: 1_000,
        maxWords: 8_000,
      },
    ]);
  });

  it("holds the declared sum to ±10% of the part's target, boundary included", () => {
    const under = aChapterOutlineBatch();
    under.chapters.forEach((chapter) => (chapter.targetWordCount = 2_000));
    expect(
      checkChapterOutlineBatch(checkInputOf(under, aChapterOutlineBatchInput())).defects,
    ).toContainEqual({
      kind: "word-budget-out-of-tolerance",
      declaredTotal: 6_000,
      partTargetWordCount: 10_000,
      minTotal: 9_000,
      maxTotal: 11_000,
    });

    const atFloor = aChapterOutlineBatch();
    atFloor.chapters.forEach((chapter) => (chapter.targetWordCount = 3_000));
    expect(
      checkChapterOutlineBatch(checkInputOf(atFloor, aChapterOutlineBatchInput())).acceptable,
    ).toBe(true);
  });

  // Row-capability (CAL-108, CAL-110): a hand-added plan starts empty, and a
  // null field skips the checks that read it instead of failing them — the
  // budget gate disarmed whole, because a sum with a hole verifies nothing.
  it("skips the checks a null planning field would feed, the budget gate included", () => {
    const input = checkInputOf(aChapterOutlineBatch(), aChapterOutlineBatchInput());
    const chapters: ChapterBatchCheckChapter[] = input.chapters.map((chapter, index) =>
      index === 0
        ? {
            ...chapter,
            workingTitle: null,
            targetWordCount: null,
            focalCharacterName: null,
            placeName: null,
            immediateGoal: null,
            revelationPreparation: null,
          }
        : chapter,
    );

    const report = checkChapterOutlineBatch({ ...input, chapters });

    expect(report.acceptable).toBe(true);
    expect(report.defects).toEqual([]);
  });

  describe("the advisories", () => {
    it("reports two chapters arguing the same stake, and never refuses for it", () => {
      const batch = aChapterOutlineBatch();
      chapterAt(batch, 1).immediateGoal = chapterAt(batch, 0).immediateGoal;

      const report = checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput()));

      expect(report.acceptable).toBe(true);
      expect(report.defects).toEqual([]);

      const finding = report.advisories.find((advisory) => advisory.kind === "similar-stakes");
      if (finding === undefined || finding.kind !== "similar-stakes") {
        throw new Error("the advisory was not reported");
      }
      expect(finding.chapterIndex).toBe(1);
      expect(finding.otherChapterIndex).toBe(0);
      expect(finding.sharedWords).toBe(finding.words);
    });

    it("reports a stake echoing a preceding chapter's, and never refuses for it", () => {
      const batch = aChapterOutlineBatch();
      const input = aChapterOutlineBatchInput();
      const digest = input.precedingChapters[0];
      if (digest === undefined) throw new Error("the fixture holds no preceding chapter");
      chapterAt(batch, 0).immediateGoal = digest.immediateGoal;

      const report = checkChapterOutlineBatch(checkInputOf(batch, input));

      expect(report.acceptable).toBe(true);
      expect(report.advisories).toContainEqual({
        kind: "similar-preceding-stake",
        chapterIndex: 0,
        precedingIndex: 0,
        sharedWords: expect.any(Number) as number,
        words: expect.any(Number) as number,
      });
    });

    it("reports a chapter advancing no thread, and never refuses for it", () => {
      const batch = aChapterOutlineBatch();
      chapterAt(batch, 2).continuesThreadIndexes = [];

      const report = checkChapterOutlineBatch(checkInputOf(batch, aChapterOutlineBatchInput()));

      expect(report.acceptable).toBe(true);
      expect(report.advisories).toContainEqual({ kind: "threadless-chapter", chapterIndex: 2 });
    });
  });
});
