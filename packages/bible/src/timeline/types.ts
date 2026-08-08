/**
 * The shapes the chronology is reasoned about in (CAL-017).
 *
 * They are structural, not Prisma types: a narrative rule must be runnable
 * without a database (CLAUDE.md §8), and the repository layer that will read
 * these rows does not exist yet (CAL-023). A caller passes its own row type and
 * gets its own row type back.
 */

/**
 * What placing an event on the chronology needs, and nothing else.
 *
 * Both placements of `TimelineEvent` are here — the absolute day and the anchor
 * with its optional duration — because either one alone is a partial answer:
 * the axis carries the events that are dated, the chain carries the ones that
 * are only ordered, and most chronologies mix the two.
 */
export interface TimelinePlacement {
  id: string;
  /** Days from the day the novel opens, negative before it. */
  absoluteDay: number | null;
  /** The event this one is placed after. */
  precedingEventId: string | null;
  /** Days since that event. Null with an anchor set means order without date. */
  daysAfterPreceding: number | null;
}

/** One event of the chronology, in the order the chronology puts it. */
export interface ResolvedTimelineEvent<TEvent extends TimelinePlacement> {
  event: TEvent;
  /**
   * The day the event resolves to, or `null` when its chain never reaches an
   * absolute date. An undated event still has a place in the order — that is
   * what the chain buys — but no position on the axis, and saying `null` is
   * the honest answer where a number would be an invention.
   */
  day: number | null;
}

/**
 * An age is an interval, never a number.
 *
 * Knowing a character is 30 on the day the novel opens fixes their birth only
 * to within a year, so their age a year and a half later is 31 *or* 32
 * depending on where their birthday falls. Returning one of the two would make
 * CAL-093 report a contradiction on roughly half the events of a perfectly
 * consistent novel.
 */
export interface AgeRange {
  min: number;
  max: number;
}
