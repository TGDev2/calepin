/**
 * The two closed lists the traceability pattern is built on (CAL-073).
 *
 * One is stored and one is derived, and keeping them apart is the whole point:
 * `ContentOrigin` records *who authored the wording that is there now*, and it
 * is the only thing a row carries. `ProvenanceState` is what a reader is shown,
 * and it is computed — never a column, never a second answer able to disagree
 * with the first.
 */

/**
 * Who authored the current wording of one element.
 *
 * Mirrors the Prisma enum `ContentOrigin` (§4.2 carve-out: a union that mirrors
 * a Prisma enum spells its members as the schema spells them).
 * `prisma/schema.test.ts` pins the pair.
 *
 * Three members rather than two, for the reason `DirectionOrigin` already
 * gives: an element the author rewrote from a proposal and one they started
 * from nothing are worth telling apart, and `GENERATED` / `EDITED` alone
 * cannot.
 */
export const CONTENT_ORIGINS = ["GENERATED", "EDITED", "USER_WRITTEN"] as const;

export type ContentOrigin = (typeof CONTENT_ORIGINS)[number];

/**
 * What a reader is told about one element — the backlog's three origins, plus
 * the one they are read against.
 *
 * Derived from the element's own origin and from whether the revision holding
 * it was authored by a person; see `resolveProvenanceState`. Lowercase members,
 * because this list mirrors no column (§4.2).
 */
export const PROVENANCE_STATES = ["proposed", "accepted", "edited", "user-written"] as const;

export type ProvenanceState = (typeof PROVENANCE_STATES)[number];
