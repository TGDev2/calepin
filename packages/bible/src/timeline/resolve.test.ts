import { isErr, isOk } from "@calepin/shared/errors";
import { describe, expect, it } from "vitest";

import { resolveTimeline } from "./resolve";
import type { TimelinePlacement } from "./types";

/**
 * Every fixture here is an identifier and a number. CLAUDE.md §9 keeps literary
 * content out of this repository, and an ordering rule needs none: what is
 * under test is where an event lands, never what happens in it.
 */
function event(id: string, placement: Partial<Omit<TimelinePlacement, "id">> = {}) {
  return {
    id,
    absoluteDay: placement.absoluteDay ?? null,
    precedingEventId: placement.precedingEventId ?? null,
    daysAfterPreceding: placement.daysAfterPreceding ?? null,
  };
}

function orderOf(events: readonly TimelinePlacement[]): string[] {
  const resolved = resolveTimeline(events);
  if (!isOk(resolved)) throw new Error("the chronology was expected to resolve");

  return resolved.value.map(({ event: resolvedEvent }) => resolvedEvent.id);
}

function daysOf(events: readonly TimelinePlacement[]): (number | null)[] {
  const resolved = resolveTimeline(events);
  if (!isOk(resolved)) throw new Error("the chronology was expected to resolve");

  return resolved.value.map(({ day }) => day);
}

