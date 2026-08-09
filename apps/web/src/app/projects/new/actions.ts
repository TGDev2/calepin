"use server";

/**
 * The project creation wizard's only write (CAL-040).
 *
 * Unlike every other project action in this app, this one does not
 * `redirect()` on every outcome — it returns a `ProjectCreationActionState`,
 * the shape `useActionState` requires, because the client needs the chance to
 * clear its `localStorage` draft *before* navigating away on success. See
 * `components/project-creation-wizard.tsx` for the full rationale.
 *
 * Validation runs again here even though the wizard already gated every step
 * with the same function — defense in depth, not the primary UX: a draft
 * restored from an older `localStorage` entry is the realistic way this path
 * gets exercised in practice.
 */

import { runWithActor } from "@calepin/shared/audit";
import { errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import { createProjectWithSourceText } from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import {
  draftFromFormData,
  PROJECT_CREATION_UNAVAILABLE_MESSAGE,
  type ProjectCreationActionState,
  validateProjectCreationDraft,
} from "@/lib/project-creation";
import { withRequestLogContext } from "@/lib/request-context";
import { signInDestination } from "@/lib/sign-in-redirect";

const NEW_PROJECT_PATH = "/projects/new";
const DASHBOARD_PATH = "/";

export async function createProjectFromDraftAction(
  _previous: ProjectCreationActionState,
  formData: FormData,
): Promise<ProjectCreationActionState> {
  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(NEW_PROJECT_PATH));

  const validation = validateProjectCreationDraft(draftFromFormData(formData));
  if (!validation.ok) return { ok: false, errors: validation.errors };

  return withRequestLogContext(async () => {
    try {
      const project = await runWithActor(user.id, async () =>
        createProjectWithSourceText({ ownerId: user.id, ...validation.value }),
      );

      revalidatePath(DASHBOARD_PATH);
      return { ok: true, projectId: project.id };
    } catch (error: unknown) {
      logger.error("project.creation-failed", { userId: user.id, ...errorLogFields(error) });
      return { ok: false, formError: PROJECT_CREATION_UNAVAILABLE_MESSAGE };
    }
  });
}
