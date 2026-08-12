/**
 * The character sheet: contract, knowledge vocabulary, verification,
 * resolution and hand-editing (CAL-090, CAL-097). `fixtures.ts` is
 * deliberately absent — test material, not public surface.
 */

export {
  CHARACTER_EDIT_CHAR_CEILINGS,
  CHARACTER_EDIT_LIST_MAX,
  type CharacterContent,
  characterContentSchema,
  parseCharacterContent,
} from "./edit";
export {
  CHARACTER_KNOWLEDGE_STANCE_LABELS,
  CHARACTER_KNOWLEDGE_STANCE_PREFIXES,
  CHARACTER_KNOWLEDGE_STANCE_VERBS,
  CHARACTER_KNOWLEDGE_STANCES,
  type CharacterKnowledgeStance,
  type KnowledgeBelief,
  knowledgeStanceToBelief,
} from "./knowledge";
export {
  CHARACTER_BREACH_CONNECTOR,
  CHARACTER_DILEMMA_CONNECTOR,
  CHARACTER_DIVERGENCE_CONNECTOR,
  resolveCharacterSheet,
  type ResolvedCharacterRelationship,
  type ResolvedCharacterSheet,
} from "./resolve";
export {
  CHARACTER_BRIEF_CHAR_CEILING,
  CHARACTER_CHAR_CEILINGS,
  CHARACTER_ESTABLISHED_COUNTS,
  CHARACTER_ESTABLISHED_SUMMARY_CHAR_CEILING,
  CHARACTER_IMPORTANCE_LABELS,
  CHARACTER_IMPORTANCES,
  CHARACTER_LABEL_CHAR_CEILING,
  CHARACTER_LIST_COUNTS,
  CHARACTER_RELATIONSHIP_TYPE_LABELS,
  CHARACTER_RELATIONSHIP_TYPES,
  CHARACTER_SOURCE_CHAR_CEILING,
  CHARACTER_SOURCE_COUNTS,
  CHARACTER_SOURCE_KEY_CHAR_CEILING,
  CHARACTER_SOURCE_KINDS,
  CHARACTER_WORD_TARGETS,
  type CharacterImportanceInput,
  type CharacterRelationship,
  characterRelationshipSchema,
  type CharacterRelationshipType,
  type CharacterSheetInput,
  characterSheetInputSchema,
  type CharacterSource,
  type CharacterSourceKind,
  characterSourceSchema,
  type ConflictedCharacterSheet,
  conflictedCharacterSheetSchema,
  type EstablishedCharacter,
  establishedCharacterSchema,
  type HeldKnowledgeEntry,
  heldKnowledgeEntrySchema,
} from "./schema";
export {
  CHARACTER_SHEET_DROP_REASONS,
  CHARACTER_SHEET_REFUSALS,
  type CharacterSheetDroppedEntry,
  type CharacterSheetDropReason,
  type CharacterSheetRefusal,
  type CharacterSheetVerification,
  isVerifiedCharacterSheet,
  VERIFIED_CHARACTER_SHEET_BRAND,
  type VerifiedCharacterSheet,
  verifyCharacterSheet,
} from "./verify";
