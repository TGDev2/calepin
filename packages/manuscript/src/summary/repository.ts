/**
 * The summary read and write paths (CAL-055).
 *
 * Every function here takes a `ProjectScope` and composes `scopedWhere`, the
 * shape `chapter/revision.ts` beside it already uses. Two things differ, and
 * both follow from what a summary is:
 *
 *   - **`withProjectTransaction`, not `withProjectAggregates`.** A summary moves
 *     no derived column — it is not a chapter revision, so it changes neither
 *     `writtenChapterCount` nor `totalWordCount` nor the project's status — and
 *     running it under the aggregate wrapper would take the project's row lock
 *     and rewrite two counters to the values they already held.
 *   - **`requireOwnedRow` before the create.** A `where` protects a read, an
 *     update and a delete; the parent id of a new child row is a value the
 *     caller supplied and nothing constrains it. This is the check CLAUDE.md
 *     §3.5 puts there, and the first place in a domain package that needs it.
 *
 * The reads exist to feed `@calepin/ai`'s composers, so they return that
 * layer's candidate shapes directly. Resolving a chapter's distance and a
 * part's is narrative arithmetic over `orderKey`, which is the domain's job and
 * not the composer's (§5.7).
 */

import type { PartSummary, PrecedingChapterSummary } from "@calepin/ai";
import { fail, NotFoundError, type Result, succeed } from "@calepin/shared/errors";
import {
  type ProjectScope,
  requireOwnedRow,
  scopedWhere,
  type TransactionClient,
  withProjectTransaction,
} from "@calepin/shared/repository";
import { countWords } from "@calepin/shared/text";

/** A chapter's stored pair of summaries, as the repository hands them out. */
export interface ChapterSummarySnapshot {
  readonly id: string;
  readonly chapterId: string;
  /** 1 for the first summary of a chapter; the current one is the highest. */
  readonly revisionNumber: number;
  /** The chapter revision these were made from — the provenance link. */
  readonly chapterRevisionId: string;
  readonly briefSummary: string;
  readonly detailedSummary: string;
  readonly briefWordCount: number;
  readonly detailedWordCount: number;
}

/** A part's stored summary. */
export interface PartSummarySnapshot {
  readonly id: string;
  readonly partId: string;
  readonly revisionNumber: number;
  readonly summary: string;
  readonly wordCount: number;
}

export interface AppendChapterSummaryInput {
  readonly chapterId: string;
  /** The revision summarised. Must belong to the chapter, and is checked to. */
  readonly chapterRevisionId: string;
  readonly briefSummary: string;
  readonly detailedSummary: string;
  readonly authorId: string;
  readonly generationId?: string;
}

export interface AppendPartSummaryInput {
  readonly partId: string;
  readonly summary: string;
  readonly authorId: string;
  readonly generationId?: string;
}

function chapterRevisionNotFound(): NotFoundError {
  return new NotFoundError({ message: "no revision with this id belongs to this chapter" });
}

function partNotFound(): NotFoundError {
  return new NotFoundError({ message: "no part with this id belongs to this project" });
}

/**
 * Appends the next summary revision of a chapter.
 *
 * The revision is resolved through the *chapter* rather than by id alone, so a
 * caller cannot pair one chapter's id with another's revision: the composite
 * foreign key would refuse the write anyway, but a `NOT_FOUND` from a scoped
 * read is the answer the caller can act on, and a constraint violation is not.
 */
export async function appendChapterSummaryRevision(
  scope: ProjectScope,
  input: AppendChapterSummaryInput,
): Promise<Result<ChapterSummarySnapshot>> {
  return withProjectTransaction(scope, async (tx) => {
    // One statement, and it does two things: it finds the revision and it
    // proves the chapter it hangs off belongs to the scope's project.
    const revision = await tx.chapterRevision.findFirst({
      where: scopedWhere("ChapterRevision", scope, {
        id: input.chapterRevisionId,
        chapterId: input.chapterId,
      }),
      select: { id: true },
    });

    if (revision === null) return fail(chapterRevisionNotFound());

    const latest = await tx.chapterSummaryRevision.findFirst({
      where: { chapterId: input.chapterId },
      orderBy: { revisionNumber: "desc" },
      select: { revisionNumber: true },
    });

    const created = await tx.chapterSummaryRevision.create({
      data: {
        chapterId: input.chapterId,
        chapterRevisionId: input.chapterRevisionId,
        revisionNumber: (latest?.revisionNumber ?? 0) + 1,
        briefSummary: input.briefSummary,
        detailedSummary: input.detailedSummary,
        briefWordCount: countWords(input.briefSummary),
        detailedWordCount: countWords(input.detailedSummary),
        generationId: input.generationId ?? null,
        createdById: input.authorId,
      },
      select: SUMMARY_FIELDS,
    });

    return succeed(created);
  });
}

