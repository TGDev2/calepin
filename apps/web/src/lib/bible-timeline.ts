/**
 * Orders a bible's chronology for the consultation screen (CAL-096).
 *
 * `resolveTimeline` in `@calepin/bible` is generic over anything shaped like
 * `TimelinePlacement` — `describeWorldBounds`'s own reasoning, "a row read
 * back out of the table satisfies it as readily as a model's answer" — so a
 * raw `BibleTimelineEventRow` only needs its two precision enums converted to
 * the day counts `toleranceOf` already knows, not a second chain-resolution
 * rule written here.
 */

import { resolveTimeline, type TimelinePlacement, toleranceOf } from "@calepin/bible";
import type { BibleTimelineEventRow } from "@calepin/shared/repository";

export interface OrderedTimelineEvent {
  readonly event: BibleTimelineEventRow;
  /** The day the event resolves to, or `null` when its chain never anchors. */
  readonly day: number | null;
  /** How far that day could be off, in days. Zero when nothing was stated. */
  readonly toleranceDays: number;
}

function toPlacement(event: BibleTimelineEventRow): TimelinePlacement {
  return {
    id: event.id,
    absoluteDay: event.absoluteDay,
    precedingEventId: event.precedingEventId,
    daysAfterPreceding: event.daysAfterPreceding,
    dateToleranceDays: toleranceOf(event.datePrecision),
    durationToleranceDays: toleranceOf(event.durationPrecision),
  };
}

/**
 * The chronology in narrative order, each event's resolved day beside it.
 *
 * Falls back to a stable order by name — never throws, never drops an event —
 * when the stored chain cannot be resolved (an anchor cycle, or an anchor
 * that names an event outside this bible). That state should not exist in a
 * bible a person can reach through this screen, since nothing writes one yet
 * (CLAUDE.md §13); a read screen must still show every row rather than fail
 * the whole section for it.
 */
export function orderTimelineEvents(
  events: readonly BibleTimelineEventRow[],
): readonly OrderedTimelineEvent[] {
  const resolved = resolveTimeline(events.map(toPlacement));

  if (!resolved.ok) {
    return [...events]
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .map((event) => ({ event, day: null, toleranceDays: 0 }));
  }

  const byId = new Map(events.map((event) => [event.id, event]));

  return resolved.value.map(({ event: placement, day, toleranceDays }) => {
    const event = byId.get(placement.id);
    if (event === undefined) {
      throw new Error("resolveTimeline returned an event this bible does not hold");
    }
    return { event, day, toleranceDays };
  });
}
