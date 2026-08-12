/**
 * *Deux faits canoniques qui se contredisent*, calculated (CAL-099).
 *
 * This is the acceptance criterion's own case, and the schema was built for it:
 * `CanonFact.statement` is always affirmative and the polarity lives in
 * `isTrue`, which its doc comment says is *what lets the detector surface two
 * facts with comparable statements and opposite truth values*. Comparability is
 * `canonFactStatementKey`'s, taken at one polarity so the truth value drops out
 * of the key and becomes the thing being compared.
 *
 * Two shapes of contradiction, both deterministic:
 *
 * - the same thing said twice with opposite truth values, over periods that are
 *   not provably disjoint;
 * - two facts that are one fact — same key, same truth, same window, same
 *   subjects — giving one character two different states of knowledge. CAL-094
 *   keeps that pair instead of merging it, and says in its own header that
 *   arbitrating it is this task's.
 *
 * **It errs toward reporting.** A period bound stated in words alone, or an
 * invalidating event nobody dated, makes the overlap unprovable either way, and
 * this check then reports. The asymmetry is deliberate: a false positive costs
 * one click and is remembered forever after — the fingerprint carries the
 * author's *accepté* through every later run — while a missed contradiction
 * reaches the novel. That is the opposite of the direction CAL-093 chose for
 * the tolerances, and for the same underlying reason: what is cheap to dismiss
 * should be loud, what is expensive to dismiss should be quiet.
 *
 * A semantically opposed pair worded differently is out of reach here by
 * construction — the key is content words in order — and it is exactly what
 * `detect-bible-contradictions` is for.
 */

import type { CoherenceFinding } from "@calepin/shared/coherence";

import {
  canonFactStatementKey,
  type DeduplicableCanonFact,
  deduplicateCanonFacts,
} from "../../canon-fact/dedup";
import { canonFactAnchor, characterAnchor } from "../anchor";
import {
  describeContradictoryBelief,
  describeContradictoryBeliefFix,
  describeOpposedFacts,
  describeOpposedFactsFix,
} from "../copy";
import type { BibleCoherenceSubject, CoherenceCanonFact } from "../subject";

const CHECK_ID = "bible-canon-fact-collision";

/** A period, with null on either side meaning *nothing bounds it here*. */
interface FactWindow {
  readonly from: number | null;
  readonly until: number | null;
}

function factWindow(
  fact: CoherenceCanonFact,
  eventDayById: ReadonlyMap<string, number | null>,
): FactWindow {
  if (fact.validity === "PERMANENT") return { from: null, until: null };

  if (fact.validity === "UNTIL_EVENT") {
    const day =
      fact.invalidatedByEventId === null
        ? null
        : (eventDayById.get(fact.invalidatedByEventId) ?? null);

    // In force strictly before the event, so the last day it holds is the one
    // before. An undated event bounds nothing anyone can compute.
    return { from: null, until: day === null ? null : day - 1 };
  }

  return { from: fact.validFromDay, until: fact.validUntilDay };
}

/**
 * True unless the two periods are *provably* disjoint.
 *
 * An unbounded side never proves a separation, which is what makes the answer
 * permissive toward reporting.
 */
function windowsOverlap(first: FactWindow, second: FactWindow): boolean {
  if (first.until !== null && second.from !== null && first.until < second.from) return false;
  if (second.until !== null && first.from !== null && second.until < first.from) return false;

  return true;
}

function toDeduplicable(fact: CoherenceCanonFact): DeduplicableCanonFact {
  return {
    statement: fact.statement,
    isTrue: fact.isTrue,
    validity: fact.validity,
    validFromDay: fact.validFromDay,
    validUntilDay: fact.validUntilDay,
    endingEventKey: fact.invalidatedByEventId,
    subjectKeys: [
      ...fact.subjectCharacterIds.map((id) => characterAnchor(id)),
      ...fact.subjectPlaceIds.map((id) => `place:${id}`),
    ],
    beliefs: fact.beliefs.map((belief) => ({
      characterKey: belief.characterId,
      state: belief.state,
    })),
  };
}

function opposedStatements(subject: BibleCoherenceSubject): readonly CoherenceFinding[] {
  const eventDayById = new Map(subject.timeline.map((event) => [event.id, event.absoluteDay]));

  // The key drops the truth value, so a group holds every fact making the same
  // assertion — whichever way round it was recorded.
  const byStatement = new Map<string, CoherenceCanonFact[]>();
  for (const fact of subject.canonFacts) {
    const key = canonFactStatementKey(fact.statement, true);
    const group = byStatement.get(key);
    if (group === undefined) byStatement.set(key, [fact]);
    else group.push(fact);
  }

  const findings: CoherenceFinding[] = [];

  for (const group of byStatement.values()) {
    if (group.length < 2) continue;

    const held = group.filter((fact) => fact.isTrue);
    const denied = group.filter((fact) => !fact.isTrue);

    for (const trueFact of held) {
      for (const falseFact of denied) {
        if (
          !windowsOverlap(factWindow(trueFact, eventDayById), factWindow(falseFact, eventDayById))
        ) {
          continue;
        }

        findings.push({
          checkId: CHECK_ID,
          category: "FACTUAL_CONTINUITY",
          severity: "CRITICAL",
          anchor: [canonFactAnchor(trueFact.id), canonFactAnchor(falseFact.id)],
          explanation: describeOpposedFacts(trueFact.statement, falseFact.statement),
          proposedFix: describeOpposedFactsFix(),
        });
      }
    }
  }

  return findings;
}

function contradictoryBeliefs(subject: BibleCoherenceSubject): readonly CoherenceFinding[] {
  if (subject.canonFacts.length < 2) return [];

  const nameById = new Map(subject.characters.map((character) => [character.id, character.name]));
  const deduplication = deduplicateCanonFacts(subject.canonFacts.map(toDeduplicable));
  const findings: CoherenceFinding[] = [];

  for (const duplication of deduplication.report.duplications) {
    if (duplication.kind !== "contradictory-duplicate") continue;

    const fact = subject.canonFacts[duplication.index];
    const firstFact = subject.canonFacts[duplication.firstIndex];
    if (fact === undefined || firstFact === undefined) continue;

    const characterId = fact.beliefs[duplication.beliefIndex]?.characterId;
    if (characterId === undefined) continue;

    const characterName = nameById.get(characterId);
    if (characterName === undefined) continue;

    findings.push({
      checkId: CHECK_ID,
      category: "FACTUAL_CONTINUITY",
      severity: "CRITICAL",
      anchor: [
        canonFactAnchor(firstFact.id),
        canonFactAnchor(fact.id),
        characterAnchor(characterId),
      ],
      explanation: describeContradictoryBelief(characterName, firstFact.statement),
      proposedFix: describeContradictoryBeliefFix(characterName),
    });
  }

  return findings;
}

export function checkCanonFactCollisions(
  subject: BibleCoherenceSubject,
): readonly CoherenceFinding[] {
  return [...opposedStatements(subject), ...contradictoryBeliefs(subject)];
}
