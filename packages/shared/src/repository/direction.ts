/**
 * The proposed novelistic directions, read back for comparison (CAL-082).
 *
 * `getDirectionsForComparison` reads as a bare array rather than a `Result`,
 * `getAnalysis`'s convention: a project with no directions yet is a legitimate,
 * expected state (no executor is registered for `propose-directions`, CLAUDE.md
 * §13), not a failure.
 *
 * **`narrativeEngine` and the four evaluation lists travel untyped.** They are
 * validated contracts owned by `@calepin/direction`
 * (`narrativeEngineSchema`, `directionEvaluationSchema`) — the domain's schema,
 * never restated here — and `@calepin/shared` may not import a domain (§3.2).
 * The caller, which may, parses them against the real schema before rendering
 * anything from them.
 */

import type { $Enums } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";

/** One direction's critique (CAL-081), or absent when none has been produced. */
export interface DirectionEvaluationSnapshot {
  readonly promises: unknown;
  readonly shortfalls: unknown;
  readonly conventions: unknown;
  readonly comparativeWeaknesses: unknown;
  readonly createdAt: Date;
}

/** One proposed direction, with its critique when one exists. */
export interface DirectionSnapshot {
  readonly id: string;
  readonly workingTitle: string;
  readonly developedPremise: string;
  readonly dominantGenre: string;
  readonly mainConflict: string;
  readonly protagonistArc: string;
  readonly newStakes: readonly string[];
  readonly charactersToIntroduce: readonly string[];
  readonly endingNature: string;
  readonly mainRisks: readonly string[];
  readonly elementsKeptFromSource: readonly string[];
  readonly elementsTransformed: readonly string[];
  readonly novelPotentialAssessment: string;
  /** CAL-080's declaration — see this module's doc comment. */
  readonly narrativeEngine: unknown;
  readonly isCanonical: boolean;
  readonly origin: $Enums.DirectionOrigin;
  readonly createdAt: Date;
  readonly evaluation: DirectionEvaluationSnapshot | null;
}

/**
 * Every direction proposed for a project, oldest first — the order they were
 * produced in, which is also the order CAL-079's mission returns them.
 */
export async function getDirectionsForComparison(
  scope: ProjectScope,
): Promise<readonly DirectionSnapshot[]> {
  assertProjectScope(scope);

  const directions = await getDatabaseClient().creativeDirection.findMany({
    where: scopedWhere("CreativeDirection", scope),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      workingTitle: true,
      developedPremise: true,
      dominantGenre: true,
      mainConflict: true,
      protagonistArc: true,
      newStakes: true,
      charactersToIntroduce: true,
      endingNature: true,
      mainRisks: true,
      elementsKeptFromSource: true,
      elementsTransformed: true,
      novelPotentialAssessment: true,
      narrativeEngine: true,
      isCanonical: true,
      origin: true,
      createdAt: true,
      evaluation: {
        select: {
          promises: true,
          shortfalls: true,
          conventions: true,
          comparativeWeaknesses: true,
          createdAt: true,
        },
      },
    },
  });

  return directions;
}
