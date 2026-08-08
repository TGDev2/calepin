/**
 * The chapter write paths (CAL-033) — the four operations that move a project's
 * manuscript, and therefore its aggregates.
 *
 * A chapter's text is versioned by appending, never by overwriting: a generation
 * appends a revision, a manual edit appends a revision, and restoring an earlier
 * one appends a revision carrying its text back. Three of the four operations
 * are the same write with a different origin, which is why they share one
 * implementation and differ only where the product does. The fourth removes a
 * chapter and everything it was worth.
 *
 * **Every one of them runs inside `withProjectAggregates`.** That is the whole
 * point of this module existing in this task: the counters on `projects` are
 * maintained by the write, and a write path that forgot to would be a number
 * nothing ever contradicts. The wrapper locks the project, runs the write, and
 * rewrites both counters from the rows themselves — so the restoration case
 * needs no arithmetic of its own, and a failed write leaves neither a revision
 * nor a counter behind.
 *
 * What this module deliberately does *not* do: move `Chapter.status` (CAL-124
 * owns that state machine), create a chapter (E10's outline domain owns
 * ordering and `orderKey`), stream, autosave, or render anything. It is the
 * persistence E11 and E14 will build on, and nothing beyond it.
 */

import { fail, NotFoundError, type Result, succeed } from "@calepin/shared/errors";
import {
  type ProjectScope,
  scopedWhere,
  type TransactionClient,
  withProjectAggregates,
} from "@calepin/shared/repository";
import { countWords } from "@calepin/shared/text";

/** Where a revision came from — `ChapterRevisionOrigin`, as the schema names it. */
export type ChapterRevisionOrigin = "GENERATED" | "EDITED";

/**
 * What an appended revision is worth, without its text.
 *
 * The prose is not returned: the caller of an append already has it, and a
 * restoration's reader wants the chapter, not this receipt. Keeping it out is
 * also what makes this value safe to log, count and pass around — §9 forbids
 * literary content in a technical artefact, and the cheapest way to honour that
 * is not to hand the prose to code that has no use for it.
 */
export interface ChapterRevisionSummary {
  readonly id: string;
  readonly chapterId: string;
  /** 1 for the first revision of a chapter; the current one is the highest. */
  readonly revisionNumber: number;
  readonly origin: ChapterRevisionOrigin;
  /** Counted at write time by `countWords`, never supplied by the caller. */
  readonly wordCount: number;
}

export interface AppendChapterRevisionInput {
  readonly chapterId: string;
  /** The chapter's new text. Counted here, so no caller can disagree. */
  readonly content: string;
  /** The `User` credited with this revision — `ChapterRevision.createdById`. */
  readonly authorId: string;
}

export interface AppendGeneratedChapterRevisionInput extends AppendChapterRevisionInput {
  /**
   * The `Generation` that produced this text (CAL-021), when there is one. A
   * generation whose trace was never written still stores its chapter: the
   * schema pairs the two loosely on purpose.
   */
  readonly generationId?: string;
}

export interface RestoreChapterRevisionInput {
  readonly chapterId: string;
  /** The revision to bring back — its number, as the history displays it. */
  readonly revisionNumber: number;
  /** The `User` performing the restoration; they author the new revision. */
  readonly authorId: string;
}

export interface DeleteChapterInput {
  readonly chapterId: string;
}

function chapterNotFound(): NotFoundError {
  return new NotFoundError({ message: "no chapter with this id belongs to this project" });
}

/**
 * A generated revision (CAL-122): the model wrote the chapter, the domain stores
 * it. Appends, so the previous text stays readable and restorable — a
 * regeneration can add a version, it cannot destroy one.
 */
export async function appendGeneratedChapterRevision(
  scope: ProjectScope,
  input: AppendGeneratedChapterRevisionInput,
): Promise<Result<ChapterRevisionSummary>> {
  return withProjectAggregates(scope, async (tx) =>
    appendRevision(tx, scope, {
      chapterId: input.chapterId,
      content: input.content,
      authorId: input.authorId,
      origin: "GENERATED",
      generationId: input.generationId ?? null,
    }),
  );
}

/**
 * A manual edit (CAL-121). Same append, no generation behind it — an author who
 * rewrote the chapter entirely still produced one revision, not a generation.
 */
export async function appendEditedChapterRevision(
  scope: ProjectScope,
  input: AppendChapterRevisionInput,
): Promise<Result<ChapterRevisionSummary>> {
  return withProjectAggregates(scope, async (tx) =>
    appendRevision(tx, scope, {
      chapterId: input.chapterId,
      content: input.content,
      authorId: input.authorId,
      origin: "EDITED",
      generationId: null,
    }),
  );
}

