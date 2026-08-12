/**
 * *Cohérence arithmétique des âges et des dates* (CAL-099).
 *
 * Almost none of this is new. CAL-093 wrote the arithmetic — the anchor graph,
 * the precision tolerances, the birth-day intersection — over index-keyed
 * structural types, and said in its own header that it did so because CAL-099
 * and CAL-133 would re-run it over database rows. This file is that re-run: it
 * translates ids into indexes, calls `checkTimelineArithmetic`, and translates
 * the indexes back.
 *
 * **Translating back is the whole reason it is not a one-liner.** An index is
 * fine inside one pass and useless as an identity: inserting an event at the
 * top of the chronology would shift every index, and every arbitration the
 * author had made would follow the shift onto another event. The findings are
 * anchored on row ids.
 *
 * Severity follows what the inconsistency *is*, not how alarming it sounds. A
 * contradiction — two statements that cannot both be true — is `CRITICAL` and
 * blocks the validation. An event nobody dated is `MINOR`: it is the
 * calculation saying it could not run, and CAL-093's own report already treats
 * *could not be checked* as distinct from *checked and wrong*, because silence
 * must not read as approval.
 */

import type { CoherenceFinding } from "@calepin/shared/coherence";

import {
  checkTimelineArithmetic,
  type TimelineArithmeticEvent,
  type TimelineInconsistency,
} from "../../timeline/arithmetic";
import { CAST_AGE_ANCHOR, characterAnchor, timelineEventAnchor } from "../anchor";
import {
  describeAgeConflict,
  describeAgeConflictFix,
  describeBackwardsChain,
  describeBackwardsChainFix,
  describeBrokenAnchor,
  describeBrokenAnchorFix,
  describeCategoryContradiction,
  describeCategoryContradictionFix,
  describeChainCycle,
  describeChainCycleFix,
  describeDateContradiction,
  describeDateContradictionFix,
  describeParticipation,
  describeUndatedEvent,
  describeUndatedEventFix,
} from "../copy";
import type { BibleCoherenceSubject } from "../subject";

const CHECK_ID = "bible-timeline-arithmetic";

/**
 * An index no row answers to.
 *
 * Deliberately not `null`: a foreign key makes a dangling anchor
 * unrepresentable, but if one ever arrived, mapping it to *no anchor at all*
 * would hide it, while mapping it out of range makes `checkTimelineArithmetic`
 * report it. A defect should surface as a finding, never as silence.
 */
const MISSING_INDEX = -1;

function toArithmeticInput(subject: BibleCoherenceSubject): {
  readonly events: readonly TimelineArithmeticEvent[];
  readonly characters: readonly { readonly ageAtOpening: number | null }[];
} {
  const eventIndexById = new Map(subject.timeline.map((event, index) => [event.id, index]));
  const characterIndexById = new Map(
    subject.characters.map((character, index) => [character.id, index]),
  );

  return {
    events: subject.timeline.map((event) => ({
      category: event.category,
      absoluteDay: event.absoluteDay,
      datePrecision: event.datePrecision,
      precedingEventIndex:
        event.precedingEventId === null
          ? null
          : (eventIndexById.get(event.precedingEventId) ?? MISSING_INDEX),
      daysAfterPreceding: event.daysAfterPreceding,
      durationPrecision: event.durationPrecision,
      participants: event.participants.map((participant) => ({
        characterIndex: characterIndexById.get(participant.characterId) ?? MISSING_INDEX,
        declaredAge: participant.declaredAge,
      })),
    })),
    characters: subject.characters.map((character) => ({ ageAtOpening: character.age })),
  };
}

function finding(
  severity: CoherenceFinding["severity"],
  anchor: readonly string[],
  explanation: string,
  proposedFix: string | null,
): CoherenceFinding {
  return {
    checkId: CHECK_ID,
    category: "FACTUAL_CONTINUITY",
    severity,
    anchor,
    explanation,
    proposedFix,
  };
}

/**
 * One finding per inconsistency, with the indexes read back as ids.
 *
 * Total over `TIMELINE_INCONSISTENCY_KINDS` rather than over the kinds this
 * caller can actually produce: three of the eleven are `verifyBibleTimeline`'s
 * and cannot arrive from foreign-keyed rows, and a `switch` that omitted them
 * would stop compiling the day CAL-133 hands this function a model's answer.
 */
