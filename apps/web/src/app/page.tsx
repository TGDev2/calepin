import { listProjectDashboardRows, type ProjectDashboardRow } from "@calepin/shared/repository";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { projectStatusLabel } from "@/lib/project-status-label";
import { signInDestination } from "@/lib/sign-in-redirect";

import styles from "./page.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

/**
 * The project dashboard (CAL-032) — the seven pieces of information the
 * specification asks for, per project: title, status, last-modified date,
 * planned chapters, written chapters, total word count, and current process
 * stage. The schema carries one field for both "statut" and "étape actuelle
 * du processus" (`Project.status`), so it is shown once, as a status badge —
 * see `@/lib/project-status-label`.
 *
 * Aggregates are computed live by `listProjectDashboardRows`, in one query
 * (CLAUDE.md §3.5) — CAL-033 owns replacing this with write-time,
 * denormalized counters.
 *
 * The mirror image of `/account`'s own "no session → redirect" (CAL-029):
 * `proxy.ts` already turns away a visitor with no session cookie, and this is
 * what catches a cookie present but not naming a live session.
 */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect(signInDestination("/"));

  const projects = await listProjectDashboardRows(user.id);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Mes projets</h1>

      {projects.length === 0 ? (
        <p className={styles.empty}>Aucun projet pour l&apos;instant.</p>
      ) : (
        <ul className={styles.projects}>
          {projects.map((project) => (
            <li key={project.id} className={styles.project}>
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ProjectCard({ project }: { project: ProjectDashboardRow }) {
  return (
    <article>
      <div className={styles.projectHeader}>
        <h2 className={styles.projectTitle}>{project.title}</h2>
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
          <dd>
            {project.writtenChapterCount} / {project.plannedChapterCount}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt>Mots</dt>
          <dd>{NUMBER_FORMAT.format(project.totalWordCount)}</dd>
        </div>
      </dl>
    </article>
  );
}
