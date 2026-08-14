/**
 * The proposed novelistic directions, read back for comparison (CAL-082),
 * written off one at a time (CAL-083), rewritten by hand or written from
 * scratch (CAL-085), and finally retained — one per project (CAL-086).
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
 *
 * **Retaining one is a status write, so it goes through `withProjectStatus`.**
 * `isCanonical` is the evidence `deriveProjectStatus` reads for
 * `BIBLE_TO_VALIDATE` (CAL-034), and the wrapper is what recomputes the column
 * inside the same transaction as the flag — the one arrangement that cannot
 * leave the two disagreeing. Everything the change puts in doubt downstream is
 * *derived* from the same rows afterwards (`@calepin/shared/obsolescence`), so
 * no bible, plan or chapter is touched by the statement, let alone deleted.
 */

import type { $Enums, Prisma } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import {
  type AppError,
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import {
  assessCanonicalDirectionObsolescence,
  type CanonicalDirectionObsolescence,
  DIRECTION_DEPENDENT_STAGES,
  type DirectionDependentStage,
  type DownstreamStageState,
  type StageChainAssessment,
} from "../obsolescence";
import { projectNotFound, type TransactionClient } from "./project-lock";
import { withProjectStatus } from "./project-status";
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

export interface WriteGeneratedDirectionsInput {
  /**
   * The accepted proposals, in the order they are to be written — which is the
   * order the relaunch retained them in, and the order
   * `getDirectionsForComparison` reads them back in.
   *
   * `DirectionContentInput` again rather than a second shape: a generated
   * direction and a hand-written one differ by their `origin` column and by
   * nothing else, which is what `writeUserDirection`'s own doc comment already
   * claims of the row it writes.
   */
  readonly directions: readonly DirectionContentInput[];
}

export interface GeneratedDirectionsWritten {
  readonly directionCount: number;
}

/**
 * Writes the directions a mission proposed, inside a transaction the caller
 * holds (CAL-210).
 *
 * `writeGeneratedAnalysisWithin`'s shape one stage down, and everything it
 * shares with it is the point:
 *
 * - **It takes the caller's transaction rather than opening one.** The write has
 *   to land in the statement that completes the attempt (§7: *succeed is a
 *   single atomic operation*), so `GenerationProduct.append` hands it the client
 *   `completeGenerationAttempt` is already holding, under the generation's own
 *   row lock. A refusal here rolls the directions, the attempt and the
 *   generation back together, which is what makes *never a partial write*
 *   structural rather than careful.
 * - **One statement.** An interactive transaction has a five-second budget by
 *   default and this one is already holding a row lock, an attempt update and a
 *   closing status write; three round trips where one `createMany` does is how
 *   an answer somebody paid for comes to be rolled back by a timeout. Nothing
 *   here needs the ids back, so `createMany` rather than `createManyAndReturn`.
 * - **It refuses a project that already holds standing proposals**, the same
 *   refusal the executor makes before paying for anything. Decided twice on
 *   purpose: the author may write their own direction while the generation runs,
 *   and a lock is true for every writer or it is true for none.
 *
 * **The project is confirmed through this client.** These rows have no existing
 * `CreativeDirection` for a `scopedWhere` to protect — `writeUserDirection`
 * answers that with `withProjectTransaction`, and this function cannot, because
 * it must stay inside the transaction it was handed. The count below is that
 * same check, run against the caller's client: a scope that was forged rather
 * than opened by `openProjectScope` reaches nothing.
 *
 * The caller must be inside `runWithActor`: `CreativeDirection` carries the
 * audit block, and the sentinel default the column would otherwise take is
 * refused by its foreign key at commit.
 *
 * There is deliberately **no status recompute**. `ProjectProgress` reads
 * `hasCanonicalDirection`, never *the project has directions*, so proposing
 * moves no evidence `deriveProjectStatus` reads and `withProjectStatus` would be
 * a lock taken for nothing — `writeGeneratedAnalysisWithin`'s reasoning, one
 * stage down.
 */
export async function writeGeneratedDirectionsWithin(
  client: TransactionClient,
  scope: ProjectScope,
  input: WriteGeneratedDirectionsInput,
): Promise<Result<GeneratedDirectionsWritten>> {
  assertProjectScope(scope);

  if (input.directions.length === 0) {
    return fail(
      new ValidationError({
        message: "a generated proposal holds no direction",
        userMessage: "La proposition produite ne contient aucune direction.",
        fieldPath: "directions",
      }),
    );
  }

  const project = await client.project.count({
    where: { id: scope.projectId, userId: scope.ownerId },
  });

  if (project === 0) return fail(projectNotFound());

  const standing = await client.creativeDirection.count({
    where: scopedWhere("CreativeDirection", scope, { discardedAt: null }),
  });

  if (standing > 0) return fail(directionsAlreadyProposed());

  await client.creativeDirection.createMany({
    data: input.directions.map((content) => ({
      projectId: scope.projectId,
      ...directionContentData(content),
      origin: "PROPOSED" as const,
      isCanonical: false,
    })),
  });

  return succeed({ directionCount: input.directions.length });
}

/**
 * The refusal both writers of a generated proposal raise — the executor before
 * the model is called, this module at the write.
 *
 * One helper so the two cannot word it differently, `analysisAlreadyValidated`'s
 * arrangement in the analysis module.
 */
export function directionsAlreadyProposed(): AppError {
  return new ConflictError({
    code: "DIRECTIONS_ALREADY_PROPOSED",
    message: "the project already holds directions that have not been discarded",
    userMessage:
      "Ce projet a déjà des directions en comparaison. " +
      "Écartez celles qui ne vous conviennent pas, puis demandez un remplacement.",
  });
}

/**
 * What one statement says about the work built on the retained direction.
 *
 * **The reference instant is the canonical direction's own `updatedAt`**, and
 * it is the right one because it is the only thing that moves when the
 * direction the novel is built on moves: a row becomes canonical through an
 * update, ceases to be canonical through another, and its wording changes
 * through `editDirection` — three writes, all of them a reason for the bible to
 * be looked at again, all of them recorded in that one column. A dedicated
 * `canonicalSince` beside it would be a second answer able to disagree with it,
 * which is the shape `Project.status` and `AnalysisSectionRevision` both refuse.
 *
 * The three counts are judged by time for the reason `readSourceTextObsolescence`
 * gives: nothing downstream of the direction records which direction it was
 * produced from, and inventing three columns for write paths that do not exist
 * yet (E09 to E12) would be guessing at their shape.
 *
 * With no canonical direction, the cross join yields no row and every preceding
 * count is zero — nothing can descend from a direction that was never chosen.
 * Counts and one boolean; nothing readable as part of the novel (CLAUDE.md §9).
 */
async function selectDirectionDependencyState(
  client: TransactionClient,
  scope: ProjectScope,
): Promise<CanonicalDirectionDependencyRow | undefined> {
  const rows = await client.$queryRaw`
    WITH "canonical" AS (
      SELECT d."updatedAt"
      FROM "creative_directions" d
      WHERE d."projectId" = ${scope.projectId} AND d."isCanonical"
      LIMIT 1
    )
    SELECT
      EXISTS (SELECT 1 FROM "canonical") AS "hasCanonicalDirection",
      (
        SELECT COUNT(*) FROM "bibles" b
        WHERE b."projectId" = ${scope.projectId}
      )::int AS "biblePresentCount",
      (
        SELECT COUNT(*) FROM "bibles" b CROSS JOIN "canonical" c
        WHERE b."projectId" = ${scope.projectId} AND b."updatedAt" < c."updatedAt"
      )::int AS "biblePrecedingCount",
      (
        SELECT COUNT(*) FROM "outlines" o
        WHERE o."projectId" = ${scope.projectId}
      )::int AS "outlinePresentCount",
      (
        SELECT COUNT(*) FROM "outlines" o CROSS JOIN "canonical" c
        WHERE o."projectId" = ${scope.projectId} AND o."updatedAt" < c."updatedAt"
      )::int AS "outlinePrecedingCount",
      (
        SELECT COUNT(*) FROM "outlines" o
        JOIN "chapters" ch ON ch."outlineId" = o."id"
        WHERE o."projectId" = ${scope.projectId}
      )::int AS "chaptersPresentCount",
      (
        SELECT COUNT(*) FROM "outlines" o
        JOIN "chapters" ch ON ch."outlineId" = o."id"
        CROSS JOIN "canonical" c
        WHERE o."projectId" = ${scope.projectId} AND ch."updatedAt" < c."updatedAt"
      )::int AS "chaptersPrecedingCount"
    FROM "projects" p
    WHERE p."id" = ${scope.projectId} AND p."userId" = ${scope.ownerId}
  `;

  return toDependencyRow(rows);
}

interface CanonicalDirectionDependencyRow {
  readonly hasCanonicalDirection: boolean;
  readonly stages: Readonly<Record<DirectionDependentStage, DownstreamStageState>>;
}

/**
 * A raw result is untrusted input like any other (CLAUDE.md §6). A cast here
 * would turn a renamed column into a project reported permanently up to date —
 * the one failure mode this whole feature exists to prevent.
 */
function toDependencyRow(rows: unknown): CanonicalDirectionDependencyRow | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;

  const row: unknown = rows[0];
  if (typeof row !== "object" || row === null) throw unexpectedShape();

  const record: Record<string, unknown> = { ...row };

  const stages = Object.fromEntries(
    DIRECTION_DEPENDENT_STAGES.map((stage): [DirectionDependentStage, DownstreamStageState] => [
      stage,
      {
        presentCount: readCount(record, `${stage}PresentCount`),
        precedingCount: readCount(record, `${stage}PrecedingCount`),
      },
    ]),
  ) as Record<DirectionDependentStage, DownstreamStageState>;

  return { hasCanonicalDirection: readBoolean(record, "hasCanonicalDirection"), stages };
}

