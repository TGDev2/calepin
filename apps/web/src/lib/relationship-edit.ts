/**
 * The relationship screen's form state, its French sentences and its
 * `FormData` readers (CAL-091).
 *
 * Here rather than beside the actions because a `"use server"` module may
 * export only async functions — the division `lib/direction-edit.ts` already
 * draws, and the reason `lib/account-deletion-error.ts` exists at all.
 *
 * The messages are the interface layer's, as always: `@calepin/shared` decides
 * *that* a write is refused and `@calepin/bible` decides what a tie may say,
 * while the sentence an author reads is written here.
 */

/** What a relationship form knows after a submission. */
export type RelationshipFormState =
  { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const INITIAL_RELATIONSHIP_FORM_STATE: RelationshipFormState = { status: "idle" };

/** The tie the form named is gone, or was never this project's (§3.5). */
export const RELATIONSHIP_MISSING_MESSAGE =
  "Ce lien n'existe plus. Rechargez la page pour voir l'état actuel du réseau.";

export const RELATIONSHIP_WRITE_UNAVAILABLE_MESSAGE =
  "Le lien n'a pas pu être enregistré. Réessayez dans un instant.";

export const RELATIONSHIP_EDIT_UNAVAILABLE_MESSAGE =
  "Le lien n'a pas pu être modifié. Réessayez dans un instant.";

export const RELATIONSHIP_DELETE_UNAVAILABLE_MESSAGE =
  "Le lien n'a pas pu être supprimé. Réessayez dans un instant.";

/** The bible screen a successful write returns to. */
export function relationshipsPath(projectId: string): string {
  return `/projects/${projectId}/bible/relationships`;
}

/**
 * One trimmed field, or null when it is absent or blank — the three cases a
 * form conflates and a repository must not.
 */
export function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

/**
 * The three columns a tie carries, in the shape `parseRelationshipContent`
 * takes. Unvalidated on purpose: the domain owns every rule about what a tie
 * may say, and this only assembles what the form sent.
 */
export function readRelationshipContentSubmission(formData: FormData): unknown {
  return {
    type: formData.get("type"),
    label: readText(formData.get("label")),
    description: readText(formData.get("description")),
  };
}
