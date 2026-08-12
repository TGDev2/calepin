/**
 * A contradiction answer read back against the ask that produced it (CAL-099).
 *
 * One regime, and it is the one the contract leaves available. An index the ask
 * never offered points at nothing, so the pair carrying it is **dropped** —
 * CAL-075's regime, reached the way CAL-076's and CAL-088's were, by asking
 * what the shape allows rather than by taste. There is nothing to clear (a pair
 * is two indexes and an argument; blanking either leaves no finding) and there
 * is **no refusal**: both lists have a floor of zero, so no drop can put an
 * answer below its own minimum, and refusing a whole answer because one pair
 * was mis-numbered would throw away the pairs that were right.
 *
 * That absence of a refusal arm is why the verification is a plain object
 * rather than the discriminated union its five siblings return. The union
 * exists to make a refusal unignorable; a function that cannot refuse would
 * carry a `refused` arm nobody can reach, which is a shape inviting a caller to
 * handle a case that does not exist.
 *
 * The result is branded because the function **rewrites** — `verifyCharacterSheet`'s
 * arrangement, and the same reason: a resolver typed on the raw answer would
 * accept one nobody read back.
 *
 * The report carries list names, indexes and counts, and never a word of the
 * bible (§9). What the pairs *say* is in the findings, which go to a column and
 * to a screen.
 */

import {
  type BibleContradictionList,
  type BibleContradictions,
  type BibleContradictionsInput,
  bibleContradictionsSchema,
} from "./schema";

export const BIBLE_CONTRADICTION_DROP_REASONS = ["unknown-element", "duplicate-pair"] as const;
export type BibleContradictionDropReason = (typeof BIBLE_CONTRADICTION_DROP_REASONS)[number];

export interface BibleContradictionDroppedEntry {
  readonly list: BibleContradictionList;
  readonly index: number;
  readonly reason: BibleContradictionDropReason;
}

export const VERIFIED_BIBLE_CONTRADICTIONS_BRAND: unique symbol = Symbol.for(
  "calepin.VerifiedBibleContradictions",
);

export type VerifiedBibleContradictions = BibleContradictions & {
  readonly [VERIFIED_BIBLE_CONTRADICTIONS_BRAND]: true;
};

export function isVerifiedBibleContradictions(
  value: unknown,
): value is VerifiedBibleContradictions {
  return (
    typeof value === "object" &&
    value !== null &&
    VERIFIED_BIBLE_CONTRADICTIONS_BRAND in value &&
    (value as { [VERIFIED_BIBLE_CONTRADICTIONS_BRAND]?: unknown })[
      VERIFIED_BIBLE_CONTRADICTIONS_BRAND
    ] === true
  );
}

export interface BibleContradictionsReport {
  readonly answered: number;
  readonly verified: number;
  readonly opposedFacts: number;
  readonly contradictoryRules: number;
  readonly dropped: readonly BibleContradictionDroppedEntry[];
}

export interface BibleContradictionsVerification {
  readonly contradictions: VerifiedBibleContradictions;
  readonly report: BibleContradictionsReport;
}

/** The pair, whichever order it was named in — an unordered pair is one finding. */
function pairKey(firstIndex: number, secondIndex: number): string {
  return [firstIndex, secondIndex].sort((a, b) => a - b).join(":");
}

function keepPairs<Pair extends { readonly firstIndex: number; readonly secondIndex: number }>(
  pairs: readonly Pair[],
  list: BibleContradictionList,
  offered: number,
  dropped: BibleContradictionDroppedEntry[],
): readonly Pair[] {
  const seen = new Set<string>();
  const kept: Pair[] = [];

  pairs.forEach((pair, index) => {
    if (pair.firstIndex >= offered || pair.secondIndex >= offered) {
      dropped.push({ list, index, reason: "unknown-element" });
      return;
    }

    const key = pairKey(pair.firstIndex, pair.secondIndex);
    if (seen.has(key)) {
      dropped.push({ list, index, reason: "duplicate-pair" });
      return;
    }

    seen.add(key);
    kept.push(pair);
  });

  return kept;
}

/** Re-parsed before branding, so a brand never certifies something the schema would refuse. */
function mint(answer: BibleContradictions): VerifiedBibleContradictions {
  const reparsed = bibleContradictionsSchema.parse(answer);

  return Object.assign(reparsed, {
    [VERIFIED_BIBLE_CONTRADICTIONS_BRAND]: true,
  }) as VerifiedBibleContradictions;
}

export function verifyBibleContradictions(
  answer: BibleContradictions,
  input: BibleContradictionsInput,
): BibleContradictionsVerification {
  const dropped: BibleContradictionDroppedEntry[] = [];

  const opposedFacts = keepPairs(answer.opposedFacts, "opposedFacts", input.facts.length, dropped);
  const contradictoryRules = keepPairs(
    answer.contradictoryRules,
    "contradictoryRules",
    input.worldRules.length,
    dropped,
  );

  const answered = answer.opposedFacts.length + answer.contradictoryRules.length;
  const contradictions = mint({
    opposedFacts: [...opposedFacts],
    contradictoryRules: [...contradictoryRules],
  });

  return {
    contradictions,
    report: {
      answered,
      verified: opposedFacts.length + contradictoryRules.length,
      opposedFacts: opposedFacts.length,
      contradictoryRules: contradictoryRules.length,
      dropped,
    },
  };
}
