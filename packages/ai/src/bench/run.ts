/**
 * The bench's two runs (CAL-059).
 *
 * `runPromptEvaluation` — one version of a mission's prompt, the whole corpus:
 * per case the mission runs through the **real** `ModelProviderPort`, so what
 * is evaluated is what production would do — retries, repair passes and the
 * usage the provider reported included — and the judge then reviews the output
 * against the reference text, the annotated expectations and the criteria.
 *
 * `runPromptComparison` — two versions of the *same* prompt: baseline (the
 * version in place) and candidate (the change under consideration). Per case
 * both versions run, then the pair is judged twice with the positions swapped
 * and the judge blind to which output came from which version. Only a
 * preference that survives the swap counts; disagreement is reported as
 * `unstable` and counts as no signal. A closing synthesis judge call turns the
 * judged cases into an argued recommendation — counting is done here in code
 * and labelled as counting, deciding is the judge's, because a deterministic
 * threshold over verdicts would be the arbitrary score wearing a rule's
 * clothes.
 *
 * **A per-case failure is data, not an abort.** A version whose outputs fail
 * validation across the corpus is the comparison's most damning evidence, and
 * a report that died on the first failure would hide it. Mis-wiring — a
 * corpus that does not cover a version's variables, an output contract of the
 * wrong kind — still throws (§7): those fail every case the same way and name
 * a bug at the call site, not a property of the prompt.
 *
 * Cases run sequentially, by design: the bench is budget-capped tooling, and
 * a deterministic order makes two readings of one corpus comparable.
 */

import { type ErrorCategory, InternalError } from "@calepin/shared/errors";
import type { z } from "zod";

import { MODEL_CAPABILITIES, type ModelId } from "../capabilities";
import { missionOutputMismatch } from "../failures";
import { MISSION_REGISTRY } from "../mission-registry";
import type { MissionId } from "../missions";
import type { ModelCallMeta, ModelProviderPort, TokenUsage } from "../port";
import { estimateCostUsd, sumCostUsd } from "../pricing";
import {
  assertMissionPrompt,
  comparePrompts,
  currentPrompt,
  type MissionPrompt,
  missionPrompt,
  promptAtVersion,
  type PromptComparison,
  type PromptDefinition,
  type PromptId,
  renderPrompt,
} from "../prompts";
import { assertReferenceCorpus, type BenchCase, type ReferenceCorpus } from "./corpus";
import {
  assertBenchCriteria,
  BENCH_CRITERIA,
  type BenchCriterion,
  criteriaLines,
} from "./criteria";
import {
  type BenchJudge,
  type BlindedVerdict,
  comparisonContract,
  type ComparisonJudgement,
  type MergedVerdict,
  type PairVerdict,
  reviewContract,
  type ReviewJudgement,
  synthesisContract,
  type SynthesisJudgement,
} from "./judge";

/* -------------------------------------------------------------------------- *
 * Options
 * -------------------------------------------------------------------------- */

/**
 * The kind of answer the mission produces, and — for a structured one — its
 * schema, supplied by the caller because the owning domain holds it (§5.5)
 * and this layer may not import a domain. Checked against the mission
 * registry's own declaration before anything runs.
 */
export type BenchOutputContract =
  { readonly kind: "structured"; readonly schema: z.ZodType<unknown> } | { readonly kind: "prose" };

interface BenchRunOptions {
  /** The production pipeline — candidate outputs are made the way real ones are. */
  readonly port: ModelProviderPort;
  /** The bench's own executor (`createBenchJudge`). */
  readonly judge: BenchJudge;
  readonly missionId: MissionId;
  readonly corpus: ReferenceCorpus;
  /**
   * French statement of what the mission is asked to produce — what the judge
   * reads instead of the prompt under evaluation, which it must never see:
   * shown the wording, it would grade obedience to whichever version it read.
   */
  readonly missionIntent: string;
  readonly output: BenchOutputContract;
  /** Defaults to `BENCH_CRITERIA`; a run may extend the set, never empty it. */
  readonly criteria?: readonly BenchCriterion[];
}

export interface PromptEvaluationOptions extends BenchRunOptions {
  /** Defaults to the version currently in place. */
  readonly promptVersion?: number;
}

export interface PromptComparisonOptions extends BenchRunOptions {
  /** The version in place — the one a regression would regress from. */
  readonly baselineVersion: number;
  /** The change under consideration. */
  readonly candidateVersion: number;
}

/* -------------------------------------------------------------------------- *
 * Report shapes
 * -------------------------------------------------------------------------- */

