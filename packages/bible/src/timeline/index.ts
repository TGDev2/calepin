/**
 * The chronology of a novel (CAL-017, CAL-093).
 *
 * `./resolve` and `./age` are the two rules the schema was built around:
 * putting the events of a bible back in order whatever mix of dates and chains
 * places them, and computing how old a character is at one of them. `./schema`
 * is what `build-timeline` is asked and allowed to return — the events before
 * the novel opens and the events it plans to tell, in two arrays so the
 * category is provenance rather than a declaration.
 *
 * `./arithmetic` is the task's centre: the calculation, independent of the
 * model and of the answer's own shape, that decides whether a chronology's
 * ages, dates and durations can all be true at once. `./verify` runs it after
 * turning every name the answer uses into a position, and refuses the whole
 * chronology when it cannot; `./rows` gives `TimelineEvent` and
 * `TimelineEventParticipant` their column values.
 *
 * `fixtures.ts` is deliberately absent — test material, not public surface.
 */

export { ageRangeAt, DAYS_PER_YEAR } from "./age";
export {
  AGE_VERIFIABILITY_WINDOW_DAYS,
  birthDayWindow,
  checkTimelineArithmetic,
  leapDayAllowance,
  TIMELINE_AGE_STATEMENT_SOURCES,
  TIMELINE_INCONSISTENCY_KINDS,
  TIMELINE_PRECISION_TOLERANCE_DAYS,
  type TimelineAgeStatement,
  type TimelineAgeStatementSource,
  type TimelineArithmeticCharacter,
  type TimelineArithmeticEvent,
  type TimelineArithmeticInput,
  type TimelineArithmeticParticipant,
  type TimelineArithmeticReport,
  type TimelineInconsistency,
  type TimelineInconsistencyKind,
  toleranceOf,
} from "./arithmetic";
export { resolveTimeline } from "./resolve";
export {
  countTimelineRows,
  type ResolvedTimelineEventRow,
  type ResolvedTimelineParticipantRow,
  resolveTimelineEvents,
  resolveTimelineParticipants,
} from "./rows";
export {
  type BibleTimelineInput,
  bibleTimelineInputSchema,
  type DatedTimeline,
  datedTimelineSchema,
  TIMELINE_CAST_NAME_CHAR_CEILING,
  TIMELINE_CHAR_CEILINGS,
  TIMELINE_DAY_BOUND,
  TIMELINE_EVENT_CATEGORIES,
  TIMELINE_EVENT_LISTS,
  TIMELINE_INITIAL_CATEGORIES,
  TIMELINE_LABEL_CHAR_CEILING,
  TIMELINE_LIST_COUNTS,
  TIMELINE_PRECISION_LABELS,
  TIMELINE_PRECISIONS,
  TIMELINE_SOURCE_CHAR_CEILING,
  TIMELINE_SOURCE_COUNTS,
  TIMELINE_SOURCE_KEY_CHAR_CEILING,
  TIMELINE_SOURCE_KINDS,
  TIMELINE_WORD_TARGETS,
  type TimelineCastMember,
  timelineCastMemberSchema,
  type TimelineEvent,
  type TimelineEventCategoryInput,
  type TimelineEventList,
  timelineEventSchema,
  type TimelineInitialCategory,
  type TimelineParticipant,
  timelineParticipantSchema,
  type TimelinePrecisionInput,
  type TimelineSource,
  type TimelineSourceKind,
  timelineSourceSchema,
} from "./schema";
export type { AgeRange, ResolvedTimelineEvent, TimelinePlacement } from "./types";
export {
  type BibleTimelineVerification,
  flattenTimeline,
  isVerifiedBibleTimeline,
  locateTimelineEvent,
  VERIFIED_BIBLE_TIMELINE_BRAND,
  type VerifiedBibleTimeline,
  verifyBibleTimeline,
} from "./verify";
