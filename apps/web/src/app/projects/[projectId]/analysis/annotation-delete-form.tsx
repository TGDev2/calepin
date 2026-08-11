"use client";

/**
 * Removing one free note (CAL-073).
 *
 * A form rather than a link, because deleting is not something a prefetch or a
 * crawler may do. `useActionState` for the same reason as its two siblings —
 * the action is a prop, never an import (the CAL-039 trap), and a refusal shows
 * a sentence instead of vanishing into a redirect.
 */

import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { type AnalysisEditState, INITIAL_ANALYSIS_EDIT_STATE } from "@/lib/analysis-edit";

import styles from "./annotation-delete-form.module.css";

export interface AnnotationDeleteFormProps {
  readonly projectId: string;
  readonly section: string;
  readonly annotationId: string;
  readonly action: (previous: AnalysisEditState, formData: FormData) => Promise<AnalysisEditState>;
}

export function AnnotationDeleteForm({
  projectId,
  section,
  annotationId,
  action,
}: AnnotationDeleteFormProps) {
  const [state, formAction] = useActionState(action, INITIAL_ANALYSIS_EDIT_STATE);

  return (
    <form className={styles.form} action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="annotationId" value={annotationId} />

      {/*
        "la note" rather than "Supprimer": a section holds its own Modifier
        link and, in edit mode, a "Supprimer cet élément" checkbox per row. Two
        controls with the same accessible name inside one section is ambiguous
        for a screen reader before it is ambiguous for a test.
      */}
      <SubmitButton className={styles.button} variant="danger" pendingLabel="Suppression…">
        Supprimer la note
      </SubmitButton>

      {state.status === "error" ? (
        <span className={styles.error} role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
