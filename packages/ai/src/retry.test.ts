import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ProviderError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "@calepin/shared/errors";
import { describe, expect, it } from "vitest";

import { isFallbackEligible, retryDelayMs, type RetryPolicy } from "./retry";

const POLICY: RetryPolicy = { maxAttemptsPerModel: 3, baseDelayMs: 500, maxDelayMs: 30_000 };

describe("isFallbackEligible", () => {
  // Only a provider-side failure is the backup model's problem to solve.
  it.each([
    ["provider", new ProviderError()],
    ["timeout", new TimeoutError()],
    ["rate_limit", new RateLimitError()],
  ] as const)("a %s failure moves to the backup model", (_category, error) => {
    expect(isFallbackEligible(error)).toBe(true);
  });

  it.each([
    ["validation", new ValidationError()],
    ["not_found", new NotFoundError()],
    ["forbidden", new ForbiddenError()],
    ["conflict", new ConflictError()],
    ["internal", new InternalError()],
  ] as const)("a %s failure does not", (_category, error) => {
    expect(isFallbackEligible(error)).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("doubles per attempt", () => {
    const full = (): number => 1;

    expect(retryDelayMs(new ProviderError(), 1, POLICY, full)).toBe(500);
    expect(retryDelayMs(new ProviderError(), 2, POLICY, full)).toBe(1000);
    expect(retryDelayMs(new ProviderError(), 3, POLICY, full)).toBe(2000);
  });

  it("jitters the whole window down to zero", () => {
    expect(retryDelayMs(new ProviderError(), 2, POLICY, () => 0.5)).toBe(500);
    expect(retryDelayMs(new ProviderError(), 2, POLICY, () => 0)).toBe(0);
  });

  it("treats the provider's retryAfterMs as a floor", () => {
    const limited = new RateLimitError({ retryAfterMs: 4000 });

    expect(retryDelayMs(limited, 1, POLICY, () => 0)).toBe(4000);
  });

  it("caps every wait, the provider's own included", () => {
    const limited = new RateLimitError({ retryAfterMs: 90_000 });

    expect(retryDelayMs(limited, 1, POLICY, () => 0)).toBe(30_000);
    expect(retryDelayMs(new ProviderError(), 10, POLICY, () => 1)).toBe(30_000);
  });

  it("ignores a malformed retryAfterMs", () => {
    const limited = new RateLimitError({ retryAfterMs: Number.NaN });

    expect(retryDelayMs(limited, 1, POLICY, () => 1)).toBe(500);
  });
});
