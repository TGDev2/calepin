/**
 * The style section of the bible (CAL-089).
 *
 * `./schema` is the contract — what the mission is asked and what it may
 * answer, every element an operational constraint paired with its observable
 * breach; `./resolve` flattens each pair into the one text its `BibleStyle`
 * column stores.
 */

export { resolveBibleStyle, type ResolvedBibleStyle, STYLE_VIOLATION_CONNECTOR } from "./resolve";
export {
  type BibleStyleInput,
  bibleStyleInputSchema,
  type OperationalStyle,
  operationalStyleSchema,
  STYLE_AUDIENCE_CHAR_CEILING,
  STYLE_CHAR_CEILINGS,
  STYLE_FIELD_LABELS,
  STYLE_FIELDS,
  STYLE_LIST_COUNTS,
  STYLE_SCALAR_FIELDS,
  STYLE_SOURCE_CHAR_CEILING,
  STYLE_SOURCE_COUNTS,
  STYLE_SOURCE_KEY_CHAR_CEILING,
  STYLE_SOURCE_KINDS,
  STYLE_WORD_TARGETS,
  type StyleConstraint,
  styleConstraintSchema,
  type StyleField,
  type StyleScalarField,
  type StyleSource,
  type StyleSourceKind,
  styleSourceSchema,
} from "./schema";
