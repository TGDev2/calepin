/**
 * The world section of the bible (CAL-092).
 *
 * `./schema` is the contract — the specification's ten items as nine fields,
 * the tenth being the shape of the ninth: an out-of-norm capability carries
 * its limits, its costs and its failure conditions, and there is no shape in
 * which it does not. `./verify` reads a world back against itself, dropping
 * what would not insert and refusing what fell below the contract's floors;
 * `./resolve` gives `BibleWorld`, `Place` and `WorldRule` their column values,
 * writing `isSupernatural` from provenance rather than from the answer;
 * `./bounds` phrases what the world forbids in the French the prompt, the
 * writing context and the originality controls all quote.
 *
 * `fixtures.ts` is deliberately absent — test material, not public surface.
 */

export {
  countWorldBounds,
  describeWorldBounds,
  describeWorldRule,
  WORLD_BOUND_SEPARATOR,
  WORLD_CAPABILITY_NOTICE,
  WORLD_COSTS_NOTICE,
  WORLD_FAILURE_NOTICE,
  WORLD_FORBIDS_NOTICE,
  WORLD_LIMITS_NOTICE,
} from "./bounds";
export {
  countWorldRows,
  resolveBibleWorld,
  type ResolvedBibleWorld,
  type ResolvedPlaceRow,
  type ResolvedWorldRuleRow,
  resolveWorldPlaces,
  resolveWorldRules,
  WORLD_CONSEQUENCE_CONNECTOR,
  WORLD_FORBIDS_CONNECTOR,
} from "./resolve";
export {
  type OutOfNormCapability,
  outOfNormCapabilitySchema,
  WORLD_CHAR_CEILINGS,
  WORLD_FIELD_LABELS,
  WORLD_FIELDS,
  WORLD_LABEL_CHAR_CEILING,
  WORLD_LIST_COUNTS,
  WORLD_SOURCE_CHAR_CEILING,
  WORLD_SOURCE_COUNTS,
  WORLD_SOURCE_KEY_CHAR_CEILING,
  WORLD_SOURCE_KINDS,
  WORLD_WORD_TARGETS,
  type WorldBible,
  type WorldBibleInput,
  worldBibleInputSchema,
  worldBibleSchema,
  type WorldConstraint,
  worldConstraintSchema,
  type WorldField,
  type WorldPlace,
  worldPlaceSchema,
  type WorldRuleDeclaration,
  worldRuleSchema,
  type WorldSource,
  type WorldSourceKind,
  worldSourceSchema,
} from "./schema";
export {
  isVerifiedWorldBible,
  VERIFIED_WORLD_BIBLE_BRAND,
  type VerifiedWorldBible,
  verifyWorldBible,
  WORLD_BIBLE_DROP_LISTS,
  WORLD_BIBLE_DROP_REASONS,
  WORLD_BIBLE_REFUSALS,
  type WorldBibleDropList,
  type WorldBibleDroppedEntry,
  type WorldBibleDropReason,
  type WorldBibleRefusal,
  type WorldBibleVerification,
} from "./verify";
