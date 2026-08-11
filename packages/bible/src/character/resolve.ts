/**
 * The `Character` column values, from a verified sheet (CAL-090).
 *
 * `Character` (CAL-016) stores each sheet field as one free text or one text
 * list, deliberately — the narrative rule lives in this package's contract,
 * not in the column type. This function is where the three pairs and the
 * stance-typed knowledge become those texts: each pair joined by one fixed
 * French connector, each knowledge entry prefixed by its stance — so
 * persistence, when its task comes, is a copy and not a translation.
 * `resolveBibleStyle`'s role, one section over: flattening without erasing.
 * The divergence, the dilemma, the breach and the stance stay visible in the
 * stored text the author reviews, which is also what CAL-107's writing
 * context will quote and CAL-136's checks will hold prose to.
 *
 * It takes a `VerifiedCharacterSheet`, never a bare answer: the verified
 * value is the one whose name and edges carry the ask's spellings, and
 * accepting the unverified one here would be the way around the brand.
 *
 * `importance` is absent on purpose — it is the ask's, and the composer that
 * writes the row reads it from there. The relationships resolve to
 * name-keyed row shapes: resolving a name to a `Character.id` is business
 * code's, with a live scope in hand (§6).
 */

import { CHARACTER_KNOWLEDGE_STANCE_PREFIXES } from "./knowledge";
import type { CharacterRelationshipType } from "./schema";
import type { VerifiedCharacterSheet } from "./verify";

/**
 * What separates a pair's two halves in the stored text. Clauses, not bare
 * colons, so the resolved sentence still says what the second half *is* —
 * `STYLE_VIOLATION_CONNECTOR`'s shape, one per pair.
 */
export const CHARACTER_DIVERGENCE_CONNECTOR = "Écart au désir :";
export const CHARACTER_DILEMMA_CONNECTOR = "Choix qu'elle impose :";
export const CHARACTER_BREACH_CONNECTOR = "Jamais dans sa bouche :";

/** One outgoing edge as the `Relationship` row will store it, name-keyed. */
export interface ResolvedCharacterRelationship {
  /** The established character the edge reaches — the ask's own spelling. */
  readonly toCharacterName: string;
  readonly type: CharacterRelationshipType;
  readonly label: string;
  readonly description: string | null;
}

/**
 * The sheet as `Character` stores it: the fifteen sheet columns under their
 * own names, and the edges beside them for the `Relationship` rows.
 */
export interface ResolvedCharacterSheet {
  readonly name: string;
  readonly age: number | null;
  readonly role: string;
  readonly appearance: string;
  readonly initialSituation: string;
  readonly apparentDesire: string;
  readonly deepNeed: string;
  readonly fear: string;
  readonly contradiction: string;
  readonly secret: string;
  readonly past: string;
  readonly plannedArc: string;
  readonly speechStyle: string;
  readonly heldKnowledge: readonly string[];
  readonly elementsToPreserve: readonly string[];
  readonly relationships: readonly ResolvedCharacterRelationship[];
}

/** The column values, entry for entry and in the sheet's own order. */
export function resolveCharacterSheet(sheet: VerifiedCharacterSheet): ResolvedCharacterSheet {
  return {
    name: sheet.name,
    age: sheet.age,
    role: sheet.role,
    appearance: sheet.appearance,
    initialSituation: sheet.initialSituation,
    apparentDesire: sheet.apparentDesire,
    deepNeed: `${sheet.deepNeed.need} ${CHARACTER_DIVERGENCE_CONNECTOR} ${sheet.deepNeed.divergence}`,
    fear: sheet.fear,
    contradiction: `${sheet.contradiction.tension} ${CHARACTER_DILEMMA_CONNECTOR} ${sheet.contradiction.dilemma}`,
    secret: sheet.secret,
    past: sheet.past,
    plannedArc: sheet.plannedArc,
    speechStyle: `${sheet.speechStyle.voice} ${CHARACTER_BREACH_CONNECTOR} ${sheet.speechStyle.breach}`,
    heldKnowledge: sheet.heldKnowledge.map(
      (entry) => `${CHARACTER_KNOWLEDGE_STANCE_PREFIXES[entry.stance]} ${entry.statement}`,
    ),
    elementsToPreserve: sheet.elementsToPreserve,
    relationships: sheet.relationships.map((relationship) => ({
      toCharacterName: relationship.characterName,
      type: relationship.type,
      label: relationship.label,
      description: relationship.description,
    })),
  };
}