/** How one mission run of one case ended — the mechanics are findings too. */
export type CandidateRun =
  | {
      readonly status: "produced";
      /** Prose as-is; structured output serialised — what the judge was shown. */
      readonly outputText: string;
      readonly meta: ModelCallMeta;
      readonly costUsd: string;
    }
  | {
      readonly status: "failed";
      readonly errorCode: string;
      readonly errorCategory: ErrorCategory;
    };

/** The mechanics of one judge call, recorded beside its judgement. */
export interface JudgeCallMechanics {
  readonly usage: TokenUsage;
  readonly durationMs: number;
  readonly attemptCount: number;
  readonly costUsd: string;
}

export interface JudgeFailure {
  readonly errorCode: string;
  readonly errorCategory: ErrorCategory;
}

export interface EvaluationCaseReport {
  readonly caseId: string;
  readonly title: string;
  readonly run: CandidateRun;
  readonly review?: { readonly judgement: ReviewJudgement } & JudgeCallMechanics;
  readonly judgeFailure?: JudgeFailure;
}

/** Which version sat where in one blinded pass — the legend a reader needs. */
export type PassOrder = "baseline-first" | "candidate-first";

export interface ComparisonPassReport extends JudgeCallMechanics {
  readonly order: PassOrder;
  readonly judgement: ComparisonJudgement;
}

export interface MergedCriterionJudgement {
  readonly criterionId: string;
  readonly verdict: MergedVerdict;
  /** True when the two swapped passes agreed. */
  readonly stable: boolean;
}

export interface ComparisonCaseReport {
  readonly caseId: string;
  readonly title: string;
  readonly baseline: CandidateRun;
  readonly candidate: CandidateRun;
  readonly judgement?: {
    readonly passes: readonly [ComparisonPassReport, ComparisonPassReport];
    readonly criteria: readonly MergedCriterionJudgement[];
    readonly overall: { readonly verdict: MergedVerdict; readonly stable: boolean };
  };
  readonly judgeFailure?: JudgeFailure;
}

/**
 * Counts of argued verdicts across the judged cases — a census of judgements,
 * never a measure of quality. The renderer states that framing in as many
 * words; this comment is where the shape itself states it.
 */
export interface CriterionTally {
  readonly criterionId: string;
  readonly counts: Readonly<Record<MergedVerdict, number>>;
}

export interface BenchJudgeIdentity {
  readonly model: ModelId;
  readonly promptId: PromptId;
  readonly promptVersion: number;
}

/** Usage and money across the run's *completed* calls — accounting, not quality. */
export interface BenchTotals {
  readonly missionUsage: TokenUsage;
  readonly judgeUsage: TokenUsage;
  readonly measuredCostUsd: string;
}

export interface PromptEvaluationReport {
  readonly missionId: MissionId;
  readonly promptId: PromptId;
  readonly promptVersion: number;
  readonly missionIntent: string;
  readonly judge: BenchJudgeIdentity;
  readonly corpus: {
    readonly id: string;
    readonly description: string;
    readonly caseCount: number;
  };
  readonly criteria: readonly BenchCriterion[];
  readonly cases: readonly EvaluationCaseReport[];
  readonly totals: BenchTotals;
  /** French — what this run cannot establish, stated rather than implied. */
  readonly limitations: readonly string[];
}

export interface PromptComparisonReport {
  readonly missionId: MissionId;
  readonly promptId: PromptId;
  readonly baselineVersion: number;
  readonly candidateVersion: number;
  readonly missionIntent: string;
  /** What changed in the text itself, beside what changed in the outputs. */
  readonly promptDiff: PromptComparison;
  readonly judge: BenchJudgeIdentity;
  readonly corpus: {
    readonly id: string;
    readonly description: string;
    readonly caseCount: number;
  };
  readonly criteria: readonly BenchCriterion[];
  readonly cases: readonly ComparisonCaseReport[];
  readonly tallies: readonly CriterionTally[];
  readonly overallTally: Readonly<Record<MergedVerdict, number>>;
  readonly synthesis?: { readonly judgement: SynthesisJudgement } & JudgeCallMechanics;
  /** French — why the synthesis was not asked for, when it was not. */
  readonly synthesisSkipped?: string;
  readonly totals: BenchTotals;
  readonly limitations: readonly string[];
}

