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
export { createModelProviderPort, type CreateModelProviderPortOptions } from "./create-model-port";
export { ModelOutputInvalidError } from "./failures";
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
export { DEFAULT_RETRY_POLICY, type RetryPolicy } from "./retry";
export { MISSION_MODEL_ROUTING, type MissionRouting } from "./routing";
export type { Scheduler } from "./timing";
