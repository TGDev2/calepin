import {
  getProjectForOwner,
  getSourceText,
  listFailedGenerations,
  listRunningGenerations,
  openProjectScope,
  type ProjectScope,
  readProjectProgress,
  readSourceTextObsolescence,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ArchiveProjectSection } from "@/components/archive-project-section";
import { GenerationFailureList } from "@/components/generation-failure-list";
import { GenerationIndicator } from "@/components/generation-indicator";
import { ObsolescenceNotice } from "@/components/obsolescence-notice";
import { ProjectOverview } from "@/components/project-overview";
import { SkeletonBlock } from "@/components/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { getCurrentUser } from "@/lib/current-user";
import { projectActionErrorMessage } from "@/lib/project-action-error";
import { projectStatusLabel } from "@/lib/project-status-label";
import { PROJECT_TITLE_MAX_LENGTH } from "@/lib/project-title";
import { signInDestination } from "@/lib/sign-in-redirect";

import {
  archiveProjectAction,
  cancelGenerationAction,
  duplicateProjectAction,
  renameProjectAction,
  replayGenerationAction,
  restoreProjectAction,
} from "./actions";
import loadingStyles from "./loading.module.css";
import styles from "./page.module.css";

type FoundProject = Extract<Awaited<ReturnType<typeof getProjectForOwner>>, { ok: true }>["value"];

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
 * **The ownership check runs above any `<Suspense>` boundary, on purpose.**
 * Next only commits to the response's HTTP status once something below the
 * first boundary in the tree suspends; a `notFound()` thrown after that point
 * still renders the not-found UI but the status stays 200 (a known Next.js
 * streaming behaviour, not a bug in this page). `getProjectForOwner` and
 * `openProjectScope` above are therefore awaited directly in this component —
 * which has no `loading.tsx` and no ancestor `<Suspense>` — before rendering
 * begins; only the slower, ownership-agnostic `<ProjectDetails>` below is
 * wrapped in one, so the skeleton still shows without ever gating the 404.
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

  const error = projectActionErrorMessage((await searchParams).error);

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href="/">← Mes projets</Link>
      </p>

      <Suspense fallback={<ProjectDetailsSkeleton />}>
        <ProjectDetails scope={scope.value} project={found.value} error={error} />
      </Suspense>
    </main>
  );
}

interface ProjectDetailsProps {
  readonly scope: ProjectScope;
  readonly project: FoundProject;
  readonly error: string | null;
}

/**
 * Everything about the project that is not the ownership decision — the nine-
 * step bar, the generation indicator and the three actions. Split out of
 * `ProjectPage` so only this half streams behind a `<Suspense>` boundary; see
 * that component's doc comment for why.
 */
async function ProjectDetails({ scope, project, error }: ProjectDetailsProps) {
  const [progress, runningGenerations, failedGenerations, sourceText, obsolescence] =
    await Promise.all([
      readProjectProgress(scope),
      listRunningGenerations(scope),
      listFailedGenerations(scope),
      getSourceText(scope),
      readSourceTextObsolescence(scope),
    ]);
  if (!progress.ok) notFound();

  const isArchived = project.archivedAt !== null;

  return (
    <>
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
        initial={runningGenerations.map((row) => ({
          id: row.id,
          mission: row.mission,
          progressStep: row.progressStep,
          progressPercent: row.progressPercent,
          failureClass: row.failureClass,
        }))}
        cancelAction={cancelGenerationAction}
      />

      {/*
       * Above the rest of the actions, and on purpose (CAL-063): a generation the
       * author paid for and did not get is the most urgent thing on this page,
       * and the button that fixes it should not be below "Dupliquer".
       */}
      <GenerationFailureList
        projectId={project.id}
        failures={failedGenerations}
        replayAction={replayGenerationAction}
      />

      {/*
       * The warning lives here as well as on the editor, and on purpose: an
       * author who edited their text last week arrives on the project page, not
       * on the screen where they made the change. A consequence only visible
       * where it was caused is a consequence nobody sees again.
       */}
      {obsolescence.ok ? <ObsolescenceNotice report={obsolescence.value} /> : null}

      <section className={styles.action} aria-labelledby="source-text-heading">
        <h3 className={styles.actionTitle} id="source-text-heading">
          Texte source
        </h3>
        <p className={styles.actionNote}>
          {sourceText.ok ? (
            <>
              Version&nbsp;{sourceText.value.versionNumber} ·{" "}
              {NUMBER_FORMAT.format(sourceText.value.wordCount)} mots ·{" "}
              {sourceText.value.versionCount === 1
                ? "une seule version"
                : `${NUMBER_FORMAT.format(sourceText.value.versionCount)} versions conservées`}
              . Chaque modification en crée une nouvelle&nbsp;; aucune n&apos;est jamais écrasée.
            </>
          ) : (
            "Ce projet ne contient pas encore de texte source."
          )}
        </p>
        <Link className={styles.actionLink} href={`/projects/${project.id}/source-text`}>
          Modifier le texte source…
        </Link>
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
    </>
  );
}

/**
 * `<ProjectDetails>`'s fallback — the same shape `loading.tsx` used to render
 * for the whole page, minus the back link and page shell that now render
 * immediately in `ProjectPage` itself.
 */
function ProjectDetailsSkeleton() {
  return (
    <div className={loadingStyles.skeleton} role="status" aria-live="polite">
      <span className="visually-hidden">Chargement du projet…</span>

      <div className={loadingStyles.header}>
        <SkeletonBlock height="2rem" width="16rem" />
        <SkeletonBlock height="1.5rem" width="6rem" />
      </div>

      <SkeletonBlock height="0.85rem" width="10rem" />

      <div className={loadingStyles.stats}>
        <SkeletonBlock height="2.5rem" width="8rem" />
        <SkeletonBlock height="2.5rem" width="8rem" />
      </div>

      <div className={loadingStyles.stepper}>
        {Array.from({ length: 9 }, (_, index) => (
          <SkeletonBlock key={index} className={loadingStyles.step} height="0.75rem" />
        ))}
      </div>

      <div className={loadingStyles.actions}>
        {[0, 1, 2].map((index) => (
          <div key={index} className={loadingStyles.action}>
            <SkeletonBlock height="1.1rem" width="30%" />
            <SkeletonBlock height="0.85rem" width="70%" />
            <SkeletonBlock height="2.25rem" width="10rem" />
          </div>
        ))}
      </div>
    </div>
  );
}
