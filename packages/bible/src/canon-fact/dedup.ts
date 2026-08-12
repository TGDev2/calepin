/**
 * Whether two canonical facts are the same fact (CAL-094).
 *
 * `CanonFact`'s own doc comment sends the question here: there is deliberately
 * no unique index on the statement, because *a semantic duplicate reworded is
 * invisible to a btree; deduplication belongs to the extraction mission*. The
 * same comment gives the reason `REJECTED` rows survive — *so re-extraction can
 * deduplicate against what the author already refused instead of re-proposing
 * it forever* — which is what `known` is for below.
 *
 * Nothing here reads a database, a clock or an environment, and nothing here
 * calls a model. *Semantic* is meant in the only sense a deterministic rule can
 * honour: two facts are one when they assert the same content, of the same
 * entities, over the same scope, whatever the typography and whatever the
 * determiners. A model asked to judge similarity would be a second, unreviewable
 * answer, and CAL-099 is the task that owns *semantically opposed*, not this
 * one.
 *
 * **It never merges a distinction away.** Three outcomes and each is separate:
 * an equal key merges, an equal key whose stances disagree about one character
 * is a **contradiction** and keeps both, and anything merely close is reported
 * and keeps both. Merging on similarity is how *Nora vit à Lyon* and *Nora vit à
 * Lyon depuis peu* become one fact and the second disappears.
 *
 * **What it hands back is positions, never facts.** A key is built out of the
 * statement and is therefore literary content; it never enters the report, and
 * `canonFactKey` is exported for CAL-098's benefit with that written on it. The
 * report carries counts and indexes only (§9).
 */

import type { CanonFactBeliefState, CanonFactValidity } from "./types";

/**
 * The determiners the key ignores.
 *
 * Deliberately short, and every omission is argued. Prepositions are **not**
 * here — *de*, *du*, *des*, *au*, *aux*, *à*, *en*, *dans*, *sans* all carry
 * meaning, and stripping them would make *venir de Lyon* and *venir à Lyon* one
 * fact. Nor are verbs, for the same reason one step further: dropping *est* and
 * *a* would make *Nora a une sœur* and *Nora est une sœur* one fact.
 *
 * What is left is what genuinely cannot change a fact: an article, a
 * demonstrative or a possessive. *une voiture* and *la voiture* are the same
 * assertion about the same object, and reporting them as two is the redundancy
 * the backlog asks this pass to remove.
 *
 * No negation is in this list, and `dedup.test.ts` pins the two sets disjoint:
 * a stripped negation would make a fact and its opposite share a key.
 */
export const CANON_FACT_STOP_WORDS = [
  "le",
  "la",
  "les",
  "l",
  "un",
  "une",
  "ce",
  "cet",
  "cette",
  "ces",
  "mon",
  "ma",
  "mes",
  "ton",
  "ta",
  "tes",
  "son",
  "sa",
  "ses",
  "notre",
  "nos",
  "votre",
  "vos",
  "leur",
  "leurs",
] as const;

/**
 * How much of two statements must be shared before the pair is worth showing.
 *
 * Three words in four, over the longer of the two. An atomic statement is short
 * by construction — the contract targets twenty words and most come to four or
 * five once the determiners are gone — so a bar any higher would need two
 * statements to differ by nothing at all, and the signal would be dead. At three
 * in four, a statement that merely extends another is reported (*Nora possède
 * une voiture* inside *Nora possède une voiture rouge*) while two facts that
 * share a subject and a verb are not (*Madeleine possède le manoir* against
 * *Madeleine habite le manoir*, two in three).
 *
 * It costs nothing to be wrong here in the loud direction: a near-duplicate is
 * **reported and never merged**, so the worst a false positive does is show the
 * author a pair worth a glance.
 */
export const CANON_FACT_NEAR_DUPLICATE_RATIO = 0.75;

/**
 * What deciding whether two facts are one needs, and nothing else.
 *
 * Keys rather than names, so a row read out of `canon_facts` satisfies this as
 * readily as a model's answer does — `TimelineArithmeticEvent`'s arrangement,
 * and what lets CAL-098 and CAL-155 run the same rule over rows. What a key
 * *is* — a name, a cuid — is the caller's business; all this asks is that two
 * keys are equal when they name the same thing.
 */
export interface DeduplicableCanonFact {
  readonly statement: string;
  readonly isTrue: boolean;
  readonly validity: CanonFactValidity;
  readonly validFromDay: number | null;
  readonly validUntilDay: number | null;
  readonly endingEventKey: string | null;
  readonly subjectKeys: readonly string[];
  readonly beliefs: readonly DeduplicableCanonFactBelief[];
}