/** French labels for merged verdicts — shared by the synthesis input and the renderer. */
export const MERGED_VERDICT_LABELS: Readonly<Record<MergedVerdict, string>> = {
  "baseline-stronger": "version en place plus forte",
  "candidate-stronger": "version candidate plus forte",
  comparable: "comparables",
  contrasted: "contrasté",
  unstable: "instable selon l'ordre de présentation",
};

/* -------------------------------------------------------------------------- *
 * Shared mechanics
 * -------------------------------------------------------------------------- */

const NO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/**
 * Resolves the definition a run evaluates, and refuses a registry incoherence
 * — a version whose scope stopped naming the mission — before a token is
 * spent on it.
 */
function resolveVersion(missionId: MissionId, version: number | undefined): PromptDefinition {
  const current = missionPrompt(missionId);
  const definition = version === undefined ? current : promptAtVersion(current.id, version);

  if (definition.scope.kind !== "mission" || definition.scope.missionId !== missionId) {
    throw new InternalError({
      message: "the resolved prompt version does not serve the mission under evaluation",
      fieldPath: `${definition.id}@${definition.version}`,
    });
  }

  return definition;
}

/**
 * The case's variables poured into one version of the mission prompt.
 *
 * The cast restates what `resolveVersion` just checked and `assertMissionPrompt`
 * re-checks at runtime: a mission-scoped definition renders a prompt that
 * names its mission. A corpus not covering a declared variable throws here,
 * with the variable's name — an authoring gap, not a property of the prompt.
 */
function renderCase(definition: PromptDefinition, benchCase: BenchCase): MissionPrompt {
  const rendered = renderPrompt(definition, benchCase.variables) as MissionPrompt;

  assertMissionPrompt(rendered);

  return rendered;
}

async function runCandidate(
  port: ModelProviderPort,
  output: BenchOutputContract,
  prompt: MissionPrompt,
): Promise<CandidateRun> {
  if (output.kind === "prose") {
    const result = await port.generateProse({ prompt });

    if (!result.ok) {
      return {
        status: "failed",
        errorCode: result.error.code,
        errorCategory: result.error.category,
      };
    }

    const { text, ...meta } = result.value;

    return {
      status: "produced",
      outputText: text,
      meta,
      costUsd: estimateCostUsd(meta.model, meta.usage),
    };
  }

  const result = await port.generateStructured({ prompt, schema: output.schema });

  if (!result.ok) {
    return { status: "failed", errorCode: result.error.code, errorCategory: result.error.category };
  }

  const { output: value, ...meta } = result.value;

  return {
    status: "produced",
    outputText: JSON.stringify(value, null, 2),
    meta,
    costUsd: estimateCostUsd(meta.model, meta.usage),
  };
}

function checkRunOptions(options: BenchRunOptions): readonly BenchCriterion[] {
  const criteria = options.criteria ?? BENCH_CRITERIA;

  assertBenchCriteria(criteria);
  assertReferenceCorpus(options.corpus);

  if (options.missionIntent.trim() === "") {
    throw new InternalError({ message: "a bench run needs the mission's French intent" });
  }

  // One mission, one treatment (§5.4): asking the bench for the kind of answer
  // the mission does not produce is a call-site bug, refused before a call.
  if (MISSION_REGISTRY[options.missionId].output.kind !== options.output.kind) {
    throw missionOutputMismatch();
  }

  return criteria;
}

function judgeCallMechanics(call: {
  readonly model: ModelId;
  readonly usage: TokenUsage;
  readonly durationMs: number;
  readonly attemptCount: number;
}): JudgeCallMechanics {
  return {
    usage: call.usage,
    durationMs: call.durationMs,
    attemptCount: call.attemptCount,
    costUsd: estimateCostUsd(call.model, call.usage),
  };
}

/** The limitations every bench report must state, in the reader's language. */
function sharedLimitations(
  judge: BenchJudge,
  corpus: ReferenceCorpus,
  failedRunCount: number,
): string[] {
  const lines = [
    "Un seul échantillon par cas et par version : la variance d'échantillonnage n'est pas mesurée.",
    `Le juge est un modèle (${MODEL_CAPABILITIES[judge.model].label}) : ses jugements sont faillibles. Les preuves citées sont là pour être contrôlées, pas pour être crues sur parole.`,
    `Le jeu de textes « ${corpus.id} » (${corpus.cases.length} cas) ne couvre que ce qu'il couvre : un effet absent du corpus reste invisible.`,
  ];

  if (failedRunCount > 0) {
    lines.push(
      `${failedRunCount} exécution(s) de mission en échec technique : leur qualité n'a pas été jugée et leur coût n'est pas compté dans les totaux.`,
    );
  }

  return lines;
}

