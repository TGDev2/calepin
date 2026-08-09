"use server";

/**
 * Saving an edited source text (CAL-046).
 *
 * It composes and nothing more, which is what the interface layer is for (§3.3):
 * the session says who is asking, `openProjectScope` turns the project id in the
 * form into a proof of ownership, and `updateSourceText` performs — appending a
 * version, refusing an over-limit text, and leaving every earlier version
 * exactly as it was.
 *
 * **This one answers with state rather than a redirect**, unlike the five
 * actions on the project screen. Those carry a reason code back on the URL,
 * which is the right shape for a form holding a title. Here the form holds two
 * thousand words, and a redirect discards them: the visitor would come back to a
 * textarea reset to the last *saved* version, having lost the edit they were
 * being told was too long. So the refusal comes back beside the field, and the
 * field still holds what was typed.
 *
 * `revalidatePath` after a success, so the version number, the history and the
 * obsolescence panel on the page all reflect the write. The dashboard too — the
 * project's `updatedAt` moved.
 *
 * A `"use server"` module may export nothing but async functions, which is why
 * the state type and every French sentence live in `lib/source-text-edit.ts`.
 */

import { runWithActor } from "@calepin/shared/audit";
import { errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import { openProjectScope, updateSourceText } from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { withRequestLogContext } from "@/lib/request-context";
import { signInDestination } from "@/lib/sign-in-redirect";
import {
  readSourceTextContent,
  SOURCE_TEXT_EDIT_UNAVAILABLE_MESSAGE,
  SOURCE_TEXT_EMPTY_MESSAGE,
  SOURCE_TEXT_MISSING_MESSAGE,
  type SourceTextEditState,
} from "@/lib/source-text-edit";

const DASHBOARD_PATH = "/";

export async function updateSourceTextAction(
  _previous: SourceTextEditState,
  formData: FormData,
): Promise<SourceTextEditState> {
  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || projectId === "") redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(sourceTextPath(projectId)));

  const content = readSourceTextContent(formData.get("content"));

  return withRequestLogContext(async () => {
    if (content === null) {
      logger.warn("source-text.edit-refused", {
        userId: user.id,
        projectId,
        fieldPath: "content",
      });

      return { status: "error", message: SOURCE_TEXT_EMPTY_MESSAGE };
    }

    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) return refuse(user.id, projectId, scope.error, SOURCE_TEXT_MISSING_MESSAGE);

      const edited = await runWithActor(user.id, async () =>
        updateSourceText(scope.value, { content }),
      );

      if (!edited.ok) {
        // A validation failure carries a French sentence written for the reader
        // — the word limit, with the count. Anything else does not: the reader
        // gets the one sentence that says their previous version is intact.
        const message =
          edited.error.category === "validation"
            ? edited.error.userMessage
            : edited.error.code === "NOT_FOUND"
              ? SOURCE_TEXT_MISSING_MESSAGE
              : SOURCE_TEXT_EDIT_UNAVAILABLE_MESSAGE;

        return refuse(user.id, projectId, edited.error, message);
      }

      revalidatePath(DASHBOARD_PATH);
      revalidatePath(sourceTextPath(projectId));
      revalidatePath(projectPath(projectId));

      logger.info("source-text.edited", {
        userId: user.id,
        projectId,
        wordCount: edited.value.wordCount,
      });

      return edited.value.created
        ? { status: "saved", versionNumber: edited.value.versionNumber }
        : { status: "unchanged", versionNumber: edited.value.versionNumber };
    } catch (error: unknown) {
      // A throw rather than a value, by §7: the transaction rolled back, so the
      // honest answer is that nothing happened. The trace goes to the log,
      // classified and stripped of every message (§9); the screen gets one
      // French sentence, and never the text that was posted.
      logger.error("source-text.edit-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: SOURCE_TEXT_EDIT_UNAVAILABLE_MESSAGE };
    }
  });
}

function refuse(
  userId: string,
  projectId: string,
  error: unknown,
  message: string,
): SourceTextEditState {
  logger.warn("source-text.edit-refused", { userId, projectId, ...errorLogFields(error) });

  return { status: "error", message };
}

function projectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

function sourceTextPath(projectId: string): string {
  return `${projectPath(projectId)}/source-text`;
}
