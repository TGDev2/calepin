import { describe, expect, it } from "vitest";

import {
  describeAgeConflict,
  describeBackwardsChain,
  describeChainCycle,
  describeDateContradiction,
  describeUndatedEvent,
} from "../copy";
import { aBibleContent, DEPARTURE, FIRE, NORA, OPENING } from "../fixtures";
import {
  type BibleContentRows,
  type BibleTimelineRow,
  buildBibleCoherenceSubject,
} from "../subject";
import { checkBibleTimeline } from "./timeline";

function withEvent(id: string, patch: Partial<BibleTimelineRow>): BibleContentRows {
  const content = aBibleContent();

  return {
    ...content,
    timeline: content.timeline.map((event) => (event.id === id ? { ...event, ...patch } : event)),
  };
}

function findings(content: BibleContentRows) {
  return checkBibleTimeline(buildBibleCoherenceSubject(content));
}

describe("checkBibleTimeline", () => {
  it("says nothing about a chronology whose arithmetic holds", () => {
    expect(findings(aBibleContent())).toEqual([]);
  });

  it("says nothing when there is no chronology at all", () => {
    expect(findings({ ...aBibleContent(), timeline: [] })).toEqual([]);
  });

  it("reports an age the rest of the chronology contradicts, and names the character", () => {
    // The sheet says twelve while the fire, the opening and the departure agree
    // on a woman ten years older at each of them. Consensus names the outlier —
    // CAL-093's rule, so the finding is about the sheet and not about a pair.
    const content = aBibleContent();
    const broken: BibleContentRows = {
      ...content,
      characters: content.characters.map((character) =>
        character.id === NORA ? { ...character, age: 12 } : character,
      ),
    };

    const [finding, ...rest] = findings(broken);

    expect(rest).toEqual([]);
    expect(finding?.severity).toBe("CRITICAL");
    expect(finding?.checkId).toBe("bible-timeline-arithmetic");
    expect(finding?.anchor).toContain(`character:${NORA}`);
    expect(finding?.anchor).toContain("statement:cast");
    expect(finding?.explanation).toBe(describeAgeConflict("Nora", []));
  });

  it("reports a date the chain contradicts, and names both events", () => {
    const broken = withEvent(DEPARTURE, { absoluteDay: 1_000, participants: [] });
    const [finding, ...rest] = findings(broken);

    expect(rest).toEqual([]);
    expect(finding?.severity).toBe("CRITICAL");
    expect([...(finding?.anchor ?? [])].sort()).toEqual(
      [`event:${DEPARTURE}`, `event:${OPENING}`].sort(),
    );
    expect(finding?.explanation).toBe(
      describeDateContradiction("le départ de la vallée", "le retour au hameau", 1_000, 365, 0),
    );
  });

  it("reports an event that precedes the one it is said to follow", () => {
    const broken = withEvent(DEPARTURE, {
      absoluteDay: -100,
      category: "BACKSTORY",
      daysAfterPreceding: null,
      durationPrecision: null,
      participants: [],
    });

    const found = findings(broken);

    expect(found.map((entry) => entry.explanation)).toContain(
      describeBackwardsChain("le départ de la vallée", "le retour au hameau", -100, 0),
    );
    expect(found.every((entry) => entry.severity === "CRITICAL")).toBe(true);
  });

  it("reports a loop in the chain", () => {
    const content = aBibleContent();
    const broken: BibleContentRows = {
      ...content,
      timeline: content.timeline.map((event) => {
        if (event.id === OPENING) {
          return {
            ...event,
            absoluteDay: null,
            datePrecision: null,
            precedingEventId: DEPARTURE,
            daysAfterPreceding: 10,
            durationPrecision: "DAY",
            participants: [],
          };
        }
        if (event.id === DEPARTURE) {
          return {
            ...event,
            absoluteDay: null,
            datePrecision: null,
            precedingEventId: OPENING,
            participants: [],
          };
        }

        return event;
      }),
    };

    const found = findings(broken);

    expect(found.map((entry) => entry.explanation)).toContain(
      describeChainCycle("le retour au hameau"),
    );
  });

  it("reports an undated event as worth knowing rather than as a contradiction", () => {
    // The calculation saying it could not run. Blocking a validation on it would
    // stop every author who has not finished dating their chronology, which is
    // the detector nobody leaves switched on.
    const broken = withEvent(FIRE, {
      absoluteDay: null,
      datePrecision: null,
      participants: [],
    });

    const found = findings(broken);
    const undated = found.find(
      (entry) => entry.explanation === describeUndatedEvent("l'incendie de la grange"),
    );

    expect(undated?.severity).toBe("MINOR");
    expect(undated?.anchor).toEqual([`event:${FIRE}`]);
  });

  it("anchors on row ids, so inserting an event elsewhere does not move a finding", () => {
    // An index would have moved. That is the whole reason this file translates
    // the arithmetic's indexes back before reporting.
    const content = aBibleContent();
    const broken: BibleContentRows = {
      ...content,
      characters: content.characters.map((character) =>
        character.id === NORA ? { ...character, age: 12 } : character,
      ),
    };
    const before = findings(broken);

    const shifted: BibleContentRows = {
      ...broken,
      timeline: [
        {
          id: "event-inserted",
          name: "une veille sans témoin",
          summary: null,
          category: "BACKSTORY",
          absoluteDay: -7_300,
          datePrecision: "YEAR",
          precedingEventId: null,
          daysAfterPreceding: null,
          durationPrecision: null,
          participants: [],
        },
        ...broken.timeline,
      ],
    };

    expect(findings(shifted).map((entry) => entry.anchor)).toEqual(
      before.map((entry) => entry.anchor),
    );
  });
});
