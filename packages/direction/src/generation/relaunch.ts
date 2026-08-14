/**
 * The targeted relaunch CAL-079 and CAL-080 left to the executor task
 * (CAL-210).
 *
 * Both of those tasks produced a **report and stopped**: `divergence.ts` says so
 * in as many words — *"`retained` says which directions stand, `regenerate` says
 * which slots to re-ask, and the caller reads the excluded engines off the
 * retained directions it already holds. Executing that re-ask is the executor
 * task's."* This module is that execution, minus the model call: what to keep,
 * what to ask for next, and when to stop asking.
 *
 * **Pure, and separate from the executor for exactly that reason.** Everything
 * here is a decision over values, so the acceptance criterion — *three
 * deliberately quasi-identical directions trigger the relaunch* — is provable
 * without a provider, a queue or a database. The executor's own job is then the
 * loop and nothing else.
 *
 * **Compliance first, divergence second.** A direction whose declaration
 * overshoots the project's freedom level is not a direction the author asked
 * for, so it may not hold a slot that a compliant one would then have to differ
 * from. Its engine is *not* excluded from the re-ask: what failed is what the
 * direction claims to do to the source text, not the mechanism it runs on, and
 * forbidding a legitimate mechanism because of a declaration would narrow the
 * next ask for no reason.
 *
 * **The exclusions are the engines that stand, and only those.** A rejected
 * candidate that shared an engine shared it *with* a standing direction, so
 * excluding the standing one already excludes it; listing the rejects too would
 * say the same thing twice and spend context on it.
 *
 * Every field of the report is an index, a count, a closed reason or a
 * constraint id — safe to log (§9). The proposals themselves travel beside it,
 * never inside it, which is `verifyAnalysisEvidence`'s arrangement.
 */

import type { FreedomLevel } from "@calepin/shared/freedom-level";

import { checkDirectionDivergence } from "../divergence";
import type { NarrativeEngine } from "../narrative-engine";
import {
  checkDirectionProposalCompliance,
  DIRECTION_PROPOSAL_COUNT,
  type DirectionProposal,
} from "../proposals";

/**
 * How many times one generation asks for directions, the first ask included.
 *
 * **Three**, and it is a bound rather than a policy: the first ask is the
 * question, the second is the one the divergence report was designed for — it
 * names the engines that stand and asks only for the slots that collided — and
 * the third covers a model that repeats itself once under that instruction. A
 * fourth would be paying a fourth time for the same misunderstanding, and the
 * remedy past that point is a person's: `replayGeneration` is what reopens a
 * generation somebody decided to run again.
 *
 * It is not `MAX_GENERATION_ATTEMPTS`' twin. That one bounds *deliveries* of a
 * job across worker restarts; this one bounds model calls inside one attempt,
 * and the two are counted independently because they protect against different
 * failures — a broken provider there, an answer that will not diverge here.
 */
export const MAX_DIRECTION_PROPOSAL_ASKS = 3;

/** Why a proposed direction did not join the ones that stand. */
export const DIRECTION_REJECTION_REASONS = ["freedom-compliance", "shared-engine"] as const;

export type DirectionRejectionReason = (typeof DIRECTION_REJECTION_REASONS)[number];

export interface RejectedDirection {
  /** Its index in the answer it came from. */
  readonly candidate: number;
  readonly reason: DirectionRejectionReason;
  /**
   * The clauses its declaration broke, by `FreedomViolation.constraintId` —
   * empty on a `shared-engine` rejection.
   */
  readonly violatedConstraintIds: readonly string[];
  /**
   * The index, among the directions that now stand, of the one whose engine it
   * repeats — null on a `freedom-compliance` rejection.
   */
  readonly collidesWith: number | null;
}

/** What one ask changed, in numbers a log may carry. */
export interface DirectionAcceptanceReport {
  /** How many directions stand after this ask. */
  readonly keptCount: number;
  /** How many of this ask's candidates joined them. */
  readonly acceptedCount: number;
  readonly rejected: readonly RejectedDirection[];
  /** Whether enough directions now stand — the loop's exit condition. */
  readonly complete: boolean;
}

