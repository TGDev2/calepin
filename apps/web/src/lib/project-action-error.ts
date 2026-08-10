/**
 * Why an action on a project did not happen (CAL-035), turned into the French
 * sentence the project screen shows.
 *
 * The same shape as `account-deletion-error.ts`, and for the same reasons: the
 * reason travels back on the page's own URL, so it carries a closed code and
 * never a message — still less one built from what the visitor typed (§7, §9) —
 * and the set is deliberately coarse. A code exists when the reader can do
 * something different because of it.
 *
 * `missing` covers both halves of the repository's `NOT_FOUND`: the project is
 * gone, or it was never theirs. The layer underneath refuses to tell those
 * apart (CLAUDE.md §3.5), and a screen that did would reopen the leak.
 */

export const PROJECT_ACTION_ERRORS = [
  "title",
  "confirmation",
  "missing",
  "generation",
  "unavailable",
] as const;
export type ProjectActionError = (typeof PROJECT_ACTION_ERRORS)[number];

const MESSAGES: Record<ProjectActionError, string> = {
  title: "Le titre ne peut pas être vide et ne peut pas dépasser 200 caractères.",
  confirmation:
    "Le titre saisi ne correspond pas à celui du projet. Aucune donnée n'a été supprimée.",
  missing: "Ce projet n'existe plus, ou il ne vous appartient pas.",
  // A replay that arrived too late (CAL-063): the generation has finished, or it
  // is running again, since the page was rendered. Not a failure of anything —
  // a reload shows the truth, so the message points at the reload.
  generation:
    "Cette génération n'est plus en échec : elle a abouti, ou une nouvelle tentative est déjà en cours. Rechargez la page.",
  unavailable: "L'action n'a pas pu aboutir. Votre projet est intact. Réessayez dans un instant.",
};

/** `null` for no code at all — the caller renders no banner in that case. */
export function projectActionErrorMessage(code: string | string[] | undefined): string | null {
  const value = Array.isArray(code) ? code[0] : code;

  if (value === undefined) return null;

  return isProjectActionError(value) ? MESSAGES[value] : MESSAGES.unavailable;
}

export function isProjectActionError(value: string): value is ProjectActionError {
  return (PROJECT_ACTION_ERRORS as readonly string[]).includes(value);
}
