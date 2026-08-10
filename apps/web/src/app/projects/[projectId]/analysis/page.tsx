import { ANALYSIS_SECTIONS } from "@calepin/analysis";
import { getAnalysis, getProjectForOwner, openProjectScope } from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import { ElementKindBadge } from "./element-kind-badge";
import styles from "./page.module.css";
import { SECTION_META } from "./section-metadata";

/**
 * The narrative diagnostic, in its seventeen sections (CAL-072).
 *
 * Read-only: editing and annotating an element is CAL-073's screen. Every
 * element carries its marker — fait or interprétation — as an icon and a
 * visible label rather than color alone (`ElementKindBadge`), and the four
 * specialised notions the backlog names (point de vue, focalisation, promesse
 * narrative, arc dramatique) carry a short explanation on hover and on
 * keyboard focus (`TermHint`, wired in `section-metadata.tsx`).
 *
 * **No `<Suspense>` boundary**, for the same reason `source-text/page.tsx`
 * has none: the ownership check must resolve before anything renders so
 * `notFound()` can still set a real 404 status, and the query behind it is a
 * handful of indexed reads — not slow enough to be worth streaming behind a
 * skeleton.
 */
export default async function AnalysisPage({
  params,
}: PageProps<"/projects/[projectId]/analysis">) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(`/projects/${projectId}/analysis`));

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);
  if (!found.ok || !scope.ok) notFound();

  const analysis = await getAnalysis(scope.value);

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href={`/projects/${projectId}`}>← {found.value.title}</Link>
      </p>

      <h1 className={styles.title}>Diagnostic narratif</h1>

      {analysis === null ? (
        <p className={styles.empty}>
          Aucune analyse n&apos;a encore été réalisée pour ce texte source.
        </p>
      ) : (
        <>
          <p className={styles.intro}>
            Chaque élément est marqué <ElementKindBadge kind="FACTUAL" /> quand le texte le dit
            explicitement, ou <ElementKindBadge kind="INTERPRETATION" /> quand il s&apos;agit
            d&apos;une lecture proposée par l&apos;analyse, à discuter.
          </p>

          <div className={styles.sections}>
            {ANALYSIS_SECTIONS.map((section) => {
              const meta = SECTION_META[section];
              const current = analysis.sections.find((entry) => entry.section === section);
              const elements = current?.elements ?? [];
              const headingId = `section-${section}`;

              return (
                <section key={section} className={styles.section} aria-labelledby={headingId}>
                  <h2 className={styles.sectionTitle} id={headingId}>
                    {meta.title}
                  </h2>
                  <p className={styles.sectionSubtitle}>{meta.subtitle}</p>

                  {elements.length === 0 ? (
                    <p className={styles.sectionEmpty}>{meta.emptyNote}</p>
                  ) : (
                    <ul className={styles.elements}>
                      {elements.map((element, index) => (
                        <li key={index} className={styles.element}>
                          <div className={styles.elementHead}>
                            {element.label === null ? null : (
                              <span className={styles.elementLabel}>{element.label}</span>
                            )}
                            <ElementKindBadge kind={element.kind} />
                          </div>
                          <p className={styles.elementStatement}>{element.statement}</p>
                          {element.evidence === null ? null : (
                            <blockquote className={styles.evidence}>
                              « {element.evidence} »
                            </blockquote>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