export interface DirectionAcceptance {
  /**
   * The directions that stand, oldest first: the ones already kept, then the
   * candidates of this ask that joined them, in the answer's own order.
   */
  readonly kept: readonly DirectionProposal[];
  readonly report: DirectionAcceptanceReport;
}

/**
 * Which of one answer's directions join the ones that already stand.
 *
 * The divergence rule is `checkDirectionDivergence` and nothing else: the
 * standing directions are listed first, so its prefix-greedy `retained` keeps
 * every one of them — they are pairwise distinct by construction — and admits a
 * candidate exactly when it collides with none of them and with no earlier
 * candidate of the same answer.
 *
 * The count is the *ask's* business, not this function's: the answer's schema is
 * `directionProposalsSchemaFor(n)` and the prompt states the same `n`, so a
 * caller that asked for what was missing cannot be handed more than fits.
 */
export function acceptDirectionCandidates(
  level: FreedomLevel,
  kept: readonly DirectionProposal[],
  candidates: readonly DirectionProposal[],
): DirectionAcceptance {
  const rejected: RejectedDirection[] = [];
  const compliant: { readonly candidate: number; readonly proposal: DirectionProposal }[] = [];

  candidates.forEach((proposal, candidate) => {
    const compliance = checkDirectionProposalCompliance(level, proposal);

    if (compliance.compliant) {
      compliant.push({ candidate, proposal });
      return;
    }

    rejected.push({
      candidate,
      reason: "freedom-compliance",
      violatedConstraintIds: compliance.violations.map((violation) => violation.constraintId),
      collidesWith: null,
    });
  });

  const divergence = checkDirectionDivergence([
    ...kept.map((direction) => direction.narrativeEngine),
    ...compliant.map((entry) => entry.proposal.narrativeEngine),
  ]);

  const retained = new Set(divergence.retained);
  const accepted = [...kept];

  compliant.forEach((entry, offset) => {
    const position = kept.length + offset;

    if (retained.has(position)) {
      accepted.push(entry.proposal);
      return;
    }

    // The pair the prefix-greedy rule dropped it on: the first standing engine
    // it is not distinct from. `directions` is ordered `[i, j]` with `i < j`,
    // so the collision is always the left-hand index.
    const collision = divergence.comparisons.find(
      (pair) =>
        pair.directions[1] === position && !pair.distinct && retained.has(pair.directions[0]),
    );

    rejected.push({
      candidate: entry.candidate,
      reason: "shared-engine",
      violatedConstraintIds: [],
      collidesWith:
        collision === undefined ? null : divergence.retained.indexOf(collision.directions[0]),
    });
  });

  return {
    kept: accepted,
    report: {
      keptCount: accepted.length,
      acceptedCount: accepted.length - kept.length,
      rejected,
      complete: accepted.length >= DIRECTION_PROPOSAL_COUNT,
    },
  };
}

/** What the next ask asks for — the prompt's two variables, and nothing else. */
export interface DirectionAskPlan {
  /** `directionCount`: the slots still missing, never the schema's constant. */
  readonly directionCount: number;
  /** `excludedEngines`: the engines that stand, which no answer may reuse. */
  readonly excludedEngines: readonly NarrativeEngine[];
}

/**
 * The ask that fills the slots still missing, or `null` when none is.
 *
 * `null` rather than a plan for zero directions, because those are two different
 * things to a caller: one is *ask again*, the other is *stop*, and a plan asking
 * for nothing would be a request no schema could validate an answer to.
 */
export function nextDirectionAsk(kept: readonly DirectionProposal[]): DirectionAskPlan | null {
  const missing = DIRECTION_PROPOSAL_COUNT - kept.length;

  if (missing <= 0) return null;

  return {
    directionCount: missing,
    excludedEngines: kept.map((direction) => direction.narrativeEngine),
  };
}
