import { describe, expect, it } from "vitest";

import {
  adjustChapterCalibration,
  CHAPTER_TARGET_WORD_COUNT_RANGE,
  CHAPTER_WORD_BUDGET_TOLERANCE,
  chapterCalibrationForPartWordCount,
  chapterWordBudgetGap,
  estimateChapterCalibration,
  estimatePartCalibration,
  PART_CHAPTER_COUNT_RANGE,
  PART_COUNT_RANGE,
  partCalibrationForWordCount,
  resolveNovelTargetWordCount,
} from "./calibrate";
import type { NovelLengthChoice } from "./types";

describe("resolveNovelTargetWordCount", () => {
  it("resolves a preset to the midpoint of its range", () => {
    expect(resolveNovelTargetWordCount({ targetLength: "SHORT" })).toBe(37_500);
    expect(resolveNovelTargetWordCount({ targetLength: "STANDARD" })).toBe(65_000);
    expect(resolveNovelTargetWordCount({ targetLength: "LONG" })).toBe(95_000);
  });

  it("resolves a custom choice to exactly its own word count", () => {
    expect(resolveNovelTargetWordCount({ targetLength: "CUSTOM", targetWordCount: 123_456 })).toBe(
      123_456,
    );
  });
});

describe("estimateChapterCalibration", () => {
  it("derives a chapter count and a per-chapter target for each preset", () => {
    expect(estimateChapterCalibration({ targetLength: "SHORT" })).toEqual({
      novelTargetWordCount: 37_500,
      chapterCount: 13,
      chapterTargetWordCount: 2_885,
    });
    expect(estimateChapterCalibration({ targetLength: "STANDARD" })).toEqual({
      novelTargetWordCount: 65_000,
      chapterCount: 22,
      chapterTargetWordCount: 2_955,
    });
    expect(estimateChapterCalibration({ targetLength: "LONG" })).toEqual({
      novelTargetWordCount: 95_000,
      chapterCount: 32,
      chapterTargetWordCount: 2_969,
    });
  });

  it("derives the same shape for a custom choice, from its own word count", () => {
    expect(
      estimateChapterCalibration({ targetLength: "CUSTOM", targetWordCount: 100_000 }),
    ).toEqual({
      novelTargetWordCount: 100_000,
      chapterCount: 33,
      chapterTargetWordCount: 3_030,
    });
  });

  it("never proposes fewer than 8 chapters, even at the custom range's floor", () => {
    const calibration = estimateChapterCalibration({
      targetLength: "CUSTOM",
      targetWordCount: 20_000,
    });

    expect(calibration.chapterCount).toBe(8);
    expect(calibration.chapterTargetWordCount).toBe(2_500);
  });

  it("scales the chapter count up for a long custom choice", () => {
    const calibration = estimateChapterCalibration({
      targetLength: "CUSTOM",
      targetWordCount: 200_000,
    });

    expect(calibration.chapterCount).toBe(67);
    expect(calibration.chapterTargetWordCount).toBe(2_985);
  });

  // CAL-103's own future acceptance criterion, checked here so the estimate
  // this task derives never starts outside the bar the manual-adjustment
  // task will later enforce.
  it("keeps chapterCount × chapterTargetWordCount within 10% of the target, across every choice", () => {
    const choices: NovelLengthChoice[] = [
      { targetLength: "SHORT" },
      { targetLength: "STANDARD" },
      { targetLength: "LONG" },
      { targetLength: "CUSTOM", targetWordCount: 20_000 },
      { targetLength: "CUSTOM", targetWordCount: 65_432 },
      { targetLength: "CUSTOM", targetWordCount: 200_000 },
    ];

    for (const choice of choices) {
      const { novelTargetWordCount, chapterCount, chapterTargetWordCount } =
        estimateChapterCalibration(choice);
      const sum = chapterCount * chapterTargetWordCount;
      const deviation = Math.abs(sum - novelTargetWordCount) / novelTargetWordCount;

      expect(deviation).toBeLessThan(0.1);
    }
  });
});

