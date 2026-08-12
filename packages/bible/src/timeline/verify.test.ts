import { describe, expect, it } from "vitest";

import { TIMELINE_INCONSISTENCY_KINDS, type TimelineInconsistency } from "./arithmetic";
import { aTimeline, aTimelineInput } from "./fixtures";
import type { BibleTimelineInput, DatedTimeline, TimelineEvent, TimelineEventList } from "./schema";
import {
  flattenTimeline,
  isVerifiedBibleTimeline,
  locateTimelineEvent,
  verifyBibleTimeline,
} from "./verify";

/**
 * Every deliberately false chronology below is the fixture with **one** thing
 * changed. That is what makes a firing test mean something: the check found the
 * mutation rather than something that was wrong from the start.
 */
function mutate(
  list: TimelineEventList,
  index: number,
  patch: Partial<TimelineEvent>,
): DatedTimeline {
  const timeline = aTimeline();

  return {
    ...timeline,
    [list]: timeline[list].map((event, at) => (at === index ? { ...event, ...patch } : event)),
  };
}

function refusalOf(
  timeline: DatedTimeline,
  input: BibleTimelineInput = aTimelineInput(),
): readonly TimelineInconsistency[] {
  const verification = verifyBibleTimeline(timeline, input);

  if (verification.outcome !== "refused") {
    throw new Error("the chronology was expected to be refused");
  }

  return verification.inconsistencies;
}

function kindsOf(inconsistencies: readonly TimelineInconsistency[]): string[] {
  return inconsistencies.map((finding) => finding.kind);
}

function verifiedTimeline(timeline: DatedTimeline = aTimeline()) {
  const verification = verifyBibleTimeline(timeline, aTimelineInput());

  if (verification.outcome !== "verified") {
    throw new Error(
      `the fixture no longer verifies: ${kindsOf(verification.inconsistencies).join(", ")}`,
    );
  }

  return verification;
}

