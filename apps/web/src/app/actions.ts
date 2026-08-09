"use server";

/**
 * The project creation action (CAL-037) — creates a new project for the
 * signed-in user.
 *
 * Like all actions on projects (CAL-035), it redirects: success lands on the
 * project page, failure lands back on the dashboard with a reason code.
 */

import { runWithActor } from "@calepin/shared/audit";
import { createProject } from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

const DASHBOARD_PATH = "/";

export async function createProjectAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(DASHBOARD_PATH));

  try {
    const project = await runWithActor(user.id, async () =>
      createProject({
        ownerId: user.id,
        title: "Nouveau projet",
      }),
    );

    revalidatePath(DASHBOARD_PATH);
    redirect(`/projects/${encodeURIComponent(project.id)}`);
  } catch (error: unknown) {
    redirect(DASHBOARD_PATH);
  }
}
