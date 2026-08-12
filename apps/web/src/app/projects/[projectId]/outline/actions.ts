"use server";

/**
 * Moving one chapter of the plan (CAL-105).
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

import { parseChapterMoveRequest } from "@calepin/outline";
import { moveChapter } from "@calepin/outline/repository";
import { runWithActor } from "@calepin/shared/audit";
import { type AppError, errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import { openProjectScope } from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
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
