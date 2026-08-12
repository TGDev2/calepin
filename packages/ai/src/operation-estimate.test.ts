import { describe, expect, it } from "vitest";

import { MISSION_REGISTRY } from "./mission-registry";
import {
  acceptOperationEstimate,
  estimateOperation,
  isAcceptedOperationEstimate,
  type MissionMeasurement,
  type OperationAcknowledgement,
  type OperationEstimate,
  type OperationEstimateInput,
} from "./operation-estimate";
import { COSTLY_OPERATION_IDS, COSTLY_OPERATION_REGISTRY } from "./operations";
import { estimateCostUsd, sumCostUsd } from "./pricing";

function estimate(input: OperationEstimateInput): OperationEstimate {
  const result = estimateOperation(input);

  if (!result.ok) throw new Error(`the estimate was refused with ${result.error.code}`);

  return result.value;
}

function acknowledgementOf(value: OperationEstimate): OperationAcknowledgement {
  return {
    operation: value.operation,
    unitCount: value.unitCount,
    costUsd: value.costUsd,
    durationMs: value.durationMs,
  };
}

describe("estimateOperation without history", () => {
  it.each(COSTLY_OPERATION_IDS)("falls back on what %s is declared to cost", (operationId) => {
    const value = estimate({ operation: operationId, unitCount: 1 });
    const definition = COSTLY_OPERATION_REGISTRY[operationId];

    expect(value.basis).toBe("theoretical");
    expect(value.phases).toHaveLength(definition.phases.length);

    for (const phase of value.phases) {
      const mission = MISSION_REGISTRY[phase.mission];

      expect(phase.basis).toBe("theoretical");
      expect(phase.sampleCount).toBe(0);
      // A phase's figures total over its calls — `build-chapter-outline`
      // runs once per part (CAL-102), so one unit is already several calls.
      expect(phase.usage).toEqual({
        inputTokens: mission.expectedUsage.inputTokens * phase.callCount,
        outputTokens: mission.expectedUsage.outputTokens * phase.callCount,
      });
      expect(phase.durationMs).toBe(mission.expectedDurationMs * phase.callCount);
    }
  });

  it.each(COSTLY_OPERATION_IDS)("totals %s from its own phases", (operationId) => {
    const value = estimate({ operation: operationId, unitCount: 1 });

    expect(value.costUsd).toBe(sumCostUsd(value.phases.map((phase) => phase.costUsd)));
    expect(value.durationMs).toBe(
      value.phases.reduce((total, phase) => total + phase.durationMs, 0),
    );
    expect(value.usage.inputTokens).toBe(
      value.phases.reduce((total, phase) => total + phase.usage.inputTokens, 0),
    );
    expect(value.callCount).toBe(value.phases.reduce((total, phase) => total + phase.callCount, 0));
  });

  /**
   * The requirement CAL-057 exists for, as arithmetic rather than a claim: the
   * calls nobody reads the answer of cost more than the one that writes the
   * chapter. An estimate read off the words produced would understate a
   * chapter by more than half.
   */
  it("charges more for reading and checking a chapter than for writing it", () => {
    const value = estimate({ operation: "write-chapter", unitCount: 1 });

    const costOf = (kind: string): string =>
      sumCostUsd(value.phases.filter((phase) => phase.kind === kind).map((phase) => phase.costUsd));

    const production = costOf("production");
    const around = sumCostUsd([costOf("analysis"), costOf("control")]);

    expect(Number(around)).toBeGreaterThan(Number(production));
    expect(Number(production)).toBeGreaterThan(0);
  });

  it("scales a per-chapter operation by the number of chapters", () => {
    const one = estimate({ operation: "audit-manuscript", unitCount: 1 });
    const four = estimate({ operation: "audit-manuscript", unitCount: 4 });

    expect(four.callCount).toBe(one.callCount * 4);
    expect(four.durationMs).toBe(one.durationMs * 4);
    expect(four.usage.inputTokens).toBe(one.usage.inputTokens * 4);
    expect(four.costUsd).toBe(sumCostUsd([one.costUsd, one.costUsd, one.costUsd, one.costUsd]));
  });

  it("refuses a number of units that is not a whole number of at least one", () => {
    for (const unitCount of [0, -1, 1.5, Number.NaN]) {
      const refused = estimateOperation({ operation: "write-chapter", unitCount });

      expect(refused.ok).toBe(false);
      if (refused.ok) throw new Error("an impossible unit count was accepted");
      expect(refused.error.code).toBe("VALIDATION_FAILED");
    }
  });

  // Two plans of one project are two operations, each confirmed on its own.
  it("refuses to multiply a whole-project operation", () => {
    const refused = estimateOperation({ operation: "generate-outline", unitCount: 2 });

    expect(refused.ok).toBe(false);
  });
});

