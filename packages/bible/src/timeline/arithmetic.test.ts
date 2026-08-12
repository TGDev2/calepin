import { describe, expect, it } from "vitest";

import { ageRangeAt, DAYS_PER_YEAR } from "./age";
import {
  AGE_VERIFIABILITY_WINDOW_DAYS,
  birthDayWindow,
  checkTimelineArithmetic,
  leapDayAllowance,
  TIMELINE_INCONSISTENCY_KINDS,
  TIMELINE_PRECISION_TOLERANCE_DAYS,
  type TimelineArithmeticCharacter,
  type TimelineArithmeticEvent,
  type TimelineInconsistency,
  toleranceOf,
} from "./arithmetic";
import { TIMELINE_PRECISIONS } from "./schema";

/**
 * Every fixture here is a number or a position. §9 keeps literary content out
 * of this repository, and an arithmetic rule needs none: what is under test is
 * whether the numbers can all be true, never what happens in the events.
 */
function event(placement: Partial<TimelineArithmeticEvent> = {}): TimelineArithmeticEvent {
  return {
    category: "PLANNED",
    absoluteDay: null,
    datePrecision: null,
    precedingEventIndex: null,
    daysAfterPreceding: null,
    durationPrecision: null,
    participants: [],
    ...placement,
  };
}

/**
 * An event dated exactly, which is the placement with nothing to argue about.
 *
 * The category follows the day unless a test says otherwise, so a fixture built
 * to exercise one rule does not trip another by accident — the category check
 * is real, and it fires on a backstory event written after the opening whether
 * or not that is what the test was about.
 */
function dated(absoluteDay: number, placement: Partial<TimelineArithmeticEvent> = {}) {
  return event({
    absoluteDay,
    datePrecision: "DAY",
    category: absoluteDay < 0 ? "BACKSTORY" : "PLANNED",
    ...placement,
  });
}

function cast(...ages: (number | null)[]): TimelineArithmeticCharacter[] {
  return ages.map((ageAtOpening) => ({ ageAtOpening }));
}

function kindsOf(inconsistencies: readonly TimelineInconsistency[]): string[] {
  return inconsistencies.map((finding) => finding.kind);
}

describe("the tolerance table", () => {
  it("answers for every precision the column can hold", () => {
    expect(Object.keys(TIMELINE_PRECISION_TOLERANCE_DAYS).sort()).toEqual(
      [...TIMELINE_PRECISIONS].sort(),
    );
  });

  it("widens with the vagueness of the label", () => {
    const widths = TIMELINE_PRECISIONS.map((precision) => toleranceOf(precision));

    expect(widths).toEqual([...widths].sort((left, right) => left - right));
    expect(toleranceOf("DAY")).toBe(0);
  });

  it("states nothing when the precision is unstated", () => {
    expect(toleranceOf(null)).toBe(0);
  });

  // The half-widths must cover the period each label names, or a date written
  // in the middle of a season could still fall outside its own window.
  it.each([
    ["MONTH", 31],
    ["SEASON", 91],
    ["YEAR", 365],
  ] as const)("covers the whole of what %s names", (precision, days) => {
    expect(2 * toleranceOf(precision) + 1).toBeGreaterThanOrEqual(days);
  });
});

