/**
 * The bench's judge (CAL-059): its output contracts and its executor.
 *
 * **The contracts are where the specification's prohibition becomes
 * structural.** *Ne jamais produire un score arbitraire présenté comme preuve
 * de qualité* — so the schemas hold no numeric field at all, the verdicts are
 * closed categorical enums, and every judgement requires an argument of
 * substance and at least one piece of cited evidence. A verdict without its
 * argument or its evidence is not a stylistic lapse the report forgives; it
 * fails validation and takes the repair path like any other malformed answer
 * (§6). `no-arbitrary-score.test.ts` walks the derived JSON Schemas to prove
 * the claim about every contract at once.
 *
 * **The contracts are built per run**, because the `criterionId` enum is the
 * run's own criteria list — the same list the prompt renders — so the judge
 * cannot answer under a criterion nobody asked about, and a criterion nobody
 * answered fails the parse rather than silently thinning the report.
 *
 * **The executor is deliberately smaller than the mission pipeline.** One
 * adapter, a per-attempt deadline, classified retry with backoff, validation
 * with one targeted repair pass — and no fallback model, no health memory, no
 * logging. The bench is a development tool run on purpose: an outage fails the
 * case loudly and the run is relaunched, where the production pipeline must
 * survive one. What it does share with the pipeline, it shares by import —
 * `retryDelayMs`, `classifyOutputFailure`, `deriveRepairPrompt` — so the two
 * cannot drift on what a transient error or a repairable answer is.
 */

import {
  type AppError,
  fail,
  InternalError,
  type Result,
  succeed,
  TimeoutError,
  toAppError,
  toFieldPath,
} from "@calepin/shared/errors";
import { z } from "zod";

import type { ProviderAdapter } from "../adapter";
import { MODEL_CAPABILITIES, type ModelCapability, type ModelId } from "../capabilities";
import { modelNotConfigured, ModelOutputInvalidError, ModelOutputOffTopicError } from "../failures";
import { BENCH_JUDGE, type BenchJudgeDefinition } from "../mission-registry";
import type { TokenUsage } from "../port";
import {
  deriveRepairPrompt,
  isRenderedPrompt,
  type PromptId,
  type RenderedPrompt,
} from "../prompts";
import { classifyOutputFailure, DEFAULT_REPAIR_POLICY, type RepairPolicy } from "../repair";
import { DEFAULT_RETRY_POLICY, retryDelayMs, type RetryPolicy } from "../retry";
import { REAL_SCHEDULER, type Scheduler, sleep } from "../timing";
import { assertBenchCriteria, type BenchCriterion } from "./criteria";

/* -------------------------------------------------------------------------- *
 * Contracts
 * -------------------------------------------------------------------------- */

/**
 * What the blinded pairwise judge may answer per criterion. Closed and
 * categorical — the two honest exits included, so the contract never forces
 * a difference into existence.
 */
export const BLINDED_VERDICTS = [
  "first-stronger",
  "second-stronger",
  "comparable",
  "contrasted",
] as const;

export type BlindedVerdict = (typeof BLINDED_VERDICTS)[number];

/** The same verdicts, mapped out of the blinding into the versions' terms. */
export const PAIR_VERDICTS = [
  "baseline-stronger",
  "candidate-stronger",
  "comparable",
  "contrasted",
] as const;

export type PairVerdict = (typeof PAIR_VERDICTS)[number];

/**
 * A pair verdict after the two swapped passes are merged: agreement keeps the
 * verdict, disagreement is reported as exactly what it is — a judgement that
 * followed the order of presentation, which counts as no signal.
 */
export type MergedVerdict = PairVerdict | "unstable";

export const EXPECTATION_STATUSES = ["met", "partially-met", "not-met"] as const;

export type ExpectationStatus = (typeof EXPECTATION_STATUSES)[number];

export const FINDING_KINDS = ["strength", "weakness"] as const;

export type FindingKind = (typeof FINDING_KINDS)[number];

export const RECOMMENDATIONS = [
  "adopt-candidate",
  "keep-baseline",
  "no-established-difference",
] as const;

export type Recommendation = (typeof RECOMMENDATIONS)[number];

/**
 * Bounds of the contracts, named once. The minimums are the mechanical half of
 * "argumentée et reliée à des éléments précis": a one-clause argument or a
 * two-character excerpt satisfies neither, and a bound the schema carries is a
 * bound the repair pass can quote back.
 */
export const JUDGE_CONTRACT_BOUNDS = {
  argumentMinChars: 50,
  argumentMaxChars: 2_400,
  excerptMinChars: 3,
  excerptMaxChars: 400,
  locationMaxChars: 200,
  relevanceMinChars: 20,
  relevanceMaxChars: 600,
  evidenceMaxItems: 6,
  findingsPerCriterionMax: 3,
  summaryMaxChars: 3_000,
  reservationsMaxItems: 12,
} as const;

