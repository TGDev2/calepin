/**
 * The prompt registry's public surface (CAL-053).
 *
 * What a caller needs: the current version of a prompt, a way to render it with
 * typed variables, the versions it has had, and the comparison between two of
 * them. What it never gets: a way to build a `RenderedPrompt` by hand.
 */

export {
  comparePrompts,
  comparePromptVersions,
  type DiffLine,
  type DiffLineKind,
  diffText,
  formatPromptComparison,
  type PromptComparison,
  type TextComparison,
  type VariableComparison,
  type VariableRetyping,
} from "./compare";
export {
  type CurrentPrompt,
  currentPrompt,
  missionPrompt,
  PROMPT_REGISTRY,
  promptAtVersion,
  type PromptRegistry,
  type PromptVersions,
  promptVersions,
} from "./registry";
export { assertMissionPrompt, placeholdersOf, renderPrompt } from "./render";
export { deriveRepairPrompt } from "./repair";
export {
  isRenderedPrompt,
  type MissionPrompt,
  PROMPT_IDS,
  PROMPT_VARIABLE_TYPES,
  type PromptDefinition,
  type PromptId,
  type PromptScope,
  type PromptValue,
  type PromptVariable,
  type PromptVariablesOf,
  type PromptVariableType,
  type RenderedPrompt,
  type RenderedPromptOf,
} from "./types";
