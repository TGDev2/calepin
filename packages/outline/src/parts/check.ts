/**
 * The model-independent checks of a part structure (CAL-101).
 *
 * Over **index-keyed structural types**, `checkTimelineArithmetic`'s device: a
 * database row satisfies them as readily as a model answer, which is what lets
 * CAL-108 and CAL-110 re-run the same rules over the plan after a manual edit.
 * The planning fields are therefore nullable here where the mission's schema
 * makes them required — a hand-added part starts empty, and a check that
 * demanded strings could never read a row again; a null field skips the checks
 * that read it, and CAL-110's audit is what reports the gap.
 *
 * **Two regimes, split by what a finding costs.** A defect refuses the answer
 * whole — the timeline's regime, on the timeline's own grounds: parts are
 * mutually load-bearing (each final state is the next part's ground, the
 * indexes point into the declared thread list), so nothing can be dropped or
 * cleared without breaking the progression the mission exists to produce. An
 * advisory is reported and never refused — the under-fire doctrine (CAL-093,
 * CAL-094): both advisory rules are lexical approximations of a judgement
 * call, and a detector that cries wolf is turned off, after which the
 * requirement is lost rather than met. The semantic half — is this genuinely
 * the same stake, is this resolution genuinely rushed — is CAL-110's audit.
 *
 * The count gate is the adaptation criterion made calculable: the admissible
 * range is re-derived from the input's own `targetWordCount` by the same
 * function the prompt's variables come from, so a split acceptable for a
 * short novel is refused for a long one with no model in the room.
 *
 * The report is kinds, indexes and counts, and nothing else — safe to log
 * whole (§9) by construction, since there is no field a title or a statement
 * could occupy.
 */

import { sameWords } from "@calepin/shared/text";

import { contentWordsOf, STAKE_OVERLAP_RATIO, stakeOverlap } from "../stake/overlap";
import { partCalibrationForWordCount } from "../target-length/calibrate";

/**
 * The defect kinds — closed, and closed on purpose: a report that named its
 * findings in prose could not be logged (§9) and could not be branched on.
 */
export const PART_STRUCTURE_DEFECT_KINDS = [
  "part-count-out-of-range",
  "duplicate-part-title",
  "duplicate-thread-label",
  "unknown-thread-index",
  "duplicate-thread-reference",
  "orphan-thread",
  "unchanged-state",
] as const;

export type PartStructureDefectKind = (typeof PART_STRUCTURE_DEFECT_KINDS)[number];

/** The advisory kinds — reported beside the defects, never a refusal. */
export const PART_STRUCTURE_ADVISORY_KINDS = ["similar-stakes", "single-part-thread"] as const;

export type PartStructureAdvisoryKind = (typeof PART_STRUCTURE_ADVISORY_KINDS)[number];

/**
 * One finding that refuses the answer. A union rather than one shape with
 * nullable fields, `TimelineInconsistency`'s reason: each kind names exactly
 * the positions it is about.
 */
export type PartStructureDefect =
  | {
      readonly kind: "part-count-out-of-range";
      readonly partCount: number;
      readonly minParts: number;
      readonly maxParts: number;
    }
  | {
      readonly kind: "duplicate-part-title";
      readonly partIndex: number;
      readonly firstPartIndex: number;
    }
  | {
      readonly kind: "duplicate-thread-label";
      readonly threadIndex: number;
      readonly firstThreadIndex: number;
    }
  | {
      readonly kind: "unknown-thread-index";
      readonly partIndex: number;
      /** Position inside the part's own `threadIndexes` list. */
      readonly index: number;
    }
  | {
      readonly kind: "duplicate-thread-reference";
      readonly partIndex: number;
      /** Position of the repeat inside the part's own `threadIndexes` list. */
      readonly index: number;
      readonly firstIndex: number;
    }
  | { readonly kind: "orphan-thread"; readonly threadIndex: number }
  | { readonly kind: "unchanged-state"; readonly partIndex: number };

/** One finding that is reported and decided by a person, never a refusal. */
export type PartStructureAdvisory =
  | {
      readonly kind: "similar-stakes";
      readonly partIndex: number;
      readonly otherPartIndex: number;
      /** Distinct content words the two stakes share. */
      readonly sharedWords: number;
      /** Distinct content words of the larger stake — the ratio's denominator. */
      readonly words: number;
    }
  | {
      readonly kind: "single-part-thread";
      readonly threadIndex: number;
      /** The one part that concerns the thread. */
      readonly partIndex: number;
    };

/** What classifying a thread needs, and nothing else. */
export interface PartStructureCheckThread {
  readonly label: string;
}

/**
 * What checking one part needs. The three planning fields mirror the `Part`
 * columns' own nullability, so a row read back out of the table satisfies
 * this as readily as a model answer — see the header.
 */
export interface PartStructureCheckPart {
  readonly title: string;
  readonly dramaticObjective: string | null;
  readonly initialState: string | null;
  readonly finalState: string | null;
  readonly threadIndexes: readonly number[];
}

export interface PartStructureCheckInput {
  /** The novel's resolved target — the count gate derives its range from it. */
  readonly novelTargetWordCount: number;
  readonly threads: readonly PartStructureCheckThread[];
  readonly parts: readonly PartStructureCheckPart[];
}

/**
 * What the check found, in kinds, indexes and counts — safe to log whole (§9).
 */
export interface PartStructureReport {
  /** No defect stands; advisories do not weigh here. */
  readonly acceptable: boolean;
  readonly parts: number;
  readonly threads: number;
  readonly defects: readonly PartStructureDefect[];
  readonly advisories: readonly PartStructureAdvisory[];
}

