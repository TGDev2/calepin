/**
 * The estimator the budget gate leans on (CAL-054). The constant is pinned:
 * loosening it is a decision about §5.8, and it should fail a test rather than
 * pass a review unnoticed.
 */

import { describe, expect, it } from "vitest";

import { ESTIMATED_CHARS_PER_TOKEN, estimateTokens } from "./estimate";

describe("estimateTokens", () => {
  it("stays conservative: three characters per token, pinned", () => {
    // French prose measures ~3.5–4 characters per token on this model family;
    // dividing by 3 overestimates, and overestimating is the safe direction —
    // an underestimate ships an over-budget call the pipeline can only observe
    // once the tokens are spent.
    expect(ESTIMATED_CHARS_PER_TOKEN).toBe(3);
  });

  it("rounds up, so a fragment is never counted as free", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcd")).toBe(2);
    expect(estimateTokens("abcdef")).toBe(2);
  });

  it("counts nothing for an empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });
});
