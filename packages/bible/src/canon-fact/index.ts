/**
 * The canonical facts of a novel (CAL-018).
 *
 * Two rules and the shapes they read: whether a fact is in force at a moment
 * of the chronology, and whether a character's belief agrees with the world —
 * the derivation that stands in for a stored KNOWS.
 */

export { beliefMatchesWorld } from "./belief";
export { factInForceOn } from "./in-force";
export type { CanonFactBeliefState, CanonFactValidity, CanonFactWindow } from "./types";
