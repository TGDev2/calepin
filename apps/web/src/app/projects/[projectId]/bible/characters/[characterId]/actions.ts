"use server";

/**
 * Saving a sheet as the author types, and locking or unlocking one of its
 * fields (CAL-097).
 *
 * It composes and nothing more (§3.3): the session says who is asking,
 * `openProjectScope` turns the project id into a proof of ownership,
 * `parseCharacterContent` applies the domain's rule about what a sheet may
 * say, and the repository performs.
 *
 * **Called directly, not through `<form action>`.** Autosave has no form
 * submission to hang a `FormData` off — the client component reads its own
 * fields and calls this as a plain async function, so the input here is a
 * typed object rather than a `FormData` reader (`writeRelationshipAction`'s
 * division, adapted: no `FormData`, because there is no form).
 *
 * Nothing literary is logged (§9): every log line carries the user, the
 * project and the error's own fields — never a sheet field's value.
 */

import { parseCharacterContent } from "@calepin/bible";
import { runWithActor } from "@calepin/shared/audit";
import type { CharacterLockField } from "@calepin/shared/bible-lock";
import { type AppError, errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import {
  editCharacter,
  lockBibleElement,
  openProjectScope,
  unlockBibleElement,
} from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";

import {
  CHARACTER_LOCK_UNAVAILABLE_MESSAGE,
  CHARACTER_MISSING_MESSAGE,
  CHARACTER_SAVE_UNAVAILABLE_MESSAGE,
  CHARACTER_UNLOCK_UNAVAILABLE_MESSAGE,
  characterEditorPath,
  type CharacterFormSubmission,
  type CharacterLockActionState,
  type CharacterSaveState,
} from "@/lib/character-edit";
import { getCurrentUser } from "@/lib/current-user";
import { withRequestLogContext } from "@/lib/request-context";

/**
 * The sentence a refusal becomes. A conflict is the only category whose own
 * message says something the author can act on — a locked field, or a name
 * another character of the bible already carries.
 */
function messageFor(error: AppError, unavailable: string): string {
  if (error.category === "conflict") return error.userMessage;

  return error.code === "NOT_FOUND" ? CHARACTER_MISSING_MESSAGE : unavailable;
}

export async function saveCharacterAction(
  projectId: string,
  characterId: string,
  submission: CharacterFormSubmission,
): Promise<CharacterSaveState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: CHARACTER_SAVE_UNAVAILABLE_MESSAGE };

  const content = parseCharacterContent(submission);
  if (!content.ok) return { status: "error", message: content.error.userMessage };

  return withRequestLogContext(async (): Promise<CharacterSaveState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        logger.warn("character.save-refused", {
          userId: user.id,
          projectId,
          ...errorLogFields(scope.error),
        });
        return { status: "error", message: CHARACTER_MISSING_MESSAGE };
      }

      const edited = await runWithActor(user.id, async () =>
        editCharacter(scope.value, { characterId, content: content.value }),
      );

      if (!edited.ok) {
        logger.warn("character.save-refused", {
          userId: user.id,
          projectId,
          ...errorLogFields(edited.error),
        });
        return {
          status: "error",
          message: messageFor(edited.error, CHARACTER_SAVE_UNAVAILABLE_MESSAGE),
        };
      }

      if (edited.value.updated) {
        revalidatePath(characterEditorPath(projectId, characterId));
        logger.info("character.saved", { userId: user.id, projectId });
      }

      return { status: "saved", updated: edited.value.updated };
    } catch (error: unknown) {
      logger.error("character.save-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: CHARACTER_SAVE_UNAVAILABLE_MESSAGE };
    }
  });
}

async function toggleLock(
  projectId: string,
  characterId: string,
  field: CharacterLockField | null,
  action: "lock" | "unlock",
): Promise<CharacterLockActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      message:
        action === "lock"
          ? CHARACTER_LOCK_UNAVAILABLE_MESSAGE
          : CHARACTER_UNLOCK_UNAVAILABLE_MESSAGE,
    };
  }

  return withRequestLogContext(async (): Promise<CharacterLockActionState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) return { status: "error", message: CHARACTER_MISSING_MESSAGE };

      const write = action === "lock" ? lockBibleElement : unlockBibleElement;

      const result = await runWithActor(user.id, async () =>
        write(scope.value, { model: "Character", id: characterId, field }),
      );

      if (!result.ok) {
        logger.warn(`character.${action}-refused`, {
          userId: user.id,
          projectId,
          ...errorLogFields(result.error),
        });

        return {
          status: "error",
          message: messageFor(
            result.error,
            action === "lock"
              ? CHARACTER_LOCK_UNAVAILABLE_MESSAGE
              : CHARACTER_UNLOCK_UNAVAILABLE_MESSAGE,
          ),
        };
      }

      revalidatePath(characterEditorPath(projectId, characterId));
      logger.info(`character.${action}ed`, { userId: user.id, projectId });

      return { status: "ok" };
    } catch (error: unknown) {
      logger.error(`character.${action}-failed`, {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return {
        status: "error",
        message:
          action === "lock"
            ? CHARACTER_LOCK_UNAVAILABLE_MESSAGE
            : CHARACTER_UNLOCK_UNAVAILABLE_MESSAGE,
      };
    }
  });
}

export async function lockCharacterElementAction(
  projectId: string,
  characterId: string,
  field: CharacterLockField | null,
): Promise<CharacterLockActionState> {
  return toggleLock(projectId, characterId, field, "lock");
}

export async function unlockCharacterElementAction(
  projectId: string,
  characterId: string,
  field: CharacterLockField | null,
): Promise<CharacterLockActionState> {
  return toggleLock(projectId, characterId, field, "unlock");
}
