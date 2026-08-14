/**
 * What the executor *declares* (CAL-210).
 *
 * Deliberately small, for `analysis/generation/executor.test.ts`'s reason:
 * everything the executor *does* touches rows or a provider, and is asserted end
 * to end in `test/integration/direction-generation.integration.test.ts`. A unit
 * test that mocked the repository to watch it would assert the mock.
 *
 * What is worth pinning here is that the model and the prompt version are
 * **read** rather than written: retuning the mission or shipping a prompt
 * version must move what the attempt records without this file changing.
 */

import { currentPrompt, MISSION_REGISTRY, type ModelProviderPort } from "@calepin/ai";
import { describe, expect, it } from "vitest";

import { createProposeDirectionsExecutor } from "./executor";

const IDLE_PORT: ModelProviderPort = {
  generateProse: () => {
    throw new Error("the port was reached while building the executor");
  },
  generateStructured: () => {
    throw new Error("the port was reached while building the executor");
  },
};

describe("createProposeDirectionsExecutor", () => {
  it("builds without reaching the port", () => {
    expect(() => createProposeDirectionsExecutor(IDLE_PORT)).not.toThrow();
  });

  it("records the model the mission registry routes to", () => {
    expect(createProposeDirectionsExecutor(IDLE_PORT).model).toBe(
      MISSION_REGISTRY["propose-directions"].model,
    );
  });

  it("records the prompt version the registry ships today", () => {
    const version = createProposeDirectionsExecutor(IDLE_PORT).promptVersion;

    expect(version).toBe(currentPrompt("propose-directions").version);
    expect(version).toBeGreaterThan(0);
  });
});
