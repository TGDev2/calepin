import { describe, expect, it } from "vitest";

import { INVALID_EVENT_NAME, isValidEventName, toEventName } from "./events";

describe("isValidEventName", () => {
  it.each([
    "app.started",
    "request.completed",
    "generation.failed",
    "log.invalid-event",
    "coherence.audit.finished",
    "export",
  ])("accepts %s", (event) => {
    expect(isValidEventName(event)).toBe(true);
  });

  it.each([
    "",
    " ",
    "Generation failed",
    "generation failed",
    "Generation.Failed",
    "generation.failed!",
    'wrote: "the door opened"',
    "généré",
    ".leading",
    "trailing.",
    "double..dot",
    "a".repeat(65),
  ])("rejects %j", (event) => {
    expect(isValidEventName(event)).toBe(false);
  });
});

describe("toEventName", () => {
  it("passes a valid name through", () => {
    expect(toEventName("generation.completed")).toBe("generation.completed");
  });

  it("replaces an invalid name rather than echoing it", () => {
    expect(toEventName("A sentence that could be a chapter title")).toBe(INVALID_EVENT_NAME);
  });

  it("emits a name that is itself valid", () => {
    expect(isValidEventName(INVALID_EVENT_NAME)).toBe(true);
  });
});
