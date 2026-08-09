import {
  getProjectForOwner,
  getSourceText,
  listSourceTextVersions,
  openProjectScope,
  readSourceTextObsolescence,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ObsolescenceNotice } from "@/components/obsolescence-notice";
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
 * **No `<Suspense>` boundary around the editor.** One was tried and removed:
 * streaming this section behind a fallback delays the moment React actually
 * commits (and hydrates) the real `<textarea>` relative to the moment it
 * becomes visible on screen, which widens the exact window
 * `source-text-editor.tsx`'s own doc comment already warns about — text typed
 * before a `defaultValue` field's hydration commit is silently overwritten,
 * because React re-syncs `.value` from the server-rendered raw text once, on
 * mount. An end-to-end run that filled the field immediately after
 * navigation reproduced it reliably. The query this page runs is a handful of
 * indexed reads, so the skeleton bought a flash of loading UI on a fast
 * connection at the cost of a real data-loss window on a slow one — the
 * `notFound()` this fetch could throw is provably unreachable to begin with
 * (a project always has a source text; the wizard writes both in one
 * transaction), so the boundary was not protecting a status code either.
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

  const [current, versions, obsolescence] = await Promise.all([
    getSourceText(scope.value),
    listSourceTextVersions(scope.value),
    readSourceTextObsolescence(scope.value),
  ]);
  if (!current.ok) notFound();

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href={`/projects/${projectId}`}>← {found.value.title}</Link>
      </p>

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
    </main>
  );
}
