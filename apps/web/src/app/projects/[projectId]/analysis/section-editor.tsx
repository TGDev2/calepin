"use client";

/**
 * One section of the diagnostic, in edit mode (CAL-073).
 *
 * **The action arrives as a prop and is never imported.** A client component
 * importing a `"use server"` module as a value pulls in whatever that module
 * imports too, which here reaches `@/lib/auth` and turns every unit test of
 * this file into a configuration error. The trap is in `tasks/lessons.md` under
 * CAL-039; only the *type* is imported, and type-only.
 *
 * **A refusal keeps what was typed.** `useActionState` rather than the project
 * screen's redirect-with-a-code shape, for `SourceTextEditor`'s reason: a
 * section can hold ten elements the author just wrote, and answering "that
 * label is too long" by emptying the form is not an answer. The fields are
 * uncontrolled, so React re-rendering with the same server props leaves the DOM
 * text alone.
 *
 * **It works with JavaScript off.** The form posts to the server action either
 * way; without JavaScript the submit button simply never changes its label, and
 * the spare rows below are plain markup rather than something a script adds.
 *
 * **Every existing row carries its lineage in a hidden field.** That is the
 * whole traceability mechanism seen from the browser: the identity travels back
 * with the text, so an element the author did not touch is recognised as the
 * same element and keeps saying who wrote it.
 */

import type { AnalysisElementKind } from "@calepin/analysis";
import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";
import {
  type AnalysisEditState,
  INITIAL_ANALYSIS_EDIT_STATE,
  PROVENANCE_LABELS,
} from "@/lib/analysis-edit";

import styles from "./section-editor.module.css";

/** One row of the form: an element that exists, or a blank slot for a new one. */
export interface SectionEditorRow {
  readonly lineageId: string | null;
  readonly kind: AnalysisElementKind | null;
  readonly label: string | null;
  readonly statement: string;
  readonly evidence: string | null;
  /** What the badge said before the edit — null for a blank row. */
  readonly provenance: keyof typeof PROVENANCE_LABELS | null;
}

export interface SectionEditorProps {
  readonly projectId: string;
  readonly section: string;
  /** `false` for a paragraph section: one element, no label, nothing to add. */
  readonly listed: boolean;
  /** Set when the section's own definition decides the marker (CAL-070). */
  readonly fixedKind: AnalysisElementKind | null;
  readonly rows: readonly SectionEditorRow[];
  readonly cancelHref: string;
  readonly action: (previous: AnalysisEditState, formData: FormData) => Promise<AnalysisEditState>;
}

const KIND_OPTIONS: readonly { value: AnalysisElementKind; label: string }[] = [
  { value: "FACTUAL", label: "Fait explicite — le texte le dit" },
  { value: "INTERPRETATION", label: "Interprétation — une lecture proposée" },
];

export function SectionEditor({
  projectId,
  section,
  listed,
  fixedKind,
  rows,
  cancelHref,
  action,
}: SectionEditorProps) {
  const [state, formAction] = useActionState(action, INITIAL_ANALYSIS_EDIT_STATE);

  return (
    <form className={styles.form} action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="rowCount" value={rows.length} />

      <p className={styles.guidance}>
        Ce que vous réécrivez est signalé comme votre modification ; ce que vous laissez tel quel
        reste identifié comme une proposition de l&apos;analyse, que vous avez validée en
        enregistrant.
      </p>

      <ol className={styles.rows}>
        {rows.map((row, index) => (
          <li className={styles.row} key={row.lineageId ?? `new-${index}`}>
            <div className={styles.rowHead}>
              <span className={styles.rowOrigin}>
                {row.provenance === null
                  ? "Nouvel élément"
                  : PROVENANCE_LABELS[row.provenance].label}
              </span>

              {row.lineageId === null ? null : (
                <label className={styles.remove}>
                  <input type="checkbox" name={`remove.${index}`} value="1" />
                  Supprimer cet élément
                </label>
              )}
            </div>

            {row.lineageId === null ? null : (
              <input type="hidden" name={`lineage.${index}`} value={row.lineageId} />
            )}

            {fixedKind === null ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Nature</span>
                <select
                  className={styles.select}
                  name={`kind.${index}`}
                  defaultValue={row.kind ?? "INTERPRETATION"}
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name={`kind.${index}`} value={fixedKind} />
            )}

            {listed ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Intitulé</span>
                <input
                  className={styles.input}
                  type="text"
                  name={`label.${index}`}
                  defaultValue={row.label ?? ""}
                />
              </label>
            ) : null}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Énoncé</span>
              <textarea
                className={styles.textarea}
                name={`statement.${index}`}
                rows={listed ? 3 : 6}
                defaultValue={row.statement}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Passage du texte source à l&apos;appui <em>(facultatif)</em>
              </span>
              <textarea
                className={styles.textarea}
                name={`evidence.${index}`}
                rows={2}
                defaultValue={row.evidence ?? ""}
              />
            </label>
          </li>
        ))}
      </ol>

      {state.status === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      <div className={styles.actions}>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer cette section</SubmitButton>
        <a className={styles.cancel} href={cancelHref}>
          Annuler
        </a>
      </div>
    </form>
  );
}