describe("estimateOperation with history", () => {
  const measuredWriteScene: MissionMeasurement = {
    mission: "write-scene",
    sampleCount: 4,
    inputTokens: 51_000,
    outputTokens: 9_000,
    durationMs: 412_000,
  };

  it("prefers what this project measured over what the registry expects", () => {
    const value = estimate({
      operation: "write-chapter",
      unitCount: 1,
      measurements: [measuredWriteScene],
    });

    const written = value.phases.find((phase) => phase.mission === "write-scene");

    expect(written?.basis).toBe("measured");
    expect(written?.sampleCount).toBe(4);
    expect(written?.usage).toEqual({ inputTokens: 51_000, outputTokens: 9_000 });
    expect(written?.durationMs).toBe(412_000);

    // The measurement is heavier on input and lighter on output than the
    // declaration, so this is not the number the fallback would have given.
    expect(written?.costUsd).not.toBe(
      estimateCostUsd(
        MISSION_REGISTRY["write-scene"].model,
        MISSION_REGISTRY["write-scene"].expectedUsage,
      ),
    );
  });

  it("says so when only some of the phases are measured", () => {
    const value = estimate({
      operation: "write-chapter",
      unitCount: 1,
      measurements: [measuredWriteScene],
    });

    expect(value.basis).toBe("mixed");
    expect(value.phases.filter((phase) => phase.basis === "measured")).toHaveLength(1);
  });

  it("says measured only when every phase is", () => {
    const value = estimate({
      operation: "audit-manuscript",
      unitCount: 2,
      measurements: [
        {
          mission: "check-coherence",
          sampleCount: 9,
          inputTokens: 33_000,
          outputTokens: 7_000,
          durationMs: 250_000,
        },
      ],
    });

    expect(value.basis).toBe("measured");
    expect(value.usage).toEqual({ inputTokens: 66_000, outputTokens: 14_000 });
    expect(value.durationMs).toBe(500_000);
  });

  // A row with no generations behind it is not a measurement, whatever else it
  // carries — a median over nothing is not a number to quote a price from.
  it("ignores a measurement with no sample behind it", () => {
    const value = estimate({
      operation: "audit-manuscript",
      unitCount: 1,
      measurements: [
        {
          mission: "check-coherence",
          sampleCount: 0,
          inputTokens: 1,
          outputTokens: 1,
          durationMs: 1,
        },
      ],
    });

    expect(value.basis).toBe("theoretical");
  });

  it("ignores a measurement for a mission this operation does not run", () => {
    const value = estimate({
      operation: "audit-manuscript",
      unitCount: 1,
      measurements: [measuredWriteScene],
    });

    expect(value.basis).toBe("theoretical");
  });
});

describe("acceptOperationEstimate", () => {
  const value = estimate({ operation: "write-chapter", unitCount: 2 });

  it("accepts the estimate that was shown", () => {
    const accepted = acceptOperationEstimate(value, acknowledgementOf(value));

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error("a matching acknowledgement was refused");
    expect(accepted.value.estimate).toBe(value);
    expect(isAcceptedOperationEstimate(accepted.value)).toBe(true);
  });

  it.each([
    ["operation", { operation: "regenerate-chapter" }],
    ["unitCount", { unitCount: 3 }],
    ["costUsd", { costUsd: "0.000001" }],
    ["durationMs", { durationMs: 1 }],
  ] as const)("refuses an acknowledgement whose %s is not the estimate's", (_field, difference) => {
    const refused = acceptOperationEstimate(value, {
      ...acknowledgementOf(value),
      ...difference,
    });

    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("a mismatched acknowledgement was accepted");
    expect(refused.error.code).toBe("OPERATION_NOT_CONFIRMED");
    expect(refused.error.category).toBe("conflict");
  });

  /**
   * The brand is the whole mechanism: an object shaped like an accepted
   * estimate — one that crossed JSON, one a caller built to skip the screen —
   * is not one, and the guard is what a launch checks. Same discipline as
   * `ProjectScope`.
   */
  it("does not recognise an object that merely looks accepted", () => {
    expect(isAcceptedOperationEstimate({ estimate: value })).toBe(false);
    expect(isAcceptedOperationEstimate(JSON.parse(JSON.stringify({ estimate: value })))).toBe(
      false,
    );
    expect(isAcceptedOperationEstimate(null)).toBe(false);
    expect(isAcceptedOperationEstimate(undefined)).toBe(false);
  });
});
