import {
  getProjectForOwner,
  getSourceText,
  listSourceTextVersions,
  openProjectScope,
  type ProjectScope,
  readSourceTextObsolescence,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ObsolescenceNotice } from "@/components/obsolescence-notice";
import { SkeletonBlock } from "@/components/skeleton";
import { SourceTextEditor } from "@/components/source-text-editor";
import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";
import { importSourceTextFileAction } from "@/lib/source-text-import-action";

import { updateSourceTextAction } from "./actions";
import styles from "./page.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });
const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

/**
 * The source text, after the project exists (CAL-046).
 *
 * Three things on one screen, in the order they matter: what an edit would put
 * in doubt, the text itself, and the versions already kept. The warning comes
 * first deliberately — it is the fact that changes what the author decides to
 * type, and a consequence discovered after the save is a consequence discovered
 * too late.
 *
 * A screen of its own rather than a section of the project page: a
 * two-thousand-word field is not something to scroll past on the way to the
 * archive button, and the project page already links here. Same shape as
 * `/projects/[projectId]/delete`.
 *
 * **The ownership check runs above any `<Suspense>` boundary**, for the reason
 * the project page's own doc comment sets out: Next commits the HTTP status at
 * the first suspension, so a `notFound()` thrown after that point renders the
 * 404 UI with a 200. A project that is not yours and one that does not exist are
 * the same answer, because the repository refuses to tell them apart.
 */
export default async function SourceTextPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(`/projects/${projectId}/source-text`));

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);
  if (!found.ok || !scope.ok) notFound();

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href={`/projects/${projectId}`}>← {found.value.title}</Link>
      </p>

      <Suspense fallback={<SourceTextSkeleton />}>
        <SourceTextSection scope={scope.value} projectId={projectId} />
      </Suspense>
    </main>
  );
}

interface SourceTextSectionProps {
  readonly scope: ProjectScope;
  readonly projectId: string;
}

async function SourceTextSection({ scope, projectId }: SourceTextSectionProps) {
  const [current, versions, obsolescence] = await Promise.all([
    getSourceText(scope),
    listSourceTextVersions(scope),
    readSourceTextObsolescence(scope),
  ]);

  // A project always has a source text — the wizard writes both in one
  // transaction — so its absence is a graph nothing in the product can produce.
  if (!current.ok) notFound();

  return (
    <>
      {obsolescence.ok ? <ObsolescenceNotice report={obsolescence.value} /> : null}

      <SourceTextEditor
        projectId={projectId}
        content={current.value.content}
        versionNumber={current.value.versionNumber}
        action={updateSourceTextAction}
        importSourceTextFileAction={importSourceTextFileAction}
      />

      <section className={styles.history} aria-labelledby="history-heading">
        <h2 className={styles.historyTitle} id="history-heading">
          Versions conservées
        </h2>
        <p className={styles.historyNote}>
          Chaque modification est ajoutée à cette liste. Aucune version n&apos;est supprimée.
        </p>

        <ol className={styles.versions}>
          {(versions.ok ? versions.value : []).map((version) => (
            <li key={version.versionNumber} className={styles.version}>
              <span className={styles.versionNumber}>Version&nbsp;{version.versionNumber}</span>
              <span className={styles.versionFacts}>
                {NUMBER_FORMAT.format(version.wordCount)} mots ·{" "}
                <time dateTime={version.createdAt.toISOString()}>
                  {DATE_FORMAT.format(version.createdAt)}
                </time>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function SourceTextSkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-live="polite">
      <span className="visually-hidden">Chargement du texte source…</span>

      <SkeletonBlock height="1.5rem" width="12rem" />
      <SkeletonBlock height="18rem" />
      <SkeletonBlock height="2.25rem" width="16rem" />
    </div>
  );
}
