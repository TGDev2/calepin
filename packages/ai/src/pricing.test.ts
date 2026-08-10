import { describe, expect, it } from "vitest";

import { MODEL_IDS } from "./capabilities";
import { MISSION_REGISTRY } from "./mission-registry";
import { estimateCostUsd, MODEL_PRICING } from "./pricing";

describe("the model tariff table", () => {
  it("prices every model, and only the declared models", () => {
    expect(Object.keys(MODEL_PRICING).sort()).toEqual([...MODEL_IDS].sort());
  });

  it.each(MODEL_IDS)("%s is internally consistent", (modelId) => {
    const pricing = MODEL_PRICING[modelId];

    expect(pricing.model).toBe(modelId);
    expect(pricing.inputUsdPerMillionTokens).toBeGreaterThan(0);
    expect(pricing.outputUsdPerMillionTokens).toBeGreaterThan(0);
  });
});

describe("estimateCostUsd", () => {
  it("prices zero usage at zero", () => {
    expect(estimateCostUsd("claude-sonnet-5", { inputTokens: 0, outputTokens: 0 })).toBe(
      "0.000000",
    );
  });

  it("prices one million input and one million output tokens at the declared rate", () => {
    expect(
      estimateCostUsd("claude-sonnet-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ).toBe("18.000000");
  });

  it("rounds to the schema's own precision, six decimal places", () => {
    expect(estimateCostUsd("claude-sonnet-5", { inputTokens: 100, outputTokens: 0 })).toBe(
      "0.000300",
    );
  });

  it("scales linearly with usage", () => {
    const single = estimateCostUsd("claude-opus-5", { inputTokens: 10_000, outputTokens: 2_000 });
    const doubled = estimateCostUsd("claude-opus-5", {
      inputTokens: 20_000,
      outputTokens: 4_000,
    });

    expect(Number(doubled)).toBeCloseTo(Number(single) * 2, 6);
  });

  it("prices a Bedrock model the same as its direct-API counterpart", () => {
    const usage = { inputTokens: 5_000, outputTokens: 1_000 };

    expect(estimateCostUsd("anthropic.claude-opus-5", usage)).toBe(
      estimateCostUsd("claude-opus-5", usage),
    );
  });

  it("prices every mission's expected usage without throwing, on both its models", () => {
    for (const mission of Object.values(MISSION_REGISTRY)) {
      expect(() => estimateCostUsd(mission.model, mission.expectedUsage)).not.toThrow();
      expect(() => estimateCostUsd(mission.fallbackModel, mission.expectedUsage)).not.toThrow();
    }
  });
});