function checkThreads(
  threads: readonly PartStructureCheckThread[],
): readonly PartStructureDefect[] {
  const defects: PartStructureDefect[] = [];

  threads.forEach((thread, threadIndex) => {
    // `findIndex` answers -1 for a label holding no word at all — `sameWords`
    // matches nothing against nothing — and -1 is not an earlier duplicate.
    const firstThreadIndex = threads.findIndex((other) => sameWords(other.label, thread.label));

    if (firstThreadIndex !== -1 && firstThreadIndex < threadIndex) {
      defects.push({ kind: "duplicate-thread-label", threadIndex, firstThreadIndex });
    }
  });

  return defects;
}

function checkParts(
  parts: readonly PartStructureCheckPart[],
  threadCount: number,
): readonly PartStructureDefect[] {
  const defects: PartStructureDefect[] = [];

  parts.forEach((part, partIndex) => {
    const firstPartIndex = parts.findIndex((other) => sameWords(other.title, part.title));

    if (firstPartIndex !== -1 && firstPartIndex < partIndex) {
      defects.push({ kind: "duplicate-part-title", partIndex, firstPartIndex });
    }

    part.threadIndexes.forEach((threadIndex, index) => {
      if (threadIndex < 0 || threadIndex >= threadCount) {
        defects.push({ kind: "unknown-thread-index", partIndex, index });
        return;
      }

      const firstIndex = part.threadIndexes.indexOf(threadIndex);

      if (firstIndex < index) {
        defects.push({ kind: "duplicate-thread-reference", partIndex, index, firstIndex });
      }
    });

    // Only the degenerate echo — the same words in both states. The real
    // *final ≠ initial* bar is carried by the tipping point's irreversibility
    // (see `./schema`); a check that judged two different sentences for
    // meaning the same thing would be the detector that cries wolf.
    if (
      part.initialState !== null &&
      part.finalState !== null &&
      sameWords(part.initialState, part.finalState)
    ) {
      defects.push({ kind: "unchanged-state", partIndex });
    }
  });

  return defects;
}

function checkThreadCoverage(
  parts: readonly PartStructureCheckPart[],
  threadCount: number,
): { defects: readonly PartStructureDefect[]; advisories: readonly PartStructureAdvisory[] } {
  const partsByThread = new Map<number, number[]>();

  parts.forEach((part, partIndex) => {
    // A reference counts once per part, and only when it resolves: an index
    // already reported unknown or duplicate must not also distort coverage.
    const seen = new Set<number>();

    part.threadIndexes.forEach((threadIndex) => {
      if (threadIndex < 0 || threadIndex >= threadCount || seen.has(threadIndex)) return;
      seen.add(threadIndex);
      partsByThread.set(threadIndex, [...(partsByThread.get(threadIndex) ?? []), partIndex]);
    });
  });

  const defects: PartStructureDefect[] = [];
  const advisories: PartStructureAdvisory[] = [];

  for (let threadIndex = 0; threadIndex < threadCount; threadIndex += 1) {
    const concerned = partsByThread.get(threadIndex) ?? [];
    const [onlyPart] = concerned;

    if (concerned.length === 0) {
      // A declared promise no part carries is the abandoned thread at the
      // structure's own granularity — the one planning failure the
      // acceptance criterion names, so it refuses rather than advises.
      defects.push({ kind: "orphan-thread", threadIndex });
    } else if (concerned.length === 1 && onlyPart !== undefined && parts.length > 1) {
      // Raised and settled inside one part: the rushed-resolution signal —
      // or the abandoned one, when the part is early. A signal, never a
      // gate: a minor thread can legitimately live inside one long part.
      advisories.push({ kind: "single-part-thread", threadIndex, partIndex: onlyPart });
    }
  }

  return { defects, advisories };
}

function checkStakes(parts: readonly PartStructureCheckPart[]): readonly PartStructureAdvisory[] {
  const advisories: PartStructureAdvisory[] = [];
  const stakes = parts.map((part) =>
    part.dramaticObjective === null ? null : contentWordsOf(part.dramaticObjective),
  );

  stakes.forEach((stake, partIndex) => {
    if (stake === null) return;

    for (let otherPartIndex = 0; otherPartIndex < partIndex; otherPartIndex += 1) {
      const other = stakes[otherPartIndex];

      if (other === null || other === undefined) continue;

      const { sharedWords, words } = stakeOverlap(stake, other);

      if (words > 0 && sharedWords / words >= STAKE_OVERLAP_RATIO) {
        advisories.push({ kind: "similar-stakes", partIndex, otherPartIndex, sharedWords, words });
      }
    }
  });

  return advisories;
}

/**
 * Every rule, one pass, no early return: unlike the timeline there is no
 * chain to poison — each rule reads the answer directly — so a caller sees
 * everything wrong at once rather than one finding per round trip (the
 * `age-conflict` consensus's own reason, one epic earlier).
 */
export function checkPartStructure(input: PartStructureCheckInput): PartStructureReport {
  const { threads, parts, novelTargetWordCount } = input;
  const defects: PartStructureDefect[] = [];

  const { minParts, maxParts } = partCalibrationForWordCount(novelTargetWordCount);

  if (parts.length < minParts || parts.length > maxParts) {
    defects.push({ kind: "part-count-out-of-range", partCount: parts.length, minParts, maxParts });
  }

  defects.push(...checkThreads(threads));
  defects.push(...checkParts(parts, threads.length));

  const coverage = checkThreadCoverage(parts, threads.length);

  defects.push(...coverage.defects);

  const advisories = [...coverage.advisories, ...checkStakes(parts)];

  return {
    acceptable: defects.length === 0,
    parts: parts.length,
    threads: threads.length,
    defects,
    advisories,
  };
}
