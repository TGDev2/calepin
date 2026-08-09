/**
 * The source-text editor's shared vocabulary (CAL-046): the check the action
 * runs on what was posted, and the state the form and the action agree on.
 *
 * Both halves live here rather than beside the action for the reason CAL-031
 * recorded: a `"use server"` module may export nothing but async functions, so a
 * type or a message table put there refuses to build. And the check has to be
 * one function anyway — the form's `required` and `maxLength` are hints a client
 * can switch off, this is the check that decides.
 *
 * The word limit itself is deliberately *not* re-implemented here.
 * `@calepin/shared/text` owns it, the counter under the textarea reads it, and
 * `updateSourceText` enforces it against every caller. A second ceiling written
 * on this side is a second answer able to disagree with the stored one.
 */

/** What the form and the action pass back and forth. */
export type SourceTextEditState =
  | { readonly status: "idle" }
  /** Written, and the version it became. */
  | { readonly status: "saved"; readonly versionNumber: number }
  /** Submitted unchanged: nothing was written, and saying so beats silence. */
  | { readonly status: "unchanged"; readonly versionNumber: number }
  | { readonly status: "error"; readonly message: string };

export const INITIAL_SOURCE_TEXT_EDIT_STATE: SourceTextEditState = { status: "idle" };

/**
 * The one sentence shown when the write failed for a reason the reader cannot
 * act on. The reassurance is the load-bearing half: this screen's whole promise
 * is that nothing is destroyed, so a failure has to say the previous version is
 * still there.
 */
export const SOURCE_TEXT_EDIT_UNAVAILABLE_MESSAGE =
  "La modification n'a pas pu être enregistrée. La version précédente de votre texte est intacte. Réessayez dans un instant.";

export const SOURCE_TEXT_EMPTY_MESSAGE = "Le texte source ne peut pas être vide.";

export const SOURCE_TEXT_MISSING_MESSAGE = "Ce projet n'existe plus, ou il ne vous appartient pas.";

/**
 * The posted text, or `null` when there is nothing usable in the field.
 *
 * Only emptiness is decided here. Normalisation and the word count belong to
 * `@calepin/shared/text` and run in the repository, against the exact string
 * that gets stored — a trim applied on this side as well would make the two
 * disagree about what "empty" means the moment one of them changes.
 */
export function readSourceTextContent(value: unknown): string | null {
  if (typeof value !== "string") return null;

  return value.trim() === "" ? null : value;
}
