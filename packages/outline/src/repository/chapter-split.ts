/**
 * Writing the split of one chapter into two (CAL-106).
 *
 * `chapters/split.ts` decides whether the arbitration keeps everything; this
 * puts the two halves in the database. As with the merge, the source is read
 * fresh **inside** the writing transaction, so the conservation the refusal
 * attests is conservation against the plan that exists rather than against the
 * screen the author was looking at.
 *
 * **The source keeps its id and becomes the first half.** Everything staying on
 * that side is therefore untouched — no reference is rewritten to say what it
 * already said — and only the second half's share is written anew. The new
 * chapter lands at `orderKeyAt(siblings, indexOf(source) + 1)`, which is
 * CAL-019's own sentence about this operation: one key minted, no sibling
 * renumbered, and the chapter numbers the screen shows re-derived on the next
 * read.
 *
 * **Thread endpoints move, they are never duplicated.** `Thread.openingChapterId`
 * and `closingChapterId` are single columns, so an endpoint the arbitration
 * gave to the second half is an `UPDATE` on the thread, and the checker has
 * already refused an arbitration that gave one to both. Continuations are rows,
 * so both halves may hold one and the write reconciles the source's set against
 * what the first half kept.
 *
 * **`withProjectTransaction`, no project row lock** — the merge's reasoning: a
 * written chapter is refused, so no derived column can move.
 */

import { ConflictError, fail, NotFoundError, type Result, succeed } from "@calepin/shared/errors";
import {
  assertProjectScope,
  type ProjectScope,
  requireOwnedRow,
  scopedWhere,
  type TransactionClient,
  withProjectTransaction,
} from "@calepin/shared/repository";

import {
  type ChapterSplitArbitration,
  type ChapterSplitHalf,
  type ChapterSplitReport,
  checkChapterSplit,
} from "../chapters/split";
import { orderKeyAt } from "../order/position";
import { CHAPTER_SELECT, type ChapterRow, toCutSource } from "./chapter-row";

/** What a split reports — kinds, ids and counts, safe to log whole (§9). */
export interface ChapterSplit {
  /** The source chapter, which is now the first half. */
  readonly chapterId: string;
  /** The chapter the split created, reading immediately after it. */
  readonly createdChapterId: string;
  readonly report: ChapterSplitReport;
}

/** The `ChapterOutline` column values one half writes. */
function outlineValues(half: ChapterSplitHalf) {
  return {
    workingTitle: half.workingTitle,
    targetWordCount: half.targetWordCount,
    focalCharacterId: half.focalCharacterId,
    placeId: half.placeId,
    periodStartDay: half.periodStartDay,
    periodEndDay: half.periodEndDay,
    periodPrecision: half.periodPrecision,
    periodLabel: half.periodLabel,
    dramaticFunction: half.dramaticFunction,
    immediateGoal: half.immediateGoal,
    obstacle: half.obstacle,
    decision: half.decision,
    revelation: half.revelation,
    consequence: half.consequence,
    detailedSummary: half.detailedSummary,
  };
}

/**
 * Splits `arbitration.chapterId` in two: the first half is written over it, the
 * second into a new chapter reading immediately after.
 */
