/**
 * Moving one chapter (CAL-105).
 *
 * `position.ts` answers "the key for position N among these siblings"; this
 * answers the question the plan screen actually asks — *put this chapter just
 * after that one* — and it is the last piece between the two gestures the
 * backlog demands (a drag, and `Alt`+arrow at the keyboard) and the single row
 * a move is allowed to write.
 *
 * **An anchor, never an absolute index.** The request names the chapter the
 * moved one lands behind, and `null` means the head of the part. Three reasons,
 * in the order they matter:
 *
 *   - It is what both gestures produce. A drop lands between two rows; a
 *     keyboard step means "past the chapter that was above me". Neither knows a
 *     position — the screen would have to count one, and counting it twice is
 *     how the two ways of moving come to disagree.
 *   - It survives a screen that has gone stale. Positions shift when anything
 *     else moves, so an index computed against an old reading silently lands
 *     the chapter where nobody pointed; an anchor still names the row the
 *     author was looking at, and when it has genuinely left the part it fails
 *     loudly (`STALE_PLAN_MESSAGE`) instead of drifting.
 *   - It costs the caller nothing: the id is already on screen.
 *
 * **Reference preservation is not enforced here, because it cannot be broken
 * here.** Nothing outside the plan names a chapter by its position — threads,
 * canon facts, characters and chapter outlines all name an id, and the number a
 * reader sees is derived by `resolveOutline` on every read. This function
 * returns the placement of exactly one chapter and never touches another row,
 * which is the whole of what CAL-105's acceptance criterion asks of the
 * arithmetic; `move.test.ts` runs a long series of moves and reads every
 * reference back to prove the property is not lost along the way.
 */

import {
  fail,
  fromValidationIssues,
  type Result,
  succeed,
  ValidationError,
} from "@calepin/shared/errors";
import { z } from "zod";

import { compareOrderKeys } from "./key";
import { moveOrderKey, orderKeyAt, STALE_PLAN_MESSAGE } from "./position";
import type { OrderedChapter } from "./types";

const UNKNOWN_CHAPTER_MESSAGE = "the chapter to move is absent from the given plan";
const UNKNOWN_ANCHOR_MESSAGE = "the anchor is not a chapter of the destination part";

const MALFORMED_REQUEST_MESSAGE = "Ce déplacement n'a pas pu être interprété. Rechargez le plan.";

/**
 * Where a chapter is asked to go.
 *
 * `afterChapterId` names a chapter of `targetPartId` — never the moved chapter
 * itself, which is not a position at all — and `null` puts it first in that
 * part, which is also the only way into an empty one.
 */
export interface ChapterMoveRequest {
  readonly chapterId: string;
  readonly targetPartId: string;
  readonly afterChapterId: string | null;
}

/**
 * The one row a move writes.
 *
 * `moved` is false when the chapter is already exactly there. The caller then
 * writes nothing at all — `editRelationship`'s reading of an identical
 * resubmission: an update would move the audit block and the `version` token
 * for a decision that changed nothing.
 */
export interface ChapterMovePlan {
  readonly chapterId: string;
  readonly partId: string;
  readonly orderKey: string;
  readonly moved: boolean;
}

/**
 * The request as it arrives from a client.
 *
 * A server action's argument crossed a serialisation boundary and may have been
 * written by the previous release, so it is parsed rather than trusted — the
 * rule §6 states of a model answer, for the same reason. The domain owns the
 * schema (§5.5); `apps/web` only calls it.
 */
export const chapterMoveRequestSchema = z.strictObject({
  chapterId: z.string().trim().min(1),
  targetPartId: z.string().trim().min(1),
  afterChapterId: z.string().trim().min(1).nullable(),
});

/**
 * A move request as submitted, or one French sentence saying it was not one.
 *
 * The message never names a field: the shape is built by this repository's own
 * screen, so a failure here is a defect rather than something an author typed,
 * and the only useful thing to say is that the plan should be reloaded.
 */
export function parseChapterMoveRequest(submitted: unknown): Result<ChapterMoveRequest> {
  const parsed = chapterMoveRequestSchema.safeParse(submitted);

  if (!parsed.success) {
    return fail(fromValidationIssues(parsed.error, { userMessage: MALFORMED_REQUEST_MESSAGE }));
  }

  return succeed(parsed.data);
}

/**
 * The placement the moved chapter takes, computed from the plan as it stands.
 *
 * `chapters` must hold the chapter being moved and every chapter of the
 * destination part; anything else in the list is ignored, so a caller may pass
 * the whole plan or just the two parts concerned. The siblings are sorted here
 * rather than assumed sorted — `resolveOutline`'s total order, key then id, so
 * a caller reading two parts in two queries cannot get a different answer from
 * one reading them together.
 */
export function planChapterMove(
  request: ChapterMoveRequest,
  chapters: readonly OrderedChapter[],
): Result<ChapterMovePlan, ValidationError> {
  const moving = chapters.find((chapter) => chapter.id === request.chapterId);

  if (moving === undefined) {
    return fail(
      new ValidationError({
        message: UNKNOWN_CHAPTER_MESSAGE,
        fieldPath: "chapterId",
        userMessage: STALE_PLAN_MESSAGE,
      }),
    );
  }

  const siblings = chapters
    .filter((chapter) => chapter.partId === request.targetPartId)
    .sort(byOrderKeyThenId);

  // The destination as it will be once the chapter has left wherever it is:
  // that is the list a position is read against, and `moveOrderKey` expects
  // its `to` in exactly those terms.
  const landing = siblings.filter((chapter) => chapter.id !== moving.id);
  const position = resolveAnchorPosition(request.afterChapterId, landing);

  if (position === null) {
    return fail(
      new ValidationError({
        message: UNKNOWN_ANCHOR_MESSAGE,
        fieldPath: "afterChapterId",
        userMessage: STALE_PLAN_MESSAGE,
      }),
    );
  }

  const keys = siblings.map((chapter) => chapter.orderKey);
  const from = siblings.findIndex((chapter) => chapter.id === moving.id);

  // A chapter arriving from another part is not among the destination's keys,
  // so it is placed rather than moved. Same part: `moveOrderKey` takes it out
  // of the list before reading the position, which is the off-by-one a move
  // hides and the reason `position.ts` owns it.
  const orderKey = from === -1 ? orderKeyAt(keys, position) : moveOrderKey(keys, from, position);

  if (!orderKey.ok) return orderKey;

  return succeed({
    chapterId: moving.id,
    partId: request.targetPartId,
    orderKey: orderKey.value,
    moved: moving.partId !== request.targetPartId || moving.orderKey !== orderKey.value,
  });
}

/**
 * The index the moved chapter takes among `landing`, or null when the anchor
 * is not there any more.
 *
 * The anchor being the moved chapter itself lands here too, and is refused
 * rather than read as a no-op: `landing` has already had it removed, so it
 * names nothing, and "put it after itself" is a request no gesture produces.
 */
function resolveAnchorPosition(
  afterChapterId: string | null,
  landing: readonly OrderedChapter[],
): number | null {
  if (afterChapterId === null) return 0;

  const index = landing.findIndex((chapter) => chapter.id === afterChapterId);

  return index === -1 ? null : index + 1;
}

function byOrderKeyThenId(left: OrderedChapter, right: OrderedChapter): number {
  const byKey = compareOrderKeys(left.orderKey, right.orderKey);
  if (byKey !== 0) return byKey;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
