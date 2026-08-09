/**
 * What each model can do, stated explicitly (CAL-048).
 *
 * The sheet exists so that nothing downstream ever guesses: the mission
 * registry is checked against it by test — parameters within both models'
 * limits, structured missions only on models that can serve one, context
 * budget and output cap inside the smaller window. The numbers are the
 * provider's published limits; CAL-049
 * can cross-check them against the live Models API (`max_input_tokens`,
 * `max_tokens`), which is the authoritative runtime source.
 *
 * **No pricing.** CAL-056 owns the configurable tariff table; a price written
 * here would be the copy that drifts.
 */

/**
 * The two endpoints a model can be served from (CAL-050).
 *
 * `bedrock` serves the *same* Claude models under a different account, key and
 * control plane. That is the point: an outage lives at an endpoint, not in a
 * set of weights, so a failover that keeps the model keeps the prose — a
 * chapter written after a switch does not change voice mid-novel.
 */
export const PROVIDER_IDS = ["anthropic", "bedrock"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * A model id is the string its own provider answers to, verbatim — which is
 * why the Bedrock entries carry the `anthropic.` prefix Bedrock itself uses.
 * The spelling is the provider's, not one this repository chose (§4.2 makes
 * the same carve-out for `Account`'s OAuth fields), and taking it verbatim is
 * what lets an adapter send `call.model.id` with no translation table and
 * `ModelCallMeta.model` record exactly what was invoked.
 */
export const MODEL_IDS = [
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-haiku-4-5",
  "anthropic.claude-opus-5",
  "anthropic.claude-sonnet-5",
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

/**
 * The provider-side reasoning-depth control. On the current model family the
 * sampling parameters (`temperature`, `top_p`, `top_k`) are rejected outright,
 * so `effort` is the one tuning knob a mission declares — which is why
 * `MissionDefinition` carries no temperature.
 */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export interface ModelCapability {
  readonly id: ModelId;
  readonly provider: ProviderId;
  /** Display name for screens and cost views — never parsed. */
  readonly label: string;
  readonly contextWindowTokens: number;
  /** The provider's hard cap on one response. Routing stays at or under it. */
  readonly maxOutputTokens: number;
  /** Native schema-constrained output. Without it, `generateStructured` refuses the model. */
  readonly supportsStructuredOutput: boolean;
  /** Whether the model accepts the `effort` parameter; older ones reject it. */
  readonly supportsEffort: boolean;
  /** How reasoning is switched on: adaptive (the 5-family) or a token budget. */
  readonly thinking: "adaptive" | "budget";
}

export const MODEL_CAPABILITIES = {
  "claude-opus-5": {
    id: "claude-opus-5",
    provider: "anthropic",
    label: "Claude Opus 5",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 128_000,
    supportsStructuredOutput: true,
    supportsEffort: true,
    thinking: "adaptive",
  },
  "claude-sonnet-5": {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 128_000,
    supportsStructuredOutput: true,
    supportsEffort: true,
    thinking: "adaptive",
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    supportsStructuredOutput: true,
    supportsEffort: false,
    thinking: "budget",
  },

  // The backup endpoint (CAL-050). Same weights, same limits, same request
  // surface: schema-constrained output and adaptive thinking with `effort` are
  // both generally available on Bedrock, so the second adapter has full parity
  // with the first and a mission needs no per-provider tuning.
  "anthropic.claude-opus-5": {
    id: "anthropic.claude-opus-5",
    provider: "bedrock",
    label: "Claude Opus 5 (Bedrock)",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 128_000,
    supportsStructuredOutput: true,
    supportsEffort: true,
    thinking: "adaptive",
  },
  "anthropic.claude-sonnet-5": {
    id: "anthropic.claude-sonnet-5",
    provider: "bedrock",
    label: "Claude Sonnet 5 (Bedrock)",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 128_000,
    supportsStructuredOutput: true,
    supportsEffort: true,
    thinking: "adaptive",
  },
} as const satisfies Record<ModelId, ModelCapability>;