export async function splitChapter(
  scope: ProjectScope,
  arbitration: ChapterSplitArbitration,
): Promise<Result<ChapterSplit>> {
  assertProjectScope(scope);

  return withProjectTransaction<ChapterSplit>(scope, async (tx) => {
    const owned = await requireOwnedRow("Chapter", arbitration.chapterId, scope);

    if (!owned.ok) return owned;

    const source: ChapterRow | null = await tx.chapter.findFirst({
      where: scopedWhere("Chapter", scope, { id: arbitration.chapterId }),
      select: CHAPTER_SELECT,
    });

    if (source === null) return fail(chapterNotFound());

    const report = checkChapterSplit(toCutSource(source), arbitration);

    if (!report.acceptable) return fail(splitRefused(report));

    const siblings = await tx.chapter.findMany({
      where: scopedWhere("Chapter", scope, { partId: source.partId }),
      select: { orderKey: true },
      orderBy: { orderKey: "asc" },
    });

    const keys = siblings.map((sibling) => sibling.orderKey);
    const orderKey = orderKeyAt(keys, keys.indexOf(source.orderKey) + 1);

    if (!orderKey.ok) return orderKey;

    const { bibleId } = source;
    const created = await tx.chapter.create({
      data: {
        outlineId: source.outlineId,
        bibleId,
        partId: source.partId,
        orderKey: orderKey.value,
      },
      select: { id: true },
    });
    const secondOutline = await tx.chapterOutline.create({
      data: { ...outlineValues(arbitration.second), bibleId, chapterId: created.id },
      select: { id: true },
    });

    // The first half rewrites the source's own plan row, or creates one when
    // the chapter had none — an empty plan split by hand is a plan the author
    // has just filled in.
    const firstOutlineId =
      source.chapterOutline === null
        ? (
            await tx.chapterOutline.create({
              data: {
                ...outlineValues(arbitration.first),
                bibleId,
                chapterId: arbitration.chapterId,
              },
              select: { id: true },
            })
          ).id
        : (
            await tx.chapterOutline.update({
              where: { id: source.chapterOutline.id },
              data: outlineValues(arbitration.first),
              select: { id: true },
            })
          ).id;

    // The first half prunes what it did not keep; the second's row was created
    // a moment ago and holds nothing to remove.
    await tx.chapterOutlineCharacter.deleteMany({
      where: {
        chapterOutlineId: firstOutlineId,
        characterId: { notIn: [...arbitration.first.characterIds] },
      },
    });
    await tx.chapterOutlineFact.deleteMany({
      where: {
        chapterOutlineId: firstOutlineId,
        factId: { notIn: [...arbitration.first.factIds] },
      },
    });

    await writeLinks(tx, bibleId, firstOutlineId, arbitration.first);
    await writeLinks(tx, bibleId, secondOutline.id, arbitration.second);

    for (const [threadIds, column] of [
      [arbitration.second.opensThreadIds, "openingChapterId"],
      [arbitration.second.closesThreadIds, "closingChapterId"],
    ] as const) {
      if (threadIds.length === 0) continue;

      await tx.thread.updateMany({
        where: scopedWhere("Thread", scope, { id: { in: [...threadIds] } }),
        data: { [column]: created.id },
      });
    }

    const kept = new Set(arbitration.first.continuesThreadIds);
    const dropped = source.threadContinuations
      .map((link) => link.threadId)
      .filter((threadId) => !kept.has(threadId));

    if (dropped.length > 0) {
      await tx.threadContinuation.deleteMany({
        where: scopedWhere("ThreadContinuation", scope, {
          chapterId: arbitration.chapterId,
          threadId: { in: dropped },
        }),
      });
    }

    if (arbitration.second.continuesThreadIds.length > 0) {
      await tx.threadContinuation.createMany({
        data: arbitration.second.continuesThreadIds.map((threadId) => ({
          bibleId,
          threadId,
          chapterId: created.id,
        })),
        skipDuplicates: true,
      });
    }

    return succeed({ chapterId: arbitration.chapterId, createdChapterId: created.id, report });
  });
}

/** One half's two link tables. `skipDuplicates`, so a kept link is left alone. */
async function writeLinks(
  tx: TransactionClient,
  bibleId: string,
  chapterOutlineId: string,
  half: ChapterSplitHalf,
): Promise<void> {
  await tx.chapterOutlineCharacter.createMany({
    data: half.characterIds.map((characterId) => ({ bibleId, chapterOutlineId, characterId })),
    skipDuplicates: true,
  });
  await tx.chapterOutlineFact.createMany({
    data: half.factIds.map((factId) => ({ bibleId, chapterOutlineId, factId })),
    skipDuplicates: true,
  });
}

/** Not yours and not there are the same answer (§3.5). */
const MISSING_MESSAGE = "Ce chapitre n'existe plus, ou il ne vous appartient pas.";

function chapterNotFound(): NotFoundError {
  return new NotFoundError({
    message: "no chapter with this id belongs to this project",
    userMessage: MISSING_MESSAGE,
  });
}

/**
 * The defect kinds travel in `fieldPath`, the loggable half (§7); the French
 * sentence names nothing of the plan, because the screen puts each finding back
 * beside the control that produced it.
 */
function splitRefused(report: ChapterSplitReport): ConflictError {
  return new ConflictError({
    code: "CHAPTER_SPLIT_REFUSED",
    message: "the arbitrated redistribution does not account for what the chapter carried",
    userMessage:
      "Cette répartition ne conserve pas tout le chapitre. Corrigez-la avant de scinder.",
    fieldPath: report.defects.map((defect) => defect.kind).join(","),
  });
}
