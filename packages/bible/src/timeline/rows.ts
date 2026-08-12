/**
 * A verified chronology as the rows that will hold it (CAL-093).
 *
 * `resolveWorldRules`' role two sections over, and it lives in `rows.ts` rather
 * than in `resolve.ts` because CAL-017 already owns that name here, for the
 * ordering rule. Two different questions, two files: *where does this event
 * sit* is `./resolve`, *what columns does it become* is this one.
 *
 * Every field is spelled as the `TimelineEvent` and `TimelineEventParticipant`
 * columns spell it, so persistence is a copy and not a translation. Two
 * invariants, both this package's standing ones:
 *
 *   - **Nothing resolves a name to an identifier.** An anchor comes out as the
 *     name of the event it points at and a presence as the name of the
 *     character; turning either into a primary key is business code's, with a
 *     live `ProjectScope` in hand (§6). By the time a name reaches here it is
 *     already the established spelling — `verifyBibleTimeline` rewrote it —
 *     so the lookup that does resolve it is an exact one.
 *   - **The category is provenance, never a declaration.** It is written from
 *     which of the answer's two lists the event came out of, which is the same
 *     move `resolveWorldRules` makes for `isSupernatural` and the reason the
 *     answer has two arrays at all.
 *
 * `NARRATED` is unreachable from here, and that is the initial chronology's
 * defining limit rather than an omission: nothing has been told yet. CAL-133
 * writes that member, from chapters.
 */

import {
  type DatedTimeline,
  TIMELINE_INITIAL_CATEGORIES,
  type TimelineInitialCategory,
  type TimelinePrecisionInput,
} from "./schema";
import type { VerifiedBibleTimeline } from "./verify";

/** One `TimelineEvent`, in the column values it will be written with. */
export interface ResolvedTimelineEventRow {
  readonly name: string;
  readonly summary: string;
  readonly category: TimelineInitialCategory;
  readonly absoluteDay: number | null;
  readonly datePrecision: TimelinePrecisionInput | null;
  readonly dateLabel: string | null;
  /** The name of the event this one follows — business code resolves the id. */
  readonly precedingEventName: string | null;
  readonly daysAfterPreceding: number | null;
  readonly durationPrecision: TimelinePrecisionInput | null;
}

/** One `TimelineEventParticipant`, keyed by the two names it joins. */
export interface ResolvedTimelineParticipantRow {
  readonly eventName: string;
  readonly characterName: string;
  readonly declaredAge: number;
}

/**
 * The event rows, backstory first — the order `flattenTimeline` established and
 * the order the chain is safe to insert in, since an anchor is written before
 * whatever anchors to it far more often than not.
 *
 * Insertion order is not a guarantee this function makes, though: an event may
 * legitimately be anchored to a later one in the list, and it is the writer's
 * job to order its statements. What this does guarantee is that every
 * `precedingEventName` names a row in the array it comes back in — verification
 * refused the chronology otherwise.
 */
export function resolveTimelineEvents(
  timeline: VerifiedBibleTimeline,
): readonly ResolvedTimelineEventRow[] {
  return [
    ...timeline.backstoryEvents.map((event) => row(event, TIMELINE_INITIAL_CATEGORIES[0])),
    ...timeline.plannedEvents.map((event) => row(event, TIMELINE_INITIAL_CATEGORIES[1])),
  ];
}

/**
 * The presence rows, one per character at one event.
 *
 * `declaredAge` is carried across rather than recomputed, and the distinction
 * is the whole reason the column exists: it is what the chronology **asserts**,
 * not what the day axis implies. Writing the computed value here would replace
 * the assertion with its own check's answer, and the next pass over these rows
 * — CAL-133's, after a chapter is written — would find nothing left to
 * contradict.
 */
export function resolveTimelineParticipants(
  timeline: VerifiedBibleTimeline,
): readonly ResolvedTimelineParticipantRow[] {
  return [...timeline.backstoryEvents, ...timeline.plannedEvents].flatMap((event) =>
    event.participants.map((participant) => ({
      eventName: event.name,
      characterName: participant.characterName,
      declaredAge: participant.declaredAge,
    })),
  );
}

/**
 * How many rows a chronology is, without resolving it.
 *
 * Unbranded on purpose, `countWorldRows`' reason: counting is not a write, and
 * a caller sizing a transaction or writing a log line (§9) should not have to
 * hold a verified value to do it.
 */
export function countTimelineRows(timeline: DatedTimeline): {
  readonly events: number;
  readonly backstoryEvents: number;
  readonly plannedEvents: number;
  readonly participants: number;
} {
  const events = [...timeline.backstoryEvents, ...timeline.plannedEvents];

  return {
    events: events.length,
    backstoryEvents: timeline.backstoryEvents.length,
    plannedEvents: timeline.plannedEvents.length,
    participants: events.reduce((total, event) => total + event.participants.length, 0),
  };
}

function row(
  event: DatedTimeline["backstoryEvents"][number],
  category: TimelineInitialCategory,
): ResolvedTimelineEventRow {
  return {
    name: event.name,
    summary: event.summary,
    category,
    absoluteDay: event.absoluteDay,
    datePrecision: event.datePrecision,
    dateLabel: event.dateLabel,
    precedingEventName: event.precedingEventName,
    daysAfterPreceding: event.daysAfterPreceding,
    durationPrecision: event.durationPrecision,
  };
}