const REVIEW_EVIDENCE_SOURCES = ["output", "reference-text"] as const;

const COMPARISON_EVIDENCE_SOURCES = ["first-output", "second-output", "reference-text"] as const;

function evidenceSchema<Source extends string>(sources: readonly [Source, ...Source[]]) {
  return z.strictObject({
    /** Which text the excerpt is quoted from. */
    source: z.enum(sources),
    /** Verbatim, bounded — the precise element the critique is tied to. */
    excerpt: z
      .string()
      .min(JUDGE_CONTRACT_BOUNDS.excerptMinChars)
      .max(JUDGE_CONTRACT_BOUNDS.excerptMaxChars),
    /** Where it sits — a field path, a paragraph, a position in the text. */
    location: z.string().min(1).max(JUDGE_CONTRACT_BOUNDS.locationMaxChars),
    /** Why this element supports the critique. */
    relevance: z
      .string()
      .min(JUDGE_CONTRACT_BOUNDS.relevanceMinChars)
      .max(JUDGE_CONTRACT_BOUNDS.relevanceMaxChars),
  });
}

const argumentSchema = z
  .string()
  .min(JUDGE_CONTRACT_BOUNDS.argumentMinChars)
  .max(JUDGE_CONTRACT_BOUNDS.argumentMaxChars);

/**
 * The one cast this file allows itself, and it restates `assertBenchCriteria`:
 * a validated list has at least one member, which is exactly what `z.enum`
 * demands of its tuple.
 */
function criterionIdSchema(criteria: readonly BenchCriterion[]) {
  assertBenchCriteria(criteria);

  return z.enum(criteria.map((criterion) => criterion.id) as [string, ...string[]]);
}

export interface ReviewFinding {
  readonly criterionId: string;
  readonly kind: FindingKind;
  readonly argument: string;
  readonly evidence: readonly {
    readonly source: (typeof REVIEW_EVIDENCE_SOURCES)[number];
    readonly excerpt: string;
    readonly location: string;
    readonly relevance: string;
  }[];
}

export interface ExpectationCheck {
  readonly status: ExpectationStatus;
  readonly argument: string;
  readonly evidence: readonly {
    readonly source: (typeof REVIEW_EVIDENCE_SOURCES)[number];
    readonly excerpt: string;
    readonly location: string;
    readonly relevance: string;
  }[];
}

export interface ReviewJudgement {
  readonly findings: readonly ReviewFinding[];
  /** One per annotated expectation, in the expectations' own order. */
  readonly expectationChecks: readonly ExpectationCheck[];
  readonly summary: string;
}

/**
 * The review contract: at least one argued, evidenced finding per criterion,
 * one check per annotated expectation, a closing summary — and nothing
 * numeric anywhere.
 */
export function reviewContract(
  criteria: readonly BenchCriterion[],
  expectationCount: number,
): z.ZodType<ReviewJudgement> {
  const evidence = evidenceSchema(REVIEW_EVIDENCE_SOURCES);
  const criterionIds = criteria.map((criterion) => criterion.id);

  return z
    .strictObject({
      findings: z
        .array(
          z.strictObject({
            criterionId: criterionIdSchema(criteria),
            kind: z.enum(FINDING_KINDS),
            argument: argumentSchema,
            evidence: z.array(evidence).min(1).max(JUDGE_CONTRACT_BOUNDS.evidenceMaxItems),
          }),
        )
        .min(criteria.length)
        .max(criteria.length * JUDGE_CONTRACT_BOUNDS.findingsPerCriterionMax),
      expectationChecks: z
        .array(
          z.strictObject({
            status: z.enum(EXPECTATION_STATUSES),
            argument: argumentSchema,
            evidence: z.array(evidence).min(1).max(JUDGE_CONTRACT_BOUNDS.evidenceMaxItems),
          }),
        )
        .length(expectationCount),
      summary: z
        .string()
        .min(JUDGE_CONTRACT_BOUNDS.argumentMinChars)
        .max(JUDGE_CONTRACT_BOUNDS.summaryMaxChars),
    })
    .superRefine((value, context) => {
      const covered = new Set(value.findings.map((finding) => finding.criterionId));
      const missing = criterionIds.filter((id) => !covered.has(id));

      if (missing.length > 0) {
        // Field-located, so the pipeline's classification reads it as a form
        // failure worth one targeted repair pass — the judge is told which
        // criteria it left unanswered.
        context.addIssue({
          code: "custom",
          path: ["findings"],
          message: "every criterion needs at least one finding",
        });
      }
    });
}