function toFinding(
  inconsistency: TimelineInconsistency,
  subject: BibleCoherenceSubject,
): CoherenceFinding | null {
  const eventAt = (index: number): { id: string; name: string } | null =>
    subject.timeline[index] ?? null;
  const characterAt = (index: number): { id: string; name: string } | null =>
    subject.characters[index] ?? null;

  switch (inconsistency.kind) {
    case "age-conflict": {
      const character = characterAt(inconsistency.characterIndex);
      if (character === null) return null;

      const events = inconsistency.outliers
        .map((statement) => (statement.eventIndex === null ? null : eventAt(statement.eventIndex)))
        .filter((event): event is { id: string; name: string } => event !== null);
      const fromCast = inconsistency.outliers.some((statement) => statement.source === "cast");

      return finding(
        "CRITICAL",
        [
          characterAnchor(character.id),
          ...(fromCast ? [CAST_AGE_ANCHOR] : []),
          ...events.map((event) => timelineEventAnchor(event.id)),
        ],
        describeAgeConflict(
          character.name,
          events.map((event) => event.name),
        ),
        describeAgeConflictFix(character.name),
      );
    }

    case "date-contradicts-chain": {
      const event = eventAt(inconsistency.eventIndex);
      const anchorEvent = eventAt(inconsistency.anchorEventIndex);
      if (event === null || anchorEvent === null) return null;

      return finding(
        "CRITICAL",
        [timelineEventAnchor(event.id), timelineEventAnchor(anchorEvent.id)],
        describeDateContradiction(
          event.name,
          anchorEvent.name,
          inconsistency.statedDay,
          inconsistency.impliedDay,
          inconsistency.toleranceDays,
        ),
        describeDateContradictionFix(event.name, anchorEvent.name),
      );
    }

    case "chain-runs-backwards": {
      const event = eventAt(inconsistency.eventIndex);
      const anchorEvent = eventAt(inconsistency.anchorEventIndex);
      if (event === null || anchorEvent === null) return null;

      return finding(
        "CRITICAL",
        [timelineEventAnchor(event.id), timelineEventAnchor(anchorEvent.id)],
        describeBackwardsChain(
          event.name,
          anchorEvent.name,
          inconsistency.day,
          inconsistency.anchorDay,
        ),
        describeBackwardsChainFix(event.name, anchorEvent.name),
      );
    }

    case "chain-cycle": {
      const event = eventAt(inconsistency.eventIndex);
      if (event === null) return null;

      return finding(
        "CRITICAL",
        [timelineEventAnchor(event.id)],
        describeChainCycle(event.name),
        describeChainCycleFix(event.name),
      );
    }

    case "category-contradicts-day": {
      const event = eventAt(inconsistency.eventIndex);
      if (event === null) return null;

      return finding(
        "CRITICAL",
        [timelineEventAnchor(event.id)],
        describeCategoryContradiction(event.name, inconsistency.category, inconsistency.day),
        describeCategoryContradictionFix(event.name),
      );
    }

    case "event-undated": {
      const event = eventAt(inconsistency.eventIndex);
      if (event === null) return null;

      return finding(
        "MINOR",
        [timelineEventAnchor(event.id)],
        describeUndatedEvent(event.name),
        describeUndatedEventFix(event.name),
      );
    }

    case "unknown-anchor":
    case "self-anchor": {
      const event = eventAt(inconsistency.eventIndex);
      if (event === null) return null;

      return finding(
        "MAJOR",
        [timelineEventAnchor(event.id)],
        describeBrokenAnchor(event.name),
        describeBrokenAnchorFix(event.name),
      );
    }

    case "duplicate-event-name": {
      const event = eventAt(inconsistency.eventIndex);
      if (event === null) return null;

      return finding(
        "MAJOR",
        [timelineEventAnchor(event.id)],
        describeBrokenAnchor(event.name),
        null,
      );
    }

    case "unknown-character":
    case "duplicate-participant": {
      const event = eventAt(inconsistency.eventIndex);
      if (event === null) return null;

      return finding(
        "MAJOR",
        [timelineEventAnchor(event.id)],
        describeParticipation(event.name),
        null,
      );
    }
  }
}

export function checkBibleTimeline(subject: BibleCoherenceSubject): readonly CoherenceFinding[] {
  if (subject.timeline.length === 0) return [];

  const report = checkTimelineArithmetic(toArithmeticInput(subject));

  return report.inconsistencies
    .map((inconsistency) => toFinding(inconsistency, subject))
    .filter((entry): entry is CoherenceFinding => entry !== null);
}
