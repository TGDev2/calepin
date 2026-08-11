/**
 * The proposed novelistic directions, read back for comparison (CAL-082), and
 * written off one at a time (CAL-083).
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
 *
 * **A discard writes a timestamp; it never deletes.** The backlog requires a
 * written-off direction to stay consultable, so the read below returns the
 * whole set — standing and discarded alike — and the caller splits it on
 * `discardedAt`. The alternative, filtering here, would make *disparue* and
 * *écartée* the same answer to a screen that has to tell them apart.
 */

import type { $Enums } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import { ConflictError, NotFoundError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";
import { withProjectTransaction } from "./transaction";

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
  /** When the author wrote it off (CAL-083), or null while it still stands. */
  readonly discardedAt: Date | null;
  /** Why, in their own words, or null — never logged, never reported (§9). */
  readonly discardReason: string | null;
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
      discardedAt: true,
      discardReason: true,
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

export interface DiscardDirectionInput {
  readonly directionId: string;
  /**
   * The author's reason, already parsed by
   * `parseDirectionDiscardReason` in `@calepin/direction` — `null` when they
   * gave none. Parsed by the caller rather than here because the ceiling is
   * the domain's rule and `@calepin/shared` may not import a domain (§3.2),
   * the division `editAnalysisSection` already draws.
   */
  readonly reason: string | null;
}

export interface DirectionDiscarded {
  readonly discardedAt: Date;
}

/**
 * Writes one proposed direction off, keeping every row.
 *
 * **One statement's worth of blast radius.** The update touches the named row
 * and nothing else: the two directions the author kept, their critiques, the
 * analysis and the project's own stage are all untouched, which is what makes
 * the discard a decision they can take without wondering what it costs them.
 *
 * **Two refusals, and each has a different remedy.** A direction that is
 * already discarded is a `CONFLICT`: the author is looking at a stale screen,
 * and the answer is to look again, not to write again — the same reading
 * `validateAnalysis` gives an already-validated analysis. The canonical
 * direction is a `CONFLICT` too, because writing off the direction the whole
 * novel is being built on is not a discard, it is a change of mind about the
 * novel, and it goes through whatever un-chooses it. *Not there* and *not
 * yours* stay one answer (`NOT_FOUND`, §3.5).
 *
 * The caller must be inside `runWithActor`: the update names no `updatedById`
 * on purpose, and the CAL-022 extension is what fills it — which is also what
 * records who wrote the direction off without a column of its own.
 */
export async function discardDirection(
  scope: ProjectScope,
  input: DiscardDirectionInput,
): Promise<Result<DirectionDiscarded>> {
  assertProjectScope(scope);

  return withProjectTransaction<DirectionDiscarded>(scope, async (tx) => {
    const direction = await tx.creativeDirection.findFirst({
      where: scopedWhere("CreativeDirection", scope, { id: input.directionId }),
      select: { id: true, discardedAt: true, isCanonical: true },
    });

    if (direction === null) {
      return fail(new NotFoundError({ message: "no such direction in this project" }));
    }

    if (direction.discardedAt !== null) {
      return fail(
        new ConflictError({
          message: "the direction is already discarded",
          userMessage: "Cette direction a déjà été écartée.",
        }),
      );
    }

    if (direction.isCanonical) {
      return fail(
        new ConflictError({
          message: "the canonical direction cannot be discarded",
          userMessage:
            "Cette direction est celle que vous avez retenue : elle ne peut pas être écartée.",
        }),
      );
    }

    const discardedAt = new Date();

    await tx.creativeDirection.update({
      where: { id: direction.id },
      data: { discardedAt, discardReason: input.reason },
    });

    return succeed({ discardedAt });
  });
}
