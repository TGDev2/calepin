import { describe, expect, it } from "vitest";

import { LOG_FIELD_KEYS, type LogFields, pickLogFields } from "./fields";

describe("pickLogFields", () => {
  it("keeps allowlisted primitives", () => {
    const picked = pickLogFields({
      correlationId: "corr-1",
      inputTokens: 1_200,
      durationMs: 843,
      attempt: 2,
    });

    expect(picked).toEqual({
      correlationId: "corr-1",
      inputTokens: 1_200,
      durationMs: 843,
      attempt: 2,
    });
  });

  it("returns an empty object for undefined", () => {
    expect(pickLogFields(undefined)).toEqual({});
  });

  it("skips undefined and null values instead of emitting them", () => {
    const picked = pickLogFields({
      projectId: "project-1",
      generationId: undefined,
      missionId: null,
    } as unknown as LogFields);

    expect(picked).toEqual({ projectId: "project-1" });
  });

  it("drops non-finite numbers", () => {
    const picked = pickLogFields({ durationMs: Number.NaN, byteCount: Number.POSITIVE_INFINITY });

    expect(picked).toEqual({});
  });

  it("iterates the allowlist, not the input", () => {
    // A getter on an unknown key would run if the input were enumerated.
    let touched = false;
    const hostile = {
      generationId: "gen-1",
      get sourceText(): string {
        touched = true;
        return "unreachable";
      },
    };

    const picked = pickLogFields(hostile as unknown as LogFields);

    expect(touched).toBe(false);
    expect(picked).toEqual({ generationId: "gen-1" });
  });

  it("applies the value redactor to strings only", () => {
    const picked = pickLogFields(
      { errorStack: "at pg://user:pw@host", attempt: 3 },
      () => "[masked]",
    );

    expect(picked).toEqual({ errorStack: "[masked]", attempt: 3 });
  });
});

describe("LOG_FIELD_KEYS", () => {
  it("carries no field capable of holding prose", () => {
    // `errorMessage` is the one that keeps getting proposed: a validation
    // message quotes the value that failed (CLAUDE.md §6). `fieldPath` is the
    // allowed substitute.
    expect(LOG_FIELD_KEYS).not.toContain("errorMessage");
    expect(LOG_FIELD_KEYS).toContain("fieldPath");
  });

  it("covers the identifiers CLAUDE.md §9 says to log instead", () => {
    for (const key of [
      "correlationId",
      "projectId",
      "generationId",
      "missionId",
      "promptId",
      "promptVersion",
      "model",
      "inputTokens",
      "outputTokens",
      "durationMs",
      "attempt",
      "errorCode",
      "errorCategory",
      "wordCount",
      "byteCount",
      "fieldPath",
    ] as const) {
      expect(LOG_FIELD_KEYS).toContain(key);
    }
  });
});