describe("estimatePartCalibration", () => {
  // CAL-101's acceptance bar — "le découpage s'adapte réellement" — proved at
  // the source: the three presets resolve to three distinct ranges, so a split
  // acceptable for a short novel is refusable for a long one before any model
  // is asked anything.
  it("derives a distinct part-count range for each preset", () => {
    expect(estimatePartCalibration({ targetLength: "SHORT" })).toEqual({
      novelTargetWordCount: 37_500,
      minParts: 2,
      maxParts: 3,
    });
    expect(estimatePartCalibration({ targetLength: "STANDARD" })).toEqual({
      novelTargetWordCount: 65_000,
      minParts: 3,
      maxParts: 5,
    });
    expect(estimatePartCalibration({ targetLength: "LONG" })).toEqual({
      novelTargetWordCount: 95_000,
      minParts: 4,
      maxParts: 6,
    });
  });

  it("adapts to a custom choice at both extremes of its range", () => {
    // The floor collapses to [2, 2]: a 20 000-word novel gets exactly two
    // parts, because below two a découpage is not one.
    expect(estimatePartCalibration({ targetLength: "CUSTOM", targetWordCount: 20_000 })).toEqual({
      novelTargetWordCount: 20_000,
      minParts: 2,
      maxParts: 2,
    });
    expect(estimatePartCalibration({ targetLength: "CUSTOM", targetWordCount: 200_000 })).toEqual({
      novelTargetWordCount: 200_000,
      minParts: 10,
      maxParts: 12,
    });
  });

  // One arithmetic serves the estimate, the prompt and the checker's gate —
  // the wrapper only resolves the choice first.
  it("wraps partCalibrationForWordCount over the resolved word count", () => {
    const choices: NovelLengthChoice[] = [
      { targetLength: "SHORT" },
      { targetLength: "STANDARD" },
      { targetLength: "LONG" },
      { targetLength: "CUSTOM", targetWordCount: 72_000 },
    ];

    for (const choice of choices) {
      expect(estimatePartCalibration(choice)).toEqual(
        partCalibrationForWordCount(resolveNovelTargetWordCount(choice)),
      );
    }
  });

  it("agrees with the chapter calibration on the resolved word count", () => {
    const choice: NovelLengthChoice = { targetLength: "CUSTOM", targetWordCount: 87_654 };

    expect(estimatePartCalibration(choice).novelTargetWordCount).toBe(
      estimateChapterCalibration(choice).novelTargetWordCount,
    );
  });
});

describe("partCalibrationForWordCount", () => {
  it("never leaves the envelope, and never proposes an empty range", () => {
    for (let words = 20_000; words <= 200_000; words += 1_000) {
      const { minParts, maxParts } = partCalibrationForWordCount(words);

      expect(minParts).toBeGreaterThanOrEqual(PART_COUNT_RANGE.min);
      expect(maxParts).toBeLessThanOrEqual(PART_COUNT_RANGE.max);
      expect(minParts).toBeLessThanOrEqual(maxParts);
    }
  });

  it("scales monotonically: more words never allow fewer parts", () => {
    let previous = partCalibrationForWordCount(20_000);

    for (let words = 21_000; words <= 200_000; words += 1_000) {
      const current = partCalibrationForWordCount(words);

      expect(current.minParts).toBeGreaterThanOrEqual(previous.minParts);
      expect(current.maxParts).toBeGreaterThanOrEqual(previous.maxParts);
      previous = current;
    }
  });
});

describe("chapterCalibrationForPartWordCount", () => {
  // CAL-102's adaptation gate at the source: distinct part word targets
  // resolve to distinct chapter-count ranges, so a batch acceptable for a
  // short part is refusable for a long one before any model is asked
  // anything — partCalibrationForWordCount's bar, one level down.
  it("derives a distinct chapter-count range across part sizes", () => {
    expect(chapterCalibrationForPartWordCount(3_000)).toEqual({
      partTargetWordCount: 3_000,
      minChapters: 2,
      maxChapters: 2,
    });
    expect(chapterCalibrationForPartWordCount(6_000)).toEqual({
      partTargetWordCount: 6_000,
      minChapters: 2,
      maxChapters: 3,
    });
    expect(chapterCalibrationForPartWordCount(10_000)).toEqual({
      partTargetWordCount: 10_000,
      minChapters: 2,
      maxChapters: 4,
    });
    // The baseline part: 18 000 words is five to seven baseline chapters.
    expect(chapterCalibrationForPartWordCount(18_000)).toEqual({
      partTargetWordCount: 18_000,
      minChapters: 5,
      maxChapters: 7,
    });
    expect(chapterCalibrationForPartWordCount(30_000)).toEqual({
      partTargetWordCount: 30_000,
      minChapters: 9,
      maxChapters: 11,
    });
    // Past the ceiling the range collapses instead of leaving the envelope.
    expect(chapterCalibrationForPartWordCount(66_000)).toEqual({
      partTargetWordCount: 66_000,
      minChapters: 20,
      maxChapters: 20,
    });
  });

  it("never leaves the envelope, and never proposes an empty range", () => {
    for (let words = 2_000; words <= 70_000; words += 500) {
      const { minChapters, maxChapters } = chapterCalibrationForPartWordCount(words);

      expect(minChapters).toBeGreaterThanOrEqual(PART_CHAPTER_COUNT_RANGE.min);
      expect(maxChapters).toBeLessThanOrEqual(PART_CHAPTER_COUNT_RANGE.max);
      expect(minChapters).toBeLessThanOrEqual(maxChapters);
    }
  });

  it("scales monotonically: more words never allow fewer chapters", () => {
    let previous = chapterCalibrationForPartWordCount(2_000);

    for (let words = 2_500; words <= 70_000; words += 500) {
      const current = chapterCalibrationForPartWordCount(words);

      expect(current.minChapters).toBeGreaterThanOrEqual(previous.minChapters);
      expect(current.maxChapters).toBeGreaterThanOrEqual(previous.maxChapters);
      previous = current;
    }
  });

  // The word-budget gate (sum within 10% of the part's target) must stay
  // satisfiable by SOME batch inside the count range and the per-chapter
  // envelope, for every part size a novel can produce (largest preset part:
  // LONG 110 000 over 2 parts). Otherwise the checker would refuse every
  // honest answer for a part size the calibration itself allows.
  it("keeps the ±10% budget window reachable inside the envelope, at every part size", () => {
    for (let words = 2_000; words <= 55_000; words += 500) {
      const { minChapters, maxChapters } = chapterCalibrationForPartWordCount(words);
      const floor = words * 0.9;
      const ceiling = words * 1.1;

      let reachable = false;
      for (let count = minChapters; count <= maxChapters; count += 1) {
        const lowest = count * CHAPTER_TARGET_WORD_COUNT_RANGE.min;
        const highest = count * CHAPTER_TARGET_WORD_COUNT_RANGE.max;

        if (lowest <= ceiling && highest >= floor) reachable = true;
      }

      expect(reachable).toBe(true);
    }
  });
});

