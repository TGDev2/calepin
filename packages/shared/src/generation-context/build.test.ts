import { describe, expect, it } from "vitest";

import { buildGenerationContext } from "./build";

describe("buildGenerationContext", () => {
  // CAL-042's own acceptance criterion: the chosen language is present in
  // the context transmitted to a generation.
  it("carries the project's resolved language into the generation context", () => {
    const context = buildGenerationContext({ language: "en" });

    expect(context).toHaveProperty("language", "en");
  });

  it("states exactly the language it was given, never a default", () => {
    expect(buildGenerationContext({ language: "de" }).language).toBe("de");
    expect(buildGenerationContext({ language: "fr" }).language).toBe("fr");
  });
});
