import { describe, expect, it } from "vitest";

import { ageRangeAt, DAYS_PER_YEAR } from "./age";

describe("ageRangeAt", () => {
  // Character.age is the age on day 0, so day 0 is the one instant the interval
  // collapses to the stated number by definition rather than by arithmetic.
  it("is exactly the stated age on the day the novel opens", () => {
    expect(ageRangeAt(30, 0)).toEqual({ min: 30, max: 30 });
  });

  // The birthday sits somewhere inside the year, so a whole number of years
  // later the character has had exactly that many birthdays, whenever it falls.
  it("collapses to a single age a whole number of years away", () => {
    expect(ageRangeAt(30, 3 * DAYS_PER_YEAR)).toEqual({ min: 33, max: 33 });
    expect(ageRangeAt(30, -3 * DAYS_PER_YEAR)).toEqual({ min: 27, max: 27 });
  });

  // The case a single number would get wrong half the time: mid-year, the
  // answer genuinely is "31 or 32", and reporting either one as the age is what
  // makes a detector contradict a consistent novel.
  it("spans two ages between birthdays", () => {
    expect(ageRangeAt(30, DAYS_PER_YEAR + 100)).toEqual({ min: 31, max: 32 });
    expect(ageRangeAt(30, 1)).toEqual({ min: 30, max: 31 });
    expect(ageRangeAt(30, DAYS_PER_YEAR - 1)).toEqual({ min: 30, max: 31 });
  });

  // Backstory events sit before day 0, which is the whole point of a signed
  // axis: the same formula has to run backwards without a special case.
  it("runs backwards for an event before the novel opens", () => {
    expect(ageRangeAt(30, -1)).toEqual({ min: 29, max: 30 });
    expect(ageRangeAt(30, -DAYS_PER_YEAR - 100)).toEqual({ min: 28, max: 29 });
  });

  // Not clamped, deliberately. A character present before their own birth is
  // the one incompatibility worth reporting, and a floor at zero would hide it.
  it("goes negative for an event that precedes the character's birth", () => {
    expect(ageRangeAt(10, -20 * DAYS_PER_YEAR)).toEqual({ min: -10, max: -10 });
  });

  it("answers nothing when the age or the day is unknown", () => {
    expect(ageRangeAt(null, 0)).toBeNull();
    expect(ageRangeAt(30, null)).toBeNull();
    expect(ageRangeAt(null, null)).toBeNull();
  });

  // A newborn is a legitimate character, and zero is not the absence of a
  // value — the nullable column is what says "unknown".
  it("treats an age of zero as an age", () => {
    expect(ageRangeAt(0, 0)).toEqual({ min: 0, max: 0 });
    expect(ageRangeAt(0, 5 * DAYS_PER_YEAR)).toEqual({ min: 5, max: 5 });
  });

  // The declared age of a participant is compared against this interval by
  // CAL-093. The property that comparison rests on is stated here rather than
  // assumed: the interval is never empty and never inverted.
  it("never returns an inverted interval", () => {
    for (let day = -800; day <= 800; day += 7) {
      const range = ageRangeAt(40, day);
      if (range === null) throw new Error("a known age and a known day must produce a range");

      expect(range.min).toBeLessThanOrEqual(range.max);
      expect(range.max - range.min).toBeLessThanOrEqual(1);
    }
  });
});
