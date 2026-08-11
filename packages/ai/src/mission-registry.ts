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
 * **Never one general-purpose prompt** (CLAUDE.md §5.4). The seventeen
 * missions ask seventeen different things of a model — a diagnosis, a hunt for
 * the déjà-lu, an appraisal of reach, one section redone, a set of proposals,
 * one of them replaced, a judgement, a fusion or its argued refusal, the
 * novel's identity transposed, a
 * character sheet, a chapter plan, a scene, a list of atomic facts, a
 * contradiction hunt, a targeted
 * correction, a summary — and merging them behind one treatment would mean
 * tuning none of them. The registry is total over `MissionId` (`satisfies`
 * below), so a mission cannot exist without its own declaration.
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
  /**
   * How long a typical call is expected to take (CAL-057) — the *theoretical*
   * duration, and the estimate's fallback when a project has never run this
   * mission and has nothing measured to answer with.
   *
   * Not `timeoutMs`. That is the deadline past which an attempt is abandoned,
   * so quoting it would forecast the worst case as the normal one and put
   * minutes on a screen that no call ever spends. This is the expectation, and
   * the test keeps it under the deadline: a mission expected to take longer
   * than it is allowed would be a mission that always fails.
   *
   * A declared number rather than one derived from `expectedUsage` and a
   * throughput table, for the same reason `expectedUsage` is declared rather
   * than derived from the context budget: the second table would be the copy
   * that drifts, and the first real measurement replaces this one anyway.
   */
  readonly expectedDurationMs: number;
}

export type MissionRegistry = Readonly<Record<MissionId, MissionDefinition>>;

