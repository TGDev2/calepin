import { describe, expect, it } from "vitest";
import { z } from "zod";

import { aTimeline, aTimelineInput, timelineSources } from "./fixtures";
import {
  bibleTimelineInputSchema,
  datedTimelineSchema,
  TIMELINE_DAY_BOUND,
  TIMELINE_EVENT_CATEGORIES,
  TIMELINE_INITIAL_CATEGORIES,
  TIMELINE_LIST_COUNTS,
  TIMELINE_PRECISION_LABELS,
  TIMELINE_PRECISIONS,
  TIMELINE_SOURCE_KINDS,
  timelineCastMemberSchema,
  timelineEventSchema,
} from "./schema";

/** Lint refuses `delete` on a computed key, so the field is filtered out. */
function without(value: object, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

function numericPaths(schema: unknown, path: string): string[] {
  if (schema instanceof z.ZodNumber) return [path];
  if (schema instanceof z.ZodNullable) return numericPaths(schema.unwrap(), path);
  if (schema instanceof z.ZodArray) return numericPaths(schema.element, `${path}[]`);
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([key, member]) =>
      numericPaths(member, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

/** One event of the fixture, to be spread over with whatever a test is about. */
function anEvent() {
  const [event] = aTimeline().backstoryEvents;
  if (event === undefined) throw new Error("the fixture lost its backstory");

  return event;
}

function parses(event: Record<string, unknown>): boolean {
  return timelineEventSchema.safeParse(event).success;
}

describe("the chronology contract", () => {
  it("accepts a complete chronology", () => {
    expect(datedTimelineSchema.safeParse(aTimeline()).success).toBe(true);
  });

  it("carries the two lists an initial chronology writes, and nothing else", () => {
    expect(Object.keys(datedTimelineSchema.shape).sort()).toEqual([
      "backstoryEvents",
      "plannedEvents",
    ]);
  });

  it("refuses a field nobody declared", () => {
    expect(datedTimelineSchema.safeParse({ ...aTimeline(), narratedEvents: [] }).success).toBe(
      false,
    );
  });

  it("holds each list to its own floor", () => {
    const timeline = aTimeline();

    expect(timeline.backstoryEvents).toHaveLength(TIMELINE_LIST_COUNTS.backstoryEvents.min);
    expect(timeline.plannedEvents).toHaveLength(TIMELINE_LIST_COUNTS.plannedEvents.min);
    expect(datedTimelineSchema.safeParse({ ...timeline, backstoryEvents: [] }).success).toBe(false);
    expect(datedTimelineSchema.safeParse({ ...timeline, plannedEvents: [] }).success).toBe(false);
  });

  /**
   * **No score, structurally** (cahier des charges 1195–1199), with the carve-out
   * that is not one: all three numbers measure time. A day is a position, a
   * duration is a length and an age is an age; none of them ranks anything.
   */
  it("holds no number that is not a measure of time", () => {
    expect(numericPaths(datedTimelineSchema, "").sort()).toEqual([
      "backstoryEvents[].absoluteDay",
      "backstoryEvents[].daysAfterPreceding",
      "backstoryEvents[].participants[].declaredAge",
      "plannedEvents[].absoluteDay",
      "plannedEvents[].daysAfterPreceding",
      "plannedEvents[].participants[].declaredAge",
    ]);
  });
});

describe("an event of the chronology", () => {
  it("writes an absence rather than eliding it", () => {
    expect(parses({ ...anEvent(), dateLabel: null })).toBe(true);
    expect(parses(without(anEvent(), "dateLabel"))).toBe(false);
    expect(parses(without(anEvent(), "participants"))).toBe(false);
  });

  // The five row constraints `20260808113131_add_timeline` already holds,
  // mirrored so that a chronology which parses is a chronology which inserts.
  describe("the placement rules the row also holds", () => {
    it("refuses an event placed by neither a date nor an anchor", () => {
      expect(
        parses({
          ...anEvent(),
          absoluteDay: null,
          datePrecision: null,
          precedingEventName: null,
        }),
      ).toBe(false);
    });

    it("refuses a day without its precision, and a precision without its day", () => {
      expect(parses({ ...anEvent(), datePrecision: null })).toBe(false);
      expect(parses({ ...anEvent(), absoluteDay: null })).toBe(false);
    });

    it("refuses a duration with no event to count it from", () => {
      expect(parses({ ...anEvent(), daysAfterPreceding: 10, durationPrecision: "DAY" })).toBe(
        false,
      );
    });

    it("refuses a duration without its precision, and a precision without its duration", () => {
      const chained = {
        ...anEvent(),
        precedingEventName: "La fermeture de l'atelier",
        daysAfterPreceding: 10,
        durationPrecision: "DAY",
      };

      expect(parses(chained)).toBe(true);
      expect(parses({ ...chained, durationPrecision: null })).toBe(false);
      expect(parses({ ...chained, daysAfterPreceding: null })).toBe(false);
    });

    it("refuses a negative duration and accepts a simultaneous one", () => {
      const chained = {
        ...anEvent(),
        precedingEventName: "La fermeture de l'atelier",
        durationPrecision: "DAY",
      };

      expect(parses({ ...chained, daysAfterPreceding: -1 })).toBe(false);
      expect(parses({ ...chained, daysAfterPreceding: 0 })).toBe(true);
    });

    it("keeps the day inside the axis, and the axis inside the column", () => {
      expect(parses({ ...anEvent(), absoluteDay: TIMELINE_DAY_BOUND })).toBe(true);
      expect(parses({ ...anEvent(), absoluteDay: TIMELINE_DAY_BOUND + 1 })).toBe(false);
      expect(parses({ ...anEvent(), absoluteDay: -TIMELINE_DAY_BOUND - 1 })).toBe(false);
      expect(TIMELINE_DAY_BOUND).toBeLessThan(2_147_483_647);
    });
  });

  /**
   * The one demand the column deliberately does not make. Left nullable, a model
   * could place every character at every event and assert nothing, satisfying
   * the contract while leaving the calculation nothing to intersect — and
   * *l'âge des personnages à chaque événement* is a deliverable of the
   * specification, not an option.
   */
  it("requires an age of every presence, where the column does not", () => {
    expect(
      parses({
        ...anEvent(),
        participants: [{ characterName: "Nora", declaredAge: null }],
      }),
    ).toBe(false);

    expect(parses({ ...anEvent(), participants: [{ characterName: "Nora" }] })).toBe(false);
    expect(
      parses({ ...anEvent(), participants: [{ characterName: "Nora", declaredAge: -1 }] }),
    ).toBe(false);
  });

  /**
   * An event of the world rather than of a person names nobody. A floor of one
   * would produce an invented presence, which the calculation would then have
   * to check — `WORLD_LIST_COUNTS.outOfNormCapabilities`' zero floor, one
   * section over.
   */
  it("lets an event name nobody", () => {
    expect(parses({ ...anEvent(), participants: [] })).toBe(true);
  });
});

describe("the categories", () => {
  it("mirrors the TimelineEventCategory enum, member for member", () => {
    expect([...TIMELINE_EVENT_CATEGORIES]).toEqual(["BACKSTORY", "NARRATED", "PLANNED"]);
  });

  it("mirrors the TimelinePrecision enum, and glosses every member", () => {
    expect([...TIMELINE_PRECISIONS]).toEqual(["DAY", "MONTH", "SEASON", "YEAR", "DECADE"]);
    expect(Object.keys(TIMELINE_PRECISION_LABELS).sort()).toEqual([...TIMELINE_PRECISIONS].sort());
  });

  /**
   * The acceptance criterion of the *initial* chronology, stated as a property
   * of the type: nothing has been told yet, so no event can be narrated.
   * CAL-133 writes that member, from chapters. There is no third array and no
   * category field, so `NARRATED` has no way into an answer at all.
   */
  it("leaves an initial chronology no way to narrate anything", () => {
    expect([...TIMELINE_INITIAL_CATEGORIES]).toEqual(["BACKSTORY", "PLANNED"]);
    expect(TIMELINE_INITIAL_CATEGORIES).not.toContain("NARRATED");

    for (const category of TIMELINE_INITIAL_CATEGORIES) {
      expect(TIMELINE_EVENT_CATEGORIES).toContain(category);
    }

    expect(Object.keys(datedTimelineSchema.shape)).toHaveLength(TIMELINE_INITIAL_CATEGORIES.length);
  });
});

describe("the chronology ask", () => {
  it("accepts a complete ask", () => {
    expect(bibleTimelineInputSchema.safeParse(aTimelineInput()).success).toBe(true);
  });

  it("closes the corpus over the four upstreams a chronology answers to", () => {
    // No `style`: nothing in a date, a duration or an age reads a register, and
    // an unused input would reopen the ask on every retune of the prose.
    expect([...TIMELINE_SOURCE_KINDS]).toEqual(["direction", "identity", "world", "analysis"]);
    expect(TIMELINE_SOURCE_KINDS).not.toContain("style");
  });

  it("takes an age at the opening, or the honest absence of one", () => {
    const member = { name: "Lise", summary: "L'enfant du voisinage.", ageAtOpening: null };

    expect(timelineCastMemberSchema.safeParse(member).success).toBe(true);
    expect(timelineCastMemberSchema.safeParse({ ...member, ageAtOpening: 7 }).success).toBe(true);
    expect(timelineCastMemberSchema.safeParse({ ...member, ageAtOpening: -1 }).success).toBe(false);
    expect(timelineCastMemberSchema.safeParse(without(member, "ageAtOpening")).success).toBe(false);
  });

  it("refuses an unknown key, so the cast stays the shape the sheet offers", () => {
    expect(
      timelineCastMemberSchema.safeParse({
        name: "Lise",
        summary: "L'enfant du voisinage.",
        ageAtOpening: null,
        birthDay: -2_600,
      }).success,
    ).toBe(false);
  });

  // Principle 6.5: decidable from the ask alone, so it is refused before a
  // token is paid for.
  it("refuses one character offered twice, before any generation", () => {
    const input = aTimelineInput();
    const [first] = input.cast;
    if (first === undefined) throw new Error("the fixture lost its cast");

    expect(
      bibleTimelineInputSchema.safeParse({ ...input, cast: [...input.cast, first] }).success,
    ).toBe(false);
  });

  it("refuses one source key offered twice, before any generation", () => {
    const sources = timelineSources();
    const [first] = sources;
    if (first === undefined) throw new Error("the fixture lost its sources");

    expect(
      bibleTimelineInputSchema.safeParse({ ...aTimelineInput(), sources: [...sources, first] })
        .success,
    ).toBe(false);
  });

  /**
   * A chronology asked with no cast could not be checked at all: there would be
   * nothing for a declared age to contradict.
   */
  it("refuses an ask with nobody to place", () => {
    expect(bibleTimelineInputSchema.safeParse({ ...aTimelineInput(), cast: [] }).success).toBe(
      false,
    );
  });
});
