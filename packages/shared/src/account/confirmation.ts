/**
 * The explicit confirmation an account deletion requires (CAL-031).
 *
 * The account holder types their own address. That is a check on *intent*, not
 * on identity — the session already established who is asking (CAL-024), and a
 * value typed into a form could never add to that. What it buys is that the
 * irreversible button cannot be reached by a mis-click, a double submit or a
 * link someone else sent: the visitor has to state which account they mean.
 *
 * Trimmed and compared case-insensitively, because an address is
 * case-insensitive to the person who owns it and refusing `Marie@…` for
 * `marie@…` would only teach them to distrust the form. It is the *stored*
 * address that the caller passes in, never the session's copy.
 */

export function matchesDeletionConfirmation(typed: string, email: string): boolean {
  const candidate = typed.trim().toLocaleLowerCase();

  // An empty stored address is not a thing this schema allows (`User.email` is
  // required), but an empty *typed* one must never match anything — without
  // this, a blank field would confirm the deletion of a broken row.
  if (candidate === "") return false;

  return candidate === email.trim().toLocaleLowerCase();
}