export interface DeduplicableCanonFactBelief {
  readonly characterKey: string;
  readonly state: CanonFactBeliefState;
}

/** A fact the bible already holds, identified by what it says. */
export interface KnownDeduplicableCanonFact {
  readonly statement: string;
  readonly isTrue: boolean;
}

/** Why two facts were held to be one, or nearly one — closed, so it is loggable. */
export const CANON_FACT_DUPLICATE_KINDS = [
  /** Same key: merged, and the survivor absorbs the beliefs. */
  "duplicate",
  /** Same statement as one the bible already holds — including one refused. */
  "already-known",
  /** Same key, opposite stances on one character: both kept, for CAL-099. */
  "contradictory-duplicate",
  /** Close, and therefore never merged. */
  "near-duplicate",
] as const;

export type CanonFactDuplicateKind = (typeof CANON_FACT_DUPLICATE_KINDS)[number];

export type CanonFactDuplication =
  | { readonly kind: "duplicate"; readonly index: number; readonly firstIndex: number }
  | { readonly kind: "already-known"; readonly index: number; readonly knownIndex: number }
  | {
      readonly kind: "contradictory-duplicate";
      readonly index: number;
      readonly firstIndex: number;
      readonly beliefIndex: number;
      readonly firstBeliefIndex: number;
    }
  | {
      readonly kind: "near-duplicate";
      readonly index: number;
      readonly firstIndex: number;
      readonly sharedWords: number;
      readonly words: number;
    };

/** What one duplicate contributes to the fact it merges into. */
export interface CanonFactMerge {
  readonly index: number;
  readonly intoIndex: number;
  /** Positions in the duplicate's own `beliefs` the survivor does not hold. */
  readonly beliefIndexes: readonly number[];
}

export interface CanonFactDeduplicationReport {
  readonly total: number;
  readonly kept: number;
  readonly merged: number;
  readonly known: number;
  readonly duplications: readonly CanonFactDuplication[];
}

export interface CanonFactDeduplication {
  /** Positions surviving, in the order they were handed in. */
  readonly kept: readonly number[];
  readonly merges: readonly CanonFactMerge[];
  readonly report: CanonFactDeduplicationReport;
}

