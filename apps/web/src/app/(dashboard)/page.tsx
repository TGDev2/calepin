import {
  isProjectStatus,
  PROJECT_STATUSES,
  type ProjectStatus,
} from "@calepin/shared/project-status";
import { listProjectDashboardRows, type ProjectDashboardRow } from "@calepin/shared/repository";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { projectStatusLabel } from "@/lib/project-status-label";
import { signInDestination } from "@/lib/sign-in-redirect";

import { createProjectAction } from "./actions";
import styles from "./page.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

type DashboardSort = "updatedAt" | "progress";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The project dashboard (CAL-032) — the seven pieces of information the
 * specification asks for, per project: title, status, last-modified date,
 * planned chapters, written chapters, total word count, and current process
 * stage. The schema carries one field for both "statut" and "étape actuelle
 * du processus" (`Project.status`), so it is shown once, as a status badge —
 * see `@/lib/project-status-label`.
 *
 * The written-chapter count and the word total are read off the project row
 * (CAL-033): they are maintained by the write that moves them, so this screen
 * displays a number rather than computing one. The planned count is still
 * counted — chapter creation belongs to E10 and has no write path to maintain
 * it yet. One query either way (CLAUDE.md §3.5).
 *
 * The mirror image of `/account`'s own "no session → redirect" (CAL-029):
 * `proxy.ts` already turns away a visitor with no session cookie, and this is
 * what catches a cookie present but not naming a live session.
 *
 * Search, sort and filter (CAL-036) live entirely in the URL's query string:
 * a plain `<form method="get">`, no client component and no JavaScript
 * needed, so submitting it is a normal navigation to `/?q=...&sort=...&status=...`
 * — which is also the shareable link the task asks for. A malformed or
 * hand-edited param degrades to the default view rather than erroring.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect(signInDestination("/"));

  const params = await searchParams;
  const search = firstParam(params.q)?.trim() ?? "";
  const sortParam = firstParam(params.sort);
  const sort: DashboardSort = sortParam === "progress" ? "progress" : "updatedAt";
  const statusParam = firstParam(params.status);
  const status: ProjectStatus | undefined = isProjectStatus(statusParam) ? statusParam : undefined;
  const isFiltered = search !== "" || sort !== "updatedAt" || status !== undefined;

  const projects = await listProjectDashboardRows(user.id, {
    ...(search === "" ? {} : { search }),
    ...(status === undefined ? {} : { status }),
    sort,
  });

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Mes projets</h1>

      <form className={styles.filters} method="get" action="/">
        <label className={styles.filterLabel} htmlFor="q">
          Titre
        </label>
        <input
          className={styles.filterInput}
          id="q"
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Rechercher un projet…"
        />

        <label className={styles.filterLabel} htmlFor="sort">
          Trier par
        </label>
        <select className={styles.filterSelect} id="sort" name="sort" defaultValue={sort}>
          <option value="updatedAt">Dernière modification</option>
          <option value="progress">Avancement</option>
        </select>

        <label className={styles.filterLabel} htmlFor="status">
          Statut
        </label>
        <select
          className={styles.filterSelect}
          id="status"
          name="status"
          defaultValue={status ?? ""}
        >
          <option value="">Tous les statuts</option>
          {PROJECT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {projectStatusLabel(value)}
            </option>
          ))}
        </select>

        <button className={styles.filterSubmit} type="submit">
          Filtrer
        </button>
        {isFiltered ? (
          <Link className={styles.filterReset} href="/">
            Réinitialiser
          </Link>
        ) : null}
      </form>

      {projects.length === 0 ? (
        isFiltered ? (
          <p className={styles.empty}>Aucun projet ne correspond à cette recherche.</p>
        ) : (
          <EmptyState />
        )
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

function EmptyState() {
  return (
    <section className={styles.emptyState}>
      <h2 className={styles.emptyTitle}>Aucun projet pour l&apos;instant.</h2>

      <p className={styles.emptyDescription}>
        Calepin transforme une fiction courte en projet de roman structuré.
      </p>

      <div className={styles.journey}>
        <p className={styles.journeyLabel}>Votre parcours :</p>
        <ol className={styles.journeySteps}>
          <li>Analysez votre texte source</li>
          <li>Structurez votre univers</li>
          <li>Écrivez votre roman</li>
        </ol>
      </div>

      <form action={createProjectAction}>
        <button type="submit" className={styles.createButton}>
          Créer mon premier projet
        </button>
      </form>
    </section>
  );
}

function ProjectCard({ project }: { project: ProjectDashboardRow }) {
  return (
    <article>
      <div className={styles.projectHeader}>
        {/* Opening a project is a link, not an action (CAL-035): it changes
            nothing, so it is a GET, it can be middle-clicked, and it is where
            the four other actions live. */}
        <h2 className={styles.projectTitle}>
          <Link className={styles.projectLink} href={`/projects/${project.id}`}>
            {project.title}
          </Link>
        </h2>
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