function unexpectedShape(fieldPath?: string): InternalError {
  return new InternalError({
    message: "the direction dependency query returned a row of an unexpected shape",
    ...(fieldPath === undefined ? {} : { fieldPath }),
  });
}

function readCount(row: Record<string, unknown>, field: string): number {
  const value: unknown = row[field];
  if (typeof value !== "number" || !Number.isInteger(value)) throw unexpectedShape(field);

  return value;
}

function readBoolean(row: Record<string, unknown>, field: string): boolean {
  const value: unknown = row[field];
  if (typeof value !== "boolean") throw unexpectedShape(field);

  return value;
}

/**
 * What the retained direction has already left behind, and what changing it now
 * would leave behind (CAL-086).
 *
 * A read, and nothing but a read — the twin of `readSourceTextObsolescence` one
 * rung down the chain. It names stages; it never deletes, regenerates or
 * enqueues anything, which is the backlog's own requirement stated of this
 * change in the same words it used of a source-text edit.
 */
export async function readCanonicalDirectionObsolescence(
  scope: ProjectScope,
): Promise<Result<CanonicalDirectionObsolescence>> {
  assertProjectScope(scope);

  const state = await selectDirectionDependencyState(getDatabaseClient(), scope);

  return state === undefined
    ? fail(projectNotFound())
    : succeed(assessCanonicalDirectionObsolescence(state));
}

