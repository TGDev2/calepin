import { describe, expect, it } from "vitest";

import { AppError, RateLimitError, ValidationError } from "./app-error";
import { ERROR_CATEGORIES, type ErrorCategory } from "./categories";
import { toErrorPayload } from "./http";
import { USER_MESSAGES } from "./messages";

/**
 * The test CAL-010 exists for, on the user's side of the wall.
 *
 * CLAUDE.md §7: *the user sees `userMessage`, in French, and nothing else. No
 * stack trace, no provider payload, no SQL, no field name from the schema.* Its
 * sibling `logging/no-literary-content.test.ts` guards the other side — that no
 * prose reaches a log. Between them, both directions are closed.
 *
 * The stand-in for technical detail is a marker. Every place a real leak could
 * come from gets one.
 */
const TECHNICAL_MARKER = "TECHNICAL-MARKER-4be71c02";

const CODE_PER_CATEGORY = {
  validation: "VALIDATION_FAILED",
  not_found: "NOT_FOUND",
  forbidden: "FORBIDDEN",
  conflict: "CONFLICT",
  rate_limit: "RATE_LIMITED",
  provider: "PROVIDER_UNAVAILABLE",
  timeout: "TIMEOUT",
  internal: "INTERNAL_ERROR",
} as const satisfies Record<ErrorCategory, string>;

/** Everything a payload built by hand would plausibly have carried across. */
function loadedWithTechnicalDetail(category: ErrorCategory): AppError {
  return new AppError(CODE_PER_CATEGORY[category], {
    message: `${TECHNICAL_MARKER} at packages/bible/src/canon.ts`,
    fieldPath: `characters.0.${TECHNICAL_MARKER}`,
    cause: new Error(`ECONNREFUSED ${TECHNICAL_MARKER} 127.0.0.1:5432`),
  });
}

describe("the payload a client receives", () => {
  it.each(ERROR_CATEGORIES)("leaks nothing technical for the category %s", (category) => {
    const payload = toErrorPayload(loadedWithTechnicalDetail(category), "abc-123");

    expect(JSON.stringify(payload)).not.toContain(TECHNICAL_MARKER);
  });

  it.each(ERROR_CATEGORIES)("says something in French for the category %s", (category) => {
    expect(toErrorPayload(new AppError(CODE_PER_CATEGORY[category])).message).toBe(
      USER_MESSAGES[category],
    );
  });

  it("has exactly four possible keys, so a new field cannot ride along unnoticed", () => {
    const keys = Object.keys(toErrorPayload(loadedWithTechnicalDetail("provider"), "abc-123"));

    expect(keys.sort()).toEqual(["category", "code", "correlationId", "message"]);
  });

  it("carries no stack, however deep the cause chain", () => {
    const deep = new AppError("INTERNAL_ERROR", {
      cause: new Error("outer", { cause: new Error(`inner ${TECHNICAL_MARKER}`) }),
    });

    const serialised = JSON.stringify(toErrorPayload(deep));

    expect(serialised).not.toContain(TECHNICAL_MARKER);
    expect(serialised).not.toContain("at ");
  });

  it("carries no field path, even when the error was built for a form", () => {
    const payload = toErrorPayload(new ValidationError({ fieldPath: `bible.${TECHNICAL_MARKER}` }));

    expect(JSON.stringify(payload)).not.toContain(TECHNICAL_MARKER);
  });

  it("carries no operational detail such as a retry delay", () => {
    // Not secret, but not the reader's business either: the payload is closed,
    // and reopening it is a decision, not an oversight.
    expect(toErrorPayload(new RateLimitError({ retryAfterMs: 4500 }))).not.toHaveProperty(
      "retryAfterMs",
    );
  });

  it("is a plain object — React refuses to serialise a class instance", () => {
    const payload = toErrorPayload(new ValidationError());

    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);
    expect(payload).not.toBeInstanceOf(Error);
  });
});