export const MISSION_REGISTRY = {
  /**
   * The whole source text, read once, in depth — the one mission whose input
   * legitimately is the entire starting text, hence the largest budget of the
   * seventeen. Everything downstream is built on its answer, so it stays on the
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
    expectedDurationMs: 180_000,
  },

  /**
   * The dedicated pass over the déjà-lu (CAL-075): the same whole source text
   * in, at most twelve argued findings out. Recognising what is conventional
   * is breadth-of-culture work — the reading has to place a passage against
   * everything it resembles — so it stays on the strongest model at `high`;
   * the budget is smaller than the diagnosis's because the answer is one
   * hunt, not seventeen sections.
   */
  "detect-cliche-risks": {
    id: "detect-cliche-risks",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "high",
    maxOutputTokens: 8_000,
    timeoutMs: 300_000,
    output: { kind: "structured", schemaOwner: "analysis" },
    contextBudgetTokens: 60_000,
    expectedUsage: { inputTokens: 20_000, outputTokens: 3_000 },
    expectedDurationMs: 120_000,
  },

  /**
   * The potential assessment (CAL-076): the validated analysis and the source
   * text in, an argued appraisal of what the text can sustain at the target
   * length out. Open editorial judgement with no verifiable answer — the case
   * where the model's depth shows directly in the product's perceived value —
   * so it stays on the strongest model at `high`; the input carries the
   * analysis on top of the source text, hence a little more than the cliché
   * pass expects.
   */
  "assess-novel-potential": {
    id: "assess-novel-potential",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "high",
    maxOutputTokens: 8_000,
    timeoutMs: 300_000,
    output: { kind: "structured", schemaOwner: "analysis" },
    contextBudgetTokens: 60_000,
    expectedUsage: { inputTokens: 25_000, outputTokens: 3_000 },
    expectedDurationMs: 120_000,
  },

  /**
   * One section redone, not seventeen (CAL-077).
   *
   * The output cap is a section's worth rather than a diagnostic's, and the
   * expected usage is dominated by the source text the mission still has to
   * read in full — which is also why the context budget stays large while the
   * answer stays small: reading everything to write one paragraph is exactly
   * the shape of this mission. It stays on Opus at `high` because the author
   * relaunches a section precisely when the first answer disappointed them,
   * and the cheaper model is not the remedy for that.
   */
  "regenerate-analysis-section": {
    id: "regenerate-analysis-section",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "high",
    maxOutputTokens: 4_000,
    timeoutMs: 180_000,
    output: { kind: "structured", schemaOwner: "analysis" },
    contextBudgetTokens: 120_000,
    expectedUsage: { inputTokens: 20_000, outputTokens: 800 },
    expectedDurationMs: 60_000,
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
    expectedDurationMs: 180_000,
  },

  /**
   * One direction replaced, not three proposed (CAL-083).
   *
   * The same reading as `propose-directions` — the validated analysis and the
   * whole source text — for a third of the answer, so the context budget stays
   * where it is while the output cap falls to roughly one direction's worth.
   * That asymmetry is the shape of the mission: reading everything to write
   * one proposal, as `regenerate-analysis-section` reads everything to write
   * one section. It stays on Opus at `high` because a replacement is asked
   * precisely when the first answer disappointed the author, and the cheaper
   * model is not the remedy for that — and because the answer has to clear
   * three engines it may not reproduce, which is the hardest exclusion any
   * direction-stage ask carries.
   */
  "replace-direction": {
    id: "replace-direction",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "high",
    maxOutputTokens: 6_000,
    timeoutMs: 180_000,
    output: { kind: "structured", schemaOwner: "direction" },
    contextBudgetTokens: 60_000,
    expectedUsage: { inputTokens: 22_000, outputTokens: 2_700 },
    expectedDurationMs: 90_000,
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
    expectedDurationMs: 90_000,
  },

  /**
   * Elements of two or three directions fused into one, or the argued answer
   * that they cannot be (CAL-084). The same reading as `replace-direction` —
   * the validated analysis, the whole source text — plus the source
   * directions themselves, for one direction's worth of answer or less.
   *
   * The one direction-stage mission at `xhigh`, deliberately: its named
   * failure, *le compromis mou*, is a judgement failure that depth prevents —
   * an engine split between two sources is caught mechanically afterwards,
   * but only depth makes the fusion that *clears* the gate worth reading —
   * and the refusal has to be calibrated too, because a lazy « irréductible »
   * is as useless as a mushy fusion. The backlog rates the ask 3/3; effort is
   * the half of that rating the registry can honour.
   */
  "combine-directions": {
    id: "combine-directions",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "xhigh",
    maxOutputTokens: 8_000,
    timeoutMs: 300_000,
    output: { kind: "structured", schemaOwner: "direction" },
    contextBudgetTokens: 60_000,
    expectedUsage: { inputTokens: 24_000, outputTokens: 3_000 },
    expectedDurationMs: 150_000,
  },

  /**
   * The bible's first section, and the one mission whose whole difficulty is
   * *not* inventing: eleven fields transposed from a direction already chosen,
   * each owing a passage. Shorter than proposing a direction — nine short
   * fields and their bases, not three whole novels — but it is what every
   * later bible section and every chapter reads first, so it stays on Opus at
   * `high`: an identity that drifts from its direction is a drift nothing
   * downstream can detect.
   */
  "define-novel-identity": {
    id: "define-novel-identity",
    model: "claude-opus-5",
    fallbackModel: "anthropic.claude-opus-5",
    effort: "high",
    maxOutputTokens: 6_000,
    timeoutMs: 240_000,
    output: { kind: "structured", schemaOwner: "bible" },
    contextBudgetTokens: 40_000,
    expectedUsage: { inputTokens: 16_000, outputTokens: 2_500 },
    expectedDurationMs: 120_000,
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
    expectedDurationMs: 90_000,
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
    expectedDurationMs: 150_000,
  },

  /**
   * The prose itself, and the only mission that produces any: everything a
   * reader reads comes from here. Largest output cap and longest deadline of
   * the seventeen, on the strongest model — this is not where a cost saving is
   * made.
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
    expectedDurationMs: 300_000,
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
    expectedDurationMs: 60_000,
  },

  /**
   * The mission the product is judged on: a contradiction between a chapter
   * and everything established before it. The most demanding reasoning of the
   * seventeen over the widest context, so it runs at `xhigh` and is given the
   * second-largest budget.
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
    expectedDurationMs: 300_000,
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
    expectedDurationMs: 150_000,
  },

  /**
   * The cheapest of the seventeen and the most frequent after `extract-facts`: one
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
    expectedDurationMs: 40_000,
  },

  /**
   * The level above (CAL-055): a part's arc, compressed out of its chapters'
   * summaries rather than out of their prose.
   *
   * Cheaper than `summarize-chapter` on both sides. The input is already
   * compressed — thirty chapters of brief and detailed summary come to well
   * under the budget below — and the output is one summary rather than two, so
   * the ceiling is halved. It runs once per validated chapter, like its
   * sibling, and it produces nothing a reader reads, which is the whole reason
   * both stay on Sonnet.
   */
  "summarize-part": {
    id: "summarize-part",
    model: "claude-sonnet-5",
    fallbackModel: "anthropic.claude-sonnet-5",
    effort: "low",
    maxOutputTokens: 2_000,
    timeoutMs: 120_000,
    output: { kind: "structured", schemaOwner: "manuscript" },
    contextBudgetTokens: 30_000,
    expectedUsage: { inputTokens: 8_000, outputTokens: 1_000 },
    expectedDurationMs: 25_000,
  },
} as const satisfies MissionRegistry;

/**
 * The evaluation bench's judge (CAL-059) — mechanics only, like a mission.
 *
 * Declared in this file because this file and the capability sheet are the
 * only places a model id may appear (`mission-registry.test.ts` walks the
 * workspace to prove it), and because "change the judge's model" should be the
 * same one-file edit as every other model change.
 *
 * Not a `MissionDefinition`, on purpose. The bench is a development tool, not
 * a product path: its executor has no fallback model and no health memory —
 * a bench run that hits an outage fails loudly and is rerun — so declaring a
 * `fallbackModel` here would promise a behaviour nothing implements. No
 * `expectedUsage` either: bench runs are launched deliberately and report
 * their real cost afterwards; nothing estimates them beforehand (CAL-057 is
 * for the product's operations).
 */
export interface BenchJudgeDefinition {
  readonly model: ModelId;
  readonly effort: EffortLevel;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
}

/**
 * The strongest model, at `high`: the specification separates writing from
 * criticism, and the judge's whole value is reading closely enough to cite —
 * a cheap judge produces exactly the unargued verdicts the bench forbids.
 */
export const BENCH_JUDGE: BenchJudgeDefinition = {
  model: "claude-opus-5",
  effort: "high",
  maxOutputTokens: 16_000,
  timeoutMs: 300_000,
};
