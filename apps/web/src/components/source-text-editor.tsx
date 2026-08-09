"use client";

/**
 * Editing the source text after the project exists (CAL-046).
 *
 * **The action arrives as a prop and is never imported.** A client component
 * importing a `"use server"` module as a value pulls in whatever that module
 * imports too — here that would reach `@/lib/auth`, which validates the
 * environment at import time and turns every unit test of this file into a
 * configuration error. The trap is in `tasks/lessons.md` under CAL-039; only the
 * *type* is imported, and type-only.
 *
 * **The typed text survives a refusal.** That is why this uses `useActionState`
 * rather than the project screen's redirect-with-a-code shape: two thousand
 * words are not something to lose because the server said the text was too long.
 * The state comes back beside the textarea, which still holds what was typed.
 *
 * **The counter is the same one the wizard uses**, reading the same
 * `measureSourceText` the repository counts with, so the number under the field
 * and the number stored on the version cannot disagree (CAL-041).
 *
 * **The field is uncontrolled, and that is not a shortcut.** A controlled
 * `value` is reset to its prop when React hydrates, so anything typed into the
 * server-rendered form before the JavaScript arrives is silently discarded —
 * the browser holds the text, React replaces it, and the author watches a
 * paragraph vanish. `defaultValue` leaves the DOM in charge of the text and
 * keeps `useState` for the counter alone, which merely lags by one keystroke in
 * that window instead of destroying input. An end-to-end run found this: a spec
 * that filled the field immediately after loading the page submitted the
 * original text.
 *
 * The submit control is never disabled by client state. An over-limit text is
 * refused by the server, and a button that greys itself out is a check a
 * visitor with JavaScript off does not get.
 *
 * **A file import (CAL-047) sets the field the same way a paste does** — the
 * DOM already owns the value, so the imported text is written straight onto
 * the textarea through a `ref` (`textareaRef.current.value = …`), and `text`
 * is updated alongside it so the counter reflects it immediately. No
 * `defaultValue`-breaking re-render involved, the same reasoning that keeps
 * the field uncontrolled in the first place.
 */

import { SOURCE_TEXT_MAX_WORDS } from "@calepin/shared/text";
import { useActionState, useRef, useState } from "react";

import { INITIAL_SOURCE_TEXT_EDIT_STATE, type SourceTextEditState } from "@/lib/source-text-edit";
import type { SourceTextImportResult } from "@/lib/source-text-import";

import { SourceTextCounter } from "./source-text-counter";
import styles from "./source-text-editor.module.css";
import { SourceTextFileImport } from "./source-text-file-import";
import { SubmitButton } from "./submit-button";

const COUNTER_ID = "source-text-editor-counter";
const FIELD_ID = "source-text-editor-field";

export interface SourceTextEditorProps {
  readonly projectId: string;
  /** The current version's text, as stored. */
  readonly content: string;
  readonly versionNumber: number;
  readonly action: (
    previous: SourceTextEditState,
    formData: FormData,
  ) => Promise<SourceTextEditState>;
  readonly importSourceTextFileAction: (formData: FormData) => Promise<SourceTextImportResult>;
}

/** The sentence under the button, once something has been submitted. */
function feedbackFor(state: SourceTextEditState): { message: string; isError: boolean } | null {
  switch (state.status) {
    case "idle":
      return null;
    case "saved":
      return {
        message: `Version ${state.versionNumber} enregistrée. Les versions précédentes sont conservées.`,
        isError: false,
      };
    case "unchanged":
      return {
        message: `Le texte est identique à la version ${state.versionNumber}. Aucune nouvelle version n'a été créée.`,
        isError: false,
      };
    case "error":
      return { message: state.message, isError: true };
  }
}

export function SourceTextEditor({
  projectId,
  content,
  versionNumber,
  action,
  importSourceTextFileAction,
}: SourceTextEditorProps) {
  const [state, formAction] = useActionState(action, INITIAL_SOURCE_TEXT_EDIT_STATE);
  /** What the counter reads. The field itself is the DOM's — see the doc above. */
  const [text, setText] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const feedback = feedbackFor(state);

  function handleImported(imported: string) {
    if (textareaRef.current) textareaRef.current.value = imported;
    setText(imported);
  }

  return (
    <section className={styles.editor} aria-labelledby="source-text-heading">
      <h2 className={styles.title} id="source-text-heading">
        Texte source
      </h2>
      <p className={styles.note}>
        Chaque enregistrement crée une nouvelle version&nbsp;; aucune version n&apos;est jamais
        écrasée. Vous en êtes à la version&nbsp;{versionNumber}.
      </p>

      <form action={formAction} className={styles.form}>
        <input type="hidden" name="projectId" value={projectId} />

        <label className={styles.label} htmlFor={FIELD_ID}>
          Votre texte de départ
        </label>
        <SourceTextFileImport action={importSourceTextFileAction} onImported={handleImported} />
        <textarea
          ref={textareaRef}
          id={FIELD_ID}
          name="content"
          className={styles.field}
          defaultValue={content}
          onChange={(event) => setText(event.target.value)}
          rows={18}
          required
          aria-required="true"
          aria-describedby={COUNTER_ID}
          spellCheck
        />

        <SourceTextCounter text={text} id={COUNTER_ID} />

        {feedback === null ? null : (
          <p
            className={feedback.isError ? styles.error : styles.confirmation}
            role={feedback.isError ? "alert" : "status"}
          >
            {feedback.isError ? <strong>Erreur&nbsp;: </strong> : null}
            {feedback.message}
          </p>
        )}

        <div className={styles.actions}>
          <SubmitButton pendingLabel="Enregistrement…">
            Enregistrer une nouvelle version
          </SubmitButton>
          <span className={styles.limit}>Limite&nbsp;: {SOURCE_TEXT_MAX_WORDS} mots.</span>
        </div>
      </form>
    </section>
  );
}
