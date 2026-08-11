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
  checkNovelIdentityBasis,
  IDENTITY_SOURCE_KINDS,
  type IdentitySource,
  type IdentitySourceKind,
  identitySourceSchema,
  NOVEL_IDENTITY_BASIS_FAILURES,
  NOVEL_IDENTITY_CHAR_CEILINGS,
  NOVEL_IDENTITY_FIELD_LABELS,
  NOVEL_IDENTITY_FIELDS,
  NOVEL_IDENTITY_LABEL_CHAR_CEILING,
  NOVEL_IDENTITY_SCALAR_FIELDS,
  NOVEL_IDENTITY_SOURCE_CHAR_CEILING,
  NOVEL_IDENTITY_SOURCE_COUNTS,
  NOVEL_IDENTITY_SOURCE_KEY_CHAR_CEILING,
  NOVEL_IDENTITY_THEME_COUNTS,
  NOVEL_IDENTITY_WORD_TARGETS,
  type NovelIdentity,
  type NovelIdentityBasis,
  type NovelIdentityBasisFailure,
  type NovelIdentityBasisReport,
  type NovelIdentityField,
  type NovelIdentityInput,
  novelIdentityInputSchema,
  type NovelIdentityProjectSettings,
  type NovelIdentityScalarField,
  type NovelIdentityThematicAxis,
  type NovelIdentityUntracedField,
  resolveNovelIdentity,
  type TracedNovelIdentity,
  tracedNovelIdentitySchema,
} from "./identity";
export {
  type AgeRange,
  ageRangeAt,
  DAYS_PER_YEAR,
  type ResolvedTimelineEvent,
  resolveTimeline,
  type TimelinePlacement,
} from "./timeline";
