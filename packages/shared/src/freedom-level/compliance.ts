/**
 * Checking a generated artefact against the freedom level it was generated
 * under (CAL-044) — the half that makes the constraints *verifiable* rather
 * than merely explicit.
 *
 * The artefact declares, per dimension, what it did to the source text; this
 * compares that declaration to the level's policy. A direction, a bible entry
 * and a chapter plan are checked identically, because the declaration is the
 * only thing any of them has to expose — the missions that will produce it
 * (CAL-079, CAL-088, CAL-102) can then keep whatever shape they like.
 *
 * **A report, not a `Result`.** §7 asks for `Result<T, AppError>` on a failure
 * the caller must handle, and this is not one: a compliance check answers a
 * question, and "three dimensions overshot" is the answer, not an error. The
 * caller that must refuse an artefact turns the report into an `AppError`; the
 * caller that wants to show the author what a regeneration would tighten reads
 * the same report and shows it.
 *
 * **Every field here is safe to log.** Dimensions, treatments and constraint
 * ids are a closed vocabulary this repository owns — no fragment of the
 * author's text or of the model's prose is ever in a report, which is what §9
 * requires of anything that will end up in a log line.
 */

import type { FreedomConstrainedStage } from "./constraints";
import {
  type DimensionTreatment,
  permitsTreatment,
  SOURCE_DIMENSIONS,
  type SourceDimension,
  treatmentRank,
} from "./dimensions";
import type { FreedomLevel } from "./levels";
import { sourceDepartureBudget, treatmentFor } from "./policy";

/** What a generated artefact says it did to one dimension of the source text. */
export interface DimensionClaim {
  readonly dimension: SourceDimension;
  readonly treatment: DimensionTreatment;
}

export interface FreedomViolation {
  /** The clause that was broken — the same id `freedomConstraints` emits. */
  readonly constraintId: string;
  readonly dimension: SourceDimension;
  readonly allowed: DimensionTreatment;
  readonly declared: DimensionTreatment;
}

export interface FreedomComplianceReport {
  readonly level: FreedomLevel;
  readonly stage: FreedomConstrainedStage;
  /** No violation *and* nothing left undeclared. */
  readonly compliant: boolean;
  readonly violations: readonly FreedomViolation[];
  /** Dimensions the artefact said nothing about, in `SOURCE_DIMENSIONS` order. */
  readonly undeclared: readonly SourceDimension[];
  /** What the artefact claims to have departed, on `sourceDepartureBudget`'s scale. */
  readonly departure: number;
  readonly budget: number;
}

/**
 * The most permissive treatment claimed per dimension.
 *
 * Two claims on one dimension is a malformed declaration rather than a
 * decision to make, and the safe reading of a malformed one is the widest:
 * scoring it by the *narrower* claim would let an artefact hide a
 * reinterpretation behind a second, tamer entry for the same dimension.
 */
function widestClaims(
  claims: readonly DimensionClaim[],
): ReadonlyMap<SourceDimension, DimensionTreatment> {
  const widest = new Map<SourceDimension, DimensionTreatment>();

  for (const claim of claims) {
    const current = widest.get(claim.dimension);
    if (current === undefined || treatmentRank(claim.treatment) > treatmentRank(current)) {
      widest.set(claim.dimension, claim.treatment);
    }
  }

  return widest;
}

/**
 * How far a declaration says the artefact travelled from its source text, on
 * the same scale as `sourceDepartureBudget` — which is what makes CAL-044's
 * criterion a comparison of two numbers rather than of two impressions.
 *
 * A dimension nobody declared contributes nothing: silence is not a departure.
 * `checkFreedomCompliance` reports it separately, where it belongs.
 */
export function sourceDeparture(claims: readonly DimensionClaim[]): number {
  return [...widestClaims(claims).values()].reduce(
    (total, treatment) => total + treatmentRank(treatment),
    0,
  );
}

export function checkFreedomCompliance(
  level: FreedomLevel,
  stage: FreedomConstrainedStage,
  claims: readonly DimensionClaim[],
): FreedomComplianceReport {
  const declared = widestClaims(claims);
  const violations: FreedomViolation[] = [];
  const undeclared: SourceDimension[] = [];

  for (const dimension of SOURCE_DIMENSIONS) {
    const claimed = declared.get(dimension);

    if (claimed === undefined) {
      undeclared.push(dimension);
      continue;
    }

    const allowed = treatmentFor(level, dimension);
    if (!permitsTreatment(allowed, claimed)) {
      violations.push({
        constraintId: `${stage}-${dimension}`,
        dimension,
        allowed,
        declared: claimed,
      });
    }
  }

  return {
    level,
    stage,
    compliant: violations.length === 0 && undeclared.length === 0,
    violations,
    undeclared,
    departure: sourceDeparture(claims),
    budget: sourceDepartureBudget(level),
  };
}
