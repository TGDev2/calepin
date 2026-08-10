/**
 * The context assemblies of the two summarising missions (CAL-055).
 *
 * Both sit on the same engine as `composeSceneContext` — render the real
 * resource, estimate the rendered text, compare against the mission's declared
 * budget — and both differ from it in the same way: **there is almost nothing
 * to degrade.**
 *
 * That is not a simplification, it is the shape of the problem. A writing
 * context is a *selection* from a novel's memory, so when it does not fit there
 * is always something less necessary to shed. A summarising context *is* its
 * subject: dropping half a chapter before summarising it produces a summary of
 * half a chapter, which is worse than no summary at all because nothing
 * downstream can tell the difference. So `composeChapterSummaryContext` has no
 * ladder, and `composePartSummaryContext` has exactly one rung — the detailed
 * chapter summaries falling back to the brief ones, which loses resolution and
 * never loses a chapter.
 *
 * Over budget after that is `CONTEXT_BUDGET_EXCEEDED`, a `Result` the caller
 * must handle (§7), and nothing is sent.
 */

import { fail, type Result, succeed } from "@calepin/shared/errors";

import { contextBudgetExceeded, contextItemOversized } from "../failures";
import { MISSION_REGISTRY } from "../mission-registry";
import { currentPrompt, type MissionPrompt, renderPrompt } from "../prompts";
import { estimateTokens } from "./estimate";
import { CONTEXT_ITEM_CEILINGS } from "./policy";
import type {
  ChapterSummaryContextInput,
  ContextCompositionReport,
  PartSummaryContextInput,
} from "./types";

export interface ComposedSummaryContext {
  readonly prompt: MissionPrompt;
  readonly report: SummaryCompositionReport;
}

/**
 * The §9-safe projection of a summarising composition — counts, identifiers and
 * token numbers, never a line of what was summarised.
 *
 * It reuses `ContextCompositionReport`'s first six fields and states its own
 * inputs rather than the scene composer's sections, because a report whose
 * `facts` and `excerpts` were always zero would be five fields of noise
 * pretending the two compositions are the same shape.
 */
export interface SummaryCompositionReport extends Pick<
  ContextCompositionReport,
  | "missionId"
  | "promptId"
  | "promptVersion"
  | "budgetTokens"
  | "estimatedTokens"
  | "degradationStepsApplied"
> {
  /** Chapters offered — 1 for a chapter summary, the part's count for a part. */
  readonly chaptersOffered: number;
  /** True when the part composition fell back to the brief summaries. */
  readonly usedBriefSummariesOnly: boolean;
}

/**
 * Composes the context that summarises one chapter.
 *
 * The chapter's own text has no ceiling of its own: it *is* the input, and the
 * only meaningful bound on it is the mission's budget, checked on the rendered
 * prompt like everywhere else. A chapter too long to summarise in one pass is a
 * real failure with a real remedy (a shorter chapter, or a bigger budget), and
 * silently truncating it would produce a summary that reads complete and is not.
 */
export function composeChapterSummaryContext(
  input: ChapterSummaryContextInput,
): Result<ComposedSummaryContext> {
  const definition = currentPrompt("summarize-chapter");
  const budgetTokens = MISSION_REGISTRY["summarize-chapter"].contextBudgetTokens;

  const prompt = renderPrompt(definition, {
    language: input.language,
    chapterText: input.chapterText,
    briefWordTarget: input.briefWordTarget,
    detailedWordTarget: input.detailedWordTarget,
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
      chaptersOffered: 1,
      usedBriefSummariesOnly: false,
    },
  });
}

/**
 * Composes the context that summarises one part, out of its chapters'
 * summaries.
 *
 * The ceiling check still applies here, and it matters more than it looks: the
 * chapter summaries reaching this composer are the same rows the writing
 * context reads, so a "summary" that is really a chapter would poison both.
 * Refusing it once, at the boundary, covers the two.
 */
export function composePartSummaryContext(
  input: PartSummaryContextInput,
): Result<ComposedSummaryContext> {
  const oversized = findOversizedSummary(input);

  if (oversized !== undefined) return fail(contextItemOversized(oversized));

  const definition = currentPrompt("summarize-part");
  const budgetTokens = MISSION_REGISTRY["summarize-part"].contextBudgetTokens;
  // One rung: detail first, then brief only. Never fewer chapters — a part
  // summary missing a chapter is wrong rather than shorter.
  const ladder = [false, true] as const;

  for (const [step, briefOnly] of ladder.entries()) {
    const prompt = renderPrompt(definition, {
      language: input.language,
      partTitle: input.partTitle,
      wordTarget: input.wordTarget,
      plannedArc: input.plannedArc,
      chapterSummaries: input.chapters.map((chapter) =>
        briefOnly ? chapter.briefSummary : (chapter.detailedSummary ?? chapter.briefSummary),
      ),
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
          chaptersOffered: input.chapters.length,
          usedBriefSummariesOnly: briefOnly,
        },
      });
    }
  }

  return fail(contextBudgetExceeded());
}

/** The fieldPath names the kind and the chapter, never the text (§9). */
function findOversizedSummary(input: PartSummaryContextInput): string | undefined {
  for (const chapter of input.chapters) {
    if (estimateTokens(chapter.briefSummary) > CONTEXT_ITEM_CEILINGS.briefSummary) {
      return `chapters.${chapter.id}.briefSummary`;
    }

    if (
      chapter.detailedSummary !== undefined &&
      estimateTokens(chapter.detailedSummary) > CONTEXT_ITEM_CEILINGS.detailedSummary
    ) {
      return `chapters.${chapter.id}.detailedSummary`;
    }
  }

  return undefined;
}
