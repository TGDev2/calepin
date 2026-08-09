import { redirect } from "next/navigation";

import { ProjectCreationWizard } from "@/components/project-creation-wizard";
import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import { createProjectFromDraftAction } from "./actions";
import styles from "./page.module.css";

const NEW_PROJECT_PATH = "/projects/new";

/**
 * The project creation wizard's page (CAL-040). No `loading.tsx` here: the
 * only thing this component does is decide (redirect, or render) — nothing
 * about it suspends, and the lesson `tasks/lessons.md` records about
 * `loading.tsx` auto-wrapping a deciding component in a `<Suspense>` boundary
 * is exactly why one is not added casually.
 */
export default async function NewProjectPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(NEW_PROJECT_PATH));

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Créer un nouveau projet</h1>
      <ProjectCreationWizard action={createProjectFromDraftAction} />
    </main>
  );
}
