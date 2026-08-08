/**
 * The age of a character at a moment of the chronology (CAL-017).
 *
 * Nothing here reads a database, a clock or an environment: this is the rule,
 * and CLAUDE.md §8 asks that a rule be runnable without any of the three.
 */

import type { AgeRange } from "./types";

/**
 * The length of a year on the day axis.
 *
 * One constant, so a world whose year is not 365 days long is a column on the
 * bible and a parameter here, rather than a number to hunt for in three files.
 * The task that meets such a world owns that change; until then this is the
 * conversion, stated once.
 */
export const DAYS_PER_YEAR = 365;

/**
 * The age a character has on a given day of the chronology.
 *
 * `ageAtOpening` is `Character.age` — the age on day 0, the day the novel
 * opens, which is the instant the schema names for it. The result is an
 * interval because that is all the input supports: a birthday sits somewhere
 * inside a year, so an age stated for day 0 pins the age on any other day only
 * to within one. The two bounds coincide exactly when the day is a whole number
 * of years away from the opening.
 *
 * Returns `null` when either the age or the day is unknown — an unplaced event,
 * or a character whose age the bible does not state yet. A missing value is not
 * a contradiction, and a caller that receives `null` must report nothing.
 *
 * The bounds are deliberately not clamped at zero. A negative age means the
 * character is present at an event that precedes their birth, which is
 * precisely the incompatibility CAL-093 exists to surface; clamping would hide
 * the one case worth reporting.
 */
export function ageRangeAt(ageAtOpening: number | null, day: number | null): AgeRange | null {
  if (ageAtOpening === null || day === null) return null;

  return {
    min: ageAtOpening + Math.floor(day / DAYS_PER_YEAR),
    max: ageAtOpening + Math.ceil(day / DAYS_PER_YEAR),
  };
}
