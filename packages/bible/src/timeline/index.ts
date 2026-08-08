/**
 * The chronology of a novel (CAL-017).
 *
 * Two rules and the shapes they read: putting the events of a bible back in
 * order whatever mix of dates and chains places them, and computing how old a
 * character is at one of them.
 */

export { ageRangeAt, DAYS_PER_YEAR } from "./age";
export { resolveTimeline } from "./resolve";
export type { AgeRange, ResolvedTimelineEvent, TimelinePlacement } from "./types";
