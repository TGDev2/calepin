import {
  getProjectForOwner,
  openProjectScope,
  readProjectProgress,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProcessStepper } from "@/components/process-stepper";
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

  const progress = await readProjectProgress(scope.value);
  if (!progress.ok) notFound();

  const project = found.value;
  const isArchived = project.archivedAt !== null;
  const error = projectActionErrorMessage((await searchParams).error);

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href="/">← Mes projets</Link>
      </p>

      <div className={styles.header}>
        <h1 className={styles.title}>{project.title}</h1>
        <span className={styles.status}>{projectStatusLabel(project.status)}</span>
      </div>

      <p className={styles.updatedAt}>
        Modifié le{" "}
        <time dateTime={project.updatedAt.toISOString()}>
          {DATE_FORMAT.format(project.updatedAt)}
        </time>
      </p>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Chapitres rédigés</dt>
          <dd>{NUMBER_FORMAT.format(project.writtenChapterCount)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Mots</dt>
          <dd>{NUMBER_FORMAT.format(project.totalWordCount)}</dd>
        </div>
      </dl>

      <ProcessStepper progress={progress.value} />

      {error ? (
        <p className={styles.error} role="alert">
          <span className={styles.errorIcon} aria-hidden="true">
            ⚠
          </span>
          <span>
            <strong>Erreur&nbsp;: </strong>
            {error}
          </span>
        </p>
      ) : null}

      <h2 className={styles.sectionsTitle}>Actions</h2>

      <section className={styles.action} aria-labelledby="rename-heading">
        <h3 className={styles.actionTitle} id="rename-heading">
          Renommer
        </h3>
        <form className={styles.renameForm} action={renameProjectAction}>
          <input type="hidden" name="projectId" value={project.id} />
          <label className={styles.label} htmlFor="title">
            Titre du projet
          </label>
          <input
            className={styles.input}
            id="title"
            name="title"
            type="text"
            defaultValue={project.title}
            maxLength={PROJECT_TITLE_MAX_LENGTH}
            required
            aria-required="true"
          />
          <button className={styles.button} type="submit">
            Renommer
          </button>
        </form>
      </section>

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
          <button className={styles.button} type="submit">
            Dupliquer ce projet
          </button>
        </form>
      </section>

      <section className={styles.action} aria-labelledby="archive-heading">
        <h3 className={styles.actionTitle} id="archive-heading">
          {isArchived ? "Restaurer" : "Archiver"}
        </h3>
        <p className={styles.actionNote}>
          {isArchived
            ? "Ce projet est archivé. Le restaurer le remet à l'étape que son contenu justifie."
            : "L'archivage met le projet de côté sans rien supprimer. Il reste consultable, et vous pouvez le restaurer à tout moment."}
        </p>
        <form action={isArchived ? restoreProjectAction : archiveProjectAction}>
          <input type="hidden" name="projectId" value={project.id} />
          <button className={styles.button} type="submit">
            {isArchived ? "Restaurer ce projet" : "Archiver ce projet"}
          </button>
        </form>
      </section>

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
