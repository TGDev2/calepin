/**
 * The source text after creation (CAL-046) — reading it, editing it, and
 * finding out what an edit put in doubt.
 *
 * Until now `createProjectWithSourceText` was the only writer of a
 * `SourceTextVersion` and it hard-coded `versionNumber: 1`. This module adds the
 * second write, and the shape of the table decides what that write looks like:
 * `SourceTextVersion` is append-only, so an edit **appends** rather than
 * updating, and every earlier version stays exactly as it was written. That is
 * the traceability the specification asks for, and it is what makes the
 * obsolescence report below possible at all — a report that could only compare
 * against the text as it is now could never say which stage read which version.
 *
 * **The append happens under the project's row lock.** `versionNumber` is
 * `max + 1`, read and then written, and the unique index on
 * `(sourceTextId, versionNumber)` turns a lost race into a write error rather
 * than a silent overwrite. `withProjectStatus` already owns that lock and
 * already recomputes the derived status inside the same transaction, which is
 * the second reason to use it: `hasSourceText` is status evidence, and a path
 * that wrote a version outside the wrapper would be the one path able to leave
 * the column disagreeing with the rows.
 *
 * **Nothing here deletes or regenerates anything.** `readSourceTextObsolescence`
 * is a read — it names the stages an edit left behind and stops there. The
 * backlog is explicit about that, and the reason is not caution: the author is
 * the only one who knows whether a rewrite of two paragraphs invalidates their
 * bible, and a product that decided for them would destroy work on a guess.
 */

