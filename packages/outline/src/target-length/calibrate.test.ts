import { describe, expect, it } from "vitest";

import {
  estimateChapterCalibration,
  estimatePartCalibration,
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
