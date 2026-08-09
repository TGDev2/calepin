/**
 * Which model serves each mission (CAL-048).
 *
 * **The one file a model change touches.** Business code names a mission and
 * nothing else; the port resolves the model, the backup model, the output
 * cap, the deadline and the effort from here. CAL-051 grows this table into
 * the full mission registry — schema reference, context budget, expected
 * cost — and per-mission tuning is that task's decision, which is why the
 * defaults below are deliberately uniform rather than cost-optimised.
 *
 * There is no `temperature` here and there will not be one: the current model
 * family rejects sampling parameters, and `effort` is the real control
 * surface (see `capabilities.ts`).
 */

import type { EffortLevel, ModelId } from "./capabilities";
import type { MissionId } from "./missions";

export interface MissionRouting {
  /** The model asked first. */
  readonly model: ModelId;
  /**
   * The backup model — *modèle de secours* — tried when the primary fails for
   * a provider-side reason (`provider`, `timeout`, `rate_limit`).
   *
   * Since CAL-050 it is the same model **on the other provider**, and
   * `routing.test.ts` pins both halves of that: never the same model, and
   * never the same provider. A backup behind the same endpoint, the same key
   * and the same outage is not a backup, and a backup of a *different* model
   * would change the novel's voice the day it served.
   */
  readonly fallbackModel: ModelId;
  /** Cap on one response, at or under both models' own caps. */
  readonly maxOutputTokens: number;
  /** Reasoning depth. Omitted, the provider default applies. */
  readonly effort?: EffortLevel;
  /** Deadline for one attempt; a retry and the backup model get a fresh one. */
  readonly timeoutMs: number;
}

export const MISSION_MODEL_ROUTING = {
  "analyze-source-text": {
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    maxOutputTokens: 16_000,
    timeoutMs: 300_000,
  },
  "propose-directions": {
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    maxOutputTokens: 16_000,
    timeoutMs: 300_000,
  },
  "evaluate-direction": {
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    maxOutputTokens: 8_000,
    timeoutMs: 180_000,
  },
  "create-character-sheet": {
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    maxOutputTokens: 8_000,
    timeoutMs: 180_000,
  },
  "build-chapter-outline": {
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    maxOutputTokens: 16_000,
    timeoutMs: 300_000,
  },
  "write-scene": {
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    maxOutputTokens: 32_000,
    timeoutMs: 600_000,
  },
  "extract-facts": {
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    maxOutputTokens: 8_000,
    timeoutMs: 180_000,
  },
  "check-coherence": {
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    maxOutputTokens: 16_000,
    timeoutMs: 600_000,
  },
  "fix-issue": {
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    maxOutputTokens: 16_000,
    timeoutMs: 300_000,
  },
  "summarize-chapter": {
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    maxOutputTokens: 4_000,
    timeoutMs: 120_000,
  },
} as const satisfies Record<MissionId, MissionRouting>;
