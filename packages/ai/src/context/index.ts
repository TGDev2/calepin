/**
 * The context composer's public surface (CAL-054, CAL-055).
 *
 * What a caller gets: the composition entry points, the candidate types they
 * must fill, the reports they can log, and the policy numbers — readable, so a
 * domain can state what will happen without re-deriving it. What it never gets:
 * a way to skip the ladder, override the budget, or reach a provider with text
 * the composition did not produce.
 */

export {
  type AnalysisCompositionReport,
  type ComposedAnalysisContext,
  composeSourceTextAnalysisContext,
} from "./analysis";
export { type ComposedSceneContext, composeSceneContext } from "./compose";
export { ESTIMATED_CHARS_PER_TOKEN, estimateTokens } from "./estimate";
export {
  CONTEXT_ITEM_CEILINGS,
  type ContextItemKind,
  DEGRADABLE_ITEM_KINDS,
  DETAILED_SUMMARY_WINDOW,
  MAX_CONTINUITY_EXCERPTS,
  MIN_SUMMARY_COUNT,
} from "./policy";
export {
  composeChapterSummaryContext,
  type ComposedSummaryContext,
  composePartSummaryContext,
  type SummaryCompositionReport,
} from "./summarize";
export type {
  CanonFactCandidate,
  ChapterSummaryContextInput,
  ContextCompositionReport,
  ContinuityExcerptCandidate,
  PartSummary,
  PartSummaryChapter,
  PartSummaryContextInput,
  PrecedingChapterSummary,
  SceneContextInput,
  SourceTextAnalysisContextInput,
} from "./types";