/** Appends the next summary revision of a part. */
export async function appendPartSummaryRevision(
  scope: ProjectScope,
  input: AppendPartSummaryInput,
): Promise<Result<PartSummarySnapshot>> {
  return withProjectTransaction(scope, async (tx) => {
    // The parent id is a value the caller supplied; this is the check a create
    // needs and a `where` cannot make (CLAUDE.md §3.5).
    const owned = await requireOwnedRow("Part", input.partId, scope);
    if (!owned.ok) return fail(partNotFound());

    const latest = await tx.partSummaryRevision.findFirst({
      where: { partId: input.partId },
      orderBy: { revisionNumber: "desc" },
      select: { revisionNumber: true },
    });

    const created = await tx.partSummaryRevision.create({
      data: {
        partId: input.partId,
        revisionNumber: (latest?.revisionNumber ?? 0) + 1,
        summary: input.summary,
        wordCount: countWords(input.summary),
        generationId: input.generationId ?? null,
        createdById: input.authorId,
      },
      select: { id: true, partId: true, revisionNumber: true, summary: true, wordCount: true },
    });

    return succeed(created);
  });
}

/** The current summary of a chapter, or `undefined` when it has none yet. */
export async function readCurrentChapterSummary(
  scope: ProjectScope,
  chapterId: string,
): Promise<Result<ChapterSummarySnapshot | undefined>> {
  return withProjectTransaction(scope, async (tx) => {
    const summary = await currentChapterSummary(tx, scope, chapterId);

    return succeed(summary ?? undefined);
  });
}

/**
 * What `summarize-chapter` needs about a chapter: its language, its current
 * revision, and the text of it.
 *
 * The chapter's status travels too, because *when* a chapter may be summarised
 * is a narrative rule and belongs on this side of the boundary — the service
 * above reads it, the AI layer never sees it.
 */
export interface ChapterSummarySubject {
  readonly chapterId: string;
  readonly partId: string;
  readonly status: string;
  readonly language: string;
  readonly chapterRevisionId: string;
  readonly content: string;
}

export async function readChapterSummarySubject(
  scope: ProjectScope,
  chapterId: string,
): Promise<Result<ChapterSummarySubject>> {
  return withProjectTransaction(scope, async (tx) => {
    const chapter = await tx.chapter.findFirst({
      where: scopedWhere("Chapter", scope, { id: chapterId }),
      select: {
        id: true,
        partId: true,
        status: true,
        outline: { select: { project: { select: { language: true } } } },
        revisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          select: { id: true, content: true },
        },
      },
    });

    if (chapter === null) {
      return fail(
        new NotFoundError({ message: "no chapter with this id belongs to this project" }),
      );
    }

    const revision = chapter.revisions[0];

    if (revision === undefined) {
      return fail(new NotFoundError({ message: "this chapter has no revision to summarise" }));
    }

    return succeed({
      chapterId: chapter.id,
      partId: chapter.partId,
      status: chapter.status,
      language: chapter.outline.project.language,
      chapterRevisionId: revision.id,
      content: revision.content,
    });
  });
}

/**
 * What `summarize-part` needs: the part's own plan, and the current summaries
 * of its chapters in reading order.
 *
 * Reading order is `orderKey` ascending, which is the plan's order and the only
 * order this repository is entitled to state — the *number* a reader sees is
 * `resolveOutline`'s, in `@calepin/outline`, and nothing here needs it.
 */
export interface PartSummarySubject {
  readonly partId: string;
  readonly title: string;
  readonly language: string;
  /** The planning attributes that are set — objective, states, tipping point. */
  readonly plannedArc: readonly string[];
  readonly chapters: readonly {
    readonly id: string;
    readonly briefSummary: string;
    readonly detailedSummary: string;
  }[];
}

export async function readPartSummarySubject(
  scope: ProjectScope,
  partId: string,
): Promise<Result<PartSummarySubject>> {
  return withProjectTransaction(scope, async (tx) => {
    const part = await tx.part.findFirst({
      where: scopedWhere("Part", scope, { id: partId }),
      select: {
        id: true,
        title: true,
        dramaticObjective: true,
        initialState: true,
        tippingPoint: true,
        finalState: true,
        outline: { select: { project: { select: { language: true } } } },
        chapters: { orderBy: { orderKey: "asc" }, select: { id: true } },
      },
    });

    if (part === null) return fail(partNotFound());

    const summaries = await currentSummariesOf(
      tx,
      scope,
      part.chapters.map((chapter) => chapter.id),
    );

    return succeed({
      partId: part.id,
      title: part.title,
      language: part.outline.project.language,
      plannedArc: [
        part.dramaticObjective,
        part.initialState,
        part.tippingPoint,
        part.finalState,
      ].filter((clause): clause is string => clause !== null && clause.trim() !== ""),
      // Chapters with no summary yet are simply absent: a part is summarised
      // out of what has been written, not out of placeholders for what has not.
      chapters: part.chapters.flatMap((chapter) => {
        const summary = summaries.get(chapter.id);

        return summary === undefined
          ? []
          : [
              {
                id: chapter.id,
                briefSummary: summary.briefSummary,
                detailedSummary: summary.detailedSummary,
              },
            ];
      }),
    });
  });
}