import { getDatabaseClient } from "../database/client";
import { InternalError, NotFoundError, ValidationError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import {
  assessSourceTextObsolescence,
  DOWNSTREAM_STAGES,
  type DownstreamStage,
  type DownstreamStageState,
  type SourceTextObsolescence,
} from "../obsolescence";
import { measureSourceText, normalizeText, sourceTextLimitMessage } from "../text";
import { projectNotFound } from "./project-lock";
import { withProjectStatus } from "./project-status";
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";

/** The source text as it stands: its current version, and how it got there. */
export interface SourceTextSnapshot {
  readonly sourceTextId: string;
  readonly versionNumber: number;
  readonly versionCount: number;
  readonly content: string;
  readonly wordCount: number;
  readonly language: string;
  readonly createdAt: Date;
}

/**
 * One entry of the history. No `content`: a list of versions is a list of
 * *facts about* versions, and shipping five copies of the novel's opening to
 * render five dates would be prose crossing a boundary for no reason
 * (CLAUDE.md §9). The content of one version is fetched when one is opened.
 */
export interface SourceTextVersionSummary {
  readonly versionNumber: number;
  readonly wordCount: number;
  readonly language: string;
  readonly createdAt: Date;
  readonly editedById: string;
}

export interface UpdateSourceTextInput {
  readonly content: string;
  /** Left alone when absent — the language is the project's decision (CAL-042). */
  readonly language?: string;
}

export interface SourceTextEdit {
  /** `false` when the submitted text was identical and no version was written. */
  readonly created: boolean;
  readonly versionNumber: number;
  readonly wordCount: number;
}

/**
 * The current source text, content included — what the editor screen loads.
 *
 * The current version is the highest `versionNumber`, never a flag: the schema
 * keeps no `isCurrent` column, for the reason it keeps none on a chapter
 * revision either. A flag is a second answer able to disagree with the ordering
 * that already holds the first one.
 */
export async function getSourceText(scope: ProjectScope): Promise<Result<SourceTextSnapshot>> {
  assertProjectScope(scope);

  const sourceText = await getDatabaseClient().sourceText.findFirst({
    where: scopedWhere("SourceText", scope),
    select: {
      id: true,
      _count: { select: { versions: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          versionNumber: true,
          content: true,
          wordCount: true,
          language: true,
          createdAt: true,
        },
      },
    },
  });

  const current = sourceText?.versions[0];

  // A source text with no version cannot be produced by any write path here —
  // creation writes both in one transaction — so it is the same answer as no
  // source text at all rather than an empty editor claiming the text is blank.
  if (sourceText === null || current === undefined) {
    return fail(new NotFoundError({ message: "this project holds no source text" }));
  }

  return succeed({
    sourceTextId: sourceText.id,
    versionCount: sourceText._count.versions,
    versionNumber: current.versionNumber,
    content: current.content,
    wordCount: current.wordCount,
    language: current.language,
    createdAt: current.createdAt,
  });
}

/** Every version, newest first. Facts only — see `SourceTextVersionSummary`. */
export async function listSourceTextVersions(
  scope: ProjectScope,
): Promise<Result<readonly SourceTextVersionSummary[]>> {
  assertProjectScope(scope);

  const versions = await getDatabaseClient().sourceTextVersion.findMany({
    where: scopedWhere("SourceTextVersion", scope),
    orderBy: { versionNumber: "desc" },
    select: {
      versionNumber: true,
      wordCount: true,
      language: true,
      createdAt: true,
      editedById: true,
    },
  });

  return succeed(versions);
}

/**
 * Edits the source text by appending a version.
 *
 * **The limit is enforced here, before the transaction opens**, exactly as
 * `createProjectWithSourceText` enforces it: the interface layer refuses an
 * over-limit text first for the author's sake, and this refusal is what makes
 * the rule true for every caller — the worker, an import path, a future API. A
 * `Result` rather than a throw, because a text that is too long is a failure the
 * caller must handle rather than a bug (CLAUDE.md §7). The message carries the
 * count and no text; `fieldPath` names the field and not its value (§9).
 *
 * **An identical submit writes nothing.** *Chaque modification crée une nouvelle
 * version* — a form posted back unchanged is not a modification, and a history
 * padded with duplicates would make the obsolescence report cry wolf on every
 * visit to the editor. Normalisation runs first, so a change that is only line
 * endings or Unicode composition is identical too.
 *
 * **The container is touched on purpose.** `SourceText` carries the audit block
 * and `SourceTextVersion` does not; the version records who wrote it, and the
 * update records that the source text as a whole moved and who moved it. The
 * caller must therefore be inside an actor scope (`runWithActor`), or the write
 * is refused rather than landing unattributed.
 */
export async function updateSourceText(
  scope: ProjectScope,
  input: UpdateSourceTextInput,
): Promise<Result<SourceTextEdit>> {
  assertProjectScope(scope);

  const content = normalizeText(input.content);
  const { wordCount } = measureSourceText(content);
  const overLimit = sourceTextLimitMessage(wordCount);

  if (overLimit !== null) {
    return fail(
      new ValidationError({
        message: "source text exceeds the word limit",
        userMessage: overLimit,
        fieldPath: "content",
      }),
    );
  }

  if (content === "") {
    return fail(
      new ValidationError({
        message: "source text is empty",
        userMessage: "Le texte source ne peut pas être vide.",
        fieldPath: "content",
      }),
    );
  }

  return withProjectStatus<SourceTextEdit>(scope, async (tx) => {
    const sourceText = await tx.sourceText.findFirst({
      where: scopedWhere("SourceText", scope),
      select: {
        id: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: { versionNumber: true, content: true, language: true },
        },
      },
    });

    const current = sourceText?.versions[0];

    if (sourceText === null || current === undefined) {
      return fail(new NotFoundError({ message: "this project holds no source text" }));
    }

    const language = input.language ?? current.language;

    if (current.content === content && current.language === language) {
      return succeed({ created: false, versionNumber: current.versionNumber, wordCount });
    }

    const versionNumber = current.versionNumber + 1;

    await tx.sourceTextVersion.create({
      data: {
        sourceTextId: sourceText.id,
        versionNumber,
        content,
        wordCount,
        language,
        editedById: scope.ownerId,
      },
    });

    // Empty data on purpose: `@updatedAt` and the CAL-022 extension are the
    // whole point of the statement, and there is no scalar on the container
    // worth restating. The version beside it holds everything that changed.
    await tx.sourceText.update({ where: { id: sourceText.id }, data: {} });

    return succeed({ created: true, versionNumber, wordCount });
  });
}

/**
 * Which stages the current version of the source text has left behind.
 *
 * One statement, anchored on `projects` for the reason `./project-status`
 * states: aggregating the other way answers "nothing to report" for a project
 * that does not exist, which reads as a clean project rather than as a missing
 * one.
 *
 * **The analysis is judged by provenance, the rest by time.** A section revision
 * names the source text version it was produced against — the one back-pointer
 * the schema carries, added for this task — so the analysis half of the answer
 * is exact: a section is behind when its latest revision names another version,
 * full stop. Nothing downstream of the analysis records such a pointer, and
 * inventing four columns for write paths that do not exist yet (E07 to E12)
 * would be guessing at their shape. Those four are judged by whether their own
 * row has been touched since the current version was written, which is the
 * honest reading of *potentiellement obsolète*: it errs toward flagging, and the
 * inheritance rule in `@calepin/shared/obsolescence` covers the case where a
 * stage was touched for an unrelated reason.
 *
 * The statement returns counts and one version number. No title, no statement,
 * no summary, nothing readable as part of the novel (CLAUDE.md §9).
 */
