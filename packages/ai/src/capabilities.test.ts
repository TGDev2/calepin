import { describe, expect, it } from "vitest";

import { MODEL_CAPABILITIES, MODEL_IDS, PROVIDER_IDS } from "./capabilities";

describe("the model capability sheet", () => {
  it("declares every model, and only the declared models", () => {
    expect(Object.keys(MODEL_CAPABILITIES).sort()).toEqual([...MODEL_IDS].sort());
  });

  it.each(MODEL_IDS)("%s is internally consistent", (modelId) => {
    const capability = MODEL_CAPABILITIES[modelId];

    expect(capability.id).toBe(modelId);
    expect(PROVIDER_IDS).toContain(capability.provider);
    expect(capability.label.length).toBeGreaterThan(0);
    expect(capability.contextWindowTokens).toBeGreaterThan(0);
    expect(capability.maxOutputTokens).toBeGreaterThan(0);
    // A response is part of the exchange: it can never exceed the window.
    expect(capability.maxOutputTokens).toBeLessThanOrEqual(capability.contextWindowTokens);
  });
});
