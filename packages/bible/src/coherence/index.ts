/**
 * The bible's coherence check (CAL-099).
 *
 * Four calculable checks over the rows, one model mission for what no key can
 * reach, and the gate that stands in front of the validation. The engine they
 * plug into is `@calepin/shared/coherence`; what is here is everything that
 * needs to know what a chronology, a relationship and a canonical fact mean.
 */

export {
  canonFactAnchor,
  CAST_AGE_ANCHOR,
  characterAnchor,
  nameAnchor,
  placeAnchor,
  relationshipAnchor,
  timelineEventAnchor,
  worldRuleAnchor,
} from "./anchor";
export { checkCanonFactCollisions } from "./checks/facts";
export { checkUndeclaredNames, extractNameCandidates } from "./checks/names";
export { checkRelationshipSymmetry } from "./checks/relationships";
export { checkBibleTimeline } from "./checks/timeline";
export { BIBLE_PROSE_SOURCE_NAMES } from "./copy";
export { type BibleContradictionRowIds, resolveBibleContradictions } from "./rows";
export {
  BIBLE_CONTRADICTION_CHAR_CEILINGS,
  BIBLE_CONTRADICTION_LABEL_CHAR_CEILING,
  BIBLE_CONTRADICTION_LIST_COUNTS,
  BIBLE_CONTRADICTION_LISTS,
  BIBLE_CONTRADICTION_MINIMUM_ELEMENTS,
  BIBLE_CONTRADICTION_WORD_TARGETS,
  type BibleContradictionList,
  type BibleContradictions,
  type BibleContradictionsInput,
  bibleContradictionsInputSchema,
  bibleContradictionsSchema,
  type ContradictionFact,
  contradictionFactSchema,
  type ContradictionPair,
  contradictionPairSchema,
  type ContradictionRule,
  contradictionRuleSchema,
} from "./schema";
export {
  BIBLE_PROSE_SOURCES,
  type BibleCanonFactRow,
  type BibleCoherenceSubject,
  type BibleContentRows,
  type BibleIdentityProse,
  type BiblePlaceRow,
  type BibleProsePassage,
  type BibleProseSource,
  type BibleRelationshipRow,
  type BibleStyleProse,
  type BibleTimelineRow,
  type BibleWorldProse,
  type BibleWorldRuleRow,
  buildBibleCoherenceSubject,
  characterNames,
  type CoherenceCanonFact,
  type CoherenceCanonFactBelief,
  type CoherenceCharacter,
  type CoherencePlace,
  type CoherenceRelationship,
  type CoherenceTimelineEvent,
  type CoherenceTimelineParticipant,
  type CoherenceWorldRule,
  placeNames,
  timelineEventNames,
} from "./subject";
export { BIBLE_COHERENCE_SUITE, BIBLE_SUITE_CHECK_IDS, checkBibleCoherence } from "./suite";
export {
  BIBLE_CONTRADICTION_DROP_REASONS,
  type BibleContradictionDroppedEntry,
  type BibleContradictionDropReason,
  type BibleContradictionsReport,
  type BibleContradictionsVerification,
  isVerifiedBibleContradictions,
  VERIFIED_BIBLE_CONTRADICTIONS_BRAND,
  type VerifiedBibleContradictions,
  verifyBibleContradictions,
} from "./verify";
