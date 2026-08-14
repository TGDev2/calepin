/**
 * The context assembly of `propose-directions` (CAL-210).
 *
 * The same engine as the other composers — render the real resource, estimate
 * the rendered text, compare against the mission's declared budget — and
 * `composeSourceTextAnalysisContext`'s shape, for the reason that one has:
 * **there is nothing to degrade.** Both of its two large inputs are the subject
 * rather than context. Proposing a novel out of half a source text proposes a
 * novel out of half a source text, and dropping a section of the diagnostic
 * would silently license the very inventions the freedom constraints exist to
 * bound. So there is no ladder, and over budget is `CONTEXT_BUDGET_EXCEEDED`
 * with nothing sent.
 *
 * The budget holds comfortably by construction: `SOURCE_TEXT_MAX_WORDS` is
 * 2 000 and `ANALYSIS_TOTAL_WORD_BUDGET` is 2 000, against the mission's
 * 60 000 tokens.
 *
 * **The freedom clauses are derived here, the narrative vocabulary is not.**
 * `freedomConstraints` and `SOURCE_DIMENSION_LABELS` are `@calepin/shared`'s and
 * this layer may read them (§3.2), so a caller cannot hand a level and a set of
 * clauses that disagree. Everything the *domain* owns — the engine axes, the
 * excluded engines, the counts and the word targets — arrives already worded,
 * because those same numbers bound the schema that validates the answer (§5.5).
 */

import { fail, type Result, succeed } from "@calepin/shared/errors";
import {
  freedomConstraints,
  SOURCE_DIMENSION_LABELS,
  SOURCE_DIMENSIONS,
} from "@calepin/shared/freedom-level";

import { contextBudgetExceeded } from "../failures";
import { MISSION_REGISTRY } from "../mission-registry";
import { currentPrompt, type MissionPrompt, renderPrompt } from "../prompts";
import { estimateTokens } from "./estimate";
import type { ContextCompositionReport, DirectionProposalsContextInput } from "./types";

export interface ComposedDirectionProposalsContext {
  readonly prompt: MissionPrompt;
  readonly report: DirectionProposalsCompositionReport;
}

/**
 * The §9-safe projection of a proposal composition — identifiers, token numbers
 * and how many engines were excluded. Never a clause, never a line of the text.
 *
 * `excludedEngineCount` is the one field beyond the six every composition
 * reports, and it is the one thing a reader of a relaunch needs: it says which
 * ask this was without quoting what was asked.
 */
export interface DirectionProposalsCompositionReport extends Pick<
  ContextCompositionReport,
  | "missionId"
  | "promptId"
  | "promptVersion"
  | "budgetTokens"
  | "estimatedTokens"
  | "degradationStepsApplied"
> {
  readonly directionCount: number;
  readonly excludedEngineCount: number;
}

/**
 * One line per source dimension — its declaration key and its French label, in
 * declaration order — for the prompt's `dimensionKeys` variable, so the ten keys
 * a direction must declare are never restated in prose (CAL-079).
 */
function dimensionKeys(): readonly string[] {
  return SOURCE_DIMENSIONS.map(
    (dimension) => `« ${dimension} » — ${SOURCE_DIMENSION_LABELS[dimension]}`,
  );
}

/**
 * Composes the context that proposes directions out of one validated diagnostic.
 *
 * `currentPrompt("propose-directions")` is typed as the latest version exactly,
 * so shipping a version that adds a variable breaks this call at compile time
 * rather than rendering a prompt with a hole in it (CAL-053).
 */
export function composeDirectionProposalsContext(
  input: DirectionProposalsContextInput,
): Result<ComposedDirectionProposalsContext> {
  const definition = currentPrompt("propose-directions");
  const budgetTokens = MISSION_REGISTRY["propose-directions"].contextBudgetTokens;

  const prompt = renderPrompt(definition, {
    language: input.language,
    targetAudience: input.targetAudience,
    targetWordCount: input.targetWordCount,
    validatedAnalysis: input.validatedAnalysis,
    sourceText: input.sourceText,
    freedomConstraints: freedomConstraints(input.freedomLevel, "direction").map(
      (constraint) => constraint.statement,
    ),
    dimensionKeys: dimensionKeys(),
    engineAxes: input.engineAxes,
    minEngineDifferences: input.minEngineDifferences,
    excludedEngines: input.excludedEngines,
    directionCount: input.directionCount,
    premiseWordTarget: input.premiseWordTarget,
    conflictWordTarget: input.conflictWordTarget,
    arcWordTarget: input.arcWordTarget,
    endingWordTarget: input.endingWordTarget,
    assessmentWordTarget: input.assessmentWordTarget,
    itemWordTarget: input.itemWordTarget,
    minNewStakes: input.minNewStakes,
    minMainRisks: input.minMainRisks,
    minElementsKept: input.minElementsKept,
    minElementsTransformed: input.minElementsTransformed,
    maxPerList: input.maxPerList,
  });

  const estimatedTokens = estimateTokens(prompt.system) + estimateTokens(prompt.text);

  if (estimatedTokens > budgetTokens) return fail(contextBudgetExceeded());

  return succeed({
    prompt,
    report: {
      missionId: prompt.missionId,
      promptId: prompt.promptId,
      promptVersion: prompt.version,
      budgetTokens,
      estimatedTokens,
      degradationStepsApplied: 0,
      directionCount: input.directionCount,
      excludedEngineCount: input.excludedEngines.length,
    },
  });
}
