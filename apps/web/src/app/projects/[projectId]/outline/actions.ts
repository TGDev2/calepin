"use server";

/**
 * Moving, merging and splitting the chapters of the plan (CAL-105, CAL-106).
 *
 * It composes and nothing more (§3.3): the session says who is asking,
 * `openProjectScope` turns the project id into a proof of ownership,
 * `parseChapterMoveRequest` applies the domain's rules about what a move
 * request may be, and `moveChapter` performs — reading the keys itself, inside
 * the transaction that writes them, so nothing about the placement is taken
 * from the client.
 *
 * **A plain argument, not a `FormData`.** Every other action on this app is a
 * `<form>` submission because it carries something the author typed and has to
 * keep on a refusal. A move carries three identifiers already on screen and is
 * triggered by a drag or by `Alt`+arrow; there is nothing to preserve, so the
 * tree calls it inside a `useTransition` and renders the sentence it returns.
 * The argument still crossed a serialisation boundary, so it is parsed rather
 * than trusted (§6).
 *
 * **Nothing literary is logged** (§9). The lines carry the user, the project
 * and the error's own fields — never a working title, never a thread label.
 */

import {
  parseChapterMergeRequest,
  parseChapterMoveRequest,
  parseChapterSplitArbitration,
} from "@calepin/outline";
import { mergeChapters, moveChapter, splitChapter } from "@calepin/outline/repository";
import { runWithActor } from "@calepin/shared/audit";
import { type AppError, errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import { openProjectScope } from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import {
  CHAPTER_MERGE_MISSING_MESSAGE,
  CHAPTER_MERGE_REFUSED_MESSAGE,
  CHAPTER_MERGE_UNAVAILABLE_MESSAGE,
  CHAPTER_SPLIT_UNAVAILABLE_MESSAGE,
  type ChapterMergeState,
  type ChapterSplitState,
  parseMergeLossKinds,
} from "@/lib/outline-cut";
import {
  CHAPTER_MOVE_MISSING_MESSAGE,
  CHAPTER_MOVE_UNAVAILABLE_MESSAGE,
  type ChapterMoveState,
  outlinePath,
} from "@/lib/outline-move";
import { withRequestLogContext } from "@/lib/request-context";
import { signInDestination } from "@/lib/sign-in-redirect";

const DASHBOARD_PATH = "/";

/**
 * The sentence a refusal becomes.
 *
 * A validation failure carries its own: `@calepin/outline` says the plan has
 * changed since it was drawn and that reloading is what helps, which is the one
 * thing the screen could not work out for itself.
 */
function messageFor(error: AppError): string {
  if (error.category === "validation") return error.userMessage;

  return error.code === "NOT_FOUND"
    ? CHAPTER_MOVE_MISSING_MESSAGE
    : CHAPTER_MOVE_UNAVAILABLE_MESSAGE;
}

function refuse(userId: string, projectId: string, error: AppError): ChapterMoveState {
  logger.warn("chapter.move-refused", { userId, projectId, ...errorLogFields(error) });

  return { status: "error", message: messageFor(error) };
}

export async function moveChapterAction(
  projectId: string,
  submitted: unknown,
): Promise<ChapterMoveState> {
  if (typeof projectId !== "string" || projectId.length === 0) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(outlinePath(projectId)));

  const request = parseChapterMoveRequest(submitted);
  if (!request.ok) return { status: "error", message: request.error.userMessage };

  return withRequestLogContext(async (): Promise<ChapterMoveState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) return refuse(user.id, projectId, scope.error);

      const moved = await runWithActor(user.id, async () =>
        moveChapter(scope.value, request.value),
      );
      if (!moved.ok) return refuse(user.id, projectId, moved.error);

      // A move that changed nothing wrote nothing, so there is nothing to
      // revalidate and nothing to report — the screen already shows the answer.
      if (moved.value.moved) {
        revalidatePath(outlinePath(projectId));
        logger.info("chapter.moved", { userId: user.id, projectId });
      }

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("chapter.move-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: CHAPTER_MOVE_UNAVAILABLE_MESSAGE };
    }
  });
}

/**
 * Merging a chapter with the one after it (CAL-106).
 *
 * Two attempts by design. The first arrives with `acknowledgeLoss: false`; when
 * the merge would drop a place, a focal role or a period precision, the write
 * refuses and the screen turns that refusal into the panel the author reads.
 * The kinds come **out of the refusal** rather than from a second computation
 * here, so the panel and the write cannot disagree about what is at stake, and
 * a screen that skipped the panel could never produce the second attempt.
 */
