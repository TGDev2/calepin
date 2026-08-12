/**
 * A verified contradiction answer, as findings the engine can persist
 * (CAL-099).
 *
 * The one thing worth reading twice is the signature: the model named indexes,
 * and this function is handed the ids those indexes stand for. Resolving an
 * index to a primary key is business code's with the rows in hand (§6), and
 * putting the two lists side by side here is what makes that resolution one
 * line the caller cannot get wrong silently — a mismatched length is refused
 * rather than truncated.
 *
 * Severity is written here and never declared by the model. This mission
 * reports contradictions or reports nothing — the prompt says so, and the
 * contract carries no severity field for a model to lower. A pair it is not
 * sure about is a pair it does not report, which is the only honest reading of
 * *no score, structurally* for a check whose findings block a validation.
 */

import type { CoherenceFinding } from "@calepin/shared/coherence";
import { InternalError } from "@calepin/shared/errors";

import { canonFactAnchor, worldRuleAnchor } from "./anchor";
import type { VerifiedBibleContradictions } from "./verify";

export interface BibleContradictionRowIds {
  /** `CanonFact.id` per entry of the ask's `facts`, in the same order. */
  readonly factIds: readonly string[];
  /** `WorldRule.id` per entry of the ask's `worldRules`, in the same order. */
  readonly worldRuleIds: readonly string[];
}

function idAt(ids: readonly string[], index: number, list: string): string {
  const id = ids[index];
  if (id === undefined) {
    // The verifier already dropped every out-of-range pair, so arriving here
    // means the caller offered ids that do not line up with the ask it sent.
    throw new InternalError({
      message: "a contradiction names an element the caller offered no identifier for",
      fieldPath: list,
    });
  }

  return id;
}

export function resolveBibleContradictions(
  contradictions: VerifiedBibleContradictions,
  ids: BibleContradictionRowIds,
): readonly CoherenceFinding[] {
  return [
    ...contradictions.opposedFacts.map((pair): CoherenceFinding => {
      const first = idAt(ids.factIds, pair.firstIndex, "opposedFacts");
      const second = idAt(ids.factIds, pair.secondIndex, "opposedFacts");

      return {
        checkId: "bible-opposed-canon-facts",
        category: "FACTUAL_CONTINUITY",
        severity: "CRITICAL",
        anchor: [canonFactAnchor(first), canonFactAnchor(second)],
        explanation: pair.explanation,
        proposedFix: pair.proposedFix,
      };
    }),
    ...contradictions.contradictoryRules.map((pair): CoherenceFinding => {
      const first = idAt(ids.worldRuleIds, pair.firstIndex, "contradictoryRules");
      const second = idAt(ids.worldRuleIds, pair.secondIndex, "contradictoryRules");

      return {
        checkId: "bible-contradictory-world-rules",
        category: "FACTUAL_CONTINUITY",
        severity: "CRITICAL",
        anchor: [worldRuleAnchor(first), worldRuleAnchor(second)],
        explanation: pair.explanation,
        proposedFix: pair.proposedFix,
      };
    }),
  ];
}
