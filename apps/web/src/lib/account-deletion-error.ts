/**
 * Why an account deletion did not happen (CAL-031), turned into the French
 * sentence the deletion screen shows.
 *
 * The set is closed and deliberately coarse. The reason travels back on the
 * page's own URL, and a URL is a place a value would be visible, shareable and
 * logged by every proxy on the way — so it carries a code and never a message,
 * still less one built from what the visitor typed (§7, §9).
 *
 * Two outcomes, because there are two the visitor can act on: they typed the
 * wrong address, or something broke. A third code would only tell them what
 * broke, which is not theirs to know and not theirs to fix.
 */

export const ACCOUNT_DELETION_ERRORS = ["confirmation", "unavailable"] as const;
export type AccountDeletionError = (typeof ACCOUNT_DELETION_ERRORS)[number];

const MESSAGES: Record<AccountDeletionError, string> = {
  confirmation:
    "L'adresse saisie ne correspond pas à celle de votre compte. Aucune donnée n'a été supprimée.",
  unavailable:
    "La suppression n'a pas pu aboutir. Votre compte est intact. Réessayez dans un instant.",
};

/** `null` for no code at all — the caller renders no banner in that case. */
export function accountDeletionErrorMessage(code: string | string[] | undefined): string | null {
  const value = Array.isArray(code) ? code[0] : code;

  if (value === undefined) return null;

  return isAccountDeletionError(value) ? MESSAGES[value] : MESSAGES.unavailable;
}

function isAccountDeletionError(value: string): value is AccountDeletionError {
  return (ACCOUNT_DELETION_ERRORS as readonly string[]).includes(value);
}
