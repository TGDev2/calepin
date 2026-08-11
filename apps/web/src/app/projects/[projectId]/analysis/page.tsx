import {
  ANALYSIS_FIXED_KINDS,
  ANALYSIS_SECTIONS,
  type AnalysisSection,
  analysisSectionElementLimit,
  isListedAnalysisSection,
} from "@calepin/analysis";
import {
  type AnalysisElementSnapshot,
  type AnalysisSectionSnapshot,
  getAnalysis,
  getProjectForOwner,
  openProjectScope,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { analysisPath, readAnalysisSection } from "@/lib/analysis-edit";
import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import {
  addAnalysisAnnotationAction,
  deleteAnalysisAnnotationAction,
  editAnalysisSectionAction,
  updateAnalysisAnnotationAction,
} from "./actions";
import { AnnotationDeleteForm } from "./annotation-delete-form";
import { AnnotationForm } from "./annotation-form";
import { ElementKindBadge } from "./element-kind-badge";
import styles from "./page.module.css";
import { ProvenanceBadge } from "./provenance-badge";
import { SectionEditor, type SectionEditorRow } from "./section-editor";
import { SECTION_META } from "./section-metadata";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

/**
 * The narrative diagnostic, in its seventeen sections (CAL-072), now editable
 * and annotable section by section (CAL-073).
 *
 * **Two markers per element, and neither depends on colour.** `ElementKindBadge`
 * says whether the element is a fact of the text or a reading of it;
 * `ProvenanceBadge` says where it came from — proposed, validated, rewritten or
 * written by the author. The second one is the point of CAL-073: it is still
 * accurate after any number of edits, because the origin travels with the
 * element's lineage rather than with the revision it happens to sit in.
 *
 * **One form at a time, opened by the URL.** `?edit=<SECTION>` opens a
 * section's editor, `?note=<id>` opens one note's form and `?note=add:<lineage>`
 * opens a blank one. No client state decides what is on
 * screen, so every affordance is a plain link and the page works with
 * JavaScript off — the constraint CAL-072 set for the term hints, applied to
 * the editing surface.
 *
 * **No `<Suspense>` boundary**, for the same reason `source-text/page.tsx` has
 * none: the ownership check must resolve before anything renders so
 * `notFound()` can still set a real 404 status.
 */
export default async function AnalysisPage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]/analysis">) {
  const { projectId } = await params;
  const query = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(analysisPath(projectId)));

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);
  if (!found.ok || !scope.ok) notFound();

  const analysis = await getAnalysis(scope.value);

  const editable = analysis !== null && analysis.validatedAt === null;
  const editing = editable ? readAnalysisSection(first(query.edit)) : null;
  const note = first(query.note);

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

          <p className={styles.intro}>
            Un second marqueur dit d&apos;où vient chaque élément et le reste après vos
            modifications : <ProvenanceBadge provenance="proposed" />{" "}
            <ProvenanceBadge provenance="accepted" /> <ProvenanceBadge provenance="edited" />{" "}
            <ProvenanceBadge provenance="user-written" />
          </p>

          {analysis.validatedAt === null ? null : (
            <p className={styles.locked}>
              Analyse validée le {DATE_FORMAT.format(analysis.validatedAt)} : elle n&apos;est plus
              modifiable.
            </p>
          )}

          <div className={styles.sections}>
            {ANALYSIS_SECTIONS.map((section) => {
              const meta = SECTION_META[section];
              const current = analysis.sections.find((entry) => entry.section === section);
              const headingId = `section-${section}`;

              return (
                <section
                  key={section}
                  id={headingId}
                  className={styles.section}
                  aria-labelledby={`${headingId}-title`}
                >
                  <div className={styles.sectionHead}>
                    <div>
                      <h2 className={styles.sectionTitle} id={`${headingId}-title`}>
                        {meta.title}
                      </h2>
                      <p className={styles.sectionSubtitle}>{meta.subtitle}</p>
                    </div>

                    {editing === section || analysis.validatedAt !== null ? null : (
                      <Link
                        className={styles.edit}
                        href={`${analysisPath(projectId, { edit: section })}#${headingId}`}
                      >
                        Modifier
                      </Link>
                    )}
                  </div>

                  {editing === section ? (
                    <SectionEditor
                      projectId={projectId}
                      section={section}
                      listed={isListedAnalysisSection(section)}
                      fixedKind={
                        ANALYSIS_FIXED_KINDS[section as keyof typeof ANALYSIS_FIXED_KINDS] ?? null
                      }
                      rows={editorRows(section, current)}
                      cancelHref={`${analysisPath(projectId)}#${headingId}`}
                      action={editAnalysisSectionAction}
                    />
                  ) : (
                    <SectionContent
                      projectId={projectId}
                      section={section}
                      headingId={headingId}
                      emptyNote={meta.emptyNote}
                      elements={current?.elements ?? []}
                      openNote={note}
                    />
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

interface SectionContentProps {
  readonly projectId: string;
  readonly section: AnalysisSection;
  readonly headingId: string;
  readonly emptyNote: string;
  readonly elements: readonly AnalysisElementSnapshot[];
  readonly openNote: string | null;
}

function SectionContent({
  projectId,
  section,
  headingId,
  emptyNote,
  elements,
  openNote,
}: SectionContentProps) {
  if (elements.length === 0) return <p className={styles.sectionEmpty}>{emptyNote}</p>;

  return (
    <ul className={styles.elements}>
      {elements.map((element) => {
        const addingNote = openNote === `add:${element.lineageId}`;

        return (
          <li key={element.lineageId} className={styles.element}>
            <div className={styles.elementHead}>
              {element.label === null ? null : (
                <span className={styles.elementLabel}>{element.label}</span>
              )}
              <ElementKindBadge kind={element.kind} />
              <ProvenanceBadge provenance={element.provenance} />
            </div>

            <p className={styles.elementStatement}>{element.statement}</p>

            {element.evidence === null ? null : (
              <blockquote className={styles.evidence}>« {element.evidence} »</blockquote>
            )}

            {element.annotations.length === 0 ? null : (
              <ul className={styles.notes}>
                {element.annotations.map((annotation) =>
                  openNote === annotation.id ? (
                    <li key={annotation.id} className={styles.note}>
                      <AnnotationForm
                        projectId={projectId}
                        section={section}
                        annotationId={annotation.id}
                        body={annotation.body}
                        cancelHref={`${analysisPath(projectId)}#${headingId}`}
                        action={updateAnalysisAnnotationAction}
                      />
                    </li>
                  ) : (
                    <li key={annotation.id} className={styles.note}>
                      <p className={styles.noteBody}>{annotation.body}</p>
                      <div className={styles.noteActions}>
                        <Link
                          className={styles.noteAction}
                          href={`${analysisPath(projectId, { note: annotation.id })}#${headingId}`}
                        >
                          Modifier la note
                        </Link>
                        <AnnotationDeleteForm
                          projectId={projectId}
                          section={section}
                          annotationId={annotation.id}
                          action={deleteAnalysisAnnotationAction}
                        />
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}

            {addingNote ? (
              <AnnotationForm
                projectId={projectId}
                section={section}
                lineageId={element.lineageId}
                cancelHref={`${analysisPath(projectId)}#${headingId}`}
                action={addAnalysisAnnotationAction}
              />
            ) : (
              <Link
                className={styles.annotate}
                href={`${analysisPath(projectId, { note: `add:${element.lineageId}` })}#${headingId}`}
              >
                Annoter
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The rows the editor renders: every element the section holds, plus the spare
 * slots the author can fill.
 *
 * The number of spares is bounded by the section's own maximum
 * (`analysisSectionElementLimit`), so the form never offers a row the schema is
 * about to refuse. A paragraph section gets exactly one row and no spare — it
 * is one element by definition, and an empty one is rendered so a section the
 * generation left blank can still be written by hand.
 */
function editorRows(
  section: AnalysisSection,
  current: AnalysisSectionSnapshot | undefined,
): readonly SectionEditorRow[] {
  const existing: SectionEditorRow[] = (current?.elements ?? []).map((element) => ({
    lineageId: element.lineageId,
    kind: element.kind,
    label: element.label,
    statement: element.statement,
    evidence: element.evidence,
    provenance: element.provenance,
  }));

  const spares = Math.max(
    0,
    Math.min(SPARE_ROWS, analysisSectionElementLimit(section) - existing.length),
  );
  const blank: SectionEditorRow = {
    lineageId: null,
    kind: null,
    label: null,
    statement: "",
    evidence: null,
    provenance: null,
  };

  if (existing.length === 0 && spares === 0) return [blank];

  return [...existing, ...Array.from({ length: spares }, () => blank)];
}

/** How many blank rows an editor offers at once. Saving again offers more. */
const SPARE_ROWS = 2;

/** A repeated query parameter is a browser's business, not this page's. */
function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;

  return value ?? null;
}
