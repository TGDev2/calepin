/**
 * The stake-overlap comparison the plan's two contracts share (CAL-101,
 * extracted by CAL-102 when the chapter batch gave it a second reader —
 * `assessStageChain`'s precedent: the walk itself, once).
 *
 * A lexical approximation of "the same stake", and deliberately only that:
 * two stakes are worth a look when they share most of their content words,
 * and the semantic judgement — is this genuinely the same stake — is
 * CAL-110's audit. Being wrong here costs a note, never a refusal: every
 * consumer reports it as an advisory, which is what buys the wider stop-word
 * list below.
 */

/**
 * Two stakes are worth a look when they share at least this fraction of
 * their content words — `CANON_FACT_NEAR_DUPLICATE_RATIO`'s figure, restated
 * here because a domain may not import a domain (§3.2). The denominator is
 * the *larger* of the two word sets: the strict direction, which under-fires
 * on purpose.
 */
export const STAKE_OVERLAP_RATIO = 0.75;

/**
 * The words stripped before two stakes are compared — determiners, the
 * high-frequency prepositions and the two coordinations, and nothing else: a
 * conservative closed list, never a verb and never a negation, so what is
 * compared is the words that carry the stake.
 */
export const STAKE_STOP_WORDS = [
  "le",
  "la",
  "les",
  "l",
  "un",
  "une",
  "des",
  "du",
  "de",
  "d",
  "au",
  "aux",
  "ce",
  "cet",
  "cette",
  "ces",
  "son",
  "sa",
  "ses",
  "leur",
  "leurs",
  "à",
  "en",
  "dans",
  "sur",
  "pour",
  "par",
  "avec",
  "et",
  "ou",
] as const;

const STOP_WORDS = new Set<string>(STAKE_STOP_WORDS);

/**
 * A stake's distinct content words — `normalizeText`'s reduction restated at
 * the word level (the same fold `createVerbatimMatcher` applies), minus the
 * stop words. Accents stay significant, and elisions split, exactly as the
 * matcher's own tokenisation splits them.
 */
export function contentWordsOf(text: string): ReadonlySet<string> {
  const words =
    text
      .normalize("NFC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];

  return new Set(
    words
      .flatMap((word) => word.split(/['’-]/u))
      .filter((word) => word.length > 0 && !STOP_WORDS.has(word)),
  );
}

/** What comparing two stakes yields — counts, so a report can carry it (§9). */
export interface StakeOverlap {
  /** Distinct content words the two stakes share. */
  readonly sharedWords: number;
  /** Distinct content words of the larger stake — the ratio's denominator. */
  readonly words: number;
}

/** The overlap of two word sets, denominator on the larger side. */
export function stakeOverlap(stake: ReadonlySet<string>, other: ReadonlySet<string>): StakeOverlap {
  const words = Math.max(stake.size, other.size);
  const sharedWords = [...stake].filter((word) => other.has(word)).length;

  return { sharedWords, words };
}
