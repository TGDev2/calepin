import { describe, expect, it } from "vitest";

import { MODEL_IDS } from "./capabilities";
import { MISSION_REGISTRY } from "./mission-registry";
import { estimateCostUsd, MODEL_PRICING, sumCostUsd } from "./pricing";

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

describe("sumCostUsd", () => {
  it("sums nothing to zero, at the same precision", () => {
    expect(sumCostUsd([])).toBe("0.000000");
  });

  it("adds the six-decimal strings estimateCostUsd returns", () => {
    expect(sumCostUsd(["1.500000", "0.750000", "0.250000"])).toBe("2.500000");
  });

  it("carries across the decimal point", () => {
    expect(sumCostUsd(["0.600000", "0.600000"])).toBe("1.200000");
  });

  // The reason this function exists rather than `values.reduce((a, b) => a + Number(b))`:
  // a tenth of a cent added a thousand times is exactly one dollar here, and is
  // not in binary floating point. An estimate that disagrees with the sum of
  // the lines printed above it is an estimate a reader stops trusting.
  it("stays exact where floating point does not", () => {
    const thousandth = "0.001000";
    const values = Array.from({ length: 1_000 }, () => thousandth);

    expect(sumCostUsd(values)).toBe("1.000000");
    expect(sumCostUsd(["0.100000", "0.200000"])).toBe("0.300000");
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("refuses anything that did not come out of estimateCostUsd", () => {
    expect(() => sumCostUsd(["1.5"])).toThrow(TypeError);
    expect(() => sumCostUsd(["1.0000000"])).toThrow(TypeError);
    expect(() => sumCostUsd([""])).toThrow(TypeError);
  });
});
