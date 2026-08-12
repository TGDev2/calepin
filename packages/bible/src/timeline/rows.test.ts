import { describe, expect, it } from "vitest";

import { aTimeline, aTimelineInput } from "./fixtures";
import { countTimelineRows, resolveTimelineEvents, resolveTimelineParticipants } from "./rows";
import { verifyBibleTimeline } from "./verify";

function aVerifiedTimeline() {
  const verification = verifyBibleTimeline(aTimeline(), aTimelineInput());

  if (verification.outcome !== "verified") throw new Error("the fixture no longer verifies");

  return verification.timeline;
}

describe("resolveTimelineEvents", () => {
  it("gives every event exactly the TimelineEvent columns", () => {
    const [row] = resolveTimelineEvents(aVerifiedTimeline());

    expect(Object.keys(row ?? {}).sort()).toEqual([
      "absoluteDay",
      "category",
      "dateLabel",
      "datePrecision",
      "daysAfterPreceding",
      "durationPrecision",
      "name",
      "precedingEventName",
      "summary",
    ]);
  });

  /**
   * The category is provenance, not a declaration: it is written from which of
   * the answer's two lists the event came out of. §6 applied to a marker, and
   * `resolveWorldRules`' arrangement for `isSupernatural`.
   */
  it("writes the category from the list, backstory first", () => {
    const rows = resolveTimelineEvents(aVerifiedTimeline());

    expect(rows.map((row) => row.category)).toEqual([
      "BACKSTORY",
      "BACKSTORY",
      "BACKSTORY",
      "PLANNED",
      "PLANNED",
      "PLANNED",
      "PLANNED",
      "PLANNED",
    ]);
  });

  it("cannot produce a narrated event, because nothing has been told yet", () => {
    const rows = resolveTimelineEvents(aVerifiedTimeline());

    expect(rows.map((row) => row.category)).not.toContain("NARRATED");
  });

  it("carries the anchor as a name, leaving the identifier to business code", () => {
    const rows = resolveTimelineEvents(aVerifiedTimeline());
    const chained = rows.find((row) => row.precedingEventName !== null);

    expect(chained?.precedingEventName).toBe("La fermeture de l'atelier");
    expect(rows.some((row) => row.precedingEventName === rows[0]?.name)).toBe(true);
  });

  it("keeps both placements when the event carries both", () => {
    const rows = resolveTimelineEvents(aVerifiedTimeline());
    const both = rows.filter((row) => row.absoluteDay !== null && row.precedingEventName !== null);

    expect(both).toHaveLength(1);
    expect(both[0]?.daysAfterPreceding).toBe(200);
  });
});

describe("resolveTimelineParticipants", () => {
  it("gives every presence exactly the TimelineEventParticipant columns", () => {
    const [row] = resolveTimelineParticipants(aVerifiedTimeline());

    expect(Object.keys(row ?? {}).sort()).toEqual(["characterName", "declaredAge", "eventName"]);
  });

  it("joins the two names it was verified against", () => {
    const rows = resolveTimelineParticipants(aVerifiedTimeline());
    const names = new Set(aTimelineInput().cast.map((member) => member.name));

    for (const row of rows) {
      expect(names.has(row.characterName)).toBe(true);
    }

    expect(rows).toHaveLength(countTimelineRows(aTimeline()).participants);
  });

  /**
   * Carried across rather than recomputed, and the distinction is the whole
   * reason the column exists: it is what the chronology **asserts**, not what
   * the day axis implies. Writing the computed value would replace the
   * assertion with its own check's answer, and CAL-133 would find nothing left
   * to contradict.
   */
  it("keeps the age the chronology asserted, not the one the axis implies", () => {
    const rows = resolveTimelineParticipants(aVerifiedTimeline());
    const atTheClosure = rows.filter((row) => row.eventName === "La fermeture de l'atelier");

    expect(atTheClosure.map((row) => row.declaredAge)).toEqual([4, 31]);
  });
});

describe("countTimelineRows", () => {
  it("counts without needing a verified chronology, since counting is not a write", () => {
    expect(countTimelineRows(aTimeline())).toEqual({
      events: 8,
      backstoryEvents: 3,
      plannedEvents: 5,
      participants: 14,
    });
  });
});
