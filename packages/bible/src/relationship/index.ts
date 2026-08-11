/**
 * The relationship graph: contract, verification, classification and
 * resolution (CAL-091). `fixtures.ts` is deliberately absent — test material,
 * not public surface.
 */

export {
  parseRelationshipContent,
  type RelationshipContent,
  relationshipContentSchema,
} from "./edit";
export {
  type DescribableEdge,
  describeEdge,
  describeRelationshipGraph,
  describeSymmetry,
  type DirectedEdge,
  RELATIONSHIP_DIRECTION_CONNECTOR,
  RELATIONSHIP_SIDE_CONNECTOR,
  RELATIONSHIP_SYMMETRIES,
  RELATIONSHIP_SYMMETRY_CONNECTOR,
  RELATIONSHIP_SYMMETRY_LABELS,
  RELATIONSHIP_UNANSWERED_NOTICE,
  type RelationshipGraph,
  type RelationshipPair,
  type RelationshipSymmetry,
  resolveRelationshipGraph,
} from "./graph";
export {
  type PendingCanonFact,
  type PendingCanonFactBelief,
  RELATIONSHIP_ASYMMETRY_CONNECTOR,
  RELATIONSHIP_DESCRIPTION_SEPARATOR,
  RELATIONSHIP_STANCE_SEPARATOR,
  resolveCharacterRelations,
  type ResolvedRelationshipRow,
  resolveRelationshipAsymmetries,
} from "./resolve";
export {
  type CharacterRelations,
  type CharacterRelationsInput,
  characterRelationsInputSchema,
  characterRelationsSchema,
  type DirectedRelationship,
  directedRelationshipSchema,
  RELATIONSHIP_CAST_COUNTS,
  RELATIONSHIP_CHAR_CEILINGS,
  RELATIONSHIP_LIST_COUNTS,
  RELATIONSHIP_WORD_TARGETS,
  type RelationshipAsymmetry,
  relationshipAsymmetrySchema,
} from "./schema";
export {
  CHARACTER_RELATIONS_DROP_REASONS,
  CHARACTER_RELATIONS_REFUSALS,
  type CharacterRelationsDroppedEntry,
  type CharacterRelationsDropReason,
  type CharacterRelationsRefusal,
  type CharacterRelationsVerification,
  isVerifiedCharacterRelations,
  VERIFIED_CHARACTER_RELATIONS_BRAND,
  type VerifiedCharacterRelations,
  verifyCharacterRelations,
} from "./verify";
