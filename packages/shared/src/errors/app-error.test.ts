import { describe, expect, it } from "vitest";

import {
  AppError,
  ConflictError,
  ForbiddenError,
  InternalError,
  isAppError,
  NotFoundError,
  ProviderError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "./app-error";
import { ERROR_CATEGORIES, HTTP_STATUS_BY_CATEGORY, RETRYABLE_BY_CATEGORY } from "./categories";
import { CATEGORY_BY_CODE, ERROR_CODES } from "./codes";
import { USER_MESSAGES } from "./messages";

describe("the tables", () => {
  it.each(ERROR_CODES)("maps the code %s to a known category", (code) => {
    expect(ERROR_CATEGORIES).toContain(CATEGORY_BY_CODE[code]);
  });

  it.each(ERROR_CATEGORIES)(
    "gives the category %s a status, a default and a message",
    (category) => {
      expect(HTTP_STATUS_BY_CATEGORY[category]).toBeGreaterThanOrEqual(400);
      expect(typeof RETRYABLE_BY_CATEGORY[category]).toBe("boolean");
      expect(USER_MESSAGES[category].length).toBeGreaterThan(0);
    },
  );

  it("marks exactly the transient categories as retryable by default", () => {
    const retryable = ERROR_CATEGORIES.filter((category) => RETRYABLE_BY_CATEGORY[category]);

    expect(retryable).toEqual(["rate_limit", "provider", "timeout"]);
  });
});

describe("AppError", () => {
  it("derives its category from its code", () => {
    expect(new AppError("STALE_REVISION").category).toBe("conflict");
    expect(new AppError("UNAUTHENTICATED").category).toBe("forbidden");
  });

  it("takes the French message of its category when none is given", () => {
    expect(new AppError("TIMEOUT").userMessage).toBe(USER_MESSAGES.timeout);
  });

  it("lets an instance override the category default for retryability", () => {
    expect(new AppError("CONFLICT").retryable).toBe(false);
    expect(new AppError("CONFLICT", { retryable: true }).retryable).toBe(true);
  });

  it("defaults its technical message to the code, never to data", () => {
    expect(new AppError("NOT_FOUND").message).toBe("NOT_FOUND");
  });

  it("preserves the cause", () => {
    const cause = new Error("driver refused the connection");

    expect(new AppError("INTERNAL_ERROR", { cause }).cause).toBe(cause);
  });

  it("reports the subclass name", () => {
    expect(new NotFoundError().name).toBe("NotFoundError");
    expect(new AppError("NOT_FOUND").name).toBe("AppError");
  });

  it("is a real Error, so it can be thrown and caught", () => {
    expect(() => {
      throw new InternalError();
    }).toThrow(Error);
  });
});

describe("the subclasses", () => {
  it("each fix a category and a default code", () => {
    expect([
      new ValidationError(),
      new NotFoundError(),
      new ForbiddenError(),
      new ConflictError(),
      new RateLimitError(),
      new ProviderError(),
      new TimeoutError(),
      new InternalError(),
    ]).toEqual([
      expect.objectContaining({ code: "VALIDATION_FAILED", category: "validation" }),
      expect.objectContaining({ code: "NOT_FOUND", category: "not_found" }),
      expect.objectContaining({ code: "FORBIDDEN", category: "forbidden" }),
      expect.objectContaining({ code: "CONFLICT", category: "conflict" }),
      expect.objectContaining({ code: "RATE_LIMITED", category: "rate_limit" }),
      expect.objectContaining({ code: "PROVIDER_UNAVAILABLE", category: "provider" }),
      expect.objectContaining({ code: "TIMEOUT", category: "timeout" }),
      expect.objectContaining({ code: "INTERNAL_ERROR", category: "internal" }),
    ]);
  });

  it("accept a more specific code within their category", () => {
    const error = new ForbiddenError({ code: "UNAUTHENTICATED" });

    expect(error.code).toBe("UNAUTHENTICATED");
    expect(error.category).toBe("forbidden");
  });

  it("carry the limiter's delay on a rate limit", () => {
    expect(new RateLimitError({ retryAfterMs: 4500 }).retryAfterMs).toBe(4500);
    expect(new RateLimitError().retryAfterMs).toBeUndefined();
  });

  it("carry the path of the field that failed, on a validation error", () => {
    expect(new ValidationError({ fieldPath: "chapters.2.title" }).fieldPath).toBe(
      "chapters.2.title",
    );
  });
});

describe("isAppError", () => {
  it("recognises every subclass", () => {
    expect(
      [new ValidationError(), new ProviderError(), new AppError("TIMEOUT")].every(isAppError),
    ).toBe(true);
  });

  it("rejects anything else", () => {
    expect([new Error("boom"), "boom", null, undefined, 42, {}].some(isAppError)).toBe(false);
  });

  it("recognises an instance built from a second copy of the class", () => {
    // What `instanceof` would get wrong: apps/web compiles packages/* from
    // source into separate node, edge and client chunk graphs, so two copies of
    // AppError can coexist. The registry symbol is shared by all of them.
    const fromAnotherCopy = { [Symbol.for("calepin.AppError")]: true };

    expect(isAppError(fromAnotherCopy)).toBe(true);
  });
});
