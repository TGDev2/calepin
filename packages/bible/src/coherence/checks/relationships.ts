/**
 * *Relations symétriques manquantes* (CAL-099).
 *
 * CAL-016 decided that the mirror row is never written automatically, and its
 * schema comment says why in this task's own words: *a schema that writes the
 * mirror itself can never produce a missing symmetric relation to detect*.
 * CAL-091 then built the classifier and left it deliberately unable to complete
 * a pair. This check is what those two decisions were for.
 *
 * Only `one-sided` is reported. `divergent` — both directions declared, but a
 * type on one side only — is a *difference*, and a difference between what two
 * people hold about each other is the substance of the relationship rather than
 * a defect in it; CAL-091's own asymmetry contract exists to declare exactly
 * that. Reporting it would train the author to dismiss the check.
 *
 * `MAJOR`, never blocking. A one-sided tie is often the truth of the story —
 * one character loves another who does not — so this is a *look at it*, not a
 * *you may not proceed*. Only a contradiction blocks.
 */

import type { CoherenceFinding } from "@calepin/shared/coherence";

import { type DirectedEdge, resolveRelationshipGraph } from "../../relationship/graph";
import { characterAnchor } from "../anchor";
import { describeOneSidedRelationship, describeOneSidedRelationshipFix } from "../copy";
import type { BibleCoherenceSubject } from "../subject";

const CHECK_ID = "bible-relationship-symmetry";

interface IdentifiedEdge extends DirectedEdge {
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
}

export function checkRelationshipSymmetry(
  subject: BibleCoherenceSubject,
): readonly CoherenceFinding[] {
  const nameById = new Map(subject.characters.map((character) => [character.id, character.name]));

  const edges: IdentifiedEdge[] = [];
  for (const relationship of subject.relationships) {
    const fromCharacterName = nameById.get(relationship.fromCharacterId);
    const toCharacterName = nameById.get(relationship.toCharacterId);
    // A relationship whose ends are outside the cast cannot exist: both are
    // composite foreign keys into the same bible. Skipping rather than
    // reporting keeps this check about symmetry alone.
    if (fromCharacterName === undefined || toCharacterName === undefined) continue;

    edges.push({
      fromCharacterName,
      toCharacterName,
      type: relationship.type,
      fromCharacterId: relationship.fromCharacterId,
      toCharacterId: relationship.toCharacterId,
    });
  }

  const graph = resolveRelationshipGraph(edges);
  const findings: CoherenceFinding[] = [];

  for (const pair of graph.pairs) {
    if (pair.symmetry !== "one-sided") continue;

    const declared = pair.forward.length > 0 ? pair.forward : pair.backward;
    const edge = declared[0];
    if (edge === undefined) continue;

    const holderName = edge.fromCharacterName;
    const subjectName = edge.toCharacterName;

    findings.push({
      checkId: CHECK_ID,
      category: "FACTUAL_CONTINUITY",
      severity: "MAJOR",
      // The pair, not the edges: adding a second link in the same direction
      // does not make this a different missing reciprocity, and the author's
      // decision about it should survive that edit.
      anchor: [characterAnchor(edge.fromCharacterId), characterAnchor(edge.toCharacterId)],
      explanation: describeOneSidedRelationship(holderName, subjectName),
      proposedFix: describeOneSidedRelationshipFix(holderName, subjectName),
    });
  }

  return findings;
}
