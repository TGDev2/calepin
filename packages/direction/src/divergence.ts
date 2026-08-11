/**
 * The divergence constraint over narrative engines (CAL-080) — the automatic
 * check that three directions differ by their engine and not by their decor,
 * and the trigger of the targeted relaunch when they do not.
 *
 * **Two engines are the same when they differ on fewer than
 * `NARRATIVE_ENGINE_DIVERGENCE_MINIMUM` of the five axes.** The number is 2,
 * held from both sides:
 *
 * - *Not 1*: a single differing axis is one mechanism with a variant outcome
 *   — a victory flipped to a defeat is the same novel with another last
 *   chapter, and one flipped member is also the cheapest way to defeat the
 *   check without diverging at all.
 * - *Not 3*: the freedom policy pins engine axes. At `LOW`, main-conflict,
 *   protagonist and ending are all `preserve` — the CAL-079 corpus pass saw
 *   the source conflict conserved verbatim across all three directions — so
 *   only the two axes no policy ever pins, the source of tension and the
 *   trigger of the turn, are guaranteed free. A minimum a compliant answer
 *   cannot reach would not buy divergence; it would teach the model to lie
 *   in its declaration.
 *
 * **A report, not a `Result`** — `checkFreedomCompliance`'s doctrine: "two
 * directions share their engine" is the answer to a question, not an error.
 * The report is also the relaunch's complete input: `retained` says which
 * directions stand, `regenerate` says which slots to re-ask, and the caller
 * reads the excluded engines off the retained directions it already holds.
 * Executing that re-ask is the executor task's, exactly as CAL-079 recorded
 * for the compliance re-ask; prompt V3 already carries its `excludedEngines`
 * contract, so no prompt work will remain.
 *
 * **Every field is safe to log (§9)**: indexes into the answer, axis
 * identifiers and booleans — never a member the model chose, never a word of
 * a direction.
 */

import {
  NARRATIVE_ENGINE_AXES,
  type NarrativeEngine,
  type NarrativeEngineAxis,
} from "./narrative-engine";
import type { DirectionProposals } from "./proposals";

/**
 * The fewest axes on which two *distinct* engines differ. See the header for
 * why it is 2 — and why it must never exceed the number of axes the tightest
 * freedom level leaves free.
 */
export const NARRATIVE_ENGINE_DIVERGENCE_MINIMUM = 2;

/** Two engines side by side, axis by axis. */
export interface NarrativeEngineComparison {
  /** Axes where the two declarations coincide, in `NARRATIVE_ENGINE_AXES` order. */
  readonly sharedAxes: readonly NarrativeEngineAxis[];
  /** Axes where they differ, in the same order. */
  readonly differingAxes: readonly NarrativeEngineAxis[];
  /** Distinct engines: at least the minimum of differing axes. */
  readonly distinct: boolean;
}

export function compareNarrativeEngines(
  a: NarrativeEngine,
  b: NarrativeEngine,
): NarrativeEngineComparison {
  const sharedAxes = NARRATIVE_ENGINE_AXES.filter((axis) => a[axis] === b[axis]);
  const differingAxes = NARRATIVE_ENGINE_AXES.filter((axis) => a[axis] !== b[axis]);

  return {
    sharedAxes,
    differingAxes,
    distinct: differingAxes.length >= NARRATIVE_ENGINE_DIVERGENCE_MINIMUM,
  };
}

/** One pair of the answer, compared — `directions` are indexes into it. */
export interface DirectionEngineComparison extends NarrativeEngineComparison {
  readonly directions: readonly [number, number];
}

export interface DirectionDivergenceReport {
  /** Every pair distinct — the gate the answer passes or fails as a whole. */
  readonly divergent: boolean;
  /** All pairs, first index ascending — what the comparison screen walks. */
  readonly comparisons: readonly DirectionEngineComparison[];
  /**
   * The largest prefix-greedy set of pairwise-distinct directions: a
   * direction stands unless its engine collides with one already standing.
   * First listed wins — the model's own ordering is as good as any, and a
   * deterministic rule is one a screen and a log can both explain.
   */
  readonly retained: readonly number[];
  /** The slots the targeted relaunch re-asks — everything not retained. */
  readonly regenerate: readonly number[];
}

/**
 * The divergence gate over any number of declared engines — the three of a
 * `propose-directions` answer today, a replacement against the two kept
 * directions when CAL-083 wires one. Fewer than two engines are trivially
 * divergent: there is no pair to collide.
 */
export function checkDirectionDivergence(
  engines: readonly NarrativeEngine[],
): DirectionDivergenceReport {
  const comparisons: DirectionEngineComparison[] = [];

  engines.forEach((a, i) => {
    engines.forEach((b, j) => {
      if (j > i) {
        comparisons.push({ directions: [i, j], ...compareNarrativeEngines(a, b) });
      }
    });
  });

  const retained: number[] = [];
  const retainedEngines: NarrativeEngine[] = [];
  const regenerate: number[] = [];

  engines.forEach((engine, index) => {
    const collides = retainedEngines.some(
      (kept) => !compareNarrativeEngines(kept, engine).distinct,
    );

    if (collides) {
      regenerate.push(index);
    } else {
      retained.push(index);
      retainedEngines.push(engine);
    }
  });

  return {
    divergent: comparisons.every((comparison) => comparison.distinct),
    comparisons,
    retained,
    regenerate,
  };
}

/** The gate over the parsed answer itself — the mission-shaped entry point. */
export function checkDirectionProposalDivergence(
  proposals: DirectionProposals,
): DirectionDivergenceReport {
  return checkDirectionDivergence(
    proposals.directions.map((direction) => direction.narrativeEngine),
  );
}