export interface SelectCanonicalDirectionInput {
  readonly directionId: string;
  /**
   * The author has read what the change leaves behind and is going ahead.
   * Required only when the project already holds work built on the direction
   * being replaced — see the refusal below.
   */
  readonly acknowledgeObsolescence?: boolean;
}

export interface CanonicalDirectionSelected {
  /** `false` when this direction was already the retained one; nothing was written. */
  readonly changed: boolean;
  /** The direction that was retained until now, or null on a first choice. */
  readonly previousDirectionId: string | null;
  /**
   * What the change put in doubt downstream — empty on a first choice, and on
   * a project holding nothing below the direction. Intact, every row of it.
   */
  readonly obsolescence: StageChainAssessment;
}

/**
 * Retains one direction as the project's own (CAL-086).
 *
 * **One per project, and the database is what says so.** Two statements —
 * clear whichever row held the flag, set it on the named one — inside the
 * transaction `withProjectStatus` opens, under the project's row lock. The
 * partial unique index `creative_directions_canonical_per_project_key` is the
 * backstop rather than the mechanism: it turns a lost race into a write error
 * instead of a project with two canonical directions, which is the same
 * division of labour `updateSourceText` gives `versionNumber`.
 *
 * **The status follows the evidence, it is not asserted.** `isCanonical` is
 * what `deriveProjectStatus` reads for `BIBLE_TO_VALIDATE`, so retaining a
 * direction moves the project there by recomputation inside the same
 * transaction (CAL-034) — no caller ever names a status, here or anywhere.
 *
 * **Four refusals, and each has its own remedy.**
 *
 *   - A direction that is not there, or not theirs: `NOT_FOUND` (§3.5).
 *   - A discarded one: `CONFLICT`. CAL-083's doctrine read one step further —
 *     nothing un-discards a direction, and building the novel on one written
 *     off would be exactly that.
 *   - Before the analysis is validated: `ANALYSIS_NOT_VALIDATED`. The status
 *     machine already holds this rule — `DIRECTION_TO_CHOOSE` is the stage a
 *     validated analysis produces — and without naming it here the recomputation
 *     would refuse the write anyway, with `ILLEGAL_STATUS_TRANSITION` and a
 *     sentence about a status the author never asked about.
 *   - A *change* that would leave downstream work behind, unacknowledged:
 *     `OBSOLESCENCE_NOT_ACKNOWLEDGED`, carrying nothing but the answer to look
 *     at the report. That is what makes *avertir explicitement* a property of
 *     the statement rather than of a screen: a caller that never shows the
 *     warning cannot get the write through.
 *
 * **Choosing the same direction again is a success, not a conflict.** A second
 * click is the same decision — `cancelGeneration`'s reading — and nothing is
 * written, so no timestamp moves and no downstream stage is put in doubt by an
 * act that changed nothing.
 *
 * The caller must be inside `runWithActor`: neither update names an
 * `updatedById`, and the CAL-022 extension is what records who chose.
 */
