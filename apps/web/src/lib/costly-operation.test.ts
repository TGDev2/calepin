import { MISSION_IDS } from "@calepin/ai";
import { describe, expect, it } from "vitest";

import {
  costlyOperationLabel,
  formatEstimatedCost,
  formatEstimatedDuration,
  GENERATION_MISSION_BY_MISSION_ID,
  MISSION_ID_BY_GENERATION_MISSION,
  operationEstimateBasisLabel,
  operationScaleLabel,
  readOperationAcknowledgement,
  toMissionMeasurements,
} from "./costly-operation";

/** The twelve the Prisma enum declares, in its own spelling. */
const GENERATION_MISSIONS = Object.keys(MISSION_ID_BY_GENERATION_MISSION);

function acknowledgementForm(fields: Record<string, string>): FormData {
  const formData = new FormData();

  for (const [name, value] of Object.entries(fields)) formData.set(name, value);

  return formData;
}

describe("the mission spelling table", () => {
  // The one place the schema's spelling and the AI layer's meet. A mission
  // added to one and not the other fails here rather than at a call site.
  it("maps every schema mission onto a mission the AI layer knows", () => {
    expect(Object.values(MISSION_ID_BY_GENERATION_MISSION).sort()).toEqual([...MISSION_IDS].sort());
  });

  it("reads back the other way for every mission", () => {
    expect(Object.keys(GENERATION_MISSION_BY_MISSION_ID).sort()).toEqual([...MISSION_IDS].sort());

    for (const mission of GENERATION_MISSIONS) {
      const id =
        MISSION_ID_BY_GENERATION_MISSION[mission as keyof typeof MISSION_ID_BY_GENERATION_MISSION];

      expect(GENERATION_MISSION_BY_MISSION_ID[id]).toBe(mission);
    }
  });

  it("restates a recorded measurement in the spelling the estimator takes", () => {
    expect(
      toMissionMeasurements([
        {
          mission: "WRITE_SCENE",
          sampleCount: 3,
          inputTokens: 31_000,
          outputTokens: 9_000,
          durationMs: 240_000,
        },
      ]),
    ).toEqual([
      {
        mission: "write-scene",
        sampleCount: 3,
        inputTokens: 31_000,
        outputTokens: 9_000,
        durationMs: 240_000,
      },
    ]);
  });
});

describe("the French of an estimate", () => {
  it("names each operation without committing to a number of chapters", () => {
    expect(costlyOperationLabel("generate-outline")).toBe("Génération du plan");
    expect(costlyOperationLabel("write-chapter")).toBe("Rédaction de chapitre");
    expect(costlyOperationLabel("regenerate-chapter")).toBe("Régénération de chapitre");
    expect(costlyOperationLabel("audit-manuscript")).toBe("Audit de cohérence");
  });

  // French keeps the singular for zero and for one, so the rule is `count > 1`.
  it("agrees the scale in number", () => {
    expect(operationScaleLabel("chapter", 1)).toBe("1 chapitre");
    expect(operationScaleLabel("chapter", 12)).toBe("12 chapitres");
    expect(operationScaleLabel("project", 1)).toBe("l'ensemble du projet");
  });

  it("says where the number comes from", () => {
    expect(operationEstimateBasisLabel("measured")).toContain("vos générations précédentes");
    expect(operationEstimateBasisLabel("theoretical")).toContain("référence");
    expect(operationEstimateBasisLabel("mixed")).toContain("en partie");
  });
});

describe("formatEstimatedCost", () => {
  it("shows a cost in dollars, to the cent", () => {
    // Which space fr-FR puts before the symbol — no-break or narrow no-break —
    // has moved between ICU versions, so the assertion is on the format and
    // not on the runtime's spacing.
    expect(formatEstimatedCost("2.904000")).toMatch(/^2,90\s\$US$/u);
  });

  // Rounding a real cost down to nothing is how a screen teaches its reader
  // that the estimate is not worth reading.
  it("never shows something that costs money as free", () => {
    expect(formatEstimatedCost("0.000300")).toContain("moins de");
    expect(formatEstimatedCost("0.009999")).toContain("moins de");
  });

  it("shows a free operation as free", () => {
    expect(formatEstimatedCost("0.000000")).not.toContain("moins de");
  });
});

describe("formatEstimatedDuration", () => {
  it("does not pretend to a precision it does not have", () => {
    expect(formatEstimatedDuration(30_000)).toBe("moins d'une minute");
    expect(formatEstimatedDuration(0)).toBe("moins d'une minute");
  });

  it("counts in minutes below an hour", () => {
    expect(formatEstimatedDuration(725_000)).toBe("12 min");
    expect(formatEstimatedDuration(3_540_000)).toBe("59 min");
  });

  it("counts in hours and minutes above one", () => {
    expect(formatEstimatedDuration(3_600_000)).toBe("1 h");
    expect(formatEstimatedDuration(7_500_000)).toBe("2 h 05");
  });
});

describe("readOperationAcknowledgement", () => {
  const valid = {
    operation: "write-chapter",
    unitCount: "3",
    costUsd: "8.712000",
    durationMs: "2175000",
  };

  it("reads back what the panel posted", () => {
    expect(readOperationAcknowledgement(acknowledgementForm(valid))).toEqual({
      operation: "write-chapter",
      unitCount: 3,
      costUsd: "8.712000",
      durationMs: 2_175_000,
    });
  });

  it("refuses a submission missing any part of the acknowledgement", () => {
    for (const missing of Object.keys(valid)) {
      const partial = Object.fromEntries(
        Object.entries(valid).filter(([field]) => field !== missing),
      );

      expect(readOperationAcknowledgement(acknowledgementForm(partial))).toBeNull();
    }
  });

  // Shape only. Whether the numbers are still *true* is the estimator's
  // question, asked against an estimate the server recomputes.
  it("refuses an operation it does not know and a count that is not one", () => {
    expect(
      readOperationAcknowledgement(acknowledgementForm({ ...valid, operation: "delete-novel" })),
    ).toBeNull();
    expect(
      readOperationAcknowledgement(acknowledgementForm({ ...valid, unitCount: "trois" })),
    ).toBeNull();
    expect(
      readOperationAcknowledgement(acknowledgementForm({ ...valid, durationMs: "1.5" })),
    ).toBeNull();
  });
});
