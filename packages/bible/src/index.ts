/**
 * @calepin/bible — the narrative reference
 *
 * Public surface of the domain. Everything other workspaces are allowed to use
 * is re-exported from here; nothing reaches into `src/` directly.
 *
 * Backlog: E09 — CAL-088 to CAL-100
 */

export {
  beliefMatchesWorld,
  type CanonFactBeliefState,
  type CanonFactValidity,
  type CanonFactWindow,
  factInForceOn,
} from "./canon-fact";
export {
  type AgeRange,
  ageRangeAt,
  DAYS_PER_YEAR,
  type ResolvedTimelineEvent,
  resolveTimeline,
  type TimelinePlacement,
} from "./timeline";
