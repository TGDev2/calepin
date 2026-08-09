/**
 * What each model can do, stated explicitly (CAL-048).
 *
 * The sheet exists so that nothing downstream ever guesses: the routing table
 * is checked against it by test, the pipeline refuses a structured call to a
 * model that cannot honour one, and CAL-054's context budgets will read the
 * window from here. The numbers are the provider's published limits; CAL-049
 * can cross-check them against the live Models API (`max_input_tokens`,
 * `max_tokens`), which is the authoritative runtime source.
 *
 * **No pricing.** CAL-056 owns the configurable tariff table; a price written
 * here would be the copy that drifts.
 */

export const PROVIDER_IDS = ["anthropic"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const MODEL_IDS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"] as const;

export type ModelId = (typeof MODEL_IDS)[number];

/**
 * The provider-side reasoning-depth control. On the current model family the
 * sampling parameters (`temperature`, `top_p`, `top_k`) are rejected outright,
 * so `effort` is the one tuning knob a mission declares — which is why
 * `MissionRouting` carries no temperature.
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
} as const satisfies Record<ModelId, ModelCapability>;
