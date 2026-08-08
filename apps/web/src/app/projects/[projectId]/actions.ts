"use server";

/**
 * The five actions on a project (CAL-035) — rename, duplicate, archive,
 * restore, delete. Opening one is the sixth, and it is a link.
 *
 * Each of them composes and nothing more, which is what the interface layer is
 * for (§3.3): the session says who is asking, `openProjectScope` turns the
 * project id in the form into a proof of ownership, and
 * `@calepin/shared/repository` performs. **The project id arrives in the form
 * and is never trusted**: it is an argument to the scope, and a scope is
 * refused unless the row it names carries this owner's id.
 *
 * **Every outcome is a redirect**, the choice CAL-028 and CAL-031 already made:
 * a refusal comes back to the page's own URL with a closed reason code in the
 * query string, so the message is part of a server-rendered response and
 * survives JavaScript being off. There is one code path rather than two, and no
 * client state decides whether a destructive button is live.
 *
 * A `"use server"` module may export nothing but async functions, which is why
 * the reason codes and the title rules live in `lib/` beside their French
 * messages rather than here.
 */

import { runWithActor } from "@calepin/shared/audit";
import { errorLogFields, type Result } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import {
  archiveProject,
  deleteProject,
  duplicateProject,
  getProjectForOwner,
  openProjectScope,
  type ProjectScope,
  restoreProject,
  updateProject,
} from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import type { ProjectActionError } from "@/lib/project-action-error";
import { duplicatedProjectTitle, matchesProjectTitle, readProjectTitle } from "@/lib/project-title";
import { withRequestLogContext } from "@/lib/request-context";
import { signInDestination } from "@/lib/sign-in-redirect";

const DASHBOARD_PATH = "/";

type ActionOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: ProjectActionError }; // prettier-ignore

export async function renameProjectAction(formData: FormData): Promise<void> {
  const projectId = readProjectId(formData);
  const userId = await requireOwnerId(projectId);
  const title = readProjectTitle(formData.get("title"));

  const outcome = await withRequestLogContext(async () => {
    if (title === null) return refused("title", userId, projectId);

    return performWrite(userId, projectId, async (scope) => updateProject(scope, { title }));
  });

  finish(outcome, projectPath(projectId), projectPath(projectId));
}

/**
 * The copy, and then straight into it. Landing on the original would leave the
 * author looking at a page that has not changed, wondering whether anything
 * happened.
 */
export async function duplicateProjectAction(formData: FormData): Promise<void> {
  const projectId = readProjectId(formData);
  const userId = await requireOwnerId(projectId);

  const outcome = await withRequestLogContext(async () =>
    performWrite(userId, projectId, async (scope) => {
      const original = await getProjectForOwner({ ownerId: userId, projectId });
      if (!original.ok) return original;

      return duplicateProject(scope, { title: duplicatedProjectTitle(original.value.title) });
    }),
  );

  finish(outcome, projectPath(projectId), (copy) => projectPath(copy.id));
}

export async function archiveProjectAction(formData: FormData): Promise<void> {
  const projectId = readProjectId(formData);
  const userId = await requireOwnerId(projectId);

  const outcome = await withRequestLogContext(async () =>
    performWrite(userId, projectId, archiveProject),
  );

  finish(outcome, projectPath(projectId), projectPath(projectId));
}

/** Archiving's undo, and the reason deleting is the only irreversible action. */
export async function restoreProjectAction(formData: FormData): Promise<void> {
  const projectId = readProjectId(formData);
  const userId = await requireOwnerId(projectId);

  const outcome = await withRequestLogContext(async () =>
    performWrite(userId, projectId, restoreProject),
  );

  finish(outcome, projectPath(projectId), projectPath(projectId));
}

/**
 * The irreversible one. The author types the project's title first — a check on
 * intent, not on identity: the session established who is asking, and the scope
 * establishes that the project is theirs.
 */
