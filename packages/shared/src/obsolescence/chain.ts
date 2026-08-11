/**
 * The propagation rule itself, once (CAL-046, generalised by CAL-086).
 *
 * CAL-046 answered one question — which stages a *source-text* edit puts in
 * doubt — and the loop that answered it turned out to be the whole mechanism:
 * walk the chain from the stage nearest the change to the one furthest from
 * it, mark a stage that exists and was either hit directly or descends from
 * something that was, and never let doubt travel backwards. CAL-086 asks the
 * same question of a different change — the author has retained another
 * novelistic direction — and the honest way to reuse the mechanism is to
 * extract the walk rather than to write a second one that will drift.
 *
 * **What is parameterised is the direct reason, and nothing else.** Every
 * caller decides what "hit directly" means for its own change by filling in
 * `precedingCount`; the walk decides what *descends* from it, always with the
 * same reason, so the two rules cannot disagree between callers. Inheritance
 * is the load-bearing half of CAL-046 and the reasoning is unchanged here:
 * without it, regenerating one stage would report a clean project while every
 * stage below still descends from what was replaced.
 *
 * **Potentially obsolete, and nothing stronger.** Nothing in this file writes,
 * deletes, regenerates or enqueues anything. It states provenance — this was
 * produced from something that has since moved — which is the only claim that
 * can be made without reading the prose, and the decision stays the author's.
 * The backlog is explicit about it for both changes: *sans jamais les
 * supprimer ni les régénérer automatiquement*.
 *
 * The report carries counts and stage names, never content (CLAUDE.md §9),
 * which is what makes it safe to log and safe to put in an error payload.
 *
 * This file imports nothing but its own siblings — same constraint as
 * `../project-status`.
 */

import type { DownstreamStage } from "./stages";

/**
 * What the database knows about one stage, relative to one change.
 *
 * The two numbers are deliberately not a boolean. "Four chapters out of twelve
 * predate your change" is a different sentence from "the chapters are out of
 * date", and the author acts differently on it; collapsing them here would make
 * the useful one unrecoverable.
 */
export interface DownstreamStageState {
  /**
   * Units the project holds for this stage — analysis sections carrying a
   * revision, creative directions, the bible, the outline, chapters. Zero means
   * the stage was never produced, and an absent stage is never obsolete: there
   * is nothing to be obsolete.
   */
  readonly presentCount: number;
  /**
   * How many of those were produced before the change this report is about.
   * Never greater than `presentCount`.
   */
  readonly precedingCount: number;
}

/**
 * Why a stage is in doubt. Closed, and the members are not interchangeable: the
 * first two are facts about this stage under one kind of change, the last is a
 * fact about the chain above it, and the sentence shown to the author differs
 * accordingly.
 */
export const OBSOLESCENCE_REASONS = [
  "source-text-changed", // produced before the current version of the source text
  "canonical-direction-changed", // produced before the retained direction last moved
  "upstream-obsolete", // built on a stage that is itself in doubt
] as const;

export type ObsolescenceReason = (typeof OBSOLESCENCE_REASONS)[number];

/**
 * The reasons a *change* can carry — everything but inheritance, which is the
 * walk's own answer and never a caller's.
 */
export type DirectObsolescenceReason = Exclude<ObsolescenceReason, "upstream-obsolete">;

export interface StageObsolescence {
  readonly stage: DownstreamStage;
  readonly presentCount: number;
  readonly precedingCount: number;
  readonly isObsolete: boolean;
  /** `null` when the stage is current, or when the project does not hold it. */
  readonly reason: ObsolescenceReason | null;
}

/** One stage's facts, named — the walk's input, in chain order. */
export interface StageChainEntry extends DownstreamStageState {
  readonly stage: DownstreamStage;
}

export interface StageChainAssessment {
  /** Every stage walked, in chain order, whether it exists or not. */
  readonly stages: readonly StageObsolescence[];
  /** Just the names of the ones in doubt, in the same order. */
  readonly obsoleteStages: readonly DownstreamStage[];
  readonly hasObsoleteStages: boolean;
}

/**
 * Walks a chain of stages once, from the one nearest the change to the one
 * furthest from it, and answers which of them the change has left behind.
 *
 * A single pass is enough because the dependency graph is the array order:
 * everything upstream of a stage has already been decided by the time the loop
 * reaches it, so `inherited` only has to remember whether *anything* so far was
 * in doubt. Nothing downstream can clear it — obsolescence propagates forward
 * and never back, which is what makes the answer stable while an author works
 * their way down the chain.
 *
 * The direct reason wins when both apply. It names the thing the author can act
 * on first, and it is the more precise of the two.
 *
 * The entries are a *contiguous run* of `DOWNSTREAM_STAGES`, not an arbitrary
 * selection: a caller handing them out of order would be describing a different
 * graph, and there is deliberately no second table for it to describe one with.
 */
export function assessStageChain(
  entries: readonly StageChainEntry[],
  directReason: DirectObsolescenceReason,
): StageChainAssessment {
  const stages: StageObsolescence[] = [];
  // Annotated: it is assigned from a value derived from itself one line later,
  // and the inference would otherwise chase its own tail.
  let inherited: boolean = false;

  for (const { stage, presentCount, precedingCount } of entries) {
    const isPresent = presentCount > 0;
    const isPreceding = precedingCount > 0;
    const isObsolete: boolean = isPresent && (isPreceding || inherited);

    stages.push({
      stage,
      presentCount,
      precedingCount,
      isObsolete,
      reason: !isObsolete ? null : isPreceding ? directReason : "upstream-obsolete",
    });

    // An absent stage is not a break in the chain. A project can hold chapters
    // whose bible was never validated — a fixture, an import, a duplication —
    // and the doubt has to reach them anyway.
    inherited = inherited || isObsolete;
  }

  const obsoleteStages = stages.filter((entry) => entry.isObsolete).map((entry) => entry.stage);

  return { stages, obsoleteStages, hasObsoleteStages: obsoleteStages.length > 0 };
}
