import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "./app-error";
import { fromValidationIssues, toAppError, toFieldPath } from "./normalize";

describe("toAppError", () => {
  it("returns a typed error untouched", () => {
    const error = new NotFoundError();

    expect(toAppError(error)).toBe(error);
  });

  it("wraps anything else as a non-retryable internal error", () => {
    const wrapped = toAppError(new TypeError("boom"));

    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.category).toBe("internal");
    expect(wrapped.retryable).toBe(false);
  });

  it("never discards the cause", () => {
    const cause = new TypeError("boom");

    expect(toAppError(cause).cause).toBe(cause);
    expect(toAppError("a string was thrown").cause).toBe("a string was thrown");
    expect(toAppError(undefined).cause).toBeUndefined();
  });
});

describe("toFieldPath", () => {
  it("joins the segments of a path", () => {
    expect(toFieldPath(["chapters", 2, "title"])).toBe("chapters.2.title");
  });

  it("answers nothing for a root-level failure", () => {
    expect(toFieldPath([])).toBeUndefined();
  });
});

describe("fromValidationIssues", () => {
  it("builds a validation error from the path of the first issue", () => {
    const error = fromValidationIssues({
      issues: [{ path: ["characters", 0, "name"] }, { path: ["title"] }],
    });

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.category).toBe("validation");
    expect(error.fieldPath).toBe("characters.0.name");
  });

  it("handles an empty issue list", () => {
    expect(fromValidationIssues({ issues: [] }).fieldPath).toBeUndefined();
  });

  it("accepts a real validator's error shape structurally", () => {
    // A zod ZodError satisfies this without @calepin/shared importing zod.
    // The parameter type declares no `message`, which is the point: the bridge
    // cannot be written in a way that copies a validator message — the message
    // quotes the value that failed (CLAUDE.md §6).
    const zodLike = {
      issues: [{ code: "invalid_type", path: ["bible", "characters", 3], message: "irrelevant" }],
    };

    const error = fromValidationIssues(zodLike);

    expect(error.fieldPath).toBe("bible.characters.3");
    expect(error.message).toBe("VALIDATION_FAILED");
    expect(JSON.stringify(error.message)).not.toContain("irrelevant");
  });
});