export async function deleteProjectAction(formData: FormData): Promise<void> {
  const projectId = readProjectId(formData);
  const userId = await requireOwnerId(projectId);
  const confirmation = formData.get("confirmation");

  const outcome = await withRequestLogContext(async () =>
    performWrite(userId, projectId, async (scope) => {
      const project = await getProjectForOwner({ ownerId: userId, projectId });
      if (!project.ok) return project;

      // Read back from the row rather than from a hidden field, so the two
      // cannot skew: what is confirmed is the title the project actually has.
      if (!matchesProjectTitle(confirmation, project.value.title)) {
        return { ok: false as const, reason: "confirmation" as const };
      }

      return deleteProject(scope);
    }),
  );

  finish(outcome, deletePath(projectId), DASHBOARD_PATH);
}

/**
 * Runs one owned write and answers with the reason it did not happen.
 *
 * No `redirect` is reachable from here, and that is deliberate: `redirect`
 * signals by throwing, and a signal thrown through the `AsyncLocalStorage`
 * callback this runs inside would be caught by the `catch` below and reported
 * as a failed action (CAL-031's lesson, one screen along).
 */
async function performWrite<T>(
  userId: string,
  projectId: string,
  write: (scope: ProjectScope) => Promise<Result<T> | { ok: false; reason: ProjectActionError }>,
): Promise<ActionOutcome<T>> {
  try {
    const scope = await openProjectScope({ ownerId: userId, projectId });
    if (!scope.ok) return refused("missing", userId, projectId, scope.error);

    const done = await runWithActor(userId, async () => write(scope.value));
    if (done.ok) return done;

    if ("reason" in done) return refused(done.reason, userId, projectId);

    return refused(
      done.error.code === "NOT_FOUND" ? "missing" : "unavailable",
      userId,
      projectId,
      done.error,
    );
  } catch (error: unknown) {
    // An integrity fault or an outage — a throw rather than a value, by §7. The
    // transaction rolled back, so the honest answer is that nothing happened.
    // The trace goes to the log, classified and stripped of every message (§9);
    // the screen gets one French sentence.
    logger.error("project.action-failed", { userId, projectId, ...errorLogFields(error) });

    return { ok: false, reason: "unavailable" };
  }
}

function refused(
  reason: ProjectActionError,
  userId: string,
  projectId: string,
  error?: unknown,
): ActionOutcome<never> {
  logger.warn("project.action-refused", {
    userId,
    projectId,
    // A refusal the screen decided has no `AppError` to classify: the reason
    // code travels as the path it concerns, never as a message and never
    // carrying what was typed (§9).
    ...(error === undefined ? { fieldPath: reason } : errorLogFields(error)),
  });

  return { ok: false, reason };
}

/**
 * Where the action lands. Outside every scope above, because `redirect` throws
 * to do its work.
 *
 * A success revalidates both the project and the dashboard: the dashboard shows
 * the title, the status and the counters this write may have moved, and a
 * client router cache holding the previous version is exactly how a rename
 * looks like it failed.
 */
function finish<T>(
  outcome: ActionOutcome<T>,
  refusalPath: string,
  destination: string | ((value: T) => string),
): never {
  if (!outcome.ok) redirect(`${refusalPath}?error=${outcome.reason}`);

  revalidatePath(DASHBOARD_PATH);
  revalidatePath(refusalPath);

  redirect(typeof destination === "string" ? destination : destination(outcome.value));
}

function projectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

function deletePath(projectId: string): string {
  return `${projectPath(projectId)}/delete`;
}

/** The project the form names. An action with no project is a malformed post. */
function readProjectId(formData: FormData): string {
  const value = formData.get("projectId");

  if (typeof value !== "string" || value === "") redirect(DASHBOARD_PATH);

  return value;
}

async function requireOwnerId(projectId: string): Promise<string> {
  const user = await getCurrentUser();

  if (!user) redirect(signInDestination(projectPath(projectId)));

  return user.id;
}