export async function readSourceTextObsolescence(
  scope: ProjectScope,
): Promise<Result<SourceTextObsolescence>> {
  assertProjectScope(scope);

  const rows = await getDatabaseClient().$queryRaw`
    WITH "current" AS (
      SELECT v."id", v."versionNumber", v."createdAt"
      FROM "source_texts" st
      JOIN "source_text_versions" v ON v."sourceTextId" = st."id"
      WHERE st."projectId" = ${scope.projectId}
      ORDER BY v."versionNumber" DESC
      LIMIT 1
    ),
    "latest_section" AS (
      SELECT DISTINCT ON (r."section") r."section", r."sourceTextVersionId"
      FROM "analysis_section_revisions" r
      JOIN "analyses" a ON a."id" = r."analysisId"
      WHERE a."projectId" = ${scope.projectId}
      ORDER BY r."section", r."revisionNumber" DESC
    )
    SELECT
      c."versionNumber"::int AS "currentVersionNumber",
      (
        SELECT COUNT(*) FROM "source_texts" st
        JOIN "source_text_versions" v ON v."sourceTextId" = st."id"
        WHERE st."projectId" = ${scope.projectId}
      )::int AS "versionCount",
      (SELECT COUNT(*) FROM "latest_section")::int AS "analysisPresentCount",
      (
        SELECT COUNT(*) FROM "latest_section" s
        WHERE s."sourceTextVersionId" <> c."id"
      )::int AS "analysisPrecedingCount",
      (
        SELECT COUNT(*) FROM "creative_directions" d
        WHERE d."projectId" = ${scope.projectId}
      )::int AS "directionPresentCount",
      (
        SELECT COUNT(*) FROM "creative_directions" d
        WHERE d."projectId" = ${scope.projectId} AND d."updatedAt" < c."createdAt"
      )::int AS "directionPrecedingCount",
      (
        SELECT COUNT(*) FROM "bibles" b
        WHERE b."projectId" = ${scope.projectId}
      )::int AS "biblePresentCount",
      (
        SELECT COUNT(*) FROM "bibles" b
        WHERE b."projectId" = ${scope.projectId} AND b."updatedAt" < c."createdAt"
      )::int AS "biblePrecedingCount",
      (
        SELECT COUNT(*) FROM "outlines" o
        WHERE o."projectId" = ${scope.projectId}
      )::int AS "outlinePresentCount",
      (
        SELECT COUNT(*) FROM "outlines" o
        WHERE o."projectId" = ${scope.projectId} AND o."updatedAt" < c."createdAt"
      )::int AS "outlinePrecedingCount",
      (
        SELECT COUNT(*) FROM "outlines" o
        JOIN "chapters" ch ON ch."outlineId" = o."id"
        WHERE o."projectId" = ${scope.projectId}
      )::int AS "chaptersPresentCount",
      (
        SELECT COUNT(*) FROM "outlines" o
        JOIN "chapters" ch ON ch."outlineId" = o."id"
        WHERE o."projectId" = ${scope.projectId} AND ch."updatedAt" < c."createdAt"
      )::int AS "chaptersPrecedingCount"
    FROM "current" c
    WHERE EXISTS (
      SELECT 1 FROM "projects" p
      WHERE p."id" = ${scope.projectId} AND p."userId" = ${scope.ownerId}
    )
  `;

  const state = toDependencyState(rows);

  return state === undefined
    ? fail(projectNotFound())
    : succeed(assessSourceTextObsolescence(state));
}

/**
 * A raw result is untrusted input like any other (CLAUDE.md §6). A cast here
 * would turn a renamed column into a project reported permanently up to date —
 * the one failure mode this whole feature exists to prevent.
 */
function toDependencyState(rows: unknown) {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;

  const row: unknown = rows[0];
  if (typeof row !== "object" || row === null) throw unexpectedShape();

  const record: Record<string, unknown> = { ...row };

  const stages = Object.fromEntries(
    DOWNSTREAM_STAGES.map((stage): [DownstreamStage, DownstreamStageState] => [
      stage,
      {
        presentCount: readCount(record, `${stage}PresentCount`),
        precedingCount: readCount(record, `${stage}PrecedingCount`),
      },
    ]),
  ) as Record<DownstreamStage, DownstreamStageState>;

  return {
    currentVersionNumber: readCount(record, "currentVersionNumber"),
    versionCount: readCount(record, "versionCount"),
    stages,
  };
}

function unexpectedShape(fieldPath?: string): InternalError {
  return new InternalError({
    message: "the source text obsolescence query returned a row of an unexpected shape",
    ...(fieldPath === undefined ? {} : { fieldPath }),
  });
}

function readCount(row: Record<string, unknown>, field: string): number {
  const value: unknown = row[field];
  if (typeof value !== "number" || !Number.isInteger(value)) throw unexpectedShape(field);

  return value;
}
