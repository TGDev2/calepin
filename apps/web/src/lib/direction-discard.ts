/**
 * Writing one proposed direction off, from the interface layer's side
 * (CAL-083).
 *
 * The division `lib/analysis-edit.ts` draws, one epic later: a `"use server"`
 * module may export nothing but async functions, so the state type, the French
 * sentences and the little readers live here and the action imports them.
 *
 * **The rule belongs to the domain, the sentence belongs here.** What a reason
 * may be is `parseDirectionDiscardReason`'s answer in `@calepin/direction` —
 * ceiling included, in a French `userMessage` the form shows as written. This
 * module holds only what no package could: the copy for a failure that has no
 * `AppError` behind it, and where the screen is.
 *
 * **The author's reason never appears in a message.** It is their own words
 * about their novel (§9), so a refusal names the rule and the count and never
 * quotes what was typed — which is also why the state below carries a message
 * and never the text.
 */

/** The form's answer: nothing to say, or one sentence to show under the field. */
export type DirectionDiscardState =
  { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const INITIAL_DIRECTION_DISCARD_STATE: DirectionDiscardState = { status: "idle" };

export const DIRECTION_MISSING_MESSAGE = "Ce projet n'existe plus, ou il ne vous appartient pas.";

export const DIRECTION_DISCARD_UNAVAILABLE_MESSAGE =
  "Cette direction n'a pas pu être écartée. Elle est intacte. Réessayez dans un instant.";

/** Where the comparison screen lives, and where a successful discard returns to. */
export function directionsPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/directions`;
}

/** A posted field, trimmed; empty and absent are the same answer. */
export function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}