export interface ComparisonJudgment {
  readonly criterionId: string;
  readonly verdict: BlindedVerdict;
  readonly argument: string;
  readonly evidence: readonly {
    readonly source: (typeof COMPARISON_EVIDENCE_SOURCES)[number];
    readonly excerpt: string;
    readonly location: string;
    readonly relevance: string;
  }[];
}

export interface ComparisonJudgement {
  readonly judgments: readonly ComparisonJudgment[];
  readonly overall: { readonly verdict: BlindedVerdict; readonly argument: string };
}

/**
 * The pairwise contract: exactly one judgement per criterion — no criterion
 * skipped, none answered twice — each argued and evidenced, plus an overall
 * judgement of the same form.
 */
export function comparisonContract(
  criteria: readonly BenchCriterion[],
): z.ZodType<ComparisonJudgement> {
  const evidence = evidenceSchema(COMPARISON_EVIDENCE_SOURCES);
  const criterionIds = criteria.map((criterion) => criterion.id);

  return z
    .strictObject({
      judgments: z
        .array(
          z.strictObject({
            criterionId: criterionIdSchema(criteria),
            verdict: z.enum(BLINDED_VERDICTS),
            argument: argumentSchema,
            evidence: z.array(evidence).min(1).max(JUDGE_CONTRACT_BOUNDS.evidenceMaxItems),
          }),
        )
        .length(criteria.length),
      overall: z.strictObject({
        verdict: z.enum(BLINDED_VERDICTS),
        argument: argumentSchema,
      }),
    })
    .superRefine((value, context) => {
      const answered = value.judgments.map((judgment) => judgment.criterionId);

      if (new Set(answered).size !== answered.length || answered.length !== criterionIds.length) {
        context.addIssue({
          code: "custom",
          path: ["judgments"],
          message: "exactly one judgment per criterion",
        });
      }
    });
}

export interface SynthesisJudgement {
  readonly recommendation: Recommendation;
  readonly argument: string;
  /** What this comparison does not allow one to conclude; may be empty. */
  readonly reservations: readonly string[];
}

/** The synthesis contract: a recommendation, its argument, its reservations. */
export function synthesisContract(): z.ZodType<SynthesisJudgement> {
  return z.strictObject({
    recommendation: z.enum(RECOMMENDATIONS),
    argument: z
      .string()
      .min(JUDGE_CONTRACT_BOUNDS.argumentMinChars)
      .max(JUDGE_CONTRACT_BOUNDS.summaryMaxChars),
    reservations: z
      .array(z.string().min(10).max(JUDGE_CONTRACT_BOUNDS.relevanceMaxChars))
      .max(JUDGE_CONTRACT_BOUNDS.reservationsMaxItems),
  });
}

/* -------------------------------------------------------------------------- *
 * Executor
 * -------------------------------------------------------------------------- */

export interface CreateBenchJudgeOptions {
  /** The endpoint the judge runs on — one, deliberately (no failover here). */
  readonly adapter: ProviderAdapter;
  /** Defaults to `BENCH_JUDGE`; injectable so a test pins the mechanics (§8). */
  readonly judge?: BenchJudgeDefinition;
  readonly capabilities?: Readonly<Record<ModelId, ModelCapability>>;
  readonly retryPolicy?: RetryPolicy;
  readonly repairPolicy?: RepairPolicy;
  readonly scheduler?: Scheduler;
  /** Jitter source, injected so tests are deterministic (§8). */
  readonly random?: () => number;
}

/** What one judge call answered with, and what it cost — never a score. */
export interface BenchJudgeCall<Output> {
  readonly output: Output;
  readonly model: ModelId;
  readonly promptId: PromptId;
  readonly promptVersion: number;
  /** Total across every pass, the repaired answer's included (CAL-056). */
  readonly usage: TokenUsage;
  readonly durationMs: number;
  readonly attemptCount: number;
}

export interface BenchJudge {
  /** The mechanics a report records beside every judgement. */
  readonly model: ModelId;
  call<Output>(
    prompt: RenderedPrompt,
    contract: z.ZodType<Output>,
  ): Promise<Result<BenchJudgeCall<Output>>>;
}

const DEADLINE_REACHED = Symbol("calepin.bench.deadline");

/**
 * Composes the judge over one adapter. Mis-wiring — an adapter for another
 * provider, a model that cannot serve a structured contract — throws at
 * composition, not at the hundredth case of a run.
 */
