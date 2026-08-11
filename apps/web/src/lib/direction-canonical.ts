/**
 * Retaining one direction as the project's own, from the interface layer's
 * side (CAL-086).
 *
 * The division `lib/direction-discard.ts` draws: a `"use server"` module may
 * export nothing but async functions, so the state type and the French
 * sentences live here and the action imports them.
 *
 * **The warning is the repository's rule, not this screen's.** A change that
 * would leave a bible, a plan or chapters behind is refused with
 * `OBSOLESCENCE_NOT_ACKNOWLEDGED` until the author confirms, so the panel below
 * the button is what makes the write possible rather than a courtesy the screen
 * could forget. The sentence a refusal shows is the error's own `userMessage`,
 * for exactly that reason — it is the rule speaking, not a copy of it.
 *
 * **Nothing here promises anything about what happens downstream**, because
 * nothing happens downstream: the backlog forbids deleting or regenerating a
 * single row, and the copy says so plainly instead of implying a cleanup the
 * product deliberately does not perform.
 */

/** The form's answer: nothing to say, or one sentence to show under the button. */
export type DirectionCanonicalState =
  { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const INITIAL_DIRECTION_CANONICAL_STATE: DirectionCanonicalState = { status: "idle" };

export const DIRECTION_CANONICAL_UNAVAILABLE_MESSAGE =
  "Cette direction n'a pas pu être retenue. Le projet est intact. Réessayez dans un instant.";

/** The checkbox the repository's acknowledgement gate reads. */
export const ACKNOWLEDGE_FIELD = "acknowledgeObsolescence";

/** A checkbox is present in the payload only when it was ticked. */
export function readAcknowledgement(value: unknown): boolean {
  return typeof value === "string" && value !== "";
}
