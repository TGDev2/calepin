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
  /**
   * How far the stated day could be off, in days — half the width of what its
   * `datePrecision` denotes. Absent means nothing was stated about the
   * exactness, which is read as zero.
   *
   * Uncertainty is part of placing an event rather than a separate concern: a
   * date known to the year and a date known to the day are the same column and
   * different placements, and only the caller's own vocabulary can say which.
   * The days behind each `TimelinePrecision` member are a narrative rule, so
   * they live in `./arithmetic` (CAL-093) and arrive here already converted —
   * which is what keeps this module free of a table it would have to agree with
   * (CAL-017).
   */
  dateToleranceDays?: number;
  /** The same, for the stated duration since the anchor. */
  durationToleranceDays?: number;
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
  /**
   * How far that day could be off, in days: the uncertainty of the date the
   * chain is rooted in plus that of every hop walked since. Zero when nothing
   * was stated, and zero when `day` is null — an unknown day has no width worth
   * naming.
   *
   * Carried here rather than computed beside this function because it is the
   * same walk: the day and how far it could be off are one answer, and
   * separating them would mean walking the chain twice with two cycle
   * detections, which is two places for the order to disagree with itself.
   */
  toleranceDays: number;
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
