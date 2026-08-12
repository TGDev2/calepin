/**
 * The bible's suite (CAL-099).
 *
 * An array, and that is the point. Adding a check is one entry here plus the
 * identifier in `@calepin/shared/coherence`'s vocabulary; nothing in the engine
 * knows what is in this list, and no `switch` anywhere names a member of it.
 * CAL-135's acceptance criterion — *adding a check must not require modifying
 * the engine* — is a property of that shape rather than a promise.
 *
 * The four calculable checks, and only those. The two model-backed ones are
 * declared in the same vocabulary and produced by `detect-bible-contradictions`
 * rather than by a run over rows: a finding somebody paid a provider for must
 * not be closed by a pass that never asked the question, and scoping a
 * reconciliation to the ids that actually ran is what keeps that true.
 */

import {
  BIBLE_DETERMINISTIC_CHECKS,
  type CoherenceCheck,
  type CoherenceRun,
  runCoherenceChecks,
} from "@calepin/shared/coherence";

import { checkCanonFactCollisions } from "./checks/facts";
import { checkUndeclaredNames } from "./checks/names";
import { checkRelationshipSymmetry } from "./checks/relationships";
import { checkBibleTimeline } from "./checks/timeline";
import type { BibleCoherenceSubject } from "./subject";

export const BIBLE_COHERENCE_SUITE = [
  { id: "bible-timeline-arithmetic", run: checkBibleTimeline },
  { id: "bible-relationship-symmetry", run: checkRelationshipSymmetry },
  { id: "bible-undeclared-name", run: checkUndeclaredNames },
  { id: "bible-canon-fact-collision", run: checkCanonFactCollisions },
] as const satisfies readonly CoherenceCheck<BibleCoherenceSubject>[];

/** The identifiers this suite recomputes — the exact set a run may close. */
export const BIBLE_SUITE_CHECK_IDS = BIBLE_COHERENCE_SUITE.map((check) => check.id);

export function checkBibleCoherence(subject: BibleCoherenceSubject): CoherenceRun {
  return runCoherenceChecks(BIBLE_COHERENCE_SUITE, subject);
}

/** Re-exported so a caller pins the suite against the vocabulary without two imports. */
export { BIBLE_DETERMINISTIC_CHECKS };
