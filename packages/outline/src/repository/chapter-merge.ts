/**
 * Writing the merge of two adjacent chapters (CAL-106).
 *
 * `chapters/merge.ts` decides what the consolidated chapter says; this puts it
 * in the database, and its whole job is to make that decision from rows read
 * inside the transaction that writes it — `moveChapter`'s discipline. The
 * caller names the two chapters and says whether it knows what would be lost;
 * everything else is read fresh, adjacency included.
 *
 * **The repointing comes before the delete, and that ordering is not a taste.**
 * `Thread.openingChapterId` is `NoAction`, so deleting a chapter a thread still
 * opens at is refused by PostgreSQL outright; `closingChapterId` is a
 * column-scoped `SET NULL`, so the same delete would *silently forget* where the
 * thread was said to end. Both are repointed onto the survivor first, which
 * turns a constraint violation and a silent loss into two ordinary updates.
 *
 * **Three unique pairs would collide on a union**, so none is written blind:
 * `ChapterOutlineCharacter` and `ChapterOutlineFact` take `skipDuplicates`, and
 * a continuation the survivor already holds is never re-created. A continuation
 * the merged chapter now opens or closes is deleted instead — CAL-102's
 * disjointness, honoured at the row.
 *
 * **`withProjectTransaction`, no project row lock** — `moveChapter`'s reasoning,
 * and it holds here only because a written chapter is refused: with no
 * `ChapterRevision` on either side, `writtenChapterCount` and `totalWordCount`
 * read back exactly what they held. The refusal that protects the manuscript is
 * what keeps the write cheap.
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
  type ChapterMergeReport,
  type ChapterMergeRequest,
  type MergedChapterOutline,
  planChapterMerge,
} from "../chapters/merge";
import { CHAPTER_SELECT, toCutSource } from "./chapter-row";

/** What a merge reports — kinds, ids and counts, safe to log whole (§9). */
export interface ChaptersMerged {
  readonly survivorChapterId: string;
  readonly absorbedChapterId: string;
  readonly report: ChapterMergeReport;
}

/**
 * Absorbs `absorbedChapterId` into `survivorChapterId`.
 *
 * The survivor keeps its id, its part and its order key, so every reference
 * that already named it is untouched; the absorbed chapter's references are
 * repointed and its row is deleted.
 */
