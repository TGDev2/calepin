import type { BibleTimelineEventRow } from "@calepin/shared/repository";
import { describe, expect, it } from "vitest";

import { orderTimelineEvents } from "./bible-timeline";

function event(overrides: Partial<BibleTimelineEventRow>): BibleTimelineEventRow {
  return {
    id: overrides.id ?? "event-1",
    name: "fixture",
    summary: null,
    category: "BACKSTORY",
    absoluteDay: null,
    datePrecision: null,
    dateLabel: null,
    precedingEventId: null,
    daysAfterPreceding: null,
    durationPrecision: null,
    origin: "GENERATED",
    lockedAt: null,
    participants: [],
    ...overrides,
  };
}

describe("orderTimelineEvents", () => {
  it("orders dated events by their absolute day", () => {
    const later = event({ id: "later", name: "later", absoluteDay: 10, datePrecision: "DAY" });
    const earlier = event({ id: "earlier", name: "earlier", absoluteDay: -5, datePrecision: "DAY" });

    const ordered = orderTimelineEvents([later, earlier]);

    expect(ordered.map((entry) => entry.event.id)).toEqual(["earlier", "later"]);
    expect(ordered[0]?.day).toBe(-5);
    expect(ordered[1]?.day).toBe(10);
  });

  it("resolves an event placed only relative to another", () => {
    const anchor = event({ id: "anchor", absoluteDay: 0, datePrecision: "DAY" });
    const follower = event({
      id: "follower",
      precedingEventId: "anchor",
      daysAfterPreceding: 7,
    });

    const ordered = orderTimelineEvents([anchor, follower]);

    expect(ordered.find((entry) => entry.event.id === "follower")?.day).toBe(7);
  });

  it("carries no tolerance for a day known exactly, and some for a vaguer one", () => {
    const exact = event({ id: "exact", absoluteDay: 0, datePrecision: "DAY" });
    const vague = event({ id: "vague", absoluteDay: 0, datePrecision: "YEAR" });

    const ordered = orderTimelineEvents([exact, vague]);

    expect(ordered.find((entry) => entry.event.id === "exact")?.toleranceDays).toBe(0);
    expect(ordered.find((entry) => entry.event.id === "vague")?.toleranceDays).toBeGreaterThan(0);
  });

  it("leaves an undated, unanchored event with no day rather than inventing one", () => {
    const undated = event({ id: "undated" });

    const ordered = orderTimelineEvents([undated]);

    expect(ordered[0]?.day).toBeNull();
  });

  it("falls back to a stable order instead of throwing when the chain cannot resolve", () => {
    const cycleA = event({ id: "a", name: "a", precedingEventId: "b", daysAfterPreceding: 1 });
    const cycleB = event({ id: "b", name: "b", precedingEventId: "a", daysAfterPreceding: 1 });

    const ordered = orderTimelineEvents([cycleB, cycleA]);

    expect(ordered.map((entry) => entry.event.id)).toEqual(["a", "b"]);
    expect(ordered.every((entry) => entry.day === null)).toBe(true);
  });
});
