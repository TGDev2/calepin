import { describe, expect, it } from "vitest";

import { InternalError, ProviderError, ValidationError } from "./app-error";
import { errorLogFields } from "./log-fields";

describe("errorLogFields", () => {
  it("reports the code, the category and the field path", () => {
    const fields = errorLogFields(new ValidationError({ fieldPath: "chapters.2.title" }));

    expect(fields).toMatchObject({
      errorCode: "VALIDATION_FAILED",
      errorCategory: "validation",
      fieldPath: "chapters.2.title",
    });
  });

  it("never reports a message, under any key", () => {
    const fields = errorLogFields(new ProviderError({ message: "MODEL_REFUSED_THE_REQUEST" }));

    expect(Object.keys(fields)).not.toContain("errorMessage");
    expect(JSON.stringify(fields)).not.toContain("MODEL_REFUSED_THE_REQUEST");
  });

  it("classifies an untyped throw as internal", () => {
    expect(errorLogFields("a string was thrown")).toMatchObject({
      errorCode: "INTERNAL_ERROR",
      errorCategory: "internal",
    });
  });

  describe("the stack", () => {
    it("keeps location frames", () => {
      const fields = errorLogFields(new InternalError({ cause: new TypeError("boom") }));

      expect(fields.errorStack).toBeDefined();
      expect(fields.errorStack).toMatch(/:\d+:\d+/);
    });

    it("drops the first line, which is 'Name: message'", () => {
      const error = new ProviderError({ message: "SENTINEL_MESSAGE_ONE" });

      expect(error.stack).toContain("SENTINEL_MESSAGE_ONE");
      expect(errorLogFields(error).errorStack ?? "").not.toContain("SENTINEL_MESSAGE_ONE");
    });

    it("drops a multi-line message even when its lines look like frames", () => {
      // The exact shape a naive startsWith("at ") filter would let through.
      const error = new Error("failed\n    at the third paragraph SENTINEL_MESSAGE_TWO");
      error.stack = `Error: failed\n    at the third paragraph SENTINEL_MESSAGE_TWO\n    at buildContext (C:\\src\\context.ts:12:34)`;

      const stack = errorLogFields(error).errorStack ?? "";

      expect(stack).not.toContain("SENTINEL_MESSAGE_TWO");
      expect(stack).toContain("buildContext");
    });

    it("walks the cause chain, so the real fault's frames survive the wrapping", () => {
      const root = new Error("root");
      root.stack = "Error: root\n    at driverCall (C:\\src\\driver.ts:1:1)";

      const stack = errorLogFields(new InternalError({ cause: root })).errorStack ?? "";

      expect(stack).toContain("driverCall");
    });

    it("stays bounded", () => {
      const error = new Error("deep");
      error.stack = [
        "Error: deep",
        ...Array.from({ length: 200 }, (_, i) => `    at f (C:\\a.ts:${i}:1)`),
      ].join("\n");

      const stack = errorLogFields(error).errorStack ?? "";

      expect(stack.split(" | ")).toHaveLength(20);
      expect(stack.length).toBeLessThanOrEqual(2000);
    });

    it("answers nothing when there is no stack at all", () => {
      const error = new ProviderError();
      // Node gives every Error a stack; a value coming back from a worker
      // thread or a structured clone may not have one.
      delete (error as { stack?: string }).stack;

      expect(errorLogFields(error).errorStack).toBeUndefined();
    });

    it("does not start with this module's own frames when it wraps a throw", () => {
      const thrown = new TypeError("boom");

      const stack = errorLogFields(thrown).errorStack ?? "";

      expect(stack).not.toContain("log-fields.ts");
      expect(stack).not.toContain("normalize.ts");
    });
  });

  describe("errorName", () => {
    it("reports the underlying fault's type rather than the wrapper's", () => {
      // errorCode and errorCategory already describe the AppError; errorName is
      // the only channel left for what actually broke.
      expect(errorLogFields(new InternalError({ cause: new TypeError("boom") })).errorName).toBe(
        "TypeError",
      );
    });

    it("reports the typed error's own name when it wraps nothing", () => {
      expect(errorLogFields(new ProviderError()).errorName).toBe("ProviderError");
    });
  });
});
