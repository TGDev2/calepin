"use client";

/**
 * Importing a source text from a `.txt`, `.md` or `.docx` file (CAL-047).
 *
 * Shared by the project-creation wizard's `sourceText` step and the
 * post-creation editor at `/projects/[projectId]/source-text` — the two
 * screens that already hold the field this fills. `onImported` hands the
 * extracted, cleaned text back to the caller, which sets it exactly as if
 * the author had typed it: nothing here submits a form or writes anything,
 * so the 2 000-word limit stays enforced exactly once, where it already was
 * (`updateSourceText`/`createProjectWithSourceText`, both in
 * `@calepin/shared/repository`).
 *
 * **The action arrives as a prop and is never imported**, the rule every
 * client component touching a `"use server"` module follows in this codebase
 * (`tasks/lessons.md`, CAL-039/CAL-046): importing one as a value pulls in
 * whatever it imports too, here `@/lib/auth` by way of `getCurrentUser`.
 *
 * **Not a `<form>`.** The wizard already wraps its whole six-step draft in
 * one `<form>`, and a nested `<form>` is invalid HTML — so the file input
 * calls the action directly from `onChange`, inside a transition, the same
 * way a poll or a one-off mutation not tied to a `<form>` would.
 */

import { useId, useRef, useState, useTransition } from "react";

import type { SourceTextImportResult } from "@/lib/source-text-import";

import styles from "./source-text-file-import.module.css";

export interface SourceTextFileImportProps {
  readonly action: (formData: FormData) => Promise<SourceTextImportResult>;
  readonly onImported: (content: string) => void;
  readonly label?: string;
}

const ACCEPTED_EXTENSIONS = ".txt,.md,.docx";

export function SourceTextFileImport({
  action,
  onImported,
  label = "Importer un fichier (.txt, .md ou .docx)",
}: SourceTextFileImportProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const result = await action(formData);

      // Cleared either way, so re-selecting the same file after a refusal —
      // an author fixing a `.doc` saved as `.docx`, say — fires `onChange`
      // again; a browser does not fire it a second time for the same value.
      if (inputRef.current) inputRef.current.value = "";

      if (result.ok) {
        onImported(result.content);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className={styles.import}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className={styles.input}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleChange}
        disabled={pending}
        aria-describedby={error ? errorId : undefined}
      />
      {pending ? (
        <span className={styles.status} role="status">
          Importation en cours…
        </span>
      ) : null}
      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
