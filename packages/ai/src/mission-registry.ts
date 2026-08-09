/**
 * The mission registry (CAL-051) — **the one file a model change touches.**
 *
 * One entry per mission, declared separately, carrying everything a call to
 * that mission needs: the model and its backup, the parameters, the kind of
 * answer expected and who owns its schema, the ceiling on the context it may
 * be given, and the usage a typical call is expected to cost. Business code
 * names a mission and nothing else — it never names a model, a token cap or a
 * deadline — so retuning a mission is an edit here and no caller moves.
 * `mission-registry.test.ts` proves that claim by walking the workspace: no
 * file outside this one and the capability sheet names a model at all.
 *
 * **Never one general-purpose prompt** (CLAUDE.md §5.4). The ten missions ask
 * ten different things of a model — a diagnosis, a set of proposals, a
 * judgement, a character sheet, a chapter plan, a scene, a list of atomic
 * facts, a contradiction hunt, a targeted correction, a summary — and merging
 * them behind one treatment would mean tuning none of them. The registry is
 * total over `MissionId` (`satisfies` below), so a mission cannot exist
 * without its own declaration.
 *
 * **No temperature, and there will not be one**: the current model family
 * rejects the sampling parameters outright, so `effort` is the real control
 * surface (see `capabilities.ts`). **No price either**: CAL-056 owns the
 * configurable tariff table, and `expectedUsage` is the token shape it
 * multiplies.
 */

import type { EffortLevel, ModelId } from "./capabilities";
import type { MissionId } from "./missions";
import type { TokenUsage } from "./port";

/**
 * The seven business packages (CLAUDE.md §3.1). A structured mission names the
 * one that owns its output schema.
 */
export const DOMAIN_PACKAGES = [
  "analysis",
  "direction",
  "bible",
  "outline",
  "manuscript",
  "coherence",
  "export",
] as const;

export type DomainPackage = (typeof DOMAIN_PACKAGES)[number];

/**
 * What kind of answer the mission expects, and — for a structured one — where
 * its schema lives.
 *
 * **A reference, never a copy** (§5.5, ADR-001). The AI layer cannot import a
 * domain: that is the dependency rule, and the schema is the domain's data
 * contract. Restating it here would create the second copy, and the copy that
 * drifts is always the one that validates writes. The schema itself reaches
 * the pipeline per call, through `StructuredGenerationRequest.schema`, so
 * there is exactly one of it; `schemaOwner` says which package that call will
 * have got it from.
 */
export type MissionOutput =
  { readonly kind: "prose" } | { readonly kind: "structured"; readonly schemaOwner: DomainPackage };

export interface MissionDefinition {
  /** Redundant with the key, and pinned against it by test — as the capability sheet is. */
  readonly id: MissionId;
  /** The model asked first. */
  readonly model: ModelId;
  /**
   * The backup model — *modèle de secours* — tried when the primary fails for
   * a provider-side reason (`provider`, `timeout`, `rate_limit`).
   *
   * Since CAL-050 it is the same model **on the other provider**, and the test
   * pins both halves of that: never the same model, and never the same
   * provider. A backup behind the same endpoint, the same key and the same
   * outage is not a backup, and a backup of a *different* model would change
   * the novel's voice the day it served.
   */
  readonly fallbackModel: ModelId;
  /** Reasoning depth — the one tuning knob this model family accepts. */
  readonly effort: EffortLevel;
  /** Cap on one response, at or under both models' own caps. */
  readonly maxOutputTokens: number;
  /** Deadline for one attempt; a retry and the backup model get a fresh one. */
  readonly timeoutMs: number;
  readonly output: MissionOutput;
  /**
   * The ceiling on the context this mission may be given, in input tokens.
   *
   * A policy number, far below the model's window on purpose: §5.8 forbids
   * dumping the novel, and a budget is how "composed, never dumped" becomes
   * checkable. CAL-054 composes under it; the pipeline logs
   * `ai.context-budget-exceeded` when the provider's own input count came back
   * over it, which is what makes the number a budget rather than a comment.
   */
  readonly contextBudgetTokens: number;
  /**
   * What a typical call is expected to consume — the *coût attendu*, in the
   * only unit this layer is allowed to hold. CAL-056 multiplies it by the
   * tariff table to forecast money; the test keeps it inside the caps above,
   * so an entry cannot expect more than it permits.
   */
  readonly expectedUsage: TokenUsage;
}

export type MissionRegistry = Readonly<Record<MissionId, MissionDefinition>>;

