"use server";

/**
 * Replay and cancel from the operations screen (CAL-068).
 *
 * The same two writes `apps/web/src/app/projects/[projectId]/actions.ts`
 * already exposes on the project page — same repository calls
 * (`replayGeneration`, `cancelGeneration`), same reason codes
 * (`@/lib/project-action-error`), same two-step replay (reopen the row, then
 * enqueue — see that file's own doc comment for why the order matters and why
 * a refused enqueue is not reported as a failure). Kept as its own small file
 * rather than sharing `performWrite`/`finish` with the project page's: the two
 * redirect to different places, and the shared surface would be smaller than
 * the seam needed to parameterise it.
 */

import { runWithActor } from "@calepin/shared/audit";
import { errorLogFields, type Result, succeed } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import { enqueueGeneration } from "@calepin/shared/queue";
import {
  cancelGeneration,
  openProjectScope,
  type ProjectScope,
  replayGeneration,
} from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import type { ProjectActionError } from "@/lib/project-action-error";
import { withRequestLogContext } from "@/lib/request-context";
import { signInDestination } from "@/lib/sign-in-redirect";

const GENERATIONS_PATH = "/generations";

type ActionOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: ProjectActionError }; // prettier-ignore

/**
 * Replays a generation that failed. See the project page's own action for the
 * full reasoning — reopening the row before enqueueing, and why a Redis
 * outage here costs latency rather than the replay.
 */
export async function replayRecentGenerationAction(formData: FormData): Promise<void> {
  const projectId = readProjectId(formData);
  const userId = await requireOwnerId();
  const generationId = readGenerationId(formData);

  const outcome = await withRequestLogContext(async () => {
    if (generationId === null) return refused("missing", userId, projectId);

    return performWrite(userId, projectId, async (scope) => {
      const replayed = await replayGeneration(scope, generationId);

      if (!replayed.ok) {
        // A generation that finished between the render and the click.
        return replayed.error.code === "CONFLICT"
          ? { ok: false as const, reason: "generation" as const }
          : replayed;
      }

      const enqueued = await enqueueGeneration(replayed.value.id, replayed.value.mission);

      if (!enqueued.ok) {
        // Said out loud rather than swallowed: the row is queued regardless,
        // and the sweep is what delivers a queued row.
        logger.warn("generation.replay-not-delivered", {
          projectId,
          generationId: replayed.value.id,
          errorCode: enqueued.error.code,
          errorCategory: enqueued.error.category,
        });
      }

      return succeed(replayed.value);
    });
  });

  finish(outcome);
}

/** Stops a generation the author no longer wants. */
export async function cancelRecentGenerationAction(formData: FormData): Promise<void> {
  const projectId = readProjectId(formData);
  const userId = await requireOwnerId();
  const generationId = readGenerationId(formData);

  const outcome = await withRequestLogContext(async () => {
    if (generationId === null) return refused("missing", userId, projectId);

    return performWrite(userId, projectId, async (scope) => {
      const cancelled = await cancelGeneration(scope, generationId);

      if (!cancelled.ok) {
        // It finished between the render and the click — its own reason code,
        // since the remedy is a reload rather than a retry.
        return cancelled.error.code === "CONFLICT"
          ? { ok: false as const, reason: "cancellation" as const }
          : cancelled;
      }

      return succeed(cancelled.value);
    });
  });

  finish(outcome);
}

/** Runs one owned write and answers with the reason it did not happen. */
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
    logger.error("generations.action-failed", { userId, projectId, ...errorLogFields(error) });

    return { ok: false, reason: "unavailable" };
  }
}

function refused(
  reason: ProjectActionError,
  userId: string,
  projectId: string,
  error?: unknown,
): ActionOutcome<never> {
  logger.warn("generations.action-refused", {
    userId,
    projectId,
    ...(error === undefined ? { fieldPath: reason } : errorLogFields(error)),
  });

  return { ok: false, reason };
}

function finish<T>(outcome: ActionOutcome<T>): never {
  if (!outcome.ok) redirect(`${GENERATIONS_PATH}?error=${outcome.reason}`);

  revalidatePath(GENERATIONS_PATH);
  redirect(GENERATIONS_PATH);
}

/** The project the form names. A submission with no project is malformed. */
function readProjectId(formData: FormData): string {
  const value = formData.get("projectId");

  if (typeof value !== "string" || value === "") redirect(GENERATIONS_PATH);

  return value;
}

function readGenerationId(formData: FormData): string | null {
  const value = formData.get("generationId");

  return typeof value === "string" && value !== "" ? value : null;
}

async function requireOwnerId(): Promise<string> {
  const user = await getCurrentUser();

  if (!user) redirect(signInDestination(GENERATIONS_PATH));

  return user.id;
}
