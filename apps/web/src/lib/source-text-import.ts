/**
 * Importing a source text from an uploaded `.txt`, `.md` or `.docx` file
 * (CAL-047) — the shape the action and the shared client component agree on.
 *
 * Lives here rather than beside the action for the reason `source-text-edit.ts`
 * already states (CAL-031, CAL-046): a `"use server"` module may export
 * nothing but async functions, so the result type and its French messages go
 * in a plain module instead.
 *
 * **This is shared by two screens** — the project-creation wizard's
 * `sourceText` step and the post-creation editor at
 * `/projects/[projectId]/source-text` — which is also why the action lives in
 * `lib/` rather than under either route's own `actions.ts`.
 */

/** What the action hands back to `<SourceTextFileImport>`. */
export type SourceTextImportResult =
  | { readonly ok: true; readonly content: string }
  | { readonly ok: false; readonly message: string };

export const SOURCE_TEXT_IMPORT_NO_FILE_MESSAGE = "Choisissez un fichier .txt, .md ou .docx.";

/**
 * The one sentence shown when extraction failed for a reason the reader
 * cannot act on. Anything the extractor itself refused for — an unsupported
 * format, a file too large, a corrupt `.docx` — carries its own French
 * `userMessage` instead (`@calepin/shared/source-text-import`), so this is
 * only the fallback for an unexpected failure.
 */
export const SOURCE_TEXT_IMPORT_UNAVAILABLE_MESSAGE =
  "Le fichier n'a pas pu être importé. Réessayez, ou saisissez votre texte directement.";

/** The uploaded file, or `null` when the field carries nothing usable. */
export function readImportedFile(formData: FormData): File | null {
  const value = formData.get("file");

  return value instanceof File && value.size > 0 ? value : null;
}
