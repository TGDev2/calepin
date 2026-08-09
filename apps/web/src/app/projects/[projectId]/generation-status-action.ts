"use server";

/**
 * The generation indicator's poll (CAL-039) — the read `GenerationIndicator`
 * calls on an interval to stay live without a page reload.
 *
 * Re-derives the owner and the scope exactly as `page.tsx` does rather than
 * trusting the project id the client already holds: the id arrives from the
 * browser and is never trusted on its own, the same discipline
 * `actions.ts`'s doc comment states for the project's other server actions.
 * An unauthenticated or non-owning caller gets an empty list, the same shape
 * a project with nothing running returns — this is a background poll, not a
 * navigation, so there is no page to redirect and no error to show; the
 * indicator just has nothing to display.
 */

import {
  type GenerationMission,
  listRunningGenerations,
  openProjectScope,
} from "@calepin/shared/repository";

import { getCurrentUser } from "@/lib/current-user";

export interface RunningGenerationView {
  readonly id: string;
  readonly mission: GenerationMission;
}

export async function getRunningGenerationsAction(
  projectId: string,
): Promise<RunningGenerationView[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const scope = await openProjectScope({ ownerId: user.id, projectId });
  if (!scope.ok) return [];

  const running = await listRunningGenerations(scope.value);

  return running.map((row) => ({ id: row.id, mission: row.mission }));
}
