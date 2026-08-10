import { describe, expect, it } from "vitest";

import { MISSION_REGISTRY } from "./mission-registry";
import {
  COSTLY_OPERATION_IDS,
  COSTLY_OPERATION_REGISTRY,
  type CostlyOperationDefinition,
  OPERATION_PHASE_KINDS,
  OPERATION_UNITS,
} from "./operations";

describe("the costly operation registry", () => {
  it("declares every operation, and nothing else", () => {
    expect(Object.keys(COSTLY_OPERATION_REGISTRY).sort()).toEqual([...COSTLY_OPERATION_IDS].sort());
  });

  it.each(COSTLY_OPERATION_IDS)("%s is a coherent declaration", (operationId) => {
    // Widened to the declared shape: the literal table narrows every field.
    const operation: CostlyOperationDefinition = COSTLY_OPERATION_REGISTRY[operationId];

    expect(operation.id).toBe(operationId);
    expect(OPERATION_UNITS).toContain(operation.unit);
    expect(operation.phases.length).toBeGreaterThan(0);

    for (const phase of operation.phases) {
      // The mission registry is the only declaration of what a call costs; a
      // phase that named a mission it does not hold would be unpriceable.
      expect(MISSION_REGISTRY[phase.mission].id).toBe(phase.mission);
      expect(OPERATION_PHASE_KINDS).toContain(phase.kind);
      expect(Number.isInteger(phase.callsPerUnit)).toBe(true);
      expect(phase.callsPerUnit).toBeGreaterThan(0);
    }
  });

  it.each(COSTLY_OPERATION_IDS)("%s names each of its missions once", (operationId) => {
    const operation: CostlyOperationDefinition = COSTLY_OPERATION_REGISTRY[operationId];
    const missions = operation.phases.map((phase) => phase.mission);

    // Two phases on one mission would be two lines on the screen the author
    // has to add up themselves, and two chances for the estimate to count the
    // same call twice. The count belongs in `callsPerUnit`.
    expect(new Set(missions).size).toBe(missions.length);
  });

  // The specification's own requirement, read as a property of the table: an
  // operation whose declaration is only its production call is an operation
  // whose price is the number of words produced, which is precisely what
  // CAL-057 exists to stop.
  it("declares an analysis phase and a control phase for writing a chapter", () => {
    const kinds = COSTLY_OPERATION_REGISTRY["write-chapter"].phases.map((phase) => phase.kind);

    expect(kinds).toContain("production");
    expect(kinds).toContain("analysis");
    expect(kinds).toContain("control");
  });

  it("charges a regeneration the whole pass, not just the scene", () => {
    const written = COSTLY_OPERATION_REGISTRY["write-chapter"].phases;
    const regenerated = COSTLY_OPERATION_REGISTRY["regenerate-chapter"].phases;

    expect(regenerated).toEqual(written);
  });

  it("makes the whole-project operations happen once and the chapter ones scale", () => {
    expect(COSTLY_OPERATION_REGISTRY["generate-outline"].unit).toBe("project");
    expect(COSTLY_OPERATION_REGISTRY["write-chapter"].unit).toBe("chapter");
    expect(COSTLY_OPERATION_REGISTRY["regenerate-chapter"].unit).toBe("chapter");
    expect(COSTLY_OPERATION_REGISTRY["audit-manuscript"].unit).toBe("chapter");
  });

  it("keeps the audit pure control", () => {
    const kinds = COSTLY_OPERATION_REGISTRY["audit-manuscript"].phases.map((phase) => phase.kind);

    expect(new Set(kinds)).toEqual(new Set(["control"]));
  });
});