export const MISSION_REGISTRY = {
  /**
   * The whole source text, read once, in depth — the one mission whose input
   * legitimately is the entire starting text, hence the largest budget of the
   * ten. Everything downstream is built on its answer, so it stays on the
   * strongest model.
   */
  "analyze-source-text": {
    id: "analyze-source-text",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "high",
    maxOutputTokens: 16_000,
    timeoutMs: 300_000,
    output: { kind: "structured", schemaOwner: "analysis" },
    contextBudgetTokens: 200_000,
    expectedUsage: { inputTokens: 60_000, outputTokens: 8_000 },
  },

  /** Divergence: several genuinely different novels out of one text. */
  "propose-directions": {
    id: "propose-directions",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "high",
    maxOutputTokens: 16_000,
    timeoutMs: 300_000,
    output: { kind: "structured", schemaOwner: "direction" },
    contextBudgetTokens: 60_000,
    expectedUsage: { inputTokens: 20_000, outputTokens: 8_000 },
  },

  /**
   * A judgement on one proposal. Shorter than proposing, and reading the
   * analysis rather than the source text — but it decides which novel gets
   * written, so it is not one of the missions that leaves Opus.
   */
  "evaluate-direction": {
    id: "evaluate-direction",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "medium",
    maxOutputTokens: 8_000,
    timeoutMs: 180_000,
    output: { kind: "structured", schemaOwner: "direction" },
    contextBudgetTokens: 40_000,
    expectedUsage: { inputTokens: 12_000, outputTokens: 4_000 },
  },

  /** One sheet, from the bible's identity section and the chosen direction. */
  "create-character-sheet": {
    id: "create-character-sheet",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "medium",
    maxOutputTokens: 8_000,
    timeoutMs: 180_000,
    output: { kind: "structured", schemaOwner: "bible" },
    contextBudgetTokens: 40_000,
    expectedUsage: { inputTokens: 12_000, outputTokens: 4_000 },
  },

  /** Structural work: what this chapter does to the threads around it. */
  "build-chapter-outline": {
    id: "build-chapter-outline",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "high",
    maxOutputTokens: 16_000,
    timeoutMs: 300_000,
    output: { kind: "structured", schemaOwner: "outline" },
    contextBudgetTokens: 60_000,
    expectedUsage: { inputTokens: 20_000, outputTokens: 6_000 },
  },

  /**
   * The prose itself, and the only mission that produces any: everything a
   * reader reads comes from here. Largest output cap and longest deadline of
   * the ten, on the strongest model — this is not where a cost saving is made.
   */
  "write-scene": {
    id: "write-scene",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "high",
    maxOutputTokens: 32_000,
    timeoutMs: 600_000,
    output: { kind: "prose" },
    contextBudgetTokens: 80_000,
    expectedUsage: { inputTokens: 30_000, outputTokens: 12_000 },
  },

  /**
   * Extraction, not creation: one chapter in, atomic statements out, against
   * the facts already known so a duplicate is not proposed twice. It runs
   * after every chapter and no reader ever reads its output, which is what
   * makes it one of the two missions where a cheaper model changes nothing
   * visible and changes the product's recurring cost.
   */
  "extract-facts": {
    id: "extract-facts",
    model: "claude-sonnet-5",
    fallbackModel: "anthropic.claude-sonnet-5",
    effort: "low",
    maxOutputTokens: 8_000,
    timeoutMs: 180_000,
    output: { kind: "structured", schemaOwner: "bible" },
    contextBudgetTokens: 60_000,
    expectedUsage: { inputTokens: 15_000, outputTokens: 4_000 },
  },

  /**
   * The mission the product is judged on: a contradiction between a chapter
   * and everything established before it. The most demanding reasoning of the
   * ten over the widest context, so it is the one raised to `xhigh` and given
   * the second-largest budget.
   */
  "check-coherence": {
    id: "check-coherence",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "xhigh",
    maxOutputTokens: 16_000,
    timeoutMs: 600_000,
    output: { kind: "structured", schemaOwner: "coherence" },
    contextBudgetTokens: 120_000,
    expectedUsage: { inputTokens: 40_000, outputTokens: 10_000 },
  },

  /**
   * A correction to one identified passage — narrow by construction, and
   * writing prose that will sit inside a chapter, which is why it stays where
   * `write-scene` is rather than following `extract-facts`.
   */
  "fix-issue": {
    id: "fix-issue",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "medium",
    maxOutputTokens: 16_000,
    timeoutMs: 300_000,
    output: { kind: "structured", schemaOwner: "coherence" },
    contextBudgetTokens: 60_000,
    expectedUsage: { inputTokens: 15_000, outputTokens: 6_000 },
  },

  /**
   * The cheapest of the ten and the most frequent after `extract-facts`: one
   * chapter in, two summaries out, feeding the context of every later chapter.
   * The second mission on Sonnet, for the same reason.
   */
  "summarize-chapter": {
    id: "summarize-chapter",
    model: "claude-sonnet-5",
    fallbackModel: "anthropic.claude-sonnet-5",
    effort: "low",
    maxOutputTokens: 4_000,
    timeoutMs: 120_000,
    output: { kind: "structured", schemaOwner: "manuscript" },
    contextBudgetTokens: 40_000,
    expectedUsage: { inputTokens: 10_000, outputTokens: 2_000 },
  },
} as const satisfies MissionRegistry;