export async function mergeChaptersAction(
  projectId: string,
  submitted: unknown,
): Promise<ChapterMergeState> {
  if (typeof projectId !== "string" || projectId.length === 0) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(outlinePath(projectId)));

  const request = parseChapterMergeRequest(submitted);
  if (!request.ok) return { status: "error", message: request.error.userMessage };

  return withRequestLogContext(async (): Promise<ChapterMergeState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) return refuseMerge(user.id, projectId, scope.error, request.value);

      const merged = await runWithActor(user.id, async () =>
        mergeChapters(scope.value, request.value),
      );
      if (!merged.ok) return refuseMerge(user.id, projectId, merged.error, request.value);

      revalidatePath(outlinePath(projectId));
      logger.info("chapter.merged", {
        userId: user.id,
        projectId,
        // Counts and nothing else — the report carries no word of the plan (§9).
        itemCount: merged.value.report.consolidated.characters,
      });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("chapter.merge-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: CHAPTER_MERGE_UNAVAILABLE_MESSAGE };
    }
  });
}

function refuseMerge(
  userId: string,
  projectId: string,
  error: AppError,
  request: { readonly survivorChapterId: string; readonly absorbedChapterId: string },
): ChapterMergeState {
  logger.warn("chapter.merge-refused", { userId, projectId, ...errorLogFields(error) });

  if (error.code === "CHAPTER_MERGE_LOSS_NOT_ACKNOWLEDGED") {
    return {
      status: "confirm",
      survivorChapterId: request.survivorChapterId,
      absorbedChapterId: request.absorbedChapterId,
      losses: parseMergeLossKinds(error.fieldPath),
    };
  }

  if (error.code === "CHAPTER_MERGE_REFUSED") {
    return { status: "error", message: CHAPTER_MERGE_REFUSED_MESSAGE };
  }

  if (error.category === "validation") return { status: "error", message: error.userMessage };

  return {
    status: "error",
    message:
      error.code === "NOT_FOUND"
        ? CHAPTER_MERGE_MISSING_MESSAGE
        : CHAPTER_MERGE_UNAVAILABLE_MESSAGE,
  };
}

/**
 * Applying the author's arbitration of a split (CAL-106).
 *
 * The whole redistribution crossed a serialisation boundary, so it is parsed
 * before anything else (§6) and then checked again by the repository against
 * rows read inside the writing transaction — the screen's copy of the chapter
 * is never what conservation is measured against.
 */
export async function splitChapterAction(
  projectId: string,
  submitted: unknown,
): Promise<ChapterSplitState> {
  if (typeof projectId !== "string" || projectId.length === 0) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(outlinePath(projectId)));

  const arbitration = parseChapterSplitArbitration(submitted);
  if (!arbitration.ok) {
    return { status: "error", message: arbitration.error.userMessage, defects: [] };
  }

  return withRequestLogContext(async (): Promise<ChapterSplitState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) return refuseSplit(user.id, projectId, scope.error);

      const applied = await runWithActor(user.id, async () =>
        splitChapter(scope.value, arbitration.value),
      );
      if (!applied.ok) return refuseSplit(user.id, projectId, applied.error);

      revalidatePath(outlinePath(projectId));
      logger.info("chapter.split", {
        userId: user.id,
        projectId,
        itemCount: applied.value.report.redistributed.threadActions,
      });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("chapter.split-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: CHAPTER_SPLIT_UNAVAILABLE_MESSAGE, defects: [] };
    }
  });
}

function refuseSplit(userId: string, projectId: string, error: AppError): ChapterSplitState {
  logger.warn("chapter.split-refused", { userId, projectId, ...errorLogFields(error) });

  if (error.code === "CHAPTER_SPLIT_REFUSED") {
    return {
      status: "error",
      message: error.userMessage,
      // The closed defect kinds, which the form turns into a sentence beside
      // the control that produced each one.
      defects: (error.fieldPath ?? "").split(",").filter((kind) => kind.length > 0),
    };
  }

  if (error.category === "validation") {
    return { status: "error", message: error.userMessage, defects: [] };
  }

  return {
    status: "error",
    message:
      error.code === "NOT_FOUND"
        ? CHAPTER_MERGE_MISSING_MESSAGE
        : CHAPTER_SPLIT_UNAVAILABLE_MESSAGE,
    defects: [],
  };
}
