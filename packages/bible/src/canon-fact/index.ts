/**
 * The canonical facts of a novel (CAL-018, CAL-094).
 *
 * Two rules and the shapes they read: whether a fact is in force at a moment
 * of the chronology, and whether a character's belief agrees with the world —
 * the derivation that stands in for a stored KNOWS.
 *
 * And, since CAL-094, the mission that fills the table: what
 * `extract-initial-facts` may be asked and may answer (`./schema`), whether one
 * statement says one thing (`./atomicity`), whether two facts are one
 * (`./dedup`), the pass that reads an answer back against its ask (`./verify`)
 * and the columns a verified canon becomes (`./rows`).
 */

export {
  CANON_FACT_CAUSAL_MARKERS,
  CANON_FACT_COORDINATION_MARKERS,
  CANON_FACT_NEGATION_MARKERS,
  CANON_FACT_STATEMENT_DEFECT_LABELS,
  CANON_FACT_STATEMENT_DEFECTS,
  CANON_FACT_TEMPORAL_MARKERS,
  type CanonFactStatementDefect,
  type CanonFactStatementDefectKind,
  checkCanonFactStatement,
  isAtomicCanonFactStatement,
} from "./atomicity";
export { beliefMatchesWorld } from "./belief";
export {
  CANON_FACT_DUPLICATE_KINDS,
  CANON_FACT_NEAR_DUPLICATE_RATIO,
  CANON_FACT_STOP_WORDS,
  type CanonFactDeduplication,
  type CanonFactDeduplicationReport,
  type CanonFactDuplicateKind,
  type CanonFactDuplication,
  canonFactKey,
  type CanonFactMerge,
  canonFactStatementKey,
  type DeduplicableCanonFact,
  type DeduplicableCanonFactBelief,
  deduplicateCanonFacts,
  type KnownDeduplicableCanonFact,
} from "./dedup";
export {
  CANON_FACT_EDIT_LIST_CEILINGS,
  type CanonFactBeliefInput,
  canonFactBeliefInputSchema,
  type CanonFactBoundInput,
  canonFactBoundInputSchema,
  type CanonFactContent,
  canonFactContentSchema,
  type CanonFactSubjectInput,
  canonFactSubjectInputSchema,
  parseCanonFactContent,
} from "./edit";
export { factInForceOn } from "./in-force";
export {
  CANON_FACT_SOURCE_BY_KIND,
  countCanonFactRows,
  type ResolvedCanonFactBeliefRow,
  type ResolvedCanonFactRow,
  type ResolvedCanonFactSubjectRow,
  resolveInitialCanonFacts,
} from "./rows";
export {
  type AnsweredCanonFact,
  CANON_FACT_CHAR_CEILINGS,
  CANON_FACT_LABEL_CHAR_CEILING,
  CANON_FACT_LIST_COUNTS,
  CANON_FACT_LISTS,
  CANON_FACT_SOURCE_CHAR_CEILING,
  CANON_FACT_SOURCE_COUNTS,
  CANON_FACT_SOURCE_KEY_CHAR_CEILING,
  CANON_FACT_SOURCE_KINDS,
  CANON_FACT_SUBJECT_KINDS,
  CANON_FACT_TOTAL_COUNTS,
  CANON_FACT_VALIDITY_BY_LIST,
  CANON_FACT_WORD_TARGETS,
  type CanonFactBasis,
  canonFactBasisSchema,
  type CanonFactBeliefDeclaration,
  canonFactBeliefSchema,
  type CanonFactBound,
  canonFactBoundSchema,
  type CanonFactEvent,
  canonFactEventSchema,
  type CanonFactList,
  type CanonFactPlace,
  canonFactPlaceSchema,
  type CanonFactSourceEntry,
  type CanonFactSourceKind,
  canonFactSourceSchema,
  type CanonFactSubjectDeclaration,
  type CanonFactSubjectKind,
  canonFactSubjectSchema,
  type EndedFact,
  endedFactSchema,
  type FactDecomposition,
  factDecompositionSchema,
  type InitialCanonFacts,
  type InitialCanonFactsInput,
  initialCanonFactsInputSchema,
  initialCanonFactsSchema,
  type KnownCanonFact,
  knownCanonFactSchema,
  type PeriodFact,
  periodFactSchema,
  type PermanentFact,
  permanentFactSchema,
} from "./schema";
export {
  CANON_FACT_BELIEF_STATE_LABELS,
  CANON_FACT_BELIEF_STATES,
  CANON_FACT_SOURCES,
  CANON_FACT_VALIDITIES,
  type CanonFactBeliefState,
  type CanonFactSource,
  type CanonFactValidity,
  type CanonFactWindow,
} from "./types";
export {
  CANON_FACT_DROP_REASONS,
  CANON_FACT_REFUSALS,
  type CanonFactDroppedEntry,
  type CanonFactDropReason,
  type CanonFactRefusal,
  flattenCanonFacts,
  type InitialCanonFactsReport,
  type InitialCanonFactsVerification,
  isVerifiedInitialCanonFacts,
  locateCanonFact,
  VERIFIED_INITIAL_CANON_FACTS_BRAND,
  type VerifiedInitialCanonFacts,
  verifyInitialCanonFacts,
} from "./verify";