describe("birthDayWindow", () => {
  it("is a year wide when the day is exact", () => {
    const window = birthDayWindow(30, 0);

    expect(window.latest - window.earliest).toBe(DAYS_PER_YEAR - 1);
  });

  it("widens by the tolerance at both ends", () => {
    const exact = birthDayWindow(30, 0);
    const vague = birthDayWindow(30, 0, 45);

    expect(vague.earliest).toBe(exact.earliest - 45);
    expect(vague.latest).toBe(exact.latest + 45);
  });

  // The duality CAL-017 left implicit. `ageRangeAt` reads the axis forwards and
  // this reads it backwards, and the two must be the same arithmetic — a second
  // answer able to disagree with the first is the copy-that-drifts CAL-012
  // recorded as a lesson.
  it("implies exactly the ages ageRangeAt gives, on every sampled day", () => {
    for (const ageAtOpening of [0, 1, 30, 34, 61, 800]) {
      const window = birthDayWindow(ageAtOpening, 0);

      for (let day = -40_000; day <= 40_000; day += 37) {
        expect(ageRangeAt(ageAtOpening, day)).toEqual({
          min: Math.floor((day - window.latest) / DAYS_PER_YEAR),
          max: Math.floor((day - window.earliest) / DAYS_PER_YEAR),
        });
      }
    }
  });

  it("runs backwards for a birth before the opening and forwards for one after", () => {
    expect(birthDayWindow(0, 400).earliest).toBeGreaterThan(0);
    expect(birthDayWindow(34, 0).latest).toBeLessThan(0);
  });
});

describe("leapDayAllowance", () => {
  it("is one day per four years lived", () => {
    expect(leapDayAllowance(0)).toBe(0);
    expect(leapDayAllowance(4)).toBe(1);
    expect(leapDayAllowance(59)).toBe(15);
  });
});

