import { describe, expect, it } from "vitest";

import { estimateChapterCalibration, resolveNovelTargetWordCount } from "./calibrate";
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
