/**
 * The identity section of the bible (CAL-088).
 *
 * `./schema` is the contract — what the mission is asked and what it may
 * answer; `./basis` reads every field back against the corpus the ask offered;
 * `./resolve` composes the specification's eleven fields from the nine that
 * were generated and the two the project already decided.
 */

export {
  checkNovelIdentityBasis,
  NOVEL_IDENTITY_BASIS_FAILURES,
  type NovelIdentityBasisFailure,
  type NovelIdentityBasisReport,
  type NovelIdentityUntracedField,
} from "./basis";
export {
  type NovelIdentity,
  type NovelIdentityProjectSettings,
  resolveNovelIdentity,
} from "./resolve";
export {
  IDENTITY_SOURCE_KINDS,
  type IdentitySource,
  type IdentitySourceKind,
  identitySourceSchema,
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
  type NovelIdentityBasis,
  type NovelIdentityField,
  type NovelIdentityInput,
  novelIdentityInputSchema,
  type NovelIdentityScalarField,
  type NovelIdentityThematicAxis,
  type TracedNovelIdentity,
  tracedNovelIdentitySchema,
} from "./schema";
