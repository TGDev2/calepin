/**
 * The context composer's public surface (CAL-054).
 *
 * What a caller gets: the composition entry point, the candidate types it must
 * fill, the report it can log, and the policy numbers — readable, so a domain
 * can state what will happen without re-deriving it. What it never gets: a way
 * to skip the ladder, override the budget, or reach a provider with text the
 * composition did not produce.
 */

export { type ComposedSceneContext, composeSceneContext } from "./compose";
export { ESTIMATED_CHARS_PER_TOKEN, estimateTokens } from "./estimate";
export {
  CONTEXT_ITEM_CEILINGS,
  type ContextItemKind,
  DETAILED_SUMMARY_WINDOW,
  MAX_CONTINUITY_EXCERPTS,
  MIN_SUMMARY_COUNT,
} from "./policy";
export type {
  CanonFactCandidate,
  ContextCompositionReport,
  ContinuityExcerptCandidate,
  PrecedingChapterSummary,
  SceneContextInput,
} from "./types";