export function createBenchJudge(options: CreateBenchJudgeOptions): BenchJudge {
  const {
    adapter,
    judge = BENCH_JUDGE,
    capabilities = MODEL_CAPABILITIES,
    retryPolicy = DEFAULT_RETRY_POLICY,
    repairPolicy = DEFAULT_REPAIR_POLICY,
    scheduler = REAL_SCHEDULER,
    random = Math.random,
  } = options;

  const capability = capabilities[judge.model];

  if (capability.provider !== adapter.provider || !capability.supportsStructuredOutput) {
    throw modelNotConfigured();
  }

  async function attemptOnce(
    prompt: RenderedPrompt,
    outputSchema: Readonly<Record<string, unknown>>,
  ): Promise<Result<{ readonly value: unknown; readonly usage: TokenUsage }>> {
    const controller = new AbortController();
    const deadline = scheduler.setTimeout(
      () => controller.abort(DEADLINE_REACHED),
      judge.timeoutMs,
    );

    try {
      const response = await adapter.generateStructured({
        model: capability,
        system: prompt.system,
        prompt: prompt.text,
        maxOutputTokens: judge.maxOutputTokens,
        effort: judge.effort,
        signal: controller.signal,
        outputSchema,
      });

      return succeed(response);
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return fail(
          new TimeoutError({ message: "the judge attempt hit its deadline", cause: error }),
        );
      }

      return fail(toAppError(error));
    } finally {
      scheduler.clearTimeout(deadline);
    }
  }

  /** One pass: the judge's model with bounded, classified retries. */
  async function deliver(
    prompt: RenderedPrompt,
    outputSchema: Readonly<Record<string, unknown>>,
  ): Promise<{
    readonly result: Result<{ readonly value: unknown; readonly usage: TokenUsage }>;
    readonly attempts: number;
  }> {
    let attempts = 0;
    let lastError: AppError | undefined;

    for (let attempt = 1; attempt <= retryPolicy.maxAttemptsPerModel; attempt += 1) {
      attempts += 1;

      const outcome = await attemptOnce(prompt, outputSchema);

      if (outcome.ok) {
        return { result: outcome, attempts };
      }

      lastError = outcome.error;

      if (outcome.error.retryable && attempt < retryPolicy.maxAttemptsPerModel) {
        await sleep(scheduler, retryDelayMs(outcome.error, attempt, retryPolicy, random));
        continue;
      }

      break;
    }

    return {
      result: fail(lastError ?? new InternalError({ message: "the judge produced no outcome" })),
      attempts,
    };
  }

  return {
    model: judge.model,

    async call<Output>(
      prompt: RenderedPrompt,
      contract: z.ZodType<Output>,
    ): Promise<Result<BenchJudgeCall<Output>>> {
      // The same refusal the port makes: text the registry never minted does
      // not reach a provider, bench or no bench (§5.2).
      if (!isRenderedPrompt(prompt)) {
        throw new InternalError({
          code: "PROMPT_NOT_RENDERED",
          message: "a judge call carries a prompt the registry did not render",
        });
      }

      const outputSchema = z.toJSONSchema(contract) as Record<string, unknown>;
      const startedAt = scheduler.now();

      let attemptCount = 0;
      let current = prompt;
      let spent: TokenUsage = { inputTokens: 0, outputTokens: 0 };

      for (let repairs = 0; ; repairs += 1) {
        const pass = await deliver(current, outputSchema);

        attemptCount += pass.attempts;

        if (!pass.result.ok) {
          return fail(pass.result.error);
        }

        const { value, usage } = pass.result.value;

        spent = {
          inputTokens: spent.inputTokens + usage.inputTokens,
          outputTokens: spent.outputTokens + usage.outputTokens,
        };

        // A judge answer is a model answer: untrusted until parsed (§6).
        const parsed = contract.safeParse(value);

        if (parsed.success) {
          return succeed({
            output: parsed.data,
            model: capability.id,
            promptId: prompt.promptId,
            promptVersion: prompt.version,
            usage: spent,
            durationMs: scheduler.now() - startedAt,
            attemptCount,
          });
        }

        const issues = parsed.error.issues;

        if (classifyOutputFailure(issues, value, outputSchema) === "off-topic") {
          return fail(new ModelOutputOffTopicError({ usage: spent }));
        }

        if (repairs < repairPolicy.maxRepairAttempts) {
          // Built from the original prompt, exactly as the pipeline does: a
          // second repair names the latest violations rather than stacking.
          current = deriveRepairPrompt({ original: prompt, value, issues });
          continue;
        }

        const firstIssue = issues[0];

        return fail(
          new ModelOutputInvalidError({
            fieldPath: firstIssue === undefined ? undefined : toFieldPath(firstIssue.path),
            usage: spent,
          }),
        );
      }
    },
  };
}