export async function mergeChapters(
  scope: ProjectScope,
  input: ChapterMergeRequest,
): Promise<Result<ChaptersMerged>> {
  assertProjectScope(scope);

  return withProjectTransaction<ChaptersMerged>(scope, async (tx) => {
    for (const id of [input.survivorChapterId, input.absorbedChapterId]) {
      const owned = await requireOwnedRow("Chapter", id, scope);

      if (!owned.ok) return owned;
    }

    const rows = await tx.chapter.findMany({
      where: scopedWhere("Chapter", scope, {
        id: { in: [input.survivorChapterId, input.absorbedChapterId] },
      }),
      select: CHAPTER_SELECT,
    });

    const survivor = rows.find((row) => row.id === input.survivorChapterId);
    const absorbed = rows.find((row) => row.id === input.absorbedChapterId);

    if (survivor === undefined || absorbed === undefined) return fail(chapterNotFound());

    // Adjacency is decided from the order that exists, never from the caller's
    // screen — `planChapterMove`'s own rule.
    const siblings = await tx.chapter.findMany({
      where: scopedWhere("Chapter", scope, { partId: survivor.partId }),
      select: { id: true, partId: true, orderKey: true },
      orderBy: { orderKey: "asc" },
    });

    const outcome = planChapterMerge(toCutSource(survivor), toCutSource(absorbed), siblings);

    if (!outcome.acceptable) return fail(mergeRefused(outcome.report));

    // Asked exactly when something would go, and never otherwise: a
    // confirmation of an empty warning teaches an author to tick without
    // reading (CAL-086's reasoning).
    if (outcome.report.losses.length > 0 && !input.acknowledgeLoss) {
      return fail(lossNotAcknowledged(outcome.report));
    }

    const { plan } = outcome;
    const { bibleId } = survivor;

    // Before the delete: `NoAction` on the opening would refuse it, and the
    // column-scoped `SET NULL` on the closing would forget it.
    if (plan.threadOpeningsToRepoint.length > 0) {
      await tx.thread.updateMany({
        where: scopedWhere("Thread", scope, { id: { in: [...plan.threadOpeningsToRepoint] } }),
        data: { openingChapterId: plan.survivorId },
      });
    }

    if (plan.threadClosingsToRepoint.length > 0) {
      await tx.thread.updateMany({
        where: scopedWhere("Thread", scope, { id: { in: [...plan.threadClosingsToRepoint] } }),
        data: { closingChapterId: plan.survivorId },
      });
    }

    if (plan.continuationsToDrop.length > 0) {
      await tx.threadContinuation.deleteMany({
        where: scopedWhere("ThreadContinuation", scope, {
          chapterId: plan.survivorId,
          threadId: { in: [...plan.continuationsToDrop] },
        }),
      });
    }

    if (plan.continuationsToMove.length > 0) {
      await tx.threadContinuation.createMany({
        data: plan.continuationsToMove.map((threadId) => ({
          bibleId,
          threadId,
          chapterId: plan.survivorId,
        })),
        skipDuplicates: true,
      });
    }

    if (plan.outline !== null) {
      const outlineId = await upsertChapterOutline(tx, {
        bibleId,
        chapterId: plan.survivorId,
        existingId: survivor.chapterOutline?.id ?? null,
        values: plan.outline,
      });

      // `skipDuplicates` rather than a read-then-write: the union already
      // deduplicates itself, and the survivor's own links are in it.
      await tx.chapterOutlineCharacter.createMany({
        data: plan.characterIds.map((characterId) => ({
          bibleId,
          chapterOutlineId: outlineId,
          characterId,
        })),
        skipDuplicates: true,
      });
      await tx.chapterOutlineFact.createMany({
        data: plan.factIds.map((factId) => ({ bibleId, chapterOutlineId: outlineId, factId })),
        skipDuplicates: true,
      });
    }

    // Everything still naming the absorbed chapter goes with it: its own plan,
    // its links and its continuations, by cascade.
    await tx.chapter.delete({ where: { id: plan.absorbedId } });

    return succeed({
      survivorChapterId: plan.survivorId,
      absorbedChapterId: plan.absorbedId,
      report: outcome.report,
    });
  });
}

/**
 * The survivor's plan row, created when it had none — a chapter with no plan
 * absorbing one that has a plan ends up holding it.
 */
async function upsertChapterOutline(
  tx: TransactionClient,
  args: {
    readonly bibleId: string;
    readonly chapterId: string;
    readonly existingId: string | null;
    readonly values: MergedChapterOutline;
  },
): Promise<string> {
  if (args.existingId !== null) {
    const updated = await tx.chapterOutline.update({
      where: { id: args.existingId },
      data: args.values,
      select: { id: true },
    });

    return updated.id;
  }

  const created = await tx.chapterOutline.create({
    data: { ...args.values, bibleId: args.bibleId, chapterId: args.chapterId },
    select: { id: true },
  });

  return created.id;
}

/**
 * Not yours and not there are the same answer (§3.5): a second wording would
 * confirm the row exists, which is the enumeration leak the shared sentence is
 * chosen to close.
 */
const MISSING_MESSAGE = "Ce chapitre n'existe plus, ou il ne vous appartient pas.";

function chapterNotFound(): NotFoundError {
  return new NotFoundError({
    message: "no chapter with this id belongs to this project",
    userMessage: MISSING_MESSAGE,
  });
}

/**
 * The report travels back in `fieldPath`, which is the loggable half (§7): the
 * defect kinds and the ids, never a word of the plan. The French sentence names
 * no chapter, because the screen knows which two it asked about.
 */
function mergeRefused(report: ChapterMergeReport): ConflictError {
  return new ConflictError({
    code: "CHAPTER_MERGE_REFUSED",
    message: "the two chapters cannot be merged as the plan stands",
    userMessage: "Ces deux chapitres ne peuvent pas être fusionnés en l'état.",
    fieldPath: report.defects.map((defect) => defect.kind).join(","),
  });
}

function lossNotAcknowledged(report: ChapterMergeReport): ConflictError {
  return new ConflictError({
    code: "CHAPTER_MERGE_LOSS_NOT_ACKNOWLEDGED",
    message: "the merge would drop a single-valued attribute the caller did not acknowledge",
    userMessage:
      "Cette fusion ne conserverait pas tout. Relisez ce qui serait perdu, puis confirmez.",
    fieldPath: report.losses.map((loss) => loss.kind).join(","),
  });
}
