/**
 * The dynamic context composer (CAL-054) — §5.8 made structural.
 *
 * For the writing mission it assembles the seven ingredients — the permanent
 * instructions (the prompt's own text), the relevant bible section, the target
 * chapter's plan, the canon facts actually concerned, the preceding chapters'
 * summaries, the excerpts continuity strictly requires, and the author's
 * request — into the current `write-scene` prompt, under the mission's
 * declared budget. The full text of a preceding chapter has no way in: no
 * input field carries it, and every field that carries prose has a ceiling an
 * entire chapter cannot pass.
 *
 * The budget is measured on the **rendered** prompt — the exact text a
 * provider would receive — by walking the degradation ladder until the
 * conservative estimate fits. Composition therefore ends in a branded
 * `MissionPrompt` (§5.2) carrying the version to record, and a §9-safe report
 * of what was kept, degraded and dropped.
 */

import { fail, type Result, succeed } from "@calepin/shared/errors";

import { contextBudgetExceeded, contextItemOversized } from "../failures";
import { MISSION_REGISTRY } from "../mission-registry";
import { currentPrompt, type MissionPrompt, renderPrompt } from "../prompts";
import { estimateTokens } from "./estimate";
import {
  CONTEXT_ITEM_CEILINGS,
  type ContextItemKind,
  type DegradationState,
  degradationStates,
  DETAILED_SUMMARY_WINDOW,
  MIN_SUMMARY_COUNT,
  selectCanonFacts,
  selectContinuityExcerpts,
} from "./policy";
import type {
  ContextCompositionReport,
  ContinuityExcerptCandidate,
  PrecedingChapterSummary,
  SceneContextInput,
} from "./types";

export interface ComposedSceneContext {
  readonly prompt: MissionPrompt;
  readonly report: ContextCompositionReport;
}

/**
 * Composes the writing context for one chapter.
 *
 * Ceilings first, on everything offered — an oversized item is a category
 * error, refused before any selection can hide it. Then selection, then the
 * ladder: render, estimate, degrade, until the estimate fits the mission's
 * budget or the ladder ends in `CONTEXT_BUDGET_EXCEEDED`. Both failures are
 * values (§7); nothing is sent on either.
 */
export function composeSceneContext(input: SceneContextInput): Result<ComposedSceneContext> {
  const oversized = findOversizedItem(input);

  if (oversized !== undefined) {
    return fail(contextItemOversized(oversized));
  }

  const facts = selectCanonFacts(input.canonFacts, input.outlineEntityIds);
  const excerpts = selectContinuityExcerpts(input.continuityExcerpts);
  // Story order — farthest first — so the model reads the past in sequence.
  const summaries = [...input.precedingChapters].sort((a, b) => b.distance - a.distance);

  const definition = currentPrompt("write-scene");
  const budgetTokens = MISSION_REGISTRY["write-scene"].contextBudgetTokens;
  const states = degradationStates(
    {
      detailedWindow: DETAILED_SUMMARY_WINDOW,
      excerptCount: excerpts.length,
      summaryCount: summaries.length,
    },
    Math.min(MIN_SUMMARY_COUNT, summaries.length),
  );

  for (const [step, state] of states.entries()) {
    const keptSummaries = summaries.slice(summaries.length - state.summaryCount);
    const keptExcerpts = [...excerpts.slice(0, state.excerptCount)].sort(
      (a, b) => b.distance - a.distance,
    );
    const detailedCount = keptSummaries.filter((chapter) => carriesDetail(chapter, state)).length;

    const prompt = renderPrompt(definition, {
      language: input.language,
      bibleStyle: input.bibleStyle,
      chapterOutline: input.chapterOutline,
      targetWordCount: input.targetWordCount,
      authorInstructions: input.authorInstructions,
      freedomConstraints: input.freedomConstraints,
      canonFacts: facts.map((fact) => fact.statement),
      precedingSummaries: keptSummaries.map((chapter) =>
        carriesDetail(chapter, state)
          ? (chapter.detailedSummary ?? chapter.briefSummary)
          : chapter.briefSummary,
      ),
      continuityExcerpts: keptExcerpts.map((excerpt) => excerpt.text),
    });

    const estimatedTokens = estimateTokens(prompt.system) + estimateTokens(prompt.text);

    if (estimatedTokens <= budgetTokens) {
      return succeed({
        prompt,
        report: {
          missionId: prompt.missionId,
          promptId: prompt.promptId,
          promptVersion: prompt.version,
          budgetTokens,
          estimatedTokens,
          degradationStepsApplied: step,
          facts: { offered: input.canonFacts.length, selected: facts.length },
          summaries: {
            offered: input.precedingChapters.length,
            detailed: detailedCount,
            brief: keptSummaries.length - detailedCount,
            dropped: input.precedingChapters.length - keptSummaries.length,
          },
          excerpts: { offered: input.continuityExcerpts.length, selected: keptExcerpts.length },
        },
      });
    }
  }

  return fail(contextBudgetExceeded());
}

function carriesDetail(chapter: PrecedingChapterSummary, state: DegradationState): boolean {
  return chapter.distance <= state.detailedWindow && chapter.detailedSummary !== undefined;
}

/**
 * The ceiling check, over everything offered — the fieldPath names the kind
 * and the item, never its text (§9).
 */
function findOversizedItem(input: SceneContextInput): string | undefined {
  const items: readonly {
    readonly kind: ContextItemKind;
    readonly path: string;
    readonly text: string;
  }[] = [
    { kind: "bibleStyle", path: "bibleStyle", text: input.bibleStyle },
    { kind: "chapterOutline", path: "chapterOutline", text: input.chapterOutline },
    ...input.authorInstructions.map((text, index) => ({
      kind: "authorInstruction" as const,
      path: `authorInstructions.${index}`,
      text,
    })),
    ...input.freedomConstraints.map((text, index) => ({
      kind: "freedomConstraint" as const,
      path: `freedomConstraints.${index}`,
      text,
    })),
    ...input.canonFacts.map((fact) => ({
      kind: "canonFact" as const,
      path: `canonFacts.${fact.id}`,
      text: fact.statement,
    })),
    ...input.precedingChapters.flatMap((chapter) => [
      {
        kind: "briefSummary" as const,
        path: `precedingChapters.${chapter.id}.briefSummary`,
        text: chapter.briefSummary,
      },
      ...(chapter.detailedSummary === undefined
        ? []
        : [
            {
              kind: "detailedSummary" as const,
              path: `precedingChapters.${chapter.id}.detailedSummary`,
              text: chapter.detailedSummary,
            },
          ]),
    ]),
    ...input.continuityExcerpts.map((excerpt: ContinuityExcerptCandidate) => ({
      kind: "continuityExcerpt" as const,
      path: `continuityExcerpts.${excerpt.id}`,
      text: excerpt.text,
    })),
  ];

  return items.find((item) => estimateTokens(item.text) > CONTEXT_ITEM_CEILINGS[item.kind])?.path;
}