/** The memory a writing context is composed from, at both resolutions. */
export interface PrecedingSummaries {
  readonly parts: readonly PartSummary[];
  readonly chapters: readonly PrecedingChapterSummary[];
}

/**
 * Everything preceding a target chapter, in the shapes `composeSceneContext`
 * takes.
 *
 * Reading order is `(part.orderKey, chapter.orderKey)`, which is the schema's
 * own statement of it, and distance is the count back from the target — 1 for
 * the chapter immediately before it, and 1 for the part immediately before the
 * target's own. A part is offered only when it is *entirely* behind the target;
 * the part being written into is represented by its chapters, which is all
 * there is of it.
 */
export async function readPrecedingSummaries(
  scope: ProjectScope,
  chapterId: string,
): Promise<Result<PrecedingSummaries>> {
  return withProjectTransaction(scope, async (tx) => {
    const target = await tx.chapter.findFirst({
      where: scopedWhere("Chapter", scope, { id: chapterId }),
      select: { id: true, orderKey: true, partId: true, outlineId: true },
    });

    if (target === null) {
      return fail(
        new NotFoundError({ message: "no chapter with this id belongs to this project" }),
      );
    }

    const parts = await tx.part.findMany({
      where: scopedWhere("Part", scope, { outlineId: target.outlineId }),
      orderBy: { orderKey: "asc" },
      select: {
        id: true,
        summaryRevisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          select: { summary: true },
        },
        chapters: { orderBy: { orderKey: "asc" }, select: { id: true, orderKey: true } },
      },
    });

    const targetPartIndex = parts.findIndex((part) => part.id === target.partId);

    if (targetPartIndex === -1) {
      return fail(new NotFoundError({ message: "the target chapter's part is not in this plan" }));
    }

    // Every chapter before the target in reading order, nearest last.
    const precedingChapterIds = parts.flatMap((part, index) =>
      index > targetPartIndex
        ? []
        : part.chapters
            .filter((chapter) => index < targetPartIndex || chapter.orderKey < target.orderKey)
            .map((chapter) => chapter.id),
    );

    const summaries = await currentSummariesOf(tx, scope, precedingChapterIds);
    const total = precedingChapterIds.length;

    return succeed({
      parts: parts.flatMap((part, index) => {
        const summary = part.summaryRevisions[0];

        // Strictly behind the target, and summarised. The target's own part is
        // excluded even when it has a summary: half of it has not happened yet.
        return index >= targetPartIndex || summary === undefined
          ? []
          : [{ id: part.id, distance: targetPartIndex - index, summary: summary.summary }];
      }),
      chapters: precedingChapterIds.flatMap((id, index) => {
        const summary = summaries.get(id);

        return summary === undefined
          ? []
          : [
              {
                id,
                distance: total - index,
                briefSummary: summary.briefSummary,
                detailedSummary: summary.detailedSummary,
              },
            ];
      }),
    });
  });
}

const SUMMARY_FIELDS = {
  id: true,
  chapterId: true,
  revisionNumber: true,
  chapterRevisionId: true,
  briefSummary: true,
  detailedSummary: true,
  briefWordCount: true,
  detailedWordCount: true,
} as const;

async function currentChapterSummary(
  tx: TransactionClient,
  scope: ProjectScope,
  chapterId: string,
): Promise<ChapterSummarySnapshot | null> {
  return tx.chapterSummaryRevision.findFirst({
    where: scopedWhere("ChapterSummaryRevision", scope, { chapterId }),
    orderBy: { revisionNumber: "desc" },
    select: SUMMARY_FIELDS,
  });
}

/**
 * The current summary of each of several chapters, in one statement.
 *
 * One query and a fold rather than one query per chapter: a part of forty
 * chapters is composed on every validation, and `DISTINCT ON` is not something
 * Prisma's query builder reaches. Ordering by `(chapterId, revisionNumber desc)`
 * and keeping the first row seen per chapter is the same answer.
 */
async function currentSummariesOf(
  tx: TransactionClient,
  scope: ProjectScope,
  chapterIds: readonly string[],
): Promise<ReadonlyMap<string, ChapterSummarySnapshot>> {
  if (chapterIds.length === 0) return new Map();

  const rows = await tx.chapterSummaryRevision.findMany({
    where: scopedWhere("ChapterSummaryRevision", scope, { chapterId: { in: [...chapterIds] } }),
    orderBy: [{ chapterId: "asc" }, { revisionNumber: "desc" }],
    select: SUMMARY_FIELDS,
  });

  const current = new Map<string, ChapterSummarySnapshot>();

  for (const row of rows) {
    if (!current.has(row.chapterId)) current.set(row.chapterId, row);
  }

  return current;
}
