/**
 * Whether a canonical fact is in force at a moment of the chronology
 * (CAL-018).
 *
 * Nothing here reads a database, a clock or an environment: this is the rule,
 * and CLAUDE.md §8 asks that a rule be runnable without any of the three.
 */

import type { CanonFactWindow } from "./types";

/**
 * Whether the fact holds on a given day of the chronology.
 *
 * `day` is the moment asked about — a scene's day, an event's resolved day.
 * `invalidatingEventDay` is the resolved day of the fact's invalidating event
 * for an UNTIL_EVENT fact, supplied by the caller: resolving it is
 * `resolveTimeline`'s job, and this rule stays database-free.
 *
 * Returns `null` — never a guess — when the data cannot answer: an unplaced
 * scene, a bound the author has only as words, an invalidating event whose
 * chain never reaches a date. `ageRangeAt`'s honesty rule applied to validity;
 * a caller that receives `null` must report nothing. The one exception reads
 * the other way: a PERMANENT fact holds on every day, so it holds on an
 * unknown one too.
 *
 * Period bounds are inclusive at both ends. An UNTIL_EVENT fact holds strictly
 * before the event's day: the event is the moment the world changes, and the
 * day it happens already belongs to the changed world.
 *
 * Precision tolerance is deliberately not applied here. The tolerance in days
 * behind each TimelinePrecision member is a narrative rule that belongs to the
 * detector (CAL-093) — the boundary `ageRangeAt` already draws.
 */
export function factInForceOn(
  fact: CanonFactWindow,
  day: number | null,
  invalidatingEventDay: number | null = null,
): boolean | null {
  if (fact.validity === "PERMANENT") return true;
  if (day === null) return null;

  if (fact.validity === "UNTIL_EVENT") {
    if (invalidatingEventDay === null) return null;
    return day < invalidatingEventDay;
  }

  // DURING_PERIOD. A numbered bound that excludes the day answers false on its
  // own; only after that does a words-only bound make the rest unanswerable.
  if (fact.validFromDay !== null && day < fact.validFromDay) return false;
  if (fact.validUntilDay !== null && day > fact.validUntilDay) return false;

  const fromIsWordsOnly = fact.validFromDay === null && fact.validFromLabel !== null;
  const untilIsWordsOnly = fact.validUntilDay === null && fact.validUntilLabel !== null;
  if (fromIsWordsOnly || untilIsWordsOnly) return null;

  return true;
}
