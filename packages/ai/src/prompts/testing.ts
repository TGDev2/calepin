/**
 * A rendered prompt with fixed text, for the suites that are not about prompts.
 *
 * The pipeline's own tests are about retries, deadlines, failover and the
 * treatment of an answer; rendering a real mission prompt there would make every
 * assertion depend on ten variables of composed context that have nothing to do
 * with what is under test. So they mint one of these instead.
 *
 * It goes through `renderPrompt` rather than around it: the brand is what the
 * port checks, and a helper that forged one would make the check untestable.
 * **Version `0`** — no shipped version is ever 0, so a fixture cannot be
 * mistaken for a registry entry in an assertion or a log line.
 *
 * Not exported from the package: a test double belongs to the tests, the way
 * `adapters/simulated.ts` does.
 */

import type { MissionId } from "../missions";
import { renderPrompt } from "./render";
import type { MissionPrompt, PromptDefinition } from "./types";

export function fixedPrompt(
  missionId: MissionId,
  options: { readonly system?: string; readonly text?: string } = {},
): MissionPrompt {
  const definition: PromptDefinition = {
    id: missionId,
    version: 0,
    scope: { kind: "mission", missionId },
    variables: [],
    system: options.system ?? "SYSTEM",
    instruction: options.text ?? "PROMPT",
  };

  // The definition is built here rather than declared `as const`, so its scope
  // is the wide `PromptScope` and the render's return type widens with it. The
  // line above is what makes the cast true.
  return renderPrompt(definition, {}) as MissionPrompt;
}
