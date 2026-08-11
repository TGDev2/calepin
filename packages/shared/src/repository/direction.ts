/**
 * The proposed novelistic directions, read back for comparison (CAL-082),
 * written off one at a time (CAL-083), rewritten by hand or written from
 * scratch (CAL-085).
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
 * anything from them. `editDirection` and `writeUserDirection` take the same
 * shape back for the same reason: `DirectionContentInput.narrativeEngine` is
 * typed only as JSON, already validated by `parseDirectionContent` before it
 * reaches here.
 *
 * **A discard writes a timestamp; it never deletes.** The backlog requires a
 * written-off direction to stay consultable, so the read below returns the
 * whole set — standing and discarded alike — and the caller splits it on
 * `discardedAt`. The alternative, filtering here, would make *disparue* and
 * *écartée* the same answer to a screen that has to tell them apart.
 *
 * **The origin transition is CAL-073's rule 2, restated for `DirectionOrigin`
 * rather than imported from `@calepin/shared/provenance`.** That module's
 * `originAfterEdit` is typed to `ContentOrigin` and meant to be reused *as is*
 * by a domain that adopts `ContentOrigin` itself; `DirectionOrigin` is
 * direction's own enum, predating this task, and already diverges from it
 * (`PROPOSED` rather than `GENERATED`) — the same reason
 * `ChapterRevisionOrigin` and `TargetLength` restate their own literal unions
 * instead of importing `@prisma/client`'s (CAL-043). The rule itself is
 * unchanged: an edit never reverts a direction to `PROPOSED`, and once a
 * direction is the author's (`USER_WRITTEN`) it stays theirs.
 */

import type { $Enums, Prisma } from "@prisma/client";

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

/**
 * A direction's content, in the shape both writers below take it —
 * `@calepin/direction`'s `DirectionContent`, restated here structurally
 * because `@calepin/shared` may not import a domain (§3.2). `narrativeEngine`
 * is `unknown`: validated by `parseDirectionContent` before the caller ever
 * reaches this module, and stored exactly as untyped as every other reader of
 * this column already treats it.
 */
