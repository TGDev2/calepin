/**
 * The context assembly of `analyze-source-text` (CAL-208).
 *
 * The same engine as the other two composers — render the real resource,
 * estimate the rendered text, compare against the mission's declared budget —
 * and the same shape as `composeChapterSummaryContext`, for the same reason it
 * has: **there is nothing to degrade.** A writing context is a *selection* from
 * a novel's memory, so when it does not fit there is always something less
 * necessary to shed. A diagnostic context *is* its subject: analysing half a
 * source text produces a diagnosis of half a source text, and every stage below
 * it — the directions, the bible, the plan — would be built on the half nobody
 * mentioned. So there is no ladder at all, and over budget is
 * `CONTEXT_BUDGET_EXCEEDED` with nothing sent.
 *
 * No per-item ceiling either, and that is the one difference from
 * `composePartSummaryContext`. A ceiling exists to catch a chapter where a
 * summary belongs — an item that is the wrong *kind* of thing. Here the whole
 * source text is the right kind of thing by definition; what bounds it is the
 * mission's own budget, which is the largest of the twenty-five precisely
 * because this is the mission whose input legitimately is the entire text. A
 * text too long to diagnose in one pass is a real failure with a real remedy,
 * and `SOURCE_TEXT_WORD_LIMIT` already refuses one at the door.
 */

import { fail, type Result, succeed } from "@calepin/shared/errors";

import { contextBudgetExceeded } from "../failures";
import { MISSION_REGISTRY } from "../mission-registry";
import { currentPrompt, type MissionPrompt, renderPrompt } from "../prompts";
import { estimateTokens } from "./estimate";
import type { ContextCompositionReport, SourceTextAnalysisContextInput } from "./types";

export interface ComposedAnalysisContext {
  readonly prompt: MissionPrompt;
  readonly report: AnalysisCompositionReport;
}

/**
 * The §9-safe projection of a diagnostic composition — identifiers and token
 * numbers, never a line of the text being diagnosed.
 *
 * It states exactly the six fields `ContextCompositionReport` shares with every
 * composition and adds none of its own, which is the honest shape: the scene
 * composer reports what it selected because it selects, and this one selects
 * nothing. `degradationStepsApplied` is therefore always zero, and reported
 * anyway so a reader comparing two composition reports does not have to know
 * which kind they are holding.
 */
export type AnalysisCompositionReport = Pick<
  ContextCompositionReport,
  | "missionId"
  | "promptId"
  | "promptVersion"
  | "budgetTokens"
  | "estimatedTokens"
  | "degradationStepsApplied"
>;

/**
 * Composes the context that diagnoses one version of the source text.
 *
 * `currentPrompt("analyze-source-text")` is typed as the latest version
 * exactly, so shipping a version that adds a variable breaks this call at
 * compile time rather than rendering a prompt with a hole in it (CAL-053).
 */
export function composeSourceTextAnalysisContext(
  input: SourceTextAnalysisContextInput,
): Result<ComposedAnalysisContext> {
  const definition = currentPrompt("analyze-source-text");
  const budgetTokens = MISSION_REGISTRY["analyze-source-text"].contextBudgetTokens;

  const prompt = renderPrompt(definition, {
    language: input.language,
    targetAudience: input.targetAudience,
    sourceText: input.sourceText,
    summaryWordTarget: input.summaryWordTarget,
    potentialWordTarget: input.potentialWordTarget,
    totalWordBudget: input.totalWordBudget,
    evidenceWordTarget: input.evidenceWordTarget,
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
    },
  });
}