/**
 * Restores an earlier revision (CAL-149) — the case a denormalised counter
 * usually gets wrong.
 *
 * It is a forward write, never a rewind: the older text is appended as a new
 * revision, so the history keeps every state the chapter has been in and the
 * "current" one stays the highest-numbered by definition. Nothing about the
 * counters is special-cased for it; they are recomputed from the rows, and the
 * rows now say the chapter is worth what the restored text is worth.
 *
 * The word count is recounted from the restored text rather than copied from the
 * old row, so one rule decides every stored count — including for a revision
 * written before that rule existed.
 */
export async function restoreChapterRevision(
  scope: ProjectScope,
  input: RestoreChapterRevisionInput,
): Promise<Result<ChapterRevisionSummary>> {
  return withProjectAggregates(scope, async (tx) => {
    // One statement, and it does two things: it finds the revision and it proves
    // the chapter it hangs off belongs to the scope's project.
    const source = await tx.chapterRevision.findFirst({
      where: scopedWhere("ChapterRevision", scope, {
        chapterId: input.chapterId,
        revisionNumber: input.revisionNumber,
      }),
      select: { content: true },
    });

    if (source === null) {
      return fail(new NotFoundError({ message: "no such revision of this chapter" }));
    }

    return appendRevision(tx, scope, {
      chapterId: input.chapterId,
      content: source.content,
      authorId: input.authorId,
      // A restoration is an authored act, not a generation, and it carries no
      // generation id — the distinction ChapterRevisionOrigin exists to draw.
      origin: "EDITED",
      generationId: null,
    });
  });
}

/**
 * Removes a chapter and every revision of it (`ChapterRevision.chapter` cascades).
 *
 * The counters drop by exactly what the chapter was contributing, because they
 * are not adjusted at all: they are recomputed from what is left.
 */
export async function deleteChapter(
  scope: ProjectScope,
  input: DeleteChapterInput,
): Promise<Result<void>> {
  return withProjectAggregates(scope, async (tx) => {
    // `deleteMany`, not `delete`: the ownership filter is a relation path, and
    // only a `where` that accepts one can carry it. A `delete` keyed on the id
    // alone would remove another project's chapter just as happily.
    const { count } = await tx.chapter.deleteMany({
      where: scopedWhere("Chapter", scope, { id: input.chapterId }),
    });

    return count === 0 ? fail(chapterNotFound()) : succeed();
  });
}

interface AppendRevisionInput {
  readonly chapterId: string;
  readonly content: string;
  readonly authorId: string;
  readonly origin: ChapterRevisionOrigin;
  readonly generationId: string | null;
}

/**
 * The one write the three appending operations share.
 *
 * The next revision number is read and used inside the transaction the project
 * row is already locked by, so two writers cannot mint the same one. The unique
 * index on `(chapterId, revisionNumber)` is the second answer to that question,
 * for anything reaching the table another way: it collides loudly instead of
 * losing a version.
 */
async function appendRevision(
  tx: TransactionClient,
  scope: ProjectScope,
  input: AppendRevisionInput,
): Promise<Result<ChapterRevisionSummary>> {
  const chapter = await tx.chapter.findFirst({
    where: scopedWhere("Chapter", scope, { id: input.chapterId }),
    select: { id: true },
  });

  if (chapter === null) return fail(chapterNotFound());

  const latest = await tx.chapterRevision.findFirst({
    where: { chapterId: input.chapterId },
    orderBy: { revisionNumber: "desc" },
    select: { revisionNumber: true },
  });

  const wordCount = countWords(input.content);

  const revision = await tx.chapterRevision.create({
    data: {
      chapterId: input.chapterId,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      origin: input.origin,
      content: input.content,
      wordCount,
      generationId: input.generationId,
      createdById: input.authorId,
    },
    select: { id: true, chapterId: true, revisionNumber: true, origin: true, wordCount: true },
  });

  // `revision.origin` is Prisma's generated enum, which is the same union
  // `ChapterRevisionOrigin` declares above — so it assigns with no cast, and a
  // member added to the schema without being added here fails to compile rather
  // than travelling as a string nothing describes.
  return succeed({
    id: revision.id,
    chapterId: revision.chapterId,
    revisionNumber: revision.revisionNumber,
    origin: revision.origin,
    wordCount: revision.wordCount,
  });
}
