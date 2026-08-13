/**
 * What the `analyze-source-text` executor declares before it runs (CAL-208).
 *
 * Everything the executor *does* — reading the source text, refusing a
 * superseded version, composing, calling the injected port, reporting what the
 * call spent, verifying the quotations — touches rows or a provider, and is
 * asserted end to end in `test/integration/generation-pipeline.integration.test.ts`.
 * `packages/manuscript/src/summary/summarize.test.ts` draws the same line for
 * the same reason: a unit test that mocked the repository would assert the mock.
 *
 * What is decidable here is the pair the attempt row is stamped with *before*
 * the model is called (CAL-058) — and the property worth pinning is not their
 * current values but that they are **read rather than written**.
 */

import { currentPrompt, MISSION_REGISTRY, type ModelProviderPort } from "@calepin/ai";
import { describe, expect, it } from "vitest";

import { createAnalyzeSourceTextExecutor } from "./executor";

/** Never called here: the executor asks nothing of a port to be constructed. */
const IDLE_PORT: ModelProviderPort = {
  generateProse: () => {
    throw new Error("the port was reached while building the executor");
  },
  generateStructured: () => {
    throw new Error("the port was reached while building the executor");
  },
};

describe("createAnalyzeSourceTextExecutor (CAL-208)", () => {
  it("declares the model the registry routes the mission to", () => {
    const executor = createAnalyzeSourceTextExecutor(IDLE_PORT);

    // Read, not written: retuning the mission moves what the claim records
    // without this executor changing a line. A hard-coded id would pass an
    // equality assertion today and silently record the wrong model tomorrow.
    expect(executor.model).toBe(MISSION_REGISTRY["analyze-source-text"].model);
  });

  it("declares the prompt version that is about to run", () => {
    const executor = createAnalyzeSourceTextExecutor(IDLE_PORT);

    expect(executor.promptVersion).toBe(currentPrompt("analyze-source-text").version);
  });

  it("declares a prompt version at all, so a dead worker's attempt is attributable", () => {
    // CAL-053's requirement, and the reason the claim writes it before the call
    // rather than reading it off the answer: the attempts that reveal a prompt
    // regression are the attempts that failed.
    expect(createAnalyzeSourceTextExecutor(IDLE_PORT).promptVersion).toBeGreaterThan(0);
  });

  it("builds without reaching the port", () => {
    expect(() => createAnalyzeSourceTextExecutor(IDLE_PORT)).not.toThrow();
  });
});
