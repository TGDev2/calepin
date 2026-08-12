/**
 * The shapes a canonical fact is reasoned about in (CAL-018).
 *
 * They are structural, not Prisma types: a narrative rule must be runnable
 * without a database (CLAUDE.md §8), and the repository layer that will read
 * these rows does not exist yet (CAL-023). A caller passes its own row type
 * and gets its own row type back.
 */

/**
 * The specification's three temporal cases, as the schema stores them.
 *
 * An `as const` array rather than a bare union, since CAL-094: that is the only
 * shape `prisma/schema.test.ts` can pin against the Prisma enum — the same move
 * `TIMELINE_PRECISIONS` makes one directory over — and the mission's contract
 * needs the members as values anyway.
 */
export const CANON_FACT_VALIDITIES = ["PERMANENT", "DURING_PERIOD", "UNTIL_EVENT"] as const;

export type CanonFactValidity = (typeof CANON_FACT_VALIDITIES)[number];

/**
 * Where a fact came from. `CHAPTER` and `USER` are unreachable for the initial
 * extraction and are members all the same: the column is one list, and a
 * resolver typed on a subset would need a widening cast at the write.
 */
export const CANON_FACT_SOURCES = ["SOURCE_TEXT", "BIBLE", "CHAPTER", "USER"] as const;

export type CanonFactSource = (typeof CANON_FACT_SOURCES)[number];

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
export const CANON_FACT_BELIEF_STATES = ["BELIEVES_TRUE", "BELIEVES_FALSE", "UNAWARE"] as const;

export type CanonFactBeliefState = (typeof CANON_FACT_BELIEF_STATES)[number];

/**
 * What the author reads beside each belief state, and what the prompt glosses
 * them with. Domain-owned copy, as `NARRATIVE_ENGINE_COPY` and
 * `TIMELINE_PRECISION_LABELS` are: the author reads the same words the model
 * was given.
 */
export const CANON_FACT_BELIEF_STATE_LABELS: Readonly<Record<CanonFactBeliefState, string>> = {
  BELIEVES_TRUE: "croit l'énoncé vrai",
  BELIEVES_FALSE: "croit l'énoncé faux",
  UNAWARE: "ignore la question",
};
