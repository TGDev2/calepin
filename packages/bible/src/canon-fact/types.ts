/**
 * The shapes a canonical fact is reasoned about in (CAL-018).
 *
 * They are structural, not Prisma types: a narrative rule must be runnable
 * without a database (CLAUDE.md §8), and the repository layer that will read
 * these rows does not exist yet (CAL-023). A caller passes its own row type
 * and gets its own row type back.
 */

/** The specification's three temporal cases, as the schema stores them. */
export type CanonFactValidity = "PERMANENT" | "DURING_PERIOD" | "UNTIL_EVENT";

/**
 * What deciding whether a fact is in force needs, and nothing else.
 *
 * The bounds mirror the row: a day on the timeline's axis, and the author's
 * own wording beside it. The wording matters to the rule even though it cannot
 * be compared: a bound that exists only as words makes the question
 * unanswerable, not answerable by ignoring it.
 */
export interface CanonFactWindow {
  validity: CanonFactValidity;
  /** Days from the day the novel opens, negative before it (CAL-017). */
  validFromDay: number | null;
  validFromLabel: string | null;
  validUntilDay: number | null;
  validUntilLabel: string | null;
}

/**
 * A character's stance on a fact's statement, as the schema stores it. KNOWS
 * is deliberately absent: knowing is the agreement between a belief and the
 * world, derived by `beliefMatchesWorld`, never stored beside `isTrue` where
 * it could contradict it.
 */
export type CanonFactBeliefState = "BELIEVES_TRUE" | "BELIEVES_FALSE" | "UNAWARE";