describe("resolveTimeline", () => {
  it("orders dated events along the axis, backstory first", () => {
    // A backstory event sits before the day the novel opens; that is what the
    // signed axis is for, and nothing about the sign is special-cased.
    expect(
      orderOf([
        event("opening", { absoluteDay: 0 }),
        event("later", { absoluteDay: 400 }),
        event("backstory", { absoluteDay: -7000 }),
      ]),
    ).toEqual(["backstory", "opening", "later"]);
  });

  it("returns an empty chronology unchanged", () => {
    expect(orderOf([])).toEqual([]);
  });

  it("does not depend on the order the events came in", () => {
    const events = [
      event("third", { absoluteDay: 30 }),
      event("first", { absoluteDay: 10 }),
      event("second", { absoluteDay: 20 }),
    ];

    expect(orderOf(events)).toEqual(["first", "second", "third"]);
    expect(orderOf([...events].reverse())).toEqual(["first", "second", "third"]);
  });

  describe("a chain rooted in a date", () => {
    // The case the backlog calls out: a duration since another event, not a
    // date of its own. It has to produce a real position on the axis.
    it("resolves each hop to a day", () => {
      const events = [
        event("root", { absoluteDay: 100 }),
        event("hop-one", { precedingEventId: "root", daysAfterPreceding: 10 }),
        event("hop-two", { precedingEventId: "hop-one", daysAfterPreceding: 5 }),
      ];

      expect(orderOf(events)).toEqual(["root", "hop-one", "hop-two"]);
      expect(daysOf(events)).toEqual([100, 110, 115]);
    });

    it("places a chain among the dated events it interleaves with", () => {
      expect(
        orderOf([
          event("early", { absoluteDay: 0 }),
          event("late", { absoluteDay: 100 }),
          event("between", { precedingEventId: "early", daysAfterPreceding: 50 }),
        ]),
      ).toEqual(["early", "between", "late"]);
    });

    it("keeps simultaneous events together rather than dropping one", () => {
      const events = [
        event("root", { absoluteDay: 0 }),
        event("same-instant", { precedingEventId: "root", daysAfterPreceding: 0 }),
      ];

      expect(orderOf(events)).toEqual(["root", "same-instant"]);
      expect(daysOf(events)).toEqual([0, 0]);
    });

    // The author's own date wins over the chain. The two disagreeing is the
    // inconsistent duration CAL-093 reports; overruling the author silently
    // would be the wrong way to hold both.
    it("keeps a stated date even when the chain computes another one", () => {
      const events = [
        event("root", { absoluteDay: 0 }),
        event("stated", { absoluteDay: 20, precedingEventId: "root", daysAfterPreceding: 500 }),
      ];

      expect(daysOf(events)).toEqual([0, 20]);
      expect(orderOf(events)).toEqual(["root", "stated"]);
    });
  });

  describe("an anchor without a duration", () => {
    // Pure ordering — the backlog's "événements sans date absolue mais
    // ordonnés". No day can be invented for it, and it must still land in the
    // right place.
    it("orders the event without dating it", () => {
      const events = [
        event("dated", { absoluteDay: 100 }),
        event("after", { precedingEventId: "dated" }),
      ];

      expect(orderOf(events)).toEqual(["dated", "after"]);
      expect(daysOf(events)).toEqual([100, null]);
    });

    it("follows the last date known before it, not the end of the chronology", () => {
      expect(
        orderOf([
          event("first", { absoluteDay: 0 }),
          event("last", { absoluteDay: 1000 }),
          event("undated", { precedingEventId: "first" }),
        ]),
      ).toEqual(["first", "undated", "last"]);
    });

    it("keeps a chain of undated events in its own order", () => {
      const events = [
        event("dated", { absoluteDay: 0 }),
        event("then-c", { precedingEventId: "then-b" }),
        event("then-a", { precedingEventId: "dated" }),
        event("then-b", { precedingEventId: "then-a" }),
      ];

      expect(orderOf(events)).toEqual(["dated", "then-a", "then-b", "then-c"]);
      expect(daysOf(events)).toEqual([0, null, null, null]);
    });

    // A date reappearing further down the chain roots it again, so the events
    // after it are dated even though the ones before it are not.
    it("dates the hops that follow a date reappearing in the chain", () => {
      const events = [
        event("start", { absoluteDay: 0 }),
        event("gap", { precedingEventId: "start" }),
        event("dated-again", { absoluteDay: 900, precedingEventId: "gap" }),
        event("after", { precedingEventId: "dated-again", daysAfterPreceding: 10 }),
      ];

      expect(orderOf(events)).toEqual(["start", "gap", "dated-again", "after"]);
      expect(daysOf(events)).toEqual([0, null, 900, 910]);
    });
  });

  describe("a chain that never reaches a date", () => {
    it("comes last, in its own order", () => {
      const events = [
        event("floating-b", { precedingEventId: "floating-a" }),
        event("dated", { absoluteDay: 500 }),
        event("floating-a", { precedingEventId: null }),
      ];

      expect(orderOf(events)).toEqual(["dated", "floating-a", "floating-b"]);
      expect(daysOf(events)).toEqual([500, null, null]);
    });

    // Two chronologies-in-waiting stay separate. Interleaving them would show
    // the author an order the data never claimed.
    it("stays grouped by chain rather than interleaved with another", () => {
      expect(
        orderOf([
          event("a-two", { precedingEventId: "a-one" }),
          event("b-two", { precedingEventId: "b-one" }),
          event("a-one"),
          event("b-one"),
        ]),
      ).toEqual(["a-one", "a-two", "b-one", "b-two"]);
    });
  });

  describe("what it refuses rather than guesses", () => {
    // The database forbids the one-step loop; anything longer spans rows and
    // only this function can see it.
    it("refuses a cycle instead of ordering it arbitrarily", () => {
      const resolved = resolveTimeline([
        event("a", { precedingEventId: "c", daysAfterPreceding: 1 }),
        event("b", { precedingEventId: "a", daysAfterPreceding: 1 }),
        event("c", { precedingEventId: "b", daysAfterPreceding: 1 }),
      ]);

      expect(isErr(resolved)).toBe(true);
      if (!isErr(resolved)) return;

      expect(resolved.error.code).toBe("VALIDATION_FAILED");
      expect(resolved.error.category).toBe("validation");
      expect(resolved.error.fieldPath).toBe("precedingEventId");
      // The reader is told what to fix, in French, with nothing technical in it.
      expect(resolved.error.userMessage).toMatch(/boucle/);
    });

    it("refuses an anchor absent from the chronology it was given", () => {
      const resolved = resolveTimeline([
        event("known", { absoluteDay: 0 }),
        event("orphan", { precedingEventId: "not-in-the-list" }),
      ]);

      expect(isErr(resolved)).toBe(true);
      if (!isErr(resolved)) return;

      expect(resolved.error.code).toBe("VALIDATION_FAILED");
      expect(resolved.error.fieldPath).toBe("precedingEventId");
    });

    // §7: an expected failure is a value. A malformed chronology is the
    // author's data, not a bug, so nothing throws.
    it("returns the failure rather than throwing it", () => {
      expect(() =>
        resolveTimeline([event("self-ish", { precedingEventId: "missing" })]),
      ).not.toThrow();
    });
  });

  // The caller's own row type comes back out: the rule reads four fields and
  // knows nothing about the rest of the row, which is what keeps it runnable
  // without a database.
  it("gives back the events it was handed, not copies of them", () => {
    const dated = { ...event("dated", { absoluteDay: 0 }), category: "NARRATED" as const };
    const resolved = resolveTimeline([dated]);
    if (!isOk(resolved)) throw new Error("the chronology was expected to resolve");

    expect(resolved.value[0]?.event).toBe(dated);
    expect(resolved.value[0]?.event.category).toBe("NARRATED");
  });
});
