import { getProjectForOwner } from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { projectActionErrorMessage } from "@/lib/project-action-error";
import { signInDestination } from "@/lib/sign-in-redirect";

import { deleteProjectAction } from "../actions";
import styles from "./page.module.css";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

/**
 * The project deletion screen (CAL-035) — the confirmation in front of the one
 * action that cannot be taken back.
 *
 * **It shows what will be lost before it asks.** The same reasoning as the
 * account screen of CAL-031, and the same discipline: counts and nothing else,
 * never a title of a chapter or a line of the text (§9), so the page is safe on
 * a screenshot or in a support session.
 *
 * **It offers the reversible action beside the irreversible one.** Archiving is
 * what the author usually means, and `restoreProject` undoes it — so it is
 * named here rather than left to be discovered on the page they came from.
 *
 * The form is a plain form: the server matches the typed title against the
 * stored one, and a refusal comes back on this URL as `?error=`.
 */
export default async function DeleteProjectPage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]/delete">) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(`/projects/${projectId}/delete`));

  const found = await getProjectForOwner({ ownerId: user.id, projectId });
  if (!found.ok) notFound();

  const project = found.value;
  const error = projectActionErrorMessage((await searchParams).error);

  return (
    <main className={styles.screen}>
      <h1 className={styles.title}>Supprimer ce projet</h1>

      <p className={styles.warning} role="note">
        <span className={styles.warningIcon} aria-hidden="true">
          ⚠
        </span>
        <span>
          <strong>Cette action est définitive.</strong> Le texte source, l&apos;analyse, la bible,
          le plan, les chapitres et toutes leurs versions sont supprimés. Aucune restauration
          n&apos;est possible.
        </span>
      </p>

      <dl className={styles.census}>
        <div className={styles.censusLine}>
          <dt>Projet</dt>
          <dd>{project.title}</dd>
        </div>
        <div className={styles.censusLine}>
          <dt>Chapitres rédigés</dt>
          <dd>{NUMBER_FORMAT.format(project.writtenChapterCount)}</dd>
        </div>
        <div className={styles.censusLine}>
          <dt>Mots</dt>
          <dd>{NUMBER_FORMAT.format(project.totalWordCount)}</dd>
        </div>
      </dl>

      <p className={styles.alternative}>
        Pour mettre le projet de côté sans rien perdre, revenez en arrière et
        <strong> archivez-le</strong>&nbsp;: c&apos;est réversible à tout moment.
      </p>

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

      <form className={styles.form} action={deleteProjectAction}>
        <input type="hidden" name="projectId" value={project.id} />

        <label className={styles.label} htmlFor="confirmation">
          Pour confirmer, saisissez le titre du projet&nbsp;:
        </label>
        <p className={styles.expected} id="confirmation-hint">
          {project.title}
        </p>
        <input
          className={styles.input}
          id="confirmation"
          name="confirmation"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required
          aria-required="true"
          aria-describedby="confirmation-hint"
          aria-invalid={error ? true : undefined}
        />

        <button className={styles.submit} type="submit">
          Supprimer définitivement ce projet
        </button>
      </form>

      <p className={styles.cancel}>
        <Link href={`/projects/${project.id}`}>Annuler et revenir au projet</Link>
      </p>
    </main>
  );
}
