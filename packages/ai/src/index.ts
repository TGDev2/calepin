/**
 * @calepin/ai — the AI layer: mechanics, never narrative meaning
 * (CLAUDE.md §5, ADR-001).
 *
 * What a domain imports from here: the port types, the mission identifiers
 * and the failure types. The concrete port is composed by the process shell —
 * `createModelProviderPort` over provider adapters — and injected into domain
 * code; a domain never touches an adapter.
 *
 * Backlog: E05 — CAL-048 to CAL-059
 */

export type {
  ProviderAdapter,
  ProviderCall,
  ProviderProse,
  ProviderValue,
  StructuredProviderCall,
} from "./adapter";
export { createAnthropicAdapter, type CreateAnthropicAdapterOptions } from "./adapters/anthropic";
export {
  type BedrockCredentials,
  createBedrockAdapter,
  type CreateBedrockAdapterOptions,
} from "./adapters/bedrock";
export type { MessagesClient } from "./adapters/messages";
export {
  EFFORT_LEVELS,
  type EffortLevel,
  MODEL_CAPABILITIES,
  MODEL_IDS,
  type ModelCapability,
  type ModelId,
  PROVIDER_IDS,
  type ProviderId,
} from "./capabilities";
export {
  type CanonFactCandidate,
  type ChapterSummaryContextInput,
  composeChapterSummaryContext,
  type ComposedSceneContext,
  type ComposedSummaryContext,
  composePartSummaryContext,
  composeSceneContext,
  CONTEXT_ITEM_CEILINGS,
  type ContextCompositionReport,
  type ContextItemKind,
  type ContinuityExcerptCandidate,
  DEGRADABLE_ITEM_KINDS,
  DETAILED_SUMMARY_WINDOW,
  ESTIMATED_CHARS_PER_TOKEN,
  estimateTokens,
  MAX_CONTINUITY_EXCERPTS,
  MIN_SUMMARY_COUNT,
  type PartSummary,
  type PartSummaryChapter,
  type PartSummaryContextInput,
  type PrecedingChapterSummary,
  type SceneContextInput,
  type SummaryCompositionReport,
} from "./context";
export { createModelProviderPort, type CreateModelProviderPortOptions } from "./create-model-port";
export { ModelOutputInvalidError, ModelOutputOffTopicError } from "./failures";
export {
  createProviderHealth,
  DEFAULT_PROVIDER_HEALTH_POLICY,
  type ProviderHealth,
  type ProviderHealthChange,
  type ProviderHealthPolicy,
} from "./health";
export {
  DOMAIN_PACKAGES,
  type DomainPackage,
  MISSION_REGISTRY,
  type MissionDefinition,
  type MissionOutput,
  type MissionRegistry,
} from "./mission-registry";
export { MISSION_IDS, type MissionId } from "./missions";
export type {
  ModelCallMeta,
  ModelProviderPort,
  ModelRequest,
  ProseGenerationResult,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TokenUsage,
} from "./port";
export { estimateCostUsd, MODEL_PRICING, type ModelPricing } from "./pricing";
export {
  assertMissionPrompt,
  comparePrompts,
  comparePromptVersions,
  type CurrentPrompt,
  currentPrompt,
  deriveRepairPrompt,
  type DiffLine,
  type DiffLineKind,
  diffText,
  formatPromptComparison,
  isRenderedPrompt,
  type MissionPrompt,
  missionPrompt,
  placeholdersOf,
  PROMPT_IDS,
  PROMPT_REGISTRY,
  PROMPT_VARIABLE_TYPES,
  promptAtVersion,
  type PromptComparison,
  type PromptDefinition,
  type PromptId,
  type PromptRegistry,
  type PromptScope,
  type PromptValue,
  type PromptVariable,
  type PromptVariablesOf,
  type PromptVariableType,
  type PromptVersions,
  promptVersions,
  type RenderedPrompt,
  type RenderedPromptOf,
  renderPrompt,
  type TextComparison,
  type VariableComparison,
  type VariableRetyping,
} from "./prompts";
export {
  DEFAULT_REPAIR_POLICY,
  OUTPUT_FAILURE_KINDS,
  type OutputFailureKind,
  type RepairPolicy,
} from "./repair";
export { DEFAULT_RETRY_POLICY, type RetryPolicy } from "./retry";
export type { Scheduler } from "./timing";