describe("checkTimelineArithmetic", () => {
  describe("the anchor graph, which is checked before anything is placed", () => {
    it("refuses an anchor that is not in the chronology", () => {
      const report = checkTimelineArithmetic({
        events: [dated(0), event({ precedingEventIndex: 7, daysAfterPreceding: 1 })],
        characters: [],
      });

      expect(report.consistent).toBe(false);
      expect(report.inconsistencies).toEqual([{ kind: "unknown-anchor", eventIndex: 1 }]);
    });

    it("refuses an event placed after itself", () => {
      const report = checkTimelineArithmetic({
        events: [dated(0), event({ precedingEventIndex: 1, daysAfterPreceding: 1 })],
        characters: [],
      });

      expect(report.inconsistencies).toEqual([{ kind: "self-anchor", eventIndex: 1 }]);
    });

    it("reports a loop once, at the event that closes it", () => {
      const report = checkTimelineArithmetic({
        events: [
          event({ precedingEventIndex: 2, daysAfterPreceding: 1, durationPrecision: "DAY" }),
          event({ precedingEventIndex: 0, daysAfterPreceding: 1, durationPrecision: "DAY" }),
          event({ precedingEventIndex: 1, daysAfterPreceding: 1, durationPrecision: "DAY" }),
        ],
        characters: [],
      });

      expect(kindsOf(report.inconsistencies)).toEqual(["chain-cycle"]);
    });

    // Without this gate, three broken anchors among forty events would report
    // thirty-seven undated ones as well — the noise that gets a detector
    // switched off.
    it("comes back alone rather than dragging every unplaced event with it", () => {
      const report = checkTimelineArithmetic({
        events: [event({ precedingEventIndex: 9 }), event(), event(), event()],
        characters: [],
      });

      expect(kindsOf(report.inconsistencies)).toEqual(["unknown-anchor"]);
    });
  });

  describe("placing an event", () => {
    it("refuses an event the axis cannot place", () => {
      const report = checkTimelineArithmetic({
        events: [dated(0), event({ precedingEventIndex: 0 })],
        characters: [],
      });

      expect(report.inconsistencies).toEqual([{ kind: "event-undated", eventIndex: 1 }]);
    });

    it("reports a stated date the chain contradicts", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(100),
          dated(150, {
            precedingEventIndex: 0,
            daysAfterPreceding: 10,
            durationPrecision: "DAY",
          }),
        ],
        characters: [],
      });

      expect(report.inconsistencies).toEqual([
        {
          kind: "date-contradicts-chain",
          eventIndex: 1,
          anchorEventIndex: 0,
          statedDay: 150,
          impliedDay: 110,
          toleranceDays: 0,
        },
      ]);
    });

    it("accepts the same disagreement when the precisions allow it", () => {
      const report = checkTimelineArithmetic({
        events: [
          event({ absoluteDay: 100, datePrecision: "SEASON" }),
          event({
            absoluteDay: 150,
            datePrecision: "DAY",
            precedingEventIndex: 0,
            daysAfterPreceding: 10,
            durationPrecision: "DAY",
          }),
        ],
        characters: [],
      });

      expect(report.consistent).toBe(true);
    });

    // The sign error the duration check cannot see, because this pair states no
    // duration to disagree with.
    it("reports a chain that runs backwards with no duration stated", () => {
      const report = checkTimelineArithmetic({
        events: [dated(100), dated(40, { precedingEventIndex: 0 })],
        characters: [],
      });

      expect(kindsOf(report.inconsistencies)).toEqual(["chain-runs-backwards"]);
    });

    it("accepts two events at the same instant", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(100),
          event({ precedingEventIndex: 0, daysAfterPreceding: 0, durationPrecision: "DAY" }),
        ],
        characters: [],
      });

      expect(report.consistent).toBe(true);
    });

    it("reports a backstory event dated after the opening", () => {
      const report = checkTimelineArithmetic({
        events: [dated(400, { category: "BACKSTORY" })],
        characters: [],
      });

      expect(report.inconsistencies).toEqual([
        {
          kind: "category-contradicts-day",
          eventIndex: 0,
          category: "BACKSTORY",
          day: 400,
          toleranceDays: 0,
        },
      ]);
    });

    it("reports a planned event dated before it", () => {
      const report = checkTimelineArithmetic({
        events: [dated(-400, { category: "PLANNED" })],
        characters: [],
      });

      expect(kindsOf(report.inconsistencies)).toEqual(["category-contradicts-day"]);
    });

    // The axis counts days, so an event earlier on the opening morning has no
    // other day to be written on. Refusing it would be crying wolf over a
    // resolution the schema does not have.
    it("accepts a backstory event on the opening day itself", () => {
      const report = checkTimelineArithmetic({
        events: [dated(0, { category: "BACKSTORY" })],
        characters: [],
      });

      expect(report.consistent).toBe(true);
    });

    it("accepts a backstory event dated to the year the novel opens", () => {
      const report = checkTimelineArithmetic({
        events: [event({ absoluteDay: 90, datePrecision: "YEAR", category: "BACKSTORY" })],
        characters: [],
      });

      expect(report.consistent).toBe(true);
    });
  });

  describe("ages", () => {
    // The backlog's own example: *un personnage de 34 ans qui avait 12 ans il y
    // a 30 ans*. The only age the interval allows at that day is 4.
    it("refuses thirty-four now and twelve thirty years ago", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(-30 * DAYS_PER_YEAR, { participants: [{ characterIndex: 0, declaredAge: 12 }] }),
        ],
        characters: cast(34),
      });

      expect(report.consistent).toBe(false);
      expect(kindsOf(report.inconsistencies)).toEqual(["age-conflict"]);
    });

    it("accepts the age that example should have carried", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(-30 * DAYS_PER_YEAR, { participants: [{ characterIndex: 0, declaredAge: 4 }] }),
        ],
        characters: cast(34),
      });

      expect(report.consistent).toBe(true);
    });

    it("catches two presences that contradict each other with no age at the opening", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(0, { participants: [{ characterIndex: 0, declaredAge: 20 }] }),
          dated(365, { participants: [{ characterIndex: 0, declaredAge: 30 }] }),
        ],
        characters: cast(null),
      });

      expect(kindsOf(report.inconsistencies)).toEqual(["age-conflict"]);
    });

    /**
     * The reason the finding is a consensus rather than a pair. A correct age
     * stated a whole number of years from the opening pins **exactly** the
     * window `Character.age` pins, so a fold reporting *the last two statements
     * that clashed* can name the correct one and never mention the anchor.
     */
    it("names the statement that is wrong, not the one that is right", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(-30 * DAYS_PER_YEAR, { participants: [{ characterIndex: 0, declaredAge: 12 }] }),
          dated(-14 * DAYS_PER_YEAR, { participants: [{ characterIndex: 0, declaredAge: 20 }] }),
        ],
        characters: cast(34),
      });

      const [finding] = report.inconsistencies;

      expect(finding?.kind).toBe("age-conflict");
      if (finding?.kind !== "age-conflict") return;

      expect(finding.outliers).toHaveLength(1);
      expect(finding.outliers[0]?.eventIndex).toBe(0);
      expect(finding.outliers[0]?.declaredAge).toBe(12);
      expect(finding.agreeing).toBe(2);
    });

    it("reports every outlier at once rather than one round trip each", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(-30 * DAYS_PER_YEAR, { participants: [{ characterIndex: 0, declaredAge: 12 }] }),
          dated(-20 * DAYS_PER_YEAR, { participants: [{ characterIndex: 0, declaredAge: 3 }] }),
          dated(-14 * DAYS_PER_YEAR, { participants: [{ characterIndex: 0, declaredAge: 20 }] }),
          dated(-7 * DAYS_PER_YEAR, { participants: [{ characterIndex: 0, declaredAge: 27 }] }),
        ],
        characters: cast(34),
      });

      const [finding] = report.inconsistencies;
      if (finding?.kind !== "age-conflict") throw new Error("expected an age conflict");

      expect(finding.outliers.map((outlier) => outlier.eventIndex)).toEqual([0, 1]);
      expect(finding.agreeing).toBe(3);
    });

    it("catches a character present before they were born", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(-20_000, {
            category: "BACKSTORY",
            participants: [{ characterIndex: 0, declaredAge: 5 }],
          }),
        ],
        characters: cast(30),
      });

      expect(kindsOf(report.inconsistencies)).toEqual(["age-conflict"]);
    });

    /**
     * A character born during the novel has no age at the opening — theirs
     * would be negative, and `characters_age_check` forbids that — so the cast
     * states null and the fold works from the presences alone.
     */
    it("accepts a character born after the novel opens", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(400, { participants: [{ characterIndex: 0, declaredAge: 0 }] }),
          dated(400 + 3 * DAYS_PER_YEAR, { participants: [{ characterIndex: 0, declaredAge: 3 }] }),
        ],
        characters: cast(null),
      });

      expect(report.consistent).toBe(true);
    });

    /**
     * A 365-day year loses about a day every four years against the calendar
     * the model counted on. Verified as a real false positive before the
     * allowance existed: the exact windows below are disjoint, and the
     * chronology is nonetheless correct.
     */
    it("does not report a correct lifetime that a 365-day year cannot span", () => {
      const day = -14_605;
      const exact = {
        opening: birthDayWindow(59, 0),
        event: birthDayWindow(20, day),
      };

      expect(exact.opening.earliest).toBeGreaterThan(exact.event.latest);

      const report = checkTimelineArithmetic({
        events: [
          dated(day, {
            category: "BACKSTORY",
            participants: [{ characterIndex: 0, declaredAge: 20 }],
          }),
        ],
        characters: cast(59),
      });

      expect(report.consistent).toBe(true);
    });

    it("still catches an error the calendar allowance cannot excuse", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(-14_605, {
            category: "BACKSTORY",
            participants: [{ characterIndex: 0, declaredAge: 22 }],
          }),
        ],
        characters: cast(59),
      });

      expect(report.consistent).toBe(false);
    });

    it("ignores a presence at an event nothing places, having refused it already", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(0),
          event({ precedingEventIndex: 0, participants: [{ characterIndex: 0, declaredAge: 99 }] }),
        ],
        characters: cast(34),
      });

      expect(kindsOf(report.inconsistencies)).toEqual(["event-undated"]);
    });
  });

  describe("what it could not check", () => {
    it("counts a character the chronology never places", () => {
      const report = checkTimelineArithmetic({ events: [dated(0)], characters: cast(34) });

      expect(report.consistent).toBe(true);
      expect(report.ageStatements).toBe(1);
      expect(report.unverifiableAges).toBe(1);
    });

    it("counts a character nothing says anything about", () => {
      const report = checkTimelineArithmetic({ events: [dated(0)], characters: cast(null) });

      expect(report.unverifiableAges).toBe(1);
    });

    /**
     * Silence must not read as approval. Dated to the decade, the slack is six
     * years and no age error of a plausible size can fail — so the count is
     * what tells a caller the difference between *checked and held* and *could
     * not be checked*.
     */
    it("counts a character whose ages the precisions leave unpinned", () => {
      const report = checkTimelineArithmetic({
        events: [
          event({
            absoluteDay: -7_300,
            datePrecision: "DECADE",
            category: "BACKSTORY",
            participants: [{ characterIndex: 0, declaredAge: 30 }],
          }),
          event({
            absoluteDay: -3_650,
            datePrecision: "DECADE",
            category: "BACKSTORY",
            participants: [{ characterIndex: 0, declaredAge: 40 }],
          }),
        ],
        characters: cast(null),
      });

      // Two statements that agree, and agreement that proves nothing: the slack
      // either side is six years, so no plausible age error could have failed.
      expect(report.consistent).toBe(true);
      expect(report.ageStatements).toBe(2);
      expect(report.unverifiableAges).toBe(1);
    });

    it("does not count a character two exact statements agree on", () => {
      const report = checkTimelineArithmetic({
        events: [dated(0, { participants: [{ characterIndex: 0, declaredAge: 34 }] })],
        characters: cast(34),
      });

      expect(report.unverifiableAges).toBe(0);
      expect(report.ageStatements).toBe(2);
    });

    it("draws the line at two years, which is where an age stops pinning a birth", () => {
      expect(AGE_VERIFIABILITY_WINDOW_DAYS).toBe(2 * DAYS_PER_YEAR);
    });
  });

  describe("what it reports", () => {
    it("names only kinds the closed list holds", () => {
      const report = checkTimelineArithmetic({
        events: [dated(400, { category: "BACKSTORY" }), event({ precedingEventIndex: 0 })],
        characters: [],
      });

      for (const finding of report.inconsistencies) {
        expect(TIMELINE_INCONSISTENCY_KINDS).toContain(finding.kind);
      }
    });

    // §9. Every field is a position, a day, an age or a closed identifier;
    // nothing a reader could read as part of the novel can reach a log line.
    it("carries positions and numbers only, never a word of the chronology", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(-30 * DAYS_PER_YEAR, {
            category: "BACKSTORY",
            participants: [{ characterIndex: 0, declaredAge: 12 }],
          }),
        ],
        characters: cast(34),
      });

      const values = report.inconsistencies.flatMap((finding) =>
        finding.kind === "age-conflict"
          ? finding.outliers.flatMap((outlier) => Object.values(outlier))
          : Object.values(finding),
      );

      for (const value of values) {
        if (typeof value !== "string") {
          expect(typeof value).toBe("number");
          continue;
        }

        expect([
          ...TIMELINE_INCONSISTENCY_KINDS,
          "cast",
          "participation",
          "BACKSTORY",
          "PLANNED",
        ]).toContain(value);
      }
    });

    it("counts what it read, which nothing downstream could recover", () => {
      const report = checkTimelineArithmetic({
        events: [
          dated(0, { participants: [{ characterIndex: 0, declaredAge: 34 }] }),
          dated(365, { participants: [{ characterIndex: 0, declaredAge: 35 }] }),
        ],
        characters: cast(34),
      });

      expect(report.events).toBe(2);
      expect(report.ageStatements).toBe(3);
    });

    it("answers an empty chronology without inventing a complaint", () => {
      const report = checkTimelineArithmetic({ events: [], characters: [] });

      expect(report).toEqual({
        consistent: true,
        events: 0,
        ageStatements: 0,
        unverifiableAges: 0,
        inconsistencies: [],
      });
    });
  });
});
