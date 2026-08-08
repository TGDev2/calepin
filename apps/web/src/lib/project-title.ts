/**
 * The two rules the project screens apply to a title (CAL-035).
 *
 * Both live in the interface layer on purpose. A title is content, not a
 * narrative invariant: `@calepin/shared` holds no French (CLAUDE.md §1), and
 * what a copy is *called* is a decision of the screen that asks for it, not of
 * the copier — which is why `duplicateProject` takes the title rather than
 * inventing one.
 */

/** Long enough for a working title, short enough to stay a title. */
export const PROJECT_TITLE_MAX_LENGTH = 200;

/**
 * A submitted title, trimmed — or `null` when it is not one.
 *
 * The form marks the field `required` and `maxLength`, and neither is a check:
 * both are hints a request can be made without. This is the check.
 */
export function readProjectTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const title = value.trim();

  return title === "" || title.length > PROJECT_TITLE_MAX_LENGTH ? null : title;
}

/**
 * What a copy is called: the original's title with a suffix, and a number from
 * the second copy of a copy on.
 *
 * Duplicating a duplicate is the flow this exists for — "Roman (copie)
 * (copie)" is what a naive suffix gives after two rounds, and it gets worse.
 * The number counts the round, not the siblings: nothing here reads the other
 * projects, so it never claims to be unique, and nothing in the schema requires
 * it to be.
 */
export function duplicatedProjectTitle(title: string): string {
  const trimmed = title.trim();
  const already = /^(.*?)\s*\(copie(?:\s+(\d+))?\)$/u.exec(trimmed);

  if (already === null) return truncateTitle(`${trimmed} (copie)`);

  const base = already[1] ?? "";
  const round = Number.parseInt(already[2] ?? "1", 10);

  return truncateTitle(`${base} (copie ${round + 1})`);
}

/**
 * A suffix must not push a title past what the column and the form accept —
 * the copy would be refused by the check the screen itself applies. The
 * beginning is what identifies a title, so the beginning is what survives.
 */
function truncateTitle(title: string): string {
  return title.length <= PROJECT_TITLE_MAX_LENGTH
    ? title
    : title.slice(0, PROJECT_TITLE_MAX_LENGTH).trimEnd();
}

/**
 * Whether what the visitor typed names the project they are about to delete.
 *
 * A check on *intent*, never on identity — the session already established who
 * is asking, and the repository call refuses a project that is not theirs. What
 * it buys is that an irreversible button cannot be reached by a mis-click or a
 * link someone else sent. Trimmed and compared case-insensitively, the same
 * reasoning `matchesDeletionConfirmation` records for an address: refusing a
 * capital would only teach the author to distrust the form.
 */
export function matchesProjectTitle(typed: unknown, title: string): boolean {
  if (typeof typed !== "string") return false;

  const candidate = typed.trim().toLocaleLowerCase();

  return candidate !== "" && candidate === title.trim().toLocaleLowerCase();
}
