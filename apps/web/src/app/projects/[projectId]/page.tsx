import {
  getProjectForOwner,
  listRunningGenerations,
  openProjectScope,
  readProjectProgress,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ArchiveProjectSection } from "@/components/archive-project-section";
import { GenerationIndicator } from "@/components/generation-indicator";
import { ProjectOverview } from "@/components/project-overview";
import { SubmitButton } from "@/components/submit-button";
import { getCurrentUser } from "@/lib/current-user";
import { projectActionErrorMessage } from "@/lib/project-action-error";
import { projectStatusLabel } from "@/lib/project-status-label";
import { PROJECT_TITLE_MAX_LENGTH } from "@/lib/project-title";
import { signInDestination } from "@/lib/sign-in-redirect";

import {
  archiveProjectAction,
  duplicateProjectAction,
  renameProjectAction,
  restoreProjectAction,
} from "./actions";
import { getRunningGenerationsAction } from "./generation-status-action";
import styles from "./page.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

/**
 * A project, and what can be done to it (CAL-035).
 *
 * **This is the "open" action.** The dashboard links here, and until the screens
 * of E7 to E15 exist this page is a shell: the same facts the dashboard card
 * shows, the nine-step progress bar (CAL-037), plus the four other actions.
 * The bar reads `readProjectProgress` rather than `project.status` — the
 * cached column can be stale (a fixture or a direct write never refreshed it),
 * while the progress query recomputes from the rows every time.
 *
 * **A project that is not yours and a project that does not exist are the same
 * answer** — `notFound()`, because the repository refuses to tell them apart
 * (CLAUDE.md §3.5) and a screen that did would reopen the enumeration leak the
 * 404 is chosen to close.
 *
 * Every form is a plain form posting to a server action. No client state
 * decides whether a destructive control is live: the checks that matter run on
 * the server, a refusal comes back on this URL as `?error=`, and the whole
 * screen works with JavaScript off.
 */
export default async function ProjectPage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(`/projects/${projectId}`));

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);
  if (!found.ok || !scope.ok) notFound();

  const [progress, runningGenerations] = await Promise.all([
    readProjectProgress(scope.value),
    listRunningGenerations(scope.value),
  ]);
  if (!progress.ok) notFound();

  const project = found.value;
  const isArchived = project.archivedAt !== null;
  const error = projectActionErrorMessage((await searchParams).error);

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href="/">← Mes projets</Link>
      </p>

      <ProjectOverview
        projectId={project.id}
        title={project.title}
        titleMaxLength={PROJECT_TITLE_MAX_LENGTH}
        statusLabel={projectStatusLabel(project.status)}
        updatedAtIso={project.updatedAt.toISOString()}
        updatedAtLabel={DATE_FORMAT.format(project.updatedAt)}
        writtenChapterCountLabel={NUMBER_FORMAT.format(project.writtenChapterCount)}
        totalWordCountLabel={NUMBER_FORMAT.format(project.totalWordCount)}
        progress={progress.value}
        error={error}
        renameAction={renameProjectAction}
      />

      <GenerationIndicator
        projectId={project.id}
        initial={runningGenerations.map((row) => ({ id: row.id, mission: row.mission }))}
        getRunningGenerations={getRunningGenerationsAction}
      />

      <section className={styles.action} aria-labelledby="duplicate-heading">
        <h3 className={styles.actionTitle} id="duplicate-heading">
          Dupliquer
        </h3>
        <p className={styles.actionNote}>
          Crée un projet indépendant contenant tout le travail&nbsp;: texte source, analyse,
          directions, bible, personnages, lieux, faits canoniques, chronologie, plan, chapitres,
          versions et fils narratifs. L&apos;historique des générations, les exports et la
          publication ne sont pas repris.
        </p>
        <form action={duplicateProjectAction}>
          <input type="hidden" name="projectId" value={project.id} />
          <SubmitButton pendingLabel="Duplication…">Dupliquer ce projet</SubmitButton>
        </form>
      </section>

      <ArchiveProjectSection
        projectId={project.id}
        isArchived={isArchived}
        archiveAction={archiveProjectAction}
        restoreAction={restoreProjectAction}
      />

      <section className={styles.danger} aria-labelledby="delete-heading">
        <h3 className={styles.actionTitle} id="delete-heading">
          Supprimer
        </h3>
        <p className={styles.actionNote}>
          <strong>Cette action est définitive.</strong> Tout le contenu du projet est supprimé. Pour
          mettre simplement le projet de côté, archivez-le&nbsp;: c&apos;est réversible.
        </p>
        <Link className={styles.dangerLink} href={`/projects/${project.id}/delete`}>
          Supprimer ce projet…
        </Link>
      </section>
    </main>
  );
}
