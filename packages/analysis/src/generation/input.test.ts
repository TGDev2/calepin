/**
 * The ask of `analyze-source-text` (CAL-208).
 *
 * Small, and load-bearing out of proportion to its size: this object is what
 * `Generation.input` stores and what `generationIdempotencyKey` digests, so its
 * shape decides when two requests are one request.
 */

import { describe, expect, it } from "vitest";

import { analyzeSourceTextAsk, analyzeSourceTextInputSchema } from "./input";

describe("analyzeSourceTextInputSchema (CAL-208)", () => {
  it("names the source text version, and nothing else", () => {
    const parsed = analyzeSourceTextInputSchema.safeParse({ sourceTextVersionId: "version-1" });

    expect(parsed.success).toBe(true);
    expect(parsed.success && Object.keys(parsed.data)).toEqual(["sourceTextVersionId"]);
  });

  // Strict, so a caller cannot slip the project's language or its readership
  // into the ask. Both are columns the executor reads at run time; a copy in
  // the payload would be a second answer able to disagree with the project, and
  // it would reopen every analysis ask ever made the first time one was retuned.
  it("refuses a field the ask does not have", () => {
    const parsed = analyzeSourceTextInputSchema.safeParse({
      sourceTextVersionId: "version-1",
      targetAudience: "Grand public",
    });

    expect(parsed.success).toBe(false);
  });

  it("refuses an ask that names no version", () => {
    expect(analyzeSourceTextInputSchema.safeParse({}).success).toBe(false);
    expect(analyzeSourceTextInputSchema.safeParse({ sourceTextVersionId: "" }).success).toBe(false);
  });

  it("mints the payload a caller reserves with", () => {
    expect(analyzeSourceTextAsk("version-7")).toEqual({ sourceTextVersionId: "version-7" });
    expect(analyzeSourceTextInputSchema.safeParse(analyzeSourceTextAsk("version-7")).success).toBe(
      true,
    );
  });
});
