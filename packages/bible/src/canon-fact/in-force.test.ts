import { describe, expect, it } from "vitest";

import { factInForceOn } from "./in-force";
import type { CanonFactWindow } from "./types";

/** Every field explicit, so a case states only what it is about. */
function window(overrides: Partial<CanonFactWindow> = {}): CanonFactWindow {
  return {
    validity: "PERMANENT",
    validFromDay: null,
    validFromLabel: null,
    validUntilDay: null,
    validUntilLabel: null,
    ...overrides,
  };
}

describe("factInForceOn", () => {
  describe("a permanent fact", () => {
    // The specification's negative example is this shape: permanent, its
    // polarity carried by isTrue, which this rule deliberately never reads —
    // a false fact in force is exactly what forbids contradicting it.
    it("holds on any day, backstory included", () => {
      for (const day of [-7000, -1, 0, 400]) {
        expect(factInForceOn(window(), day)).toBe(true);
      }
    });

    it("holds on an unknown day too, since it holds on every day", () => {
      expect(factInForceOn(window(), null)).toBe(true);
    });
  });

  describe("a fact true during a period", () => {
    // The specification's dated example is this shape: a start bound on the
    // day axis with the author's wording beside it, and no end.
    const sinceOpenStart = window({
      validity: "DURING_PERIOD",
      validFromDay: -240,
      validFromLabel: "fixture from label",
    });

    it("does not hold before its start bound", () => {
      expect(factInForceOn(sinceOpenStart, -400)).toBe(false);
    });

    it("holds from its start bound on, both ends inclusive", () => {
      expect(factInForceOn(sinceOpenStart, -240)).toBe(true);
      expect(factInForceOn(sinceOpenStart, 0)).toBe(true);
    });

    it("holds up to an end bound and no longer after it", () => {
      const untilOnly = window({ validity: "DURING_PERIOD", validUntilDay: 100 });

      expect(factInForceOn(untilOnly, -7000)).toBe(true);
      expect(factInForceOn(untilOnly, 100)).toBe(true);
      expect(factInForceOn(untilOnly, 101)).toBe(false);
    });

    it("holds inside a closed window, equal bounds meaning a single day", () => {
      const bounded = window({ validity: "DURING_PERIOD", validFromDay: 10, validUntilDay: 20 });
      const singleDay = window({ validity: "DURING_PERIOD", validFromDay: 15, validUntilDay: 15 });

      expect(factInForceOn(bounded, 9)).toBe(false);
      expect(factInForceOn(bounded, 10)).toBe(true);
      expect(factInForceOn(bounded, 20)).toBe(true);
      expect(factInForceOn(bounded, 21)).toBe(false);
      expect(factInForceOn(singleDay, 15)).toBe(true);
      expect(factInForceOn(singleDay, 14)).toBe(false);
      expect(factInForceOn(singleDay, 16)).toBe(false);
    });

    // A bound the author has only as words cannot be compared to a day, and
    // inventing an answer is what ageRangeAt's null convention forbids.
    it("answers null when a bound exists only as words", () => {
      const wordsOnly = window({ validity: "DURING_PERIOD", validFromLabel: "fixture from label" });

      expect(factInForceOn(wordsOnly, 0)).toBeNull();
    });

    it("still answers false when a numbered bound already excludes the day", () => {
      const halfNumbered = window({
        validity: "DURING_PERIOD",
        validFromLabel: "fixture from label",
        validUntilDay: 100,
      });

      expect(factInForceOn(halfNumbered, 150)).toBe(false);
      expect(factInForceOn(halfNumbered, 50)).toBeNull();
    });

    it("answers null on an unknown day", () => {
      expect(factInForceOn(sinceOpenStart, null)).toBeNull();
    });
  });

  describe("a fact false after a given event", () => {
    const untilEvent = window({ validity: "UNTIL_EVENT" });

    // Strictly before: the event is the moment the world changes, and the day
    // it happens already belongs to the changed world.
    it("holds strictly before the event's resolved day", () => {
      expect(factInForceOn(untilEvent, 99, 100)).toBe(true);
      expect(factInForceOn(untilEvent, 100, 100)).toBe(false);
      expect(factInForceOn(untilEvent, 101, 100)).toBe(false);
    });

    // An event placed only by its order — a chain that never reaches a date —
    // resolves to no day, and resolveTimeline says null; so does this.
    it("answers null while the invalidating event resolves to no day", () => {
      expect(factInForceOn(untilEvent, 0)).toBeNull();
      expect(factInForceOn(untilEvent, 0, null)).toBeNull();
    });

    it("answers null on an unknown day", () => {
      expect(factInForceOn(untilEvent, null, 100)).toBeNull();
    });
  });
});
