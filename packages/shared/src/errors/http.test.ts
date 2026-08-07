import { describe, expect, it } from "vitest";

import {
  AppError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "./app-error";
import { ERROR_CATEGORIES } from "./categories";
import { httpStatusFor, retryAfterSecondsFor, toErrorPayload } from "./http";
import { USER_MESSAGES } from "./messages";

const CODE_PER_CATEGORY = {
  validation: "VALIDATION_FAILED",
  not_found: "NOT_FOUND",
  forbidden: "FORBIDDEN",
  conflict: "CONFLICT",
  rate_limit: "RATE_LIMITED",
  provider: "PROVIDER_UNAVAILABLE",
  timeout: "TIMEOUT",
  internal: "INTERNAL_ERROR",
} as const;

describe("httpStatusFor", () => {
  it("maps every category", () => {
    const statuses = ERROR_CATEGORIES.map((category) =>
      httpStatusFor(new AppError(CODE_PER_CATEGORY[category])),
    );

    expect(statuses).toEqual([400, 404, 403, 409, 429, 503, 504, 500]);
  });

  it("lets UNAUTHENTICATED answer 401 while staying in the forbidden category", () => {
    const error = new ForbiddenError({ code: "UNAUTHENTICATED" });

    expect(error.category).toBe("forbidden");
    expect(httpStatusFor(error)).toBe(401);
    expect(httpStatusFor(new ForbiddenError())).toBe(403);
  });

  it("answers 500 for anything that is not an AppError", () => {
    expect(httpStatusFor(new Error("boom"))).toBe(500);
    expect(httpStatusFor("boom")).toBe(500);
    expect(httpStatusFor(undefined)).toBe(500);
  });
});

describe("retryAfterSecondsFor", () => {
  it("rounds the limiter's delay up to whole seconds", () => {
    expect(retryAfterSecondsFor(new RateLimitError({ retryAfterMs: 4500 }))).toBe(5);
  });

  it("never answers zero, so a client always waits", () => {
    expect(retryAfterSecondsFor(new RateLimitError({ retryAfterMs: 1 }))).toBe(1);
    expect(retryAfterSecondsFor(new RateLimitError({ retryAfterMs: 0 }))).toBe(1);
  });

  it("answers nothing when there is no delay to report", () => {
    expect(retryAfterSecondsFor(new RateLimitError())).toBeUndefined();
    expect(retryAfterSecondsFor(new NotFoundError())).toBeUndefined();
    expect(retryAfterSecondsFor(new Error("boom"))).toBeUndefined();
  });

  it("ignores a nonsensical delay", () => {
    expect(retryAfterSecondsFor(new RateLimitError({ retryAfterMs: -1 }))).toBeUndefined();
    expect(retryAfterSecondsFor(new RateLimitError({ retryAfterMs: Number.NaN }))).toBeUndefined();
  });
});

describe("toErrorPayload", () => {
  it("carries the French message, the code and the category", () => {
    expect(toErrorPayload(new NotFoundError())).toEqual({
      code: "NOT_FOUND",
      category: "not_found",
      message: USER_MESSAGES.not_found,
    });
  });

  it("includes the correlation id only when there is one", () => {
    expect(toErrorPayload(new NotFoundError(), "abc-123")).toMatchObject({
      correlationId: "abc-123",
    });
    expect(toErrorPayload(new NotFoundError())).not.toHaveProperty("correlationId");
  });

  it("turns an unknown throw into the internal payload", () => {
    expect(toErrorPayload(new TypeError("cannot read properties of undefined"))).toEqual({
      code: "INTERNAL_ERROR",
      category: "internal",
      message: USER_MESSAGES.internal,
    });
  });

  it("omits the field path, which names a field the reader never asked about", () => {
    const payload = toErrorPayload(new ValidationError({ fieldPath: "chapters.2.title" }));

    expect(payload).not.toHaveProperty("fieldPath");
    expect(JSON.stringify(payload)).not.toContain("chapters");
  });

  it("survives JSON serialisation unchanged — it crosses to a client", () => {
    const payload = toErrorPayload(new RateLimitError(), "abc-123");

    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});
