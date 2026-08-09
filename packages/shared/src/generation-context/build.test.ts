import { describe, expect, it } from "vitest";

import { buildGenerationContext } from "./build";

describe("buildGenerationContext", () => {
  // CAL-042's own acceptance criterion: the chosen language is present in
  // the context transmitted to a generation.
  it("carries the project's resolved language into the generation context", () => {
    const context = buildGenerationContext({
      language: "en",
      freedomLevel: "BALANCED",
      targetAudience: "Grand public",
    });

    expect(context).toHaveProperty("language", "en");
  });

  it("states exactly the language it was given, never a default", () => {
    expect(
      buildGenerationContext({
        language: "de",
        freedomLevel: "LOW",
        targetAudience: "Grand public",
      }).language,
    ).toBe("de");
    expect(
      buildGenerationContext({
        language: "fr",
        freedomLevel: "LOW",
        targetAudience: "Grand public",
      }).language,
    ).toBe("fr");
  });

  // CAL-044: the setting only has value if it reaches a generation, and this
  // is the seam every mission will read it from.
  it("carries the project's freedom level into the generation context", () => {
    expect(
      buildGenerationContext({
        language: "fr",
        freedomLevel: "HIGH",
        targetAudience: "Grand public",
      }).freedomLevel,
    ).toBe("HIGH");
    expect(
      buildGenerationContext({
        language: "fr",
        freedomLevel: "LOW",
        targetAudience: "Grand public",
      }).freedomLevel,
    ).toBe("LOW");
  });

  // CAL-045: the bible's style section will read this the same way a mission
  // reads freedomLevel — the context has to carry it first.
  it("carries the project's target audience into the generation context", () => {
    expect(
      buildGenerationContext({
        language: "fr",
        freedomLevel: "BALANCED",
        targetAudience: "Jeunes adultes",
      }).targetAudience,
    ).toBe("Jeunes adultes");
    expect(
      buildGenerationContext({
        language: "fr",
        freedomLevel: "BALANCED",
        targetAudience: "Amateurs de polar",
      }).targetAudience,
    ).toBe("Amateurs de polar");
  });
});
