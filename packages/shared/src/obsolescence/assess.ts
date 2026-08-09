/**
 * Which stages a source-text edit puts in doubt (CAL-046).
 *
 * **Potentially obsolete, and nothing stronger.** This module never claims a
 * chapter is wrong. It claims the chapter was produced from something the author
 * has since changed, which is a fact about provenance rather than about quality,
 * and it is the only claim that can be made without reading the prose. The
 * decision — regenerate, edit by hand, or leave it — stays with the author, and
 * nothing here writes, deletes or enqueues anything. The backlog is explicit:
 * *sans jamais les supprimer ni les régénérer automatiquement*.
 *
 * **Derived, never stored.** There is no `obsoletedAt` column and there is not
 * going to be one. A stored flag has to be maintained by every write path that
 * could invalidate it, and four of the five stages have no write path yet — a
 * column nobody sets reads as "everything is fine" for exactly as long as it
 * takes someone to trust it. The same reasoning `deriveProjectStatus` records
 * for the project status, one dependency down.
 *
 * **Two ways a stage falls behind, and the second is the load-bearing one.**
 *
 *   - *Directly*: the stage was last produced before the current version of the
 *     source text existed.
 *   - *By inheritance*: something it was built on is itself obsolete.
 *
 * Without inheritance the report is wrong the first time an author acts on it.
 * Regenerating the analysis makes the analysis current, and a rule that only
 * looked at each stage against the source text would then report a clean
 * project — while the direction still descends from the analysis that was
 * replaced. Inheritance is what keeps the warning alive until the chain has
 * actually been walked back down.
 *
 * The counts this rule reads are counts, never content (CLAUDE.md §9): how many
 * units a stage holds and how many of them predate the current version. Nothing
 * in a `SourceTextObsolescence` is readable as part of the novel, which is what
 * makes it safe to log and safe to put in an error payload.
 *
 * This file imports nothing but its own siblings — same constraint as
 * `../project-status`.
 */

import { DOWNSTREAM_STAGES, type DownstreamStage } from "./stages";

/**
 * What the database knows about one stage, relative to one source-text version.
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
   * How many of those were produced before the current source text version.
   * Never greater than `presentCount`.
   */
  readonly precedingCount: number;
}

/** Every fact the rule reads, gathered by the repository in one statement. */
export interface SourceTextDependencyState {
  /** The version every stage is judged against — the highest one written. */
  readonly currentVersionNumber: number;
  /** How many versions the source text has had, the first one included. */
  readonly versionCount: number;
  readonly stages: Readonly<Record<DownstreamStage, DownstreamStageState>>;
}

/**
 * Why a stage is in doubt. Closed, and the two members are not interchangeable:
 * the first is a fact about this stage, the second is a fact about the chain
 * above it, and the sentence shown to the author differs accordingly.
 */
export const OBSOLESCENCE_REASONS = [
  "source-text-changed", // produced before the current version of the source text
  "upstream-obsolete", // built on a stage that is itself in doubt
] as const;

export type ObsolescenceReason = (typeof OBSOLESCENCE_REASONS)[number];

export interface StageObsolescence {
  readonly stage: DownstreamStage;
  readonly presentCount: number;
  readonly precedingCount: number;
  readonly isObsolete: boolean;
  /** `null` when the stage is current, or when the project does not hold it. */
  readonly reason: ObsolescenceReason | null;
}

export interface SourceTextObsolescence {
  readonly currentVersionNumber: number;
  readonly versionCount: number;
  /** Every stage, in `DOWNSTREAM_STAGES` order, whether it exists or not. */
  readonly stages: readonly StageObsolescence[];
  /** Just the names of the ones in doubt, in the same order. */
  readonly obsoleteStages: readonly DownstreamStage[];
  readonly hasObsoleteStages: boolean;
}

/**
 * Walks the chain once, from the stage nearest the source text to the one
 * furthest from it, and answers which stages a change has left behind.
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
 */
export function assessSourceTextObsolescence(
  state: SourceTextDependencyState,
): SourceTextObsolescence {
  const stages: StageObsolescence[] = [];
  // Annotated: it is assigned from a value derived from itself one line later,
  // and the inference would otherwise chase its own tail.
  let inherited: boolean = false;

  for (const stage of DOWNSTREAM_STAGES) {
    const { presentCount, precedingCount } = state.stages[stage];

    const isPresent = presentCount > 0;
    const isPreceding = precedingCount > 0;
    const isObsolete: boolean = isPresent && (isPreceding || inherited);

    stages.push({
      stage,
      presentCount,
      precedingCount,
      isObsolete,
      reason: !isObsolete ? null : isPreceding ? "source-text-changed" : "upstream-obsolete",
    });

    // An absent stage is not a break in the chain. A project can hold chapters
    // whose bible was never validated — a fixture, an import, a duplication —
    // and the doubt has to reach them anyway.
    inherited = inherited || isObsolete;
  }

  const obsoleteStages = stages.filter((entry) => entry.isObsolete).map((entry) => entry.stage);

  return {
    currentVersionNumber: state.currentVersionNumber,
    versionCount: state.versionCount,
    stages,
    obsoleteStages,
    hasObsoleteStages: obsoleteStages.length > 0,
  };
}
