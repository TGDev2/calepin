/**
 * Writing a chapter's move (CAL-105).
 *
 * `order/move.ts` decides where the chapter lands; this puts it there, and its
 * whole job is to make that decision from rows read inside the transaction that
 * writes it. Nothing about the placement comes from the caller — the caller
 * says *which* chapter and *behind which* one, and the keys are read fresh.
 *
 * **One statement, one row.** That is the property the acceptance criterion
 * rests on. Threads, canon facts, characters and chapter outlines all name a
 * chapter by its id, and the number a reader sees is derived by `resolveOutline`
 * on every read — so an `UPDATE` that touches `partId` and `orderKey` on a
 * single row cannot break a reference, and one that touched a second row could.
 *
 * `withProjectTransaction` rather than `withProjectAggregates` or
 * `withProjectStatus`: a move changes no derived column. It reorders chapters
 * that already exist, so `writtenChapterCount`, `totalWordCount` and
 * `Project.status` all read back exactly what they held — taking the project's
 * row lock to rewrite two counters to their own values would serialise every
 * drag behind every other write of the project, for nothing.
 *
 * **A locked chapter still moves.** `ChapterOutline.lockedAt` and
 * `Chapter.status = LOCKED` stop *automatic* modification (CAL-107's own
 * wording); a drag is a decision the author makes with the badge in front of
 * them. The lock keeps doing what it is for — protecting the chapter from a
 * regeneration — and this function deliberately does not read it.
 */

import { fail, NotFoundError, type Result, succeed } from "@calepin/shared/errors";
import {
  assertProjectScope,
  type ProjectScope,
  requireOwnedRow,
  scopedWhere,
  withProjectTransaction,
} from "@calepin/shared/repository";

import { type ChapterMoveRequest, planChapterMove } from "../order/move";

/** What a move reports: whether it wrote, and where the chapter now sits. */
export interface ChapterMoved {
  /**
   * False when the chapter was already exactly there. Nothing was written —
   * not the placement, not the audit block, not the `version` token.
   */
  readonly moved: boolean;
  readonly partId: string;
}

export async function moveChapter(
  scope: ProjectScope,
  input: ChapterMoveRequest,
): Promise<Result<ChapterMoved>> {
  assertProjectScope(scope);

  return withProjectTransaction<ChapterMoved>(scope, async (tx) => {
    for (const [model, id] of [
      ["Chapter", input.chapterId],
      ["Part", input.targetPartId],
    ] as const) {
      const owned = await requireOwnedRow(model, id, scope);

      if (!owned.ok) return owned;
    }

    const moving = await tx.chapter.findFirst({
      where: scopedWhere("Chapter", scope, { id: input.chapterId }),
      select: { id: true, partId: true, orderKey: true, outlineId: true },
    });

    if (moving === null) return fail(chapterNotFound());

    // The destination has to belong to the same plan. The composite foreign key
    // `[outlineId, partId]` would refuse the write anyway, but a constraint
    // violation is not an answer a caller can act on and a `NOT_FOUND` is —
    // `appendChapterSummaryRevision`'s own reading, one package over.
    const target = await tx.part.findFirst({
      where: scopedWhere("Part", scope, { id: input.targetPartId, outlineId: moving.outlineId }),
      select: { id: true },
    });

    if (target === null) return fail(partNotFound());

    const siblings = await tx.chapter.findMany({
      where: scopedWhere("Chapter", scope, { partId: input.targetPartId }),
      select: { id: true, partId: true, orderKey: true },
      orderBy: { orderKey: "asc" },
    });

    // `planChapterMove` needs the moved chapter in the list it reads; when it
    // comes from another part it is not among the destination's siblings.
    const plan = planChapterMove(
      input,
      moving.partId === input.targetPartId ? siblings : [...siblings, moving],
    );

    if (!plan.ok) return plan;

    if (!plan.value.moved) return succeed({ moved: false, partId: moving.partId });

    await tx.chapter.update({
      where: { id: plan.value.chapterId },
      data: { partId: plan.value.partId, orderKey: plan.value.orderKey },
    });

    return succeed({ moved: true, partId: plan.value.partId });
  });
}

/**
 * Not yours and not there are the same answer (§3.5). Both refusals carry the
 * same French sentence for the same reason: a second wording would confirm that
 * the row exists, which is the enumeration leak the shared code is chosen to
 * close.
 */
const MISSING_MESSAGE = "Ce chapitre n'existe plus, ou il ne vous appartient pas.";

function chapterNotFound(): NotFoundError {
  return new NotFoundError({
    message: "no chapter with this id belongs to this project",
    userMessage: MISSING_MESSAGE,
  });
}

function partNotFound(): NotFoundError {
  return new NotFoundError({
    message: "no part with this id belongs to this chapter's plan",
    userMessage: MISSING_MESSAGE,
  });
}
