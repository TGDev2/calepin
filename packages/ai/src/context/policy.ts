/**
 * The selection policy and the degradation ladder (CAL-054, §5.8).
 *
 * Everything here is mission-agnostic mechanics over structural signals — ids,
 * distances, priorities, sizes. What a statement means never enters (§5.7).
 * `compose.ts` assembles these pieces for `write-scene`; later missions add
 * their assemblies over the same engine in their own epics.
 */

import type { CanonFactCandidate, ContinuityExcerptCandidate } from "./types";

/**
 * The ceiling of each literary item kind, in estimated tokens — checked at
 * entry, before selection, on everything offered.
 *
 * The numbers are generous for their kind and an order of magnitude under a
 * chapter: a target-length chapter estimates at several thousand tokens, so a
 * chapter travelling under any of these names is refused rather than composed.
 * That refusal is what makes "never the whole novel" (§5.8) a property of the
 * composer instead of a hope about its callers. Raising a ceiling is a
 * decision about that rule, not a convenience.
 */
export const CONTEXT_ITEM_CEILINGS = {
  bibleStyle: 2_000,
  chapterOutline: 2_000,
  authorInstruction: 1_000,
  freedomConstraint: 200,
  canonFact: 200,
  briefSummary: 400,
  detailedSummary: 1_200,
  continuityExcerpt: 1_000,
} as const;

export type ContextItemKind = keyof typeof CONTEXT_ITEM_CEILINGS;

/** How many of the nearest chapters carry their detailed summary at first. */
export const DETAILED_SUMMARY_WINDOW = 2;

/** The most excerpts a context ever carries — "strictly necessary" is few. */
export const MAX_CONTINUITY_EXCERPTS = 3;

/**
 * The floor of ladder step 3: the nearest chapters whose summaries are never
 * dropped. Below this the context stops saying what just happened, and the
 * right failure is `CONTEXT_BUDGET_EXCEEDED`, not a quieter context.
 */
export const MIN_SUMMARY_COUNT = 3;

/**
 * The facts actually concerned — *faits réellement concernés*.
 *
 * A fact enters when the outline names it (the `ChapterOutlineFact` link) or
 * when one of its subjects is an entity the outline names — set intersection
 * over ids, statements unread. Named facts rank before linked ones because the
 * outline's own naming is the stronger signal; within a rank the caller's
 * order stands. Facts are never degraded afterwards: dropping one to save
 * tokens invites the contradiction the product exists to prevent.
 */
export function selectCanonFacts(
  candidates: readonly CanonFactCandidate[],
  outlineEntityIds: readonly string[],
): readonly CanonFactCandidate[] {
  const entityIds = new Set(outlineEntityIds);
  const named = candidates.filter((fact) => fact.isNamedByOutline);
  const linked = candidates.filter(
    (fact) => !fact.isNamedByOutline && fact.subjectIds.some((id) => entityIds.has(id)),
  );

  return [...named, ...linked];
}

/**
 * The excerpts continuity actually requires: the top `MAX_CONTINUITY_EXCERPTS`
 * by priority, the nearer chapter breaking a tie, the caller's order breaking
 * the rest (`Array.prototype.sort` is stable). The result stays in priority
 * order — the ladder drops from its end.
 */
export function selectContinuityExcerpts(
  candidates: readonly ContinuityExcerptCandidate[],
): readonly ContinuityExcerptCandidate[] {
  return [...candidates]
    .sort((a, b) => a.priority - b.priority || a.distance - b.distance)
    .slice(0, MAX_CONTINUITY_EXCERPTS);
}

/**
 * One rung of the ladder: how much of each degradable section survives.
 * Everything not named here — outline, style, facts, constraints, the
 * author's request, the prompt's own text — is not degradable at all.
 */
export interface DegradationState {
  /** Nearest chapters still carrying their detailed summary. */
  readonly detailedWindow: number;
  /** Excerpts still included, from the top of the priority order. */
  readonly excerptCount: number;
  /** Nearest chapters still represented by a summary at all. */
  readonly summaryCount: number;
}

/**
 * The ladder, in full, most generous state first — walked by the composer
 * until the estimate fits.
 *
 * The order sheds prose first and coverage last: detail is cheaper to lose
 * than a verbatim passage, and a verbatim passage cheaper than a chapter's
 * summary disappearing altogether. Step 3 stops at `minimumSummaryCount` —
 * the nearest chapters are never dropped, and a context that still does not
 * fit there is a failed composition, not a quieter one.
 */
export function degradationStates(
  initial: DegradationState,
  minimumSummaryCount: number,
): readonly DegradationState[] {
  const states: DegradationState[] = [initial];
  let current = initial;

  while (current.detailedWindow > 0) {
    current = { ...current, detailedWindow: current.detailedWindow - 1 };
    states.push(current);
  }

  while (current.excerptCount > 0) {
    current = { ...current, excerptCount: current.excerptCount - 1 };
    states.push(current);
  }

  while (current.summaryCount > minimumSummaryCount) {
    current = { ...current, summaryCount: current.summaryCount - 1 };
    states.push(current);
  }

  return states;
}