/* -------------------------------------------------------------------------- *
 * Evaluation — one version, the whole corpus, an argued review per case
 * -------------------------------------------------------------------------- */

export async function runPromptEvaluation(
  options: PromptEvaluationOptions,
): Promise<PromptEvaluationReport> {
  const criteria = checkRunOptions(options);
  const definition = resolveVersion(options.missionId, options.promptVersion);
  const reviewDefinition = currentPrompt("bench-review-output");

  const cases: EvaluationCaseReport[] = [];
  let missionUsage = NO_USAGE;
  let judgeUsage = NO_USAGE;
  const costs: string[] = [];
  let failedRunCount = 0;

  for (const benchCase of options.corpus.cases) {
    const run = await runCandidate(options.port, options.output, renderCase(definition, benchCase));

    if (run.status === "failed") {
      failedRunCount += 1;
      cases.push({ caseId: benchCase.id, title: benchCase.title, run });
      continue;
    }

    missionUsage = addUsage(missionUsage, run.meta.usage);
    costs.push(run.costUsd);

    const reviewPrompt = renderPrompt(reviewDefinition, {
      missionIntent: options.missionIntent,
      referenceText: benchCase.referenceText,
      evaluatedOutput: run.outputText,
      criteria: criteriaLines(criteria),
      expectations: benchCase.expectations,
    });

    const review = await options.judge.call(
      reviewPrompt,
      reviewContract(criteria, benchCase.expectations.length),
    );

    if (!review.ok) {
      cases.push({
        caseId: benchCase.id,
        title: benchCase.title,
        run,
        judgeFailure: { errorCode: review.error.code, errorCategory: review.error.category },
      });
      continue;
    }

    judgeUsage = addUsage(judgeUsage, review.value.usage);

    const mechanics = judgeCallMechanics(review.value);

    costs.push(mechanics.costUsd);
    cases.push({
      caseId: benchCase.id,
      title: benchCase.title,
      run,
      review: { judgement: review.value.output, ...mechanics },
    });
  }

  return {
    missionId: options.missionId,
    promptId: definition.id,
    promptVersion: definition.version,
    missionIntent: options.missionIntent,
    judge: {
      model: options.judge.model,
      promptId: reviewDefinition.id,
      promptVersion: reviewDefinition.version,
    },
    corpus: {
      id: options.corpus.id,
      description: options.corpus.description,
      caseCount: options.corpus.cases.length,
    },
    criteria,
    cases,
    totals: { missionUsage, judgeUsage, measuredCostUsd: sumCostUsd(costs) },
    limitations: sharedLimitations(options.judge, options.corpus, failedRunCount),
  };
}

/* -------------------------------------------------------------------------- *
 * Comparison — two versions, blinded swapped passes, merge, synthesis
 * -------------------------------------------------------------------------- */

function toPairVerdict(verdict: BlindedVerdict, order: PassOrder): PairVerdict {
  switch (verdict) {
    case "comparable":
    case "contrasted":
      return verdict;
    case "first-stronger":
      return order === "baseline-first" ? "baseline-stronger" : "candidate-stronger";
    case "second-stronger":
      return order === "baseline-first" ? "candidate-stronger" : "baseline-stronger";
  }
}

function mergeVerdicts(
  first: PairVerdict,
  second: PairVerdict,
): { readonly verdict: MergedVerdict; readonly stable: boolean } {
  return first === second
    ? { verdict: first, stable: true }
    : { verdict: "unstable", stable: false };
}

function emptyTally(): Record<MergedVerdict, number> {
  return {
    "baseline-stronger": 0,
    "candidate-stronger": 0,
    comparable: 0,
    contrasted: 0,
    unstable: 0,
  };
}

/** The failure lines the synthesis judge reads for cases nobody could judge. */
function unjudgedLine(entry: ComparisonCaseReport): string {
  if (entry.baseline.status === "failed" && entry.candidate.status === "failed") {
    return `cas ${entry.caseId} — échec technique des deux versions : aucune comparaison rendue`;
  }

  if (entry.baseline.status === "failed") {
    return `cas ${entry.caseId} — échec technique de la version en place (${entry.baseline.errorCode}) : aucune comparaison rendue`;
  }

  if (entry.candidate.status === "failed") {
    return `cas ${entry.caseId} — échec technique de la version candidate (${entry.candidate.errorCode}) : aucune comparaison rendue`;
  }

  return `cas ${entry.caseId} — échec du juge (${entry.judgeFailure?.errorCode ?? "inconnu"}) : aucune comparaison rendue`;
}