const APOSTROPHES = /['’ʼ‘`]/gu;
const TOKEN = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
const STOP_WORDS: ReadonlySet<string> = new Set(CANON_FACT_STOP_WORDS);
/**
 * The unit separator, named by its code point rather than typed (lesson 53).
 *
 * A character no statement can carry, so two facts differing only in where one
 * field ends and the next begins cannot join into one key.
 */
const SEPARATOR = String.fromCodePoint(0x1f);

/**
 * The words a statement asserts, in order.
 *
 * Order is kept deliberately: sorting would make *Nora aime Paul* and *Paul aime
 * Nora* one fact, and those are the two facts a novel is most likely to hold
 * separately. Elisions split at the apostrophe so *l'accident* reduces to
 * *accident*, and accents stay significant, as everywhere in this repository.
 */
function contentWordsOf(statement: string): readonly string[] {
  const folded = statement.normalize("NFC").toLowerCase().replace(APOSTROPHES, " ");

  return [...folded.matchAll(TOKEN)]
    .map((match) => match[0])
    .filter((word) => !STOP_WORDS.has(word));
}

/**
 * What a statement asserts, with nothing of how it was typed.
 *
 * **Literary content** — it is the statement with its determiners removed, so it
 * never enters a report and never enters a log (§9). It is exported because
 * CAL-098 needs to ask *does this already exist* of a fact an author is typing,
 * and re-deriving the reduction there would be a second answer able to drift.
 */
export function canonFactStatementKey(statement: string, isTrue: boolean): string {
  return [contentWordsOf(statement).join(" "), isTrue ? "1" : "0"].join(SEPARATOR);
}

/**
 * The identity of a fact: what it asserts, of whom, over which scope.
 *
 * The window is part of it because a fact true during a period and the same
 * sentence held permanently are two different claims about the world, and
 * merging them would silently widen one of them. The subject keys are sorted,
 * because a subject set is unordered. Beliefs are **not** part of it: they are
 * what merging combines.
 *
 * Literary content, as `canonFactStatementKey` is.
 */
export function canonFactKey(fact: DeduplicableCanonFact): string {
  return [
    canonFactStatementKey(fact.statement, fact.isTrue),
    fact.validity,
    fact.validFromDay ?? "",
    fact.validUntilDay ?? "",
    fact.endingEventKey ?? "",
    [...fact.subjectKeys].sort().join(","),
  ].join(SEPARATOR);
}

/** How many words two statements share, counted as a multiset. */
function sharedWordCount(a: readonly string[], b: readonly string[]): number {
  const remaining = new Map<string, number>();

  for (const word of b) remaining.set(word, (remaining.get(word) ?? 0) + 1);

  let shared = 0;

  for (const word of a) {
    const left = remaining.get(word) ?? 0;

    if (left > 0) {
      shared += 1;
      remaining.set(word, left - 1);
    }
  }

  return shared;
}

function sameSubjects(a: DeduplicableCanonFact, b: DeduplicableCanonFact): boolean {
  if (a.subjectKeys.length !== b.subjectKeys.length) return false;

  const left = [...a.subjectKeys].sort();
  const right = [...b.subjectKeys].sort();

  return left.every((key, index) => key === right[index]);
}

/**
 * The stance the survivor already holds on one character, and where it sits.
 */
function beliefOf(
  fact: DeduplicableCanonFact,
  characterKey: string,
): { readonly state: CanonFactBeliefState; readonly index: number } | null {
  const index = fact.beliefs.findIndex((belief) => belief.characterKey === characterKey);
  const belief = fact.beliefs[index];

  return belief === undefined ? null : { state: belief.state, index };
}

/**
 * Remove the facts that say what another fact already says.
 *
 * The first occurrence wins, so the order handed in is the order kept — which is
 * the answer's own order, and the only one a caller can predict.
 *
 * A duplicate whose stances agree with the survivor's on every shared character
 * is merged, and `merges` names the beliefs the survivor does not yet hold. A
 * duplicate that disagrees about one character is **not** merged: two identical
 * statements with opposite knowledge is a contradiction, and arbitrating a
 * contradiction is CAL-099's, so both facts stand and the pair is reported.
 */
export function deduplicateCanonFacts(
  facts: readonly DeduplicableCanonFact[],
  known: readonly KnownDeduplicableCanonFact[] = [],
): CanonFactDeduplication {
  const knownKeys = new Map<string, number>();

  known.forEach((fact, index) => {
    const key = canonFactStatementKey(fact.statement, fact.isTrue);

    if (!knownKeys.has(key)) knownKeys.set(key, index);
  });

  const kept: number[] = [];
  const merges: CanonFactMerge[] = [];
  const duplications: CanonFactDuplication[] = [];
  const seen = new Map<string, number>();

  facts.forEach((fact, index) => {
    const knownIndex = knownKeys.get(canonFactStatementKey(fact.statement, fact.isTrue));

    if (knownIndex !== undefined) {
      duplications.push({ kind: "already-known", index, knownIndex });
      return;
    }

    const key = canonFactKey(fact);
    const firstIndex = seen.get(key);

    if (firstIndex !== undefined) {
      const survivor = facts[firstIndex];

      if (survivor === undefined) return;

      const conflict = fact.beliefs.reduce<CanonFactDuplication | null>(
        (found, belief, beliefIndex) => {
          if (found !== null) return found;

          const held = beliefOf(survivor, belief.characterKey);

          if (held === null || held.state === belief.state) return null;

          return {
            kind: "contradictory-duplicate",
            index,
            firstIndex,
            beliefIndex,
            firstBeliefIndex: held.index,
          };
        },
        null,
      );

      if (conflict !== null) {
        // Both stand. Nothing is merged and nothing is dropped: the pair is
        // evidence, and deleting either would delete the evidence.
        duplications.push(conflict);
        kept.push(index);
        return;
      }

      const beliefIndexes = fact.beliefs
        .map((belief, beliefIndex) =>
          beliefOf(survivor, belief.characterKey) === null ? beliefIndex : null,
        )
        .filter((beliefIndex): beliefIndex is number => beliefIndex !== null);

      duplications.push({ kind: "duplicate", index, firstIndex });
      merges.push({ index, intoIndex: firstIndex, beliefIndexes });
      return;
    }

    const words = contentWordsOf(fact.statement);

    for (const otherIndex of kept) {
      const other = facts[otherIndex];

      if (other === undefined || other.isTrue !== fact.isTrue || !sameSubjects(fact, other)) {
        continue;
      }

      const otherWords = contentWordsOf(other.statement);
      const longest = Math.max(words.length, otherWords.length);

      if (longest === 0) continue;

      const shared = sharedWordCount(words, otherWords);

      if (shared / longest >= CANON_FACT_NEAR_DUPLICATE_RATIO) {
        duplications.push({
          kind: "near-duplicate",
          index,
          firstIndex: otherIndex,
          sharedWords: shared,
          words: longest,
        });
        break;
      }
    }

    seen.set(key, index);
    kept.push(index);
  });

  return {
    kept,
    merges,
    report: {
      total: facts.length,
      kept: kept.length,
      merged: merges.length,
      known: duplications.filter((duplication) => duplication.kind === "already-known").length,
      duplications,
    },
  };
}