export interface DirectionContentInput {
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
  /** Already validated by `parseDirectionContent` before it reaches here. */
  readonly narrativeEngine: Prisma.InputJsonValue;
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Compares two narrative-engine declarations without assuming key order.
 *
 * PostgreSQL's `jsonb` does not preserve the order a value was written in, so
 * a plain `JSON.stringify` comparison between a submission and the engine
 * just read back from the database can report a change that never happened —
 * and silently promote a direction from `PROPOSED` to `EDITED` on a resubmit
 * that changed nothing. `narrativeEngine` is always the five flat string
 * fields `narrativeEngineSchema` (CAL-080) declares, so comparing sorted
 * entries is enough; there is nothing nested to walk.
 */
function sameNarrativeEngine(a: unknown, b: unknown): boolean {
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return a === b;

  const entriesOf = (value: object) =>
    Object.entries(value as Record<string, unknown>).sort(([x], [y]) =>
      x < y ? -1 : x > y ? 1 : 0,
    );

  return JSON.stringify(entriesOf(a)) === JSON.stringify(entriesOf(b));
}

/**
 * `DirectionContentInput`'s shape with `narrativeEngine` widened to `unknown`
 * — the comparison does not care whether a value is a validated
 * `Prisma.InputJsonValue` or a `Prisma.JsonValue` fresh off a `select`, and
 * typing it either specifically would refuse the other side.
 */
interface ComparableDirectionContent extends Omit<DirectionContentInput, "narrativeEngine"> {
  readonly narrativeEngine: unknown;
}

function isSameDirectionContent(
  a: ComparableDirectionContent,
  b: ComparableDirectionContent,
): boolean {
  return (
    a.workingTitle === b.workingTitle &&
    a.developedPremise === b.developedPremise &&
    a.dominantGenre === b.dominantGenre &&
    a.mainConflict === b.mainConflict &&
    a.protagonistArc === b.protagonistArc &&
    sameStringArray(a.newStakes, b.newStakes) &&
    sameStringArray(a.charactersToIntroduce, b.charactersToIntroduce) &&
    a.endingNature === b.endingNature &&
    sameStringArray(a.mainRisks, b.mainRisks) &&
    sameStringArray(a.elementsKeptFromSource, b.elementsKeptFromSource) &&
    sameStringArray(a.elementsTransformed, b.elementsTransformed) &&
    a.novelPotentialAssessment === b.novelPotentialAssessment &&
    sameNarrativeEngine(a.narrativeEngine, b.narrativeEngine)
  );
}

/**
 * `DirectionContentInput`'s five lists as Prisma's generated input types
 * demand them — plain mutable arrays. `DirectionContentInput` keeps them
 * `readonly` at this module's own boundary (every other snapshot type here
 * does the same); copying is the one place that boundary meets Prisma's own,
 * narrower one.
 */
function directionContentData(content: DirectionContentInput) {
  return {
    workingTitle: content.workingTitle,
    developedPremise: content.developedPremise,
    dominantGenre: content.dominantGenre,
    mainConflict: content.mainConflict,
    protagonistArc: content.protagonistArc,
    newStakes: [...content.newStakes],
    charactersToIntroduce: [...content.charactersToIntroduce],
    endingNature: content.endingNature,
    mainRisks: [...content.mainRisks],
    elementsKeptFromSource: [...content.elementsKeptFromSource],
    elementsTransformed: [...content.elementsTransformed],
    novelPotentialAssessment: content.novelPotentialAssessment,
    narrativeEngine: content.narrativeEngine,
  };
}

export interface EditDirectionInput {
  readonly directionId: string;
  readonly content: DirectionContentInput;
}

export interface DirectionEdited {
  /** `false` when the submission was identical to what stood; nothing was written. */
  readonly updated: boolean;
  readonly origin: $Enums.DirectionOrigin;
}

/**
 * Rewrites one direction's content, by hand (CAL-085).
 *
 * **A discarded direction cannot be edited.** CAL-083's own doctrine: nothing
 * un-discards a direction, and editing a written-off one would be exactly
 * that by another name. `CONFLICT`, the same remedy shape as a second
 * discard — look again, the screen is stale.
 *
 * **The canonical direction may be edited.** Only *discarding* it is blocked
 * (CAL-083) — refining the wording of the direction the novel is being built
 * on is an ordinary action with no invariant to protect.
 *
 * **An identical resubmission writes nothing and leaves the origin alone.**
 * Comparing first is what keeps a person reopening the form and saving
 * without changing anything from being silently recorded as having edited a
 * proposal they never touched.
 */
export async function editDirection(
  scope: ProjectScope,
  input: EditDirectionInput,
): Promise<Result<DirectionEdited>> {
  assertProjectScope(scope);

  return withProjectTransaction<DirectionEdited>(scope, async (tx) => {
    const direction = await tx.creativeDirection.findFirst({
      where: scopedWhere("CreativeDirection", scope, { id: input.directionId }),
      select: {
        id: true,
        origin: true,
        discardedAt: true,
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
      },
    });

    if (direction === null) {
      return fail(new NotFoundError({ message: "no such direction in this project" }));
    }

    if (direction.discardedAt !== null) {
      return fail(
        new ConflictError({
          message: "a discarded direction cannot be edited",
          userMessage: "Cette direction a été écartée : elle ne peut plus être modifiée.",
        }),
      );
    }

    const currentContent: ComparableDirectionContent = {
      workingTitle: direction.workingTitle,
      developedPremise: direction.developedPremise,
      dominantGenre: direction.dominantGenre,
      mainConflict: direction.mainConflict,
      protagonistArc: direction.protagonistArc,
      newStakes: direction.newStakes,
      charactersToIntroduce: direction.charactersToIntroduce,
      endingNature: direction.endingNature,
      mainRisks: direction.mainRisks,
      elementsKeptFromSource: direction.elementsKeptFromSource,
      elementsTransformed: direction.elementsTransformed,
      novelPotentialAssessment: direction.novelPotentialAssessment,
      narrativeEngine: direction.narrativeEngine,
    };

    if (isSameDirectionContent(currentContent, input.content)) {
      return succeed({ updated: false, origin: direction.origin });
    }

    const nextOrigin: $Enums.DirectionOrigin =
      direction.origin === "USER_WRITTEN" ? "USER_WRITTEN" : "EDITED";

    await tx.creativeDirection.update({
      where: { id: direction.id },
      data: { ...directionContentData(input.content), origin: nextOrigin },
    });

    return succeed({ updated: true, origin: nextOrigin });
  });
}

export interface WriteUserDirectionInput {
  readonly content: DirectionContentInput;
}

export interface UserDirectionWritten {
  readonly id: string;
}

/**
 * Writes a direction entirely authored by the project's owner (CAL-085) —
 * `origin: USER_WRITTEN`, not canonical, not discarded.
 *
 * **Under `withProjectTransaction`, not a bare `create`.** There is no
 * existing `CreativeDirection` row for a `scopedWhere` to protect — this is
 * the create `requireOwnedRow`'s own doc comment describes: "the parent id of
 * a new child row is a value the caller supplied and nothing constrains it."
 * `withProjectTransaction` is that same check one level up, confirming
 * `(scope.projectId, scope.ownerId)` names a real project before the insert
 * runs, so a scope that was forged rather than opened by `openProjectScope`
 * reaches nothing. The row this writes is, in every column but `origin`,
 * indistinguishable from one `propose-directions` would have produced — which
 * is what lets every existing reader, and eventually the bible mission, treat
 * it identically to a generated direction.
 */
export async function writeUserDirection(
  scope: ProjectScope,
  input: WriteUserDirectionInput,
): Promise<Result<UserDirectionWritten>> {
  assertProjectScope(scope);

  return withProjectTransaction<UserDirectionWritten>(scope, async (tx) => {
    const created = await tx.creativeDirection.create({
      data: {
        projectId: scope.projectId,
        ...directionContentData(input.content),
        origin: "USER_WRITTEN",
        isCanonical: false,
      },
      select: { id: true },
    });

    return succeed(created);
  });
}