export async function runPromptComparison(
  options: PromptComparisonOptions,
): Promise<PromptComparisonReport> {
  const criteria = checkRunOptions(options);

  if (options.baselineVersion === options.candidateVersion) {
    throw new InternalError({
      message: "a comparison needs two different versions of the prompt",
      fieldPath: String(options.baselineVersion),
    });
  }

  const baselineDefinition = resolveVersion(options.missionId, options.baselineVersion);
  const candidateDefinition = resolveVersion(options.missionId, options.candidateVersion);
  const compareDefinition = currentPrompt("bench-compare-outputs");
  const contract = comparisonContract(criteria);

  const cases: ComparisonCaseReport[] = [];
  let missionUsage = NO_USAGE;
  let judgeUsage = NO_USAGE;
  const costs: string[] = [];
  let failedRunCount = 0;

  for (const benchCase of options.corpus.cases) {
    const baseline = await runCandidate(
      options.port,
      options.output,
      renderCase(baselineDefinition, benchCase),
    );
    const candidate = await runCandidate(
      options.port,
      options.output,
      renderCase(candidateDefinition, benchCase),
    );

    for (const run of [baseline, candidate]) {
      if (run.status === "produced") {
        missionUsage = addUsage(missionUsage, run.meta.usage);
        costs.push(run.costUsd);
      } else {
        failedRunCount += 1;
      }
    }

    if (baseline.status !== "produced" || candidate.status !== "produced") {
      cases.push({ caseId: benchCase.id, title: benchCase.title, baseline, candidate });
      continue;
    }

    // The blinding is the swap itself: the judge sees réponse 1 and réponse 2,
    // and which version sits where is decided here, recorded, and reversed on
    // the second pass — deterministic, so a rerun of the corpus is comparable.
    const passes: ComparisonPassReport[] = [];
    let judgeFailure: JudgeFailure | undefined;

    for (const order of ["baseline-first", "candidate-first"] as const) {
      const [firstOutput, secondOutput] =
        order === "baseline-first"
          ? [baseline.outputText, candidate.outputText]
          : [candidate.outputText, baseline.outputText];

      const passPrompt = renderPrompt(compareDefinition, {
        missionIntent: options.missionIntent,
        referenceText: benchCase.referenceText,
        firstOutput,
        secondOutput,
        criteria: criteriaLines(criteria),
        expectations: benchCase.expectations,
      });

      const pass = await options.judge.call(passPrompt, contract);

      if (!pass.ok) {
        judgeFailure = { errorCode: pass.error.code, errorCategory: pass.error.category };
        break;
      }

      judgeUsage = addUsage(judgeUsage, pass.value.usage);

      const mechanics = judgeCallMechanics(pass.value);

      costs.push(mechanics.costUsd);
      passes.push({ order, judgement: pass.value.output, ...mechanics });
    }

    const [firstPass, secondPass] = passes;

    if (judgeFailure !== undefined || firstPass === undefined || secondPass === undefined) {
      cases.push({
        caseId: benchCase.id,
        title: benchCase.title,
        baseline,
        candidate,
        ...(judgeFailure === undefined ? {} : { judgeFailure }),
      });
      continue;
    }

    const byCriterion = (pass: ComparisonPassReport): ReadonlyMap<string, BlindedVerdict> =>
      new Map(pass.judgement.judgments.map((judgment) => [judgment.criterionId, judgment.verdict]));

    const firstVerdicts = byCriterion(firstPass);
    const secondVerdicts = byCriterion(secondPass);

    const merged = criteria.map((criterion): MergedCriterionJudgement => {
      const first = firstVerdicts.get(criterion.id);
      const second = secondVerdicts.get(criterion.id);

      if (first === undefined || second === undefined) {
        // The contract demands exactly one judgment per criterion; a parsed
        // answer missing one is a validation bug, not a judge opinion.
        throw new InternalError({
          message: "a parsed comparison pass lacks a criterion the contract demands",
          fieldPath: criterion.id,
        });
      }

      return {
        criterionId: criterion.id,
        ...mergeVerdicts(
          toPairVerdict(first, firstPass.order),
          toPairVerdict(second, secondPass.order),
        ),
      };
    });

    cases.push({
      caseId: benchCase.id,
      title: benchCase.title,
      baseline,
      candidate,
      judgement: {
        passes: [firstPass, secondPass],
        criteria: merged,
        overall: mergeVerdicts(
          toPairVerdict(firstPass.judgement.overall.verdict, firstPass.order),
          toPairVerdict(secondPass.judgement.overall.verdict, secondPass.order),
        ),
      },
    });
  }

  const tallies: CriterionTally[] = criteria.map((criterion) => {
    const counts = emptyTally();

    for (const entry of cases) {
      const verdict = entry.judgement?.criteria.find(
        (judged) => judged.criterionId === criterion.id,
      )?.verdict;

      if (verdict !== undefined) {
        counts[verdict] += 1;
      }
    }

    return { criterionId: criterion.id, counts };
  });

  const overallTally = emptyTally();

  for (const entry of cases) {
    if (entry.judgement !== undefined) {
      overallTally[entry.judgement.overall.verdict] += 1;
    }
  }

  const judgedCases = cases.filter((entry) => entry.judgement !== undefined);

  let synthesis: PromptComparisonReport["synthesis"];
  let synthesisSkipped: string | undefined;
  const synthesisDefinition = currentPrompt("bench-synthesize-comparison");

  if (judgedCases.length === 0) {
    synthesisSkipped =
      "Aucun cas n'a pu être jugé (échecs techniques) : la synthèse n'a pas été demandée au juge.";
  } else {
    const caseVerdicts = cases.map((entry) => {
      if (entry.judgement === undefined) {
        return unjudgedLine(entry);
      }

      const perCriterion = entry.judgement.criteria
        .map((judged) => `${judged.criterionId} : ${MERGED_VERDICT_LABELS[judged.verdict]}`)
        .join(" ; ");

      return `cas ${entry.caseId} — ensemble : ${MERGED_VERDICT_LABELS[entry.judgement.overall.verdict]} ; ${perCriterion}`;
    });

    const caseArguments = judgedCases.flatMap((entry) =>
      (entry.judgement?.passes ?? []).map((pass) => {
        const legend =
          pass.order === "baseline-first"
            ? "réponse 1 = version en place, réponse 2 = version candidate"
            : "réponse 1 = version candidate, réponse 2 = version en place";

        return `cas ${entry.caseId} (${legend}) : ${pass.judgement.overall.argument}`;
      }),
    );

    const synthesisPrompt = renderPrompt(synthesisDefinition, {
      missionIntent: options.missionIntent,
      caseCount: options.corpus.cases.length,
      criteria: criteriaLines(criteria),
      caseVerdicts,
      caseArguments,
    });

    const result = await options.judge.call(synthesisPrompt, synthesisContract());

    if (result.ok) {
      judgeUsage = addUsage(judgeUsage, result.value.usage);

      const mechanics = judgeCallMechanics(result.value);

      costs.push(mechanics.costUsd);
      synthesis = { judgement: result.value.output, ...mechanics };
    } else {
      synthesisSkipped = `La synthèse a échoué (${result.error.code}) : les jugements par cas restent lisibles ci-dessus.`;
    }
  }

  const limitations = sharedLimitations(options.judge, options.corpus, failedRunCount);
  const unstableCount = cases.reduce(
    (total, entry) =>
      total + (entry.judgement?.criteria.filter((judged) => !judged.stable).length ?? 0),
    0,
  );
  const judgedCriterionCount = judgedCases.length * criteria.length;

  if (judgedCriterionCount > 0) {
    limitations.push(
      `${unstableCount} jugement(s) de critère sur ${judgedCriterionCount} rendus instables selon l'ordre de présentation : comptés comme absence de signal, jamais comme une préférence.`,
    );
  }

  return {
    missionId: options.missionId,
    promptId: baselineDefinition.id,
    baselineVersion: baselineDefinition.version,
    candidateVersion: candidateDefinition.version,
    missionIntent: options.missionIntent,
    promptDiff: comparePrompts(baselineDefinition, candidateDefinition),
    judge: {
      model: options.judge.model,
      promptId: compareDefinition.id,
      promptVersion: compareDefinition.version,
    },
    corpus: {
      id: options.corpus.id,
      description: options.corpus.description,
      caseCount: options.corpus.cases.length,
    },
    criteria,
    cases,
    tallies,
    overallTally,
    ...(synthesis === undefined ? {} : { synthesis }),
    ...(synthesisSkipped === undefined ? {} : { synthesisSkipped }),
    totals: { missionUsage, judgeUsage, measuredCostUsd: sumCostUsd(costs) },
    limitations,
  };
}