export async function selectCanonicalDirection(
  scope: ProjectScope,
  input: SelectCanonicalDirectionInput,
): Promise<Result<CanonicalDirectionSelected>> {
  assertProjectScope(scope);

  return withProjectStatus<CanonicalDirectionSelected>(scope, async (tx) => {
    const direction = await tx.creativeDirection.findFirst({
      where: scopedWhere("CreativeDirection", scope, { id: input.directionId }),
      select: { id: true, isCanonical: true, discardedAt: true },
    });

    if (direction === null) {
      return fail(new NotFoundError({ message: "no such direction in this project" }));
    }

    if (direction.isCanonical) {
      return fail(
        new ConflictError({
          code: "CONFLICT",
          message: "this direction is already the retained one",
          userMessage: "Cette direction est déjà celle que vous avez retenue.",
        }),
      );
    }

    if (direction.discardedAt !== null) {
      return fail(
        new ConflictError({
          message: "a discarded direction cannot be retained",
          userMessage: "Cette direction a été écartée : elle ne peut pas être retenue.",
        }),
      );
    }

    const analysis = await tx.analysis.findFirst({
      where: scopedWhere("Analysis", scope),
      select: { validatedAt: true },
    });

    if (analysis === null || analysis.validatedAt === null) {
      return fail(
        new ConflictError({
          code: "ANALYSIS_NOT_VALIDATED",
          message: "a direction cannot be retained before the analysis is validated",
          userMessage:
            "Validez d'abord l'analyse du texte source : la direction se retient ensuite.",
        }),
      );
    }

    const previous = await tx.creativeDirection.findFirst({
      where: scopedWhere("CreativeDirection", scope, { isCanonical: true }),
      select: { id: true },
    });

    const state = await selectDirectionDependencyState(tx, scope);
    // Unreachable behind the lock, which already refused a project the scope
    // does not own — but the alternative to a check here is a cast (§6).
    if (state === undefined) return fail(projectNotFound());

    const { onChange } = assessCanonicalDirectionObsolescence(state);

    if (previous !== null && onChange.hasObsoleteStages && input.acknowledgeObsolescence !== true) {
      return fail(
        new ConflictError({
          code: "OBSOLESCENCE_NOT_ACKNOWLEDGED",
          message: "changing the retained direction leaves downstream work behind",
          userMessage:
            "Changer de direction laisse en arrière ce qui a été construit sur la précédente. " +
            "Rien ne sera supprimé ni régénéré : confirmez pour continuer.",
        }),
      );
    }

    // Cleared first, set second. The partial unique index admits one `true` per
    // project at a time, and PostgreSQL checks it as each statement lands.
    if (previous !== null) {
      await tx.creativeDirection.update({
        where: { id: previous.id },
        data: { isCanonical: false },
      });
    }

    await tx.creativeDirection.update({
      where: { id: direction.id },
      data: { isCanonical: true },
    });

    return succeed({
      changed: true,
      previousDirectionId: previous?.id ?? null,
      // What the write just put in doubt is what `onChange` named a moment ago:
      // every downstream stage now predates the direction the novel follows.
      obsolescence: previous === null ? emptyAssessment() : onChange,
    });
  });
}

/**
 * A first choice puts nothing in doubt. Not `onChange` with the counts zeroed:
 * a project that somehow holds a bible before any direction was retained did
 * not build it on the one being chosen now, and saying otherwise would be the
 * report claiming a provenance it cannot know.
 */
function emptyAssessment(): StageChainAssessment {
  return {
    stages: DIRECTION_DEPENDENT_STAGES.map((stage) => ({
      stage,
      presentCount: 0,
      precedingCount: 0,
      isObsolete: false,
      reason: null,
    })),
    obsoleteStages: [],
    hasObsoleteStages: false,
  };
}
