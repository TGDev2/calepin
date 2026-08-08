/**
 * The derivation that replaces a stored KNOWS (CAL-018).
 *
 * Nothing here reads a database, a clock or an environment: this is the rule,
 * and CLAUDE.md §8 asks that a rule be runnable without any of the three.
 */

import type { CanonFactBeliefState } from "./types";

/**
 * Whether a character's belief agrees with the world.
 *
 * `isTrue` is the fact's truth value in the world of the novel; `state` is the
 * character's stance on the statement. The two dimensions are independent
 * columns, and *knowing* is their agreement: believing true what is true, or
 * false what is false. UNAWARE never matches — a character cannot know what
 * they hold no stance on.
 *
 * The composer reads a non-matching belief as what a point of view must not
 * leak; the checker reads it as dramatic irony to preserve, or as the
 * contradiction a scene just committed. Which of the two it is, is a narrative
 * judgement and belongs to the mission that makes it (E13), not here.
 */
export function beliefMatchesWorld(isTrue: boolean, state: CanonFactBeliefState): boolean {
  if (state === "UNAWARE") return false;
  return state === "BELIEVES_TRUE" ? isTrue : !isTrue;
}