describe("verifyBibleTimeline", () => {
  describe("a chronology whose numbers agree", () => {
    it("verifies", () => {
      expect(verifiedTimeline().outcome).toBe("verified");
    });

    it("brands what it returns, so nothing unchecked can be resolved", () => {
      expect(isVerifiedBibleTimeline(verifiedTimeline().timeline)).toBe(true);
      expect(isVerifiedBibleTimeline(aTimeline())).toBe(false);
    });

    it("says what the calculation was actually able to establish", () => {
      const { report } = verifiedTimeline();

      expect(report.consistent).toBe(true);
      expect(report.events).toBe(8);
      expect(report.ageStatements).toBeGreaterThan(10);
      // Every character is placed more than once and dated tightly enough for
      // the statements to have constrained each other.
      expect(report.unverifiableAges).toBe(0);
    });
  });

  describe("names the answer uses", () => {
    it("refuses two events sharing a name, whatever the typography", () => {
      // A curly apostrophe against a typewriter one — the difference a model
      // introduces by retyping, and the reason names are compared as words.
      const found = refusalOf(mutate("plannedEvents", 0, { name: "L’incendie" }));

      expect(found).toEqual([{ kind: "duplicate-event-name", eventIndex: 3, firstEventIndex: 2 }]);
    });

    it("refuses an anchor that names nothing in the chronology", () => {
      const found = refusalOf(
        mutate("plannedEvents", 4, { precedingEventName: "Le départ de Nora" }),
      );

      expect(found).toEqual([{ kind: "unknown-anchor", eventIndex: 7 }]);
    });

    it("refuses an event placed after itself", () => {
      const found = refusalOf(mutate("plannedEvents", 4, { precedingEventName: "La décision" }));

      expect(found).toEqual([{ kind: "self-anchor", eventIndex: 7 }]);
    });

    it("refuses a presence naming somebody outside the cast", () => {
      const found = refusalOf(
        mutate("plannedEvents", 0, {
          participants: [
            { characterName: "Nora", declaredAge: 34 },
            { characterName: "Le facteur", declaredAge: 50 },
          ],
        }),
      );

      expect(found).toEqual([{ kind: "unknown-character", eventIndex: 3, participantIndex: 1 }]);
    });

    it("refuses one character present twice at one event", () => {
      const found = refusalOf(
        mutate("plannedEvents", 0, {
          participants: [
            { characterName: "Nora", declaredAge: 34 },
            { characterName: "NORA", declaredAge: 34 },
          ],
        }),
      );

      expect(found).toEqual([
        {
          kind: "duplicate-participant",
          eventIndex: 3,
          participantIndex: 1,
          firstParticipantIndex: 0,
        },
      ]);
    });

    // Gate one returns alone: with two events sharing a name there is no fact
    // of the matter about which one an anchor points at.
    it("does not report anchors it could not have resolved", () => {
      const found = refusalOf(mutate("plannedEvents", 0, { name: "L'incendie" }));

      expect(kindsOf(found)).toEqual(["duplicate-event-name"]);
    });
  });

  describe("numbers the answer states", () => {
    // The backlog's own example, carried by a real chronology: Nora is 34 when
    // the novel opens, so she cannot have been 12 thirty years earlier.
    it("refuses an age no birth day can satisfy", () => {
      const found = refusalOf(
        mutate("backstoryEvents", 0, {
          participants: [
            { characterName: "Nora", declaredAge: 12 },
            { characterName: "Émile", declaredAge: 31 },
          ],
        }),
      );

      expect(kindsOf(found)).toEqual(["age-conflict"]);

      const [finding] = found;
      if (finding?.kind !== "age-conflict") throw new Error("expected an age conflict");

      expect(finding.outliers).toHaveLength(1);
      expect(finding.outliers[0]?.declaredAge).toBe(12);
    });

    it("refuses a duration that contradicts the date beside it", () => {
      const found = refusalOf(mutate("plannedEvents", 3, { daysAfterPreceding: 40 }));

      expect(kindsOf(found)).toEqual(["date-contradicts-chain"]);
    });

    it("refuses an event the axis cannot place", () => {
      const found = refusalOf(
        mutate("plannedEvents", 4, { daysAfterPreceding: null, durationPrecision: null }),
      );

      expect(found).toEqual([{ kind: "event-undated", eventIndex: 7 }]);
    });

    it("refuses a backstory event dated after the novel opens", () => {
      const found = refusalOf(
        mutate("backstoryEvents", 2, {
          absoluteDay: 30,
          // The ages are corrected with it, so the only thing left wrong is the
          // side of the opening the event now falls on.
          participants: [
            { characterName: "Nora", declaredAge: 34 },
            { characterName: "Émile", declaredAge: 61 },
          ],
        }),
      );

      expect(kindsOf(found)).toEqual(["category-contradicts-day"]);
    });
  });

  describe("the category, which the answer never declares", () => {
    /**
     * The two arrays are the only thing that says what an event is, so moving
     * one across is the whole of what changes. `NARRATED` has no way in at all:
     * there is no third array and no field to write it in.
     */
    it("follows the list the event came out of", () => {
      const timeline = aTimeline();
      const [firstBackstory, ...restBackstory] = timeline.backstoryEvents;

      if (firstBackstory === undefined) throw new Error("the fixture lost its backstory");

      const found = refusalOf({
        backstoryEvents: [...restBackstory, ...timeline.plannedEvents.slice(0, 1)],
        plannedEvents: [...timeline.plannedEvents.slice(1), firstBackstory],
      });

      // The event dated thirty years before the opening is now planned, and the
      // one dated to the opening day is now backstory — which is allowed, since
      // day 0 is the opening itself.
      expect(kindsOf(found)).toContain("category-contradicts-day");
    });
  });

  describe("the spelling it writes back", () => {
    it("takes the cast's, never the model's echo of it", () => {
      const { timeline } = verifiedTimeline(
        mutate("plannedEvents", 2, {
          participants: [
            { characterName: "nora", declaredAge: 34 },
            { characterName: "ÉMILE", declaredAge: 61 },
            { characterName: "Lise", declaredAge: 7 },
          ],
        }),
      );

      expect(timeline.plannedEvents[2]?.participants.map((one) => one.characterName)).toEqual([
        "Nora",
        "Émile",
        "Lise",
      ]);
    });

    it("takes the anchored event's own, so a lookup afterwards is exact", () => {
      const { timeline } = verifiedTimeline(
        mutate("plannedEvents", 1, { precedingEventName: "le retour" }),
      );

      expect(timeline.plannedEvents[1]?.precedingEventName).toBe("Le retour");
    });
  });

  describe("what it reports", () => {
    it("names only kinds the closed list holds", () => {
      const found = refusalOf(mutate("plannedEvents", 3, { daysAfterPreceding: 40 }));

      for (const finding of found) {
        expect(TIMELINE_INCONSISTENCY_KINDS).toContain(finding.kind);
      }
    });

    // §9. A refusal travels to a log line and to a re-ask, so it carries
    // positions and numbers — never an event name, a summary or a date label.
    it("carries no word of the chronology", () => {
      const found = refusalOf(
        mutate("backstoryEvents", 0, {
          participants: [
            { characterName: "Nora", declaredAge: 12 },
            { characterName: "Émile", declaredAge: 31 },
          ],
        }),
      );

      const serialised = JSON.stringify(found);

      for (const event of flattenTimeline(aTimeline())) {
        expect(serialised).not.toContain(event.name);
        expect(serialised).not.toContain(event.summary);
      }

      for (const member of aTimelineInput().cast) {
        expect(serialised).not.toContain(member.name);
      }
    });
  });
});

describe("flattenTimeline", () => {
  it("puts the backstory first, which is the order everything indexes by", () => {
    const timeline = aTimeline();

    expect(flattenTimeline(timeline)).toHaveLength(8);
    expect(flattenTimeline(timeline)[0]).toBe(timeline.backstoryEvents[0]);
    expect(flattenTimeline(timeline)[3]).toBe(timeline.plannedEvents[0]);
  });
});

describe("locateTimelineEvent", () => {
  it("translates a position in the chronology back into the answer's own lists", () => {
    const timeline = aTimeline();

    expect(locateTimelineEvent(timeline, 0)).toEqual({ list: "backstoryEvents", index: 0 });
    expect(locateTimelineEvent(timeline, 2)).toEqual({ list: "backstoryEvents", index: 2 });
    expect(locateTimelineEvent(timeline, 3)).toEqual({ list: "plannedEvents", index: 0 });
    expect(locateTimelineEvent(timeline, 7)).toEqual({ list: "plannedEvents", index: 4 });
  });

  it("answers nothing for a position outside the answer", () => {
    const timeline = aTimeline();

    expect(locateTimelineEvent(timeline, 8)).toBeNull();
    expect(locateTimelineEvent(timeline, -1)).toBeNull();
  });
});
