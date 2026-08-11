"use client";

/**
 * Writing or rewriting one free note on one element (CAL-073).
 *
 * Same shape as `SectionEditor` and for the same two reasons: the action is a
 * prop rather than an import (the CAL-039 trap in `tasks/lessons.md`), and a
 * refusal comes back as state so the note the author just wrote is still in the
 * field. The form posts with JavaScript off too.
 *
 * The note is attached to a **lineage**, not to a row of the current revision.
 * Nothing on this side has to know that; it matters because it is why the note
 * is still here after the section around it has been rewritten.
 */

import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { type AnalysisEditState, INITIAL_ANALYSIS_EDIT_STATE } from "@/lib/analysis-edit";

import styles from "./annotation-form.module.css";

export interface AnnotationFormProps {
  readonly projectId: string;
  readonly section: string;
  /** Set when writing a new note; `annotationId` is set when rewriting one. */
  readonly lineageId?: string;
  readonly annotationId?: string;
  readonly body?: string;
  readonly cancelHref: string;
  readonly action: (previous: AnalysisEditState, formData: FormData) => Promise<AnalysisEditState>;
}

export function AnnotationForm({
  projectId,
  section,
  lineageId,
  annotationId,
  body,
  cancelHref,
  action,
}: AnnotationFormProps) {
  const [state, formAction] = useActionState(action, INITIAL_ANALYSIS_EDIT_STATE);

  return (
    <form className={styles.form} action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="section" value={section} />
      {lineageId === undefined ? null : <input type="hidden" name="lineageId" value={lineageId} />}
      {annotationId === undefined ? null : (
        <input type="hidden" name="annotationId" value={annotationId} />
      )}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Votre note sur cet élément</span>
        <textarea className={styles.textarea} name="body" rows={3} defaultValue={body ?? ""} />
      </label>

      {state.status === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      <div className={styles.actions}>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer la note</SubmitButton>
        <a className={styles.cancel} href={cancelHref}>
          Annuler
        </a>
      </div>
    </form>
  );
}
