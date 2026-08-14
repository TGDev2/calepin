import { describe, expect, it } from "vitest";

import { CUSTOM_TARGET_WORD_COUNT_RANGE, TARGET_LENGTH_RANGES } from "./ranges";
import { resolveNovelTargetWordCount } from "./resolve";
import { TARGET_LENGTHS } from "./types";

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

  it("resolves every preset inside its own range", () => {
    for (const targetLength of TARGET_LENGTHS) {
      if (targetLength === "CUSTOM") continue;

      const range = TARGET_LENGTH_RANGES[targetLength];
      const resolved = resolveNovelTargetWordCount({ targetLength });

      expect(resolved).toBeGreaterThanOrEqual(range.min);
      expect(resolved).toBeLessThanOrEqual(range.max);
    }
  });

  it("keeps every preset inside the bounds a custom choice must respect", () => {
    for (const targetLength of TARGET_LENGTHS) {
      if (targetLength === "CUSTOM") continue;

      const resolved = resolveNovelTargetWordCount({ targetLength });

      expect(resolved).toBeGreaterThanOrEqual(CUSTOM_TARGET_WORD_COUNT_RANGE.min);
      expect(resolved).toBeLessThanOrEqual(CUSTOM_TARGET_WORD_COUNT_RANGE.max);
    }
  });
});
