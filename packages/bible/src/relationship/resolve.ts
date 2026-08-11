/**
 * A verified graph as the rows that store it, and as the canon the coherence
 * check reads (CAL-091).
 *
 * Two resolutions, and the split is the acceptance criterion split in two.
 *
 * **`resolveCharacterRelations` is *représentable*.** It answers the
 * `Relationship` columns, flattening each edge's asymmetries into the one
 * `description` column the table has — `resolveBibleStyle`'s and
 * `resolveCharacterSheet`'s role one section over: flatten without erasing, so
 * what the author reviews on screen still says who knows what. No new column
 * is asked for, because `Relationship.description`'s own doc comment already
 * decided that this is where the asymmetry is written.
 *
 * **`resolveRelationshipAsymmetries` is *exploitable par le contrôle de
 * cohérence*.** It answers the `CanonFact` + `CanonFactBelief` shape, one fact
 * per declared asymmetry with a belief for each end, through
 * `knowledgeStanceToBelief` — the mapping CAL-090 committed and CAL-094
 * imports. That is what turns « A sait de B ce que B ignore » from prose into
 * two rows a checker can compare against what a chapter has a character do:
 * CAL-131 flags a character using information they never learned, and this is
 * where the *never learned* comes from for a tie.
 *
 * The fact's subject is the edge's **target**. An asymmetry on the edge A → B
 * is something held about B, so B is who the fact concerns
 * (`CanonFactSubject`), and both characters carry a belief about it.
 *
 * Its `isTrue` is read off the holder's stance alone, and may be: the contract
 * refuses an asymmetry whose two stances decide different worlds
 * (`schema.ts`), so the subject's would give the same answer. Reading one and
 * asserting nothing is the point — a second read able to disagree is exactly
 * what that check exists to make impossible.
 *
 * Nothing here resolves a name to a `Character.id`. That is business code's,
 * with a live scope in hand (§6) — `resolveCharacterSheet`'s own position.
 */

import type { CanonFactBeliefState } from "../canon-fact";
import { CHARACTER_KNOWLEDGE_STANCE_VERBS, knowledgeStanceToBelief } from "../character/knowledge";
import type { CharacterRelationshipType } from "../character/schema";
import type { VerifiedCharacterRelations } from "./verify";

/** What introduces one asymmetry inside a stored description. */
export const RELATIONSHIP_ASYMMETRY_CONNECTOR = "Asymétrie :";

/** What separates the two characters' stances inside one asymmetry. */
export const RELATIONSHIP_STANCE_SEPARATOR = " ; ";

/** What separates the side-specific prose from the asymmetries after it. */
export const RELATIONSHIP_DESCRIPTION_SEPARATOR = " ";

/** One `Relationship` row's column values, name-keyed. */
export interface ResolvedRelationshipRow {
  readonly fromCharacterName: string;
  readonly toCharacterName: string;
  readonly type: CharacterRelationshipType;
  readonly label: string;
  /** The side-specific prose and the asymmetries, flattened — or null. */
  readonly description: string | null;
}

/**
 * The rows a verified graph becomes.
 *
 * Order is the answer's own, so a caller inserting in sequence writes the
 * graph the model described. Every pair of names is distinct and every
 * `(from, to, type)` unique — `verifyCharacterRelations` guaranteed both — so
 * the insert cannot trip `@@unique([fromCharacterId, toCharacterId, type])`
 * on its own output.
 */
export function resolveCharacterRelations(
  relations: VerifiedCharacterRelations,
): readonly ResolvedRelationshipRow[] {
  return relations.relations.map((relation) => ({
    fromCharacterName: relation.fromCharacterName,
    toCharacterName: relation.toCharacterName,
    type: relation.type,
    label: relation.label,
    description: describeSide(relation),
  }));
}

function describeSide(relation: VerifiedCharacterRelations["relations"][number]): string | null {
  const asymmetries = relation.asymmetries.map(
    (asymmetry) =>
      `${RELATIONSHIP_ASYMMETRY_CONNECTOR} ${asymmetry.statement} — ` +
      `${relation.fromCharacterName} ${CHARACTER_KNOWLEDGE_STANCE_VERBS[asymmetry.holderStance]}` +
      `${RELATIONSHIP_STANCE_SEPARATOR}` +
      `${relation.toCharacterName} ${CHARACTER_KNOWLEDGE_STANCE_VERBS[asymmetry.subjectStance]}.`,
  );

  const parts =
    relation.description === null ? asymmetries : [relation.description, ...asymmetries];

  return parts.length === 0 ? null : parts.join(RELATIONSHIP_DESCRIPTION_SEPARATOR);
}

/** One character's stance on one pending fact. */
export interface PendingCanonFactBelief {
  readonly characterName: string;
  readonly state: CanonFactBeliefState;
}

/**
 * One `CanonFact` a declared asymmetry implies, with the two beliefs that make
 * it asymmetric — the shape CAL-094 writes and CAL-099 reads, minus the ids
 * only business code can resolve.
 */
export interface PendingCanonFact {
  /** The affirmative statement, as `CanonFact.statement` stores it. */
  readonly statement: string;
  /** Whether it holds in the novel's world, as `CanonFact.isTrue` stores it. */
  readonly isTrue: boolean;
  /** Who the fact concerns — the edge's target (`CanonFactSubject`). */
  readonly subjectCharacterName: string;
  /** The holder's stance first, the subject's second. Always two, always different. */
  readonly beliefs: readonly [PendingCanonFactBelief, PendingCanonFactBelief];
}

/**
 * Every asymmetry of a verified graph, as canon.
 *
 * Nothing is deduplicated across edges: two ties legitimately bear on one
 * statement, and reconciling them needs the whole bible in view, which is
 * CAL-094's position and not this function's. What ships here is the
 * translation — total, mechanical, and impossible to disagree with the
 * contract, because both read `knowledgeStanceToBelief`.
 */
export function resolveRelationshipAsymmetries(
  relations: VerifiedCharacterRelations,
): readonly PendingCanonFact[] {
  return relations.relations.flatMap((relation) =>
    relation.asymmetries.map((asymmetry): PendingCanonFact => {
      const holder = knowledgeStanceToBelief(asymmetry.holderStance);
      const subject = knowledgeStanceToBelief(asymmetry.subjectStance);

      return {
        statement: asymmetry.statement,
        isTrue: holder.isTrue,
        subjectCharacterName: relation.toCharacterName,
        beliefs: [
          { characterName: relation.fromCharacterName, state: holder.belief },
          { characterName: relation.toCharacterName, state: subject.belief },
        ],
      };
    }),
  );
}