describe("chapterWordBudgetGap", () => {
  it("reports zero deviation for an exact match", () => {
    expect(chapterWordBudgetGap(65_000, 65_000)).toEqual({
      totalTargetWordCount: 65_000,
      novelTargetWordCount: 65_000,
      minTotal: 58_500,
      maxTotal: 71_500,
      deviationWordCount: 0,
      deviationRatio: 0,
      withinTolerance: true,
    });
  });

  it("stays within tolerance for a total inside the ±10% envelope", () => {
    const gap = chapterWordBudgetGap(70_000, 65_000);

    expect(gap.withinTolerance).toBe(true);
    expect(gap.deviationWordCount).toBe(5_000);
    expect(gap.deviationRatio).toBeCloseTo(5_000 / 65_000);
  });

  it("includes the boundary, both floor and ceiling", () => {
    // Mirrors chapters/check.test.ts's "boundary included" case, at the
    // novel scale rather than the part scale.
    expect(chapterWordBudgetGap(9_000, 10_000).withinTolerance).toBe(true);
    expect(chapterWordBudgetGap(11_000, 10_000).withinTolerance).toBe(true);
  });

  it("refuses a total just past the boundary on either side", () => {
    expect(chapterWordBudgetGap(8_999, 10_000).withinTolerance).toBe(false);
    expect(chapterWordBudgetGap(11_001, 10_000).withinTolerance).toBe(false);
  });

  it("derives minTotal/maxTotal from CHAPTER_WORD_BUDGET_TOLERANCE", () => {
    const gap = chapterWordBudgetGap(50_000, 50_000);

    expect(gap.minTotal).toBe(Math.floor(50_000 * (1 - CHAPTER_WORD_BUDGET_TOLERANCE)));
    expect(gap.maxTotal).toBe(Math.ceil(50_000 * (1 + CHAPTER_WORD_BUDGET_TOLERANCE)));
  });

  it("reports a negative deviation when the total falls short", () => {
    const gap = chapterWordBudgetGap(40_000, 65_000);

    expect(gap.deviationWordCount).toBe(-25_000);
    expect(gap.withinTolerance).toBe(false);
  });
});

describe("adjustChapterCalibration", () => {
  const base = estimateChapterCalibration({ targetLength: "STANDARD" });

  it("returns an equivalent calibration when nothing is overridden", () => {
    expect(adjustChapterCalibration(base, {})).toEqual(base);
  });

  it("overrides only the chapter count", () => {
    expect(adjustChapterCalibration(base, { chapterCount: 30 })).toEqual({
      ...base,
      chapterCount: 30,
    });
  });

  it("overrides only the per-chapter target", () => {
    expect(adjustChapterCalibration(base, { chapterTargetWordCount: 4_000 })).toEqual({
      ...base,
      chapterTargetWordCount: 4_000,
    });
  });

  it("overrides both, and never the novel target", () => {
    expect(
      adjustChapterCalibration(base, { chapterCount: 50, chapterTargetWordCount: 1_200 }),
    ).toEqual({
      novelTargetWordCount: base.novelTargetWordCount,
      chapterCount: 50,
      chapterTargetWordCount: 1_200,
    });
  });

  // CAL-103's own point: a manual adjustment is not held inside the
  // estimate's own guarantee — pushing the chapter count up while keeping
  // the per-chapter target fixed can carry the total outside the 10% bar,
  // which is exactly what chapterWordBudgetGap exists to catch.
  it("composes with chapterWordBudgetGap to catch an adjustment that breaks the 10% bar", () => {
    const adjusted = adjustChapterCalibration(base, { chapterCount: 60 });
    const total = adjusted.chapterCount * adjusted.chapterTargetWordCount;
    const gap = chapterWordBudgetGap(total, base.novelTargetWordCount);

    expect(gap.withinTolerance).toBe(false);
  });

  it("composes with chapterWordBudgetGap to confirm a modest adjustment stays in bounds", () => {
    const adjusted = adjustChapterCalibration(base, { chapterCount: base.chapterCount + 1 });
    const total = adjusted.chapterCount * adjusted.chapterTargetWordCount;
    const gap = chapterWordBudgetGap(total, base.novelTargetWordCount);

    expect(gap.withinTolerance).toBe(true);
  });
});
