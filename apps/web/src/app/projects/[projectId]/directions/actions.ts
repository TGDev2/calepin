"use server";

/**
 * Writing one proposed direction off, optionally saying why (CAL-083).
 *
 * It composes and nothing more, which is what the interface layer is for
 * (§3.3): the session says who is asking, `openProjectScope` turns the project
 * id in the form into a proof of ownership, `parseDirectionDiscardReason`
 * applies the domain's rule about what a reason may be, and the repository
 * performs — marking that row and leaving the two the author kept exactly
 * where they were.
 *
 * **The domain parses, then the repository persists.** `@calepin/shared` may
 * not import a domain (§3.2), so the ceiling on a reason is applied here.
 * `analysis/actions.ts`'s division, one epic later.
 *
 * **A refusal comes back as state, never as a redirect.** The form holds what
 * the author just wrote about why the direction does not work for them, and a
 * redirect would answer "that was too long" by throwing it away. A *success*
 * redirects, because the discarded direction has moved to the history behind
 * the form and there is nothing left to keep.
 *
 * **Nothing literary is logged** (§9). The refusal log carries the user, the
 * project and the error's own fields; the reason is stored and shown back, and
 * never appears in a log line, which is why no `reasonLength` is recorded
 * either — a length is safe, and a field nobody needs is a field that will one
 * day carry more than a length.
 */

import { parseDirectionDiscardReason } from "@calepin/direction";
import { runWithActor } from "@calepin/shared/audit";
import { errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import { discardDirection, openProjectScope } from "@calepin/shared/repository";
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
