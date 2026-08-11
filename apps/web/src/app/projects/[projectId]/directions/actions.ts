"use server";

/**
 * Writing one proposed direction off, optionally saying why (CAL-083);
 * rewriting a direction by hand, or writing one from scratch (CAL-085).
 *
 * It composes and nothing more, which is what the interface layer is for
 * (§3.3): the session says who is asking, `openProjectScope` turns the project
 * id in the form into a proof of ownership, the domain (`parseDirectionDiscardReason`,
 * `parseDirectionContent`) applies the rule about what may be submitted, and
 * the repository performs.
 *
 * **The domain parses, then the repository persists.** `@calepin/shared` may
 * not import a domain (§3.2), so every ceiling is applied here.
 * `analysis/actions.ts`'s division, one epic later.
 *
 * **A refusal comes back as state, never as a redirect.** The form holds what
 * the author just wrote, and a redirect would answer "that was too long" by
 * throwing it away. A *success* redirects, because the screen behind the form
 * already reflects it and there is nothing left to keep.
 *
 * **Nothing literary is logged** (§9). Every refusal log carries the user,
 * the project and the error's own fields, never the text that was submitted.
 */

import { parseDirectionContent, parseDirectionDiscardReason } from "@calepin/direction";
import { runWithActor } from "@calepin/shared/audit";
import { errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import {
  discardDirection,
  editDirection,
  openProjectScope,
  writeUserDirection,
} from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import {
  DIRECTION_DISCARD_UNAVAILABLE_MESSAGE,
  DIRECTION_MISSING_MESSAGE,
  type DirectionDiscardState,
  directionsPath,
  readText,
} from "@/lib/direction-discard";
import {
  DIRECTION_CREATE_UNAVAILABLE_MESSAGE,
  DIRECTION_EDIT_UNAVAILABLE_MESSAGE,
  type DirectionEditState,
  readDirectionContentSubmission,
} from "@/lib/direction-edit";
import { withRequestLogContext } from "@/lib/request-context";
import { signInDestination } from "@/lib/sign-in-redirect";

const DASHBOARD_PATH = "/";

export async function discardDirectionAction(
  _previous: DirectionDiscardState,
  formData: FormData,
): Promise<DirectionDiscardState> {
  const projectId = readText(formData.get("projectId"));
  const directionId = readText(formData.get("directionId"));

  if (projectId === null || directionId === null) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(directionsPath(projectId)));

  // The ceiling is the domain's rule, and its French sentence is the one the
  // author reads. Checked before the session opens a scope, because a reason
  // that cannot be stored is not worth a database round trip.
  const reason = parseDirectionDiscardReason(formData.get("reason"));
  if (!reason.ok) return { status: "error", message: reason.error.userMessage };

  const outcome = await withRequestLogContext(async (): Promise<DirectionDiscardState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuse(user.id, projectId, scope.error, DIRECTION_MISSING_MESSAGE);
      }

      const discarded = await runWithActor(user.id, async () =>
        discardDirection(scope.value, { directionId, reason: reason.value }),
      );

      if (!discarded.ok) {
        // A conflict is the only refusal whose own sentence says something the
        // author can act on — already écartée, or the direction they retained.
        const message =
          discarded.error.category === "conflict"
            ? discarded.error.userMessage
            : discarded.error.code === "NOT_FOUND"
              ? DIRECTION_MISSING_MESSAGE
              : DIRECTION_DISCARD_UNAVAILABLE_MESSAGE;

        return refuse(user.id, projectId, discarded.error, message);
      }

      revalidatePath(DASHBOARD_PATH);
      revalidatePath(directionsPath(projectId));

      logger.info("direction.discarded", { userId: user.id, projectId });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("direction.discard-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: DIRECTION_DISCARD_UNAVAILABLE_MESSAGE };
    }
  });

  // Outside the try, because `redirect` signals by throwing.
  if (outcome.status === "idle") redirect(directionsPath(projectId));

  return outcome;
}

function refuse(
  userId: string,
  projectId: string,
  error: unknown,
  message: string,
): DirectionDiscardState {
  logger.warn("direction.discard-refused", { userId, projectId, ...errorLogFields(error) });

  return { status: "error", message };
}

/**
 * Rewriting one direction's content, by hand (CAL-085).
 *
 * The parse happens before the session is even asked for: a title past its
 * ceiling is a failure the form can show without a database round trip, the
 * same ordering `discardDirectionAction` gives its own domain check.
 */
export async function editDirectionAction(
  _previous: DirectionEditState,
  formData: FormData,
): Promise<DirectionEditState> {
  const projectId = readText(formData.get("projectId"));
  const directionId = readText(formData.get("directionId"));

  if (projectId === null || directionId === null) redirect(DASHBOARD_PATH);

  const parsed = parseDirectionContent(readDirectionContentSubmission(formData));
  if (!parsed.ok) return { status: "error", message: parsed.error.userMessage };

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(directionsPath(projectId)));

  const outcome = await withRequestLogContext(async (): Promise<DirectionEditState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuseEdit(user.id, projectId, scope.error, DIRECTION_MISSING_MESSAGE);
      }

      const edited = await runWithActor(user.id, async () =>
        editDirection(scope.value, { directionId, content: parsed.value }),
      );

      if (!edited.ok) {
        const message =
          edited.error.category === "conflict"
            ? edited.error.userMessage
            : edited.error.code === "NOT_FOUND"
              ? DIRECTION_MISSING_MESSAGE
              : DIRECTION_EDIT_UNAVAILABLE_MESSAGE;

        return refuseEdit(user.id, projectId, edited.error, message);
      }

      revalidatePath(DASHBOARD_PATH);
      revalidatePath(directionsPath(projectId));

      logger.info("direction.edited", { userId: user.id, projectId });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("direction.edit-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: DIRECTION_EDIT_UNAVAILABLE_MESSAGE };
    }
  });

  if (outcome.status === "idle") redirect(directionsPath(projectId));

  return outcome;
}

function refuseEdit(
  userId: string,
  projectId: string,
  error: unknown,
  message: string,
): DirectionEditState {
  logger.warn("direction.edit-refused", { userId, projectId, ...errorLogFields(error) });

  return { status: "error", message };
}

/**
 * Writing a direction entirely from scratch (CAL-085) — the same submission
 * shape as an edit, with no `directionId` to name and no row that could
 * already be discarded.
 */
export async function writeUserDirectionAction(
  _previous: DirectionEditState,
  formData: FormData,
): Promise<DirectionEditState> {
  const projectId = readText(formData.get("projectId"));

  if (projectId === null) redirect(DASHBOARD_PATH);

  const parsed = parseDirectionContent(readDirectionContentSubmission(formData));
  if (!parsed.ok) return { status: "error", message: parsed.error.userMessage };

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(directionsPath(projectId)));

  const outcome = await withRequestLogContext(async (): Promise<DirectionEditState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuseEdit(user.id, projectId, scope.error, DIRECTION_MISSING_MESSAGE);
      }

      const written = await runWithActor(user.id, async () =>
        writeUserDirection(scope.value, { content: parsed.value }),
      );

      if (!written.ok) {
        return refuseEdit(user.id, projectId, written.error, DIRECTION_CREATE_UNAVAILABLE_MESSAGE);
      }

      revalidatePath(DASHBOARD_PATH);
      revalidatePath(directionsPath(projectId));

      logger.info("direction.written", { userId: user.id, projectId });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("direction.write-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: DIRECTION_CREATE_UNAVAILABLE_MESSAGE };
    }
  });

  if (outcome.status === "idle") redirect(directionsPath(projectId));

  return outcome;
}
