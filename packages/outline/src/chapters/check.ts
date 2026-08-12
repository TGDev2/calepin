/**
 * The model-independent checks of a chapter-outline batch (CAL-102).
 *
 * Over **index-keyed structural types**, `checkPartStructure`'s device: a
 * database row satisfies them as readily as a model answer, which is what
 * lets CAL-108 and CAL-110 re-run the same rules over the plan after a
 * manual edit. The planning fields are therefore nullable here where the
 * mission's schema makes them required — a hand-added chapter plan starts
 * empty — and a null field skips the checks that read it; CAL-110's audit
 * is what reports the gap.
 *
 * **Two regimes, split by what a finding costs.** A defect refuses the batch
 * whole: the chapters of a batch are mutually load-bearing — the thread
 * choreography walks them in order, a revelation's reference points at a
 * sibling, the word budget is a sum — so nothing can be dropped or cleared
 * without breaking the sequence the mission exists to produce. An advisory
 * is reported and never refused — the under-fire doctrine: `similar-stakes`
 * and `similar-preceding-stake` are the mechanical echo of *aucune
 * répétition du même enjeu d'un chapitre à l'autre*, and `threadless-chapter`
 * of *aucun chapitre décoratif* — lexical and structural approximations of
 * judgement calls whose semantic half is CAL-110's audit. Refusing on them
 * would teach the model to reword an echo or fabricate a thread action
 * (CAL-080's lesson), not to progress.
 *
 * **The thread choreography is one ordered walk.** Each thread starts where
 * the ask's `state` seeds it and moves `unopened → open → closed`; every
 * action is held to the transition table, to the part's own assignment
 * (`assignedPartIndexes`), and to the closure schedule — a thread closes at
 * its **last** assigned part, neither before nor after. After: a thread left
 * open past its last assigned part is unclosable by construction, since
 * acting on an unassigned thread is itself a defect — that is *aucun fil
 * narratif ouvert sans chapitre de fermeture prévu*, enforced at every batch
 * rather than hoped for at the last. Before: a thread closed while later
 * parts are still assigned it makes those parts' asks self-contradictory,
 * and the next batch would be refused at composition instead of here. The
 * final part additionally closes everything, assigned or not — the belt for
 * plans re-cut by hand.
 *
 * The count gate is the adaptation criterion made calculable: the admissible
 * range is re-derived from the input's own `partTargetWordCount` by the same
 * function the prompt's variables come from (CAL-101's discipline). The word
 * budget holds the declared targets' sum within ±10 % of the part's target —
 * CAL-103's tolerance applied per batch — and is disarmed by any null
 * target, because a sum with a hole in it verifies nothing: under-firing on
 * rows is by design, and the silence is CAL-110's to report.
 *
 * The report is kinds, indexes and counts, and nothing else — safe to log
 * whole (§9) by construction.
 */

import { sameWords } from "@calepin/shared/text";

import { contentWordsOf, STAKE_OVERLAP_RATIO, stakeOverlap } from "../stake/overlap";
import {
  CHAPTER_TARGET_WORD_COUNT_RANGE,
  chapterCalibrationForPartWordCount,
  chapterWordBudgetGap,
} from "../target-length/calibrate";
import type { ChapterThreadState } from "./schema";

/**
 * The defect kinds — closed, and closed on purpose: a report that named its
 * findings in prose could not be logged (§9) and could not be branched on.
 */
export const CHAPTER_BATCH_DEFECT_KINDS = [
  "chapter-count-out-of-range",
  "duplicate-working-title",
  "focal-not-present",
  "unknown-character",
  "duplicate-character",
  "unknown-place",
  "unknown-fact-index",
  "duplicate-fact-reference",
  "unknown-thread-index",
  "duplicate-thread-action",
  "reopened-thread",
  "thread-already-closed",
  "unopened-thread-action",
  "undeclared-thread-action",
  "unaddressed-part-thread",
  "premature-thread-close",
  "thread-left-open",
  "final-part-open-thread",
  "unknown-preparation-reference",
  "chapter-target-out-of-envelope",
  "word-budget-out-of-tolerance",
] as const;

export type ChapterBatchDefectKind = (typeof CHAPTER_BATCH_DEFECT_KINDS)[number];

/** The advisory kinds — reported beside the defects, never a refusal. */
export const CHAPTER_BATCH_ADVISORY_KINDS = [
  "similar-stakes",
  "similar-preceding-stake",
  "threadless-chapter",
] as const;

export type ChapterBatchAdvisoryKind = (typeof CHAPTER_BATCH_ADVISORY_KINDS)[number];

/** Which of a chapter's three action lists an action came out of. */
export type ChapterThreadActionList = "opens" | "continues" | "closes";

/**
 * One finding that refuses the batch. A union rather than one shape with
 * nullable fields, `PartStructureDefect`'s reason: each kind names exactly
 * the positions it is about.
 */
export type ChapterBatchDefect =
  | {
      readonly kind: "chapter-count-out-of-range";
      readonly chapterCount: number;
      readonly minChapters: number;
      readonly maxChapters: number;
    }
  | {
      readonly kind: "duplicate-working-title";
      readonly chapterIndex: number;
      readonly firstChapterIndex: number;
    }
  | { readonly kind: "focal-not-present"; readonly chapterIndex: number }
  | {
      readonly kind: "unknown-character";
      readonly chapterIndex: number;
      /** Position inside the chapter's own present list. */
      readonly index: number;
    }
  | {
      readonly kind: "duplicate-character";
      readonly chapterIndex: number;
      readonly index: number;
      readonly firstIndex: number;
    }
  | { readonly kind: "unknown-place"; readonly chapterIndex: number }
  | {
      readonly kind: "unknown-fact-index";
      readonly chapterIndex: number;
      /** Position inside the chapter's own fact list. */
      readonly index: number;
    }
  | {
      readonly kind: "duplicate-fact-reference";
      readonly chapterIndex: number;
      readonly index: number;
      readonly firstIndex: number;
    }
  | {
      readonly kind: "unknown-thread-index";
      readonly chapterIndex: number;
      readonly list: ChapterThreadActionList;
      /** Position inside that list. */
      readonly index: number;
    }
  | {
      readonly kind: "duplicate-thread-action";
      readonly chapterIndex: number;
      readonly threadIndex: number;
    }
  | {
      readonly kind: "reopened-thread";
      readonly chapterIndex: number;
      readonly threadIndex: number;
    }
  | {
      readonly kind: "thread-already-closed";
      readonly chapterIndex: number;
      readonly threadIndex: number;
    }
  | {
      readonly kind: "unopened-thread-action";
      readonly chapterIndex: number;
      readonly threadIndex: number;
      readonly list: "continues" | "closes";
    }
  | {
      readonly kind: "undeclared-thread-action";
      readonly chapterIndex: number;
      readonly threadIndex: number;
    }
  | { readonly kind: "unaddressed-part-thread"; readonly threadIndex: number }
  | {
      readonly kind: "premature-thread-close";
      readonly chapterIndex: number;
      readonly threadIndex: number;
    }
  | { readonly kind: "thread-left-open"; readonly threadIndex: number }
  | { readonly kind: "final-part-open-thread"; readonly threadIndex: number }
  | { readonly kind: "unknown-preparation-reference"; readonly chapterIndex: number }
  | {
      readonly kind: "chapter-target-out-of-envelope";
      readonly chapterIndex: number;
      readonly targetWordCount: number;
      readonly minWords: number;
      readonly maxWords: number;
    }
  | {
      readonly kind: "word-budget-out-of-tolerance";
      readonly declaredTotal: number;
      readonly partTargetWordCount: number;
      readonly minTotal: number;
      readonly maxTotal: number;
    };

/** One finding that is reported and decided by a person, never a refusal. */
export type ChapterBatchAdvisory =
  | {
      readonly kind: "similar-stakes";
      readonly chapterIndex: number;
      readonly otherChapterIndex: number;
      /** Distinct content words the two stakes share. */
      readonly sharedWords: number;
      /** Distinct content words of the larger stake — the ratio's denominator. */
      readonly words: number;
    }
  | {
      readonly kind: "similar-preceding-stake";
      readonly chapterIndex: number;
      /** Position in the ask's preceding-chapter list. */
      readonly precedingIndex: number;
      readonly sharedWords: number;
      readonly words: number;
    }
  | { readonly kind: "threadless-chapter"; readonly chapterIndex: number };

/** What the choreography needs of a thread, and nothing else. */
export interface ChapterBatchCheckThread {
  readonly state: ChapterThreadState;
  /** The parts the part structure assigned this thread, ascending. */
  readonly assignedPartIndexes: readonly number[];
}

/**
 * A revelation's preparing reference — check-only: a stored row keeps no
 * position (`./resolve` flattens the prose), so for rows this is null and
 * the rule skips.
 */
export interface ChapterRevelationPreparationReference {
  readonly preparedByBatchChapterIndex: number | null;
  readonly preparedByPrecedingChapterIndex: number | null;
}

/**
 * What checking one chapter needs. The planning fields mirror the
 * `ChapterOutline` columns' own nullability, so a row read back out of the
 * table satisfies this as readily as a model answer — see the header.
 */
export interface ChapterBatchCheckChapter {
  readonly workingTitle: string | null;
  readonly targetWordCount: number | null;
  readonly focalCharacterName: string | null;
  readonly presentCharacterNames: readonly string[];
  readonly placeName: string | null;
  readonly immediateGoal: string | null;
  readonly revelationPreparation: ChapterRevelationPreparationReference | null;
  readonly opensThreadIndexes: readonly number[];
  readonly continuesThreadIndexes: readonly number[];
  readonly closesThreadIndexes: readonly number[];
  readonly factIndexes: readonly number[];
}

export interface ChapterBatchCheckInput {
  /** The part's share of the novel — the count gate and the budget derive from it. */
  readonly partTargetWordCount: number;
  readonly partIndex: number;
  readonly partCount: number;
  readonly threads: readonly ChapterBatchCheckThread[];
  /** The ask's cast spellings. */
  readonly castNames: readonly string[];
  readonly placeNames: readonly string[];
  readonly factCount: number;
  readonly precedingChapters: readonly { readonly immediateGoal: string | null }[];
  readonly chapters: readonly ChapterBatchCheckChapter[];
}

/**
 * What the check found, in kinds, indexes and counts — safe to log whole (§9).
 */
export interface ChapterBatchReport {
  /** No defect stands; advisories do not weigh here. */
  readonly acceptable: boolean;
  readonly chapters: number;
  readonly threads: number;
  readonly defects: readonly ChapterBatchDefect[];
  readonly advisories: readonly ChapterBatchAdvisory[];
}

function checkReferences(
  chapters: readonly ChapterBatchCheckChapter[],
  input: ChapterBatchCheckInput,
): readonly ChapterBatchDefect[] {
  const defects: ChapterBatchDefect[] = [];

  chapters.forEach((chapter, chapterIndex) => {
    if (chapter.workingTitle !== null) {
      const firstChapterIndex = chapters.findIndex(
        (other) =>
          other.workingTitle !== null && sameWords(other.workingTitle, chapter.workingTitle ?? ""),
      );

      if (firstChapterIndex !== -1 && firstChapterIndex < chapterIndex) {
        defects.push({ kind: "duplicate-working-title", chapterIndex, firstChapterIndex });
      }
    }

    chapter.presentCharacterNames.forEach((name, index) => {
      if (!input.castNames.some((castName) => sameWords(castName, name))) {
        defects.push({ kind: "unknown-character", chapterIndex, index });
        return;
      }

      const firstIndex = chapter.presentCharacterNames.findIndex((other) => sameWords(other, name));

      if (firstIndex !== -1 && firstIndex < index) {
        defects.push({ kind: "duplicate-character", chapterIndex, index, firstIndex });
      }
    });

    // The schema's exact-equality rule, re-held through `sameWords` so a row
    // whose spellings drifted typographically still answers honestly.
    if (
      chapter.focalCharacterName !== null &&
      !chapter.presentCharacterNames.some((name) =>
        sameWords(name, chapter.focalCharacterName ?? ""),
      )
    ) {
      defects.push({ kind: "focal-not-present", chapterIndex });
    }

    if (
      chapter.placeName !== null &&
      !input.placeNames.some((placeName) => sameWords(placeName, chapter.placeName ?? ""))
    ) {
      defects.push({ kind: "unknown-place", chapterIndex });
    }

    chapter.factIndexes.forEach((factIndex, index) => {
      if (factIndex < 0 || factIndex >= input.factCount) {
        defects.push({ kind: "unknown-fact-index", chapterIndex, index });
        return;
      }

      const firstIndex = chapter.factIndexes.indexOf(factIndex);

      if (firstIndex < index) {
        defects.push({ kind: "duplicate-fact-reference", chapterIndex, index, firstIndex });
      }
    });

    const reference = chapter.revelationPreparation;

    if (reference !== null) {
      const { preparedByBatchChapterIndex: batch, preparedByPrecedingChapterIndex: preceding } =
        reference;
      const exactlyOne = (batch === null) !== (preceding === null);
      const batchValid = batch === null || (batch >= 0 && batch < chapterIndex);
      const precedingValid =
        preceding === null || (preceding >= 0 && preceding < input.precedingChapters.length);

      if (!exactlyOne || !batchValid || !precedingValid) {
        defects.push({ kind: "unknown-preparation-reference", chapterIndex });
      }
    }
  });

  return defects;
}

/**
 * The choreography: every thread from its seeded state through the batch in
 * reading order, each action held to the transition table, the assignment
 * and the closure schedule. One walk answers four imperatives' worth of
 * rules — see the header.
 */
function checkThreads(
  chapters: readonly ChapterBatchCheckChapter[],
  input: ChapterBatchCheckInput,
): { defects: readonly ChapterBatchDefect[]; advisories: readonly ChapterBatchAdvisory[] } {
  const defects: ChapterBatchDefect[] = [];
  const advisories: ChapterBatchAdvisory[] = [];
  const isFinalPart = input.partIndex === input.partCount - 1;

  const states: ChapterThreadState[] = input.threads.map((thread) => thread.state);
  const acted = new Set<number>();

  chapters.forEach((chapter, chapterIndex) => {
    const lists = [
      ["opens", chapter.opensThreadIndexes],
      ["continues", chapter.continuesThreadIndexes],
      ["closes", chapter.closesThreadIndexes],
    ] as const;
    // One action per thread per chapter — the schema's disjointness, re-held
    // for rows; a duplicate is reported once and skipped, so it cannot also
    // distort the walk (the parts checker's `seen`-set discipline).
    const seen = new Set<number>();

    if (lists.every(([, indexes]) => indexes.length === 0)) {
      // The structural echo of the decorative chapter: it advances no thread.
      // An advisory, never a refusal — a hard demand here would teach the
      // model to fabricate a thread action (CAL-080's lesson), and the
      // semantic judgement is CAL-110's audit.
      advisories.push({ kind: "threadless-chapter", chapterIndex });
    }

    for (const [list, indexes] of lists) {
      indexes.forEach((threadIndex, index) => {
        const thread = input.threads[threadIndex];

        if (threadIndex < 0 || thread === undefined) {
          defects.push({ kind: "unknown-thread-index", chapterIndex, list, index });
          return;
        }

        if (seen.has(threadIndex)) {
          defects.push({ kind: "duplicate-thread-action", chapterIndex, threadIndex });
          return;
        }
        seen.add(threadIndex);
        acted.add(threadIndex);

        if (!thread.assignedPartIndexes.includes(input.partIndex)) {
          defects.push({ kind: "undeclared-thread-action", chapterIndex, threadIndex });
        }

        const state = states[threadIndex];

        if (state === "closed") {
          defects.push({ kind: "thread-already-closed", chapterIndex, threadIndex });
          return;
        }

        if (list === "opens") {
          if (state === "open") {
            defects.push({ kind: "reopened-thread", chapterIndex, threadIndex });
            return;
          }
          states[threadIndex] = "open";
          return;
        }

        if (state === "unopened") {
          defects.push({ kind: "unopened-thread-action", chapterIndex, threadIndex, list });
          return;
        }

        if (list === "closes") {
          const lastAssigned = thread.assignedPartIndexes[thread.assignedPartIndexes.length - 1];

          // A close lands on the thread's last assigned part, never before:
          // a thread closed while later parts are still assigned it makes
          // those parts' asks self-contradictory (a closed thread cannot be
          // assigned), and the plan would die at the next composition
          // instead of being refused here.
          if (lastAssigned !== undefined && lastAssigned > input.partIndex) {
            defects.push({ kind: "premature-thread-close", chapterIndex, threadIndex });
          }
          states[threadIndex] = "closed";
        }
      });
    }
  });

  input.threads.forEach((thread, threadIndex) => {
    const assigned = thread.assignedPartIndexes.includes(input.partIndex);
    const lastAssigned = thread.assignedPartIndexes[thread.assignedPartIndexes.length - 1];

    if (assigned && !acted.has(threadIndex)) {
      defects.push({ kind: "unaddressed-part-thread", threadIndex });
    }

    if (states[threadIndex] !== "closed") {
      // The final part closes everything still open, assigned or not — the
      // belt for plans re-cut by hand. Everywhere else, the closure schedule
      // is the assignment's own last entry: past it, no batch may touch the
      // thread again, so open here means open forever.
      if (isFinalPart) {
        defects.push({ kind: "final-part-open-thread", threadIndex });
      } else if (lastAssigned === input.partIndex) {
        defects.push({ kind: "thread-left-open", threadIndex });
      }
    }
  });

  return { defects, advisories };
}

function checkBudget(
  chapters: readonly ChapterBatchCheckChapter[],
  partTargetWordCount: number,
): readonly ChapterBatchDefect[] {
  const defects: ChapterBatchDefect[] = [];

  chapters.forEach((chapter, chapterIndex) => {
    if (chapter.targetWordCount === null) return;

    if (
      chapter.targetWordCount < CHAPTER_TARGET_WORD_COUNT_RANGE.min ||
      chapter.targetWordCount > CHAPTER_TARGET_WORD_COUNT_RANGE.max
    ) {
      defects.push({
        kind: "chapter-target-out-of-envelope",
        chapterIndex,
        targetWordCount: chapter.targetWordCount,
        minWords: CHAPTER_TARGET_WORD_COUNT_RANGE.min,
        maxWords: CHAPTER_TARGET_WORD_COUNT_RANGE.max,
      });
    }
  });

  // A sum with a hole in it verifies nothing: any null target disarms the
  // gate rather than under-counting the batch into a false refusal. The
  // under-fire on rows is by design — the gap is CAL-110's to report.
  if (chapters.some((chapter) => chapter.targetWordCount === null)) return defects;

  const declaredTotal = chapters.reduce(
    (total, chapter) => total + (chapter.targetWordCount ?? 0),
    0,
  );
  const gap = chapterWordBudgetGap(declaredTotal, partTargetWordCount);

  if (!gap.withinTolerance) {
    defects.push({
      kind: "word-budget-out-of-tolerance",
      declaredTotal,
      partTargetWordCount,
      minTotal: gap.minTotal,
      maxTotal: gap.maxTotal,
    });
  }

  return defects;
}

function checkStakes(
  chapters: readonly ChapterBatchCheckChapter[],
  precedingChapters: readonly { readonly immediateGoal: string | null }[],
): readonly ChapterBatchAdvisory[] {
  const advisories: ChapterBatchAdvisory[] = [];
  const stakes = chapters.map((chapter) =>
    chapter.immediateGoal === null ? null : contentWordsOf(chapter.immediateGoal),
  );
  const precedingStakes = precedingChapters.map((digest) =>
    digest.immediateGoal === null ? null : contentWordsOf(digest.immediateGoal),
  );

  stakes.forEach((stake, chapterIndex) => {
    if (stake === null) return;

    for (let otherChapterIndex = 0; otherChapterIndex < chapterIndex; otherChapterIndex += 1) {
      const other = stakes[otherChapterIndex];

      if (other === null || other === undefined) continue;

      const { sharedWords, words } = stakeOverlap(stake, other);

      if (words > 0 && sharedWords / words >= STAKE_OVERLAP_RATIO) {
        advisories.push({
          kind: "similar-stakes",
          chapterIndex,
          otherChapterIndex,
          sharedWords,
          words,
        });
      }
    }

    precedingStakes.forEach((other, precedingIndex) => {
      if (other === null) return;

      const { sharedWords, words } = stakeOverlap(stake, other);

      if (words > 0 && sharedWords / words >= STAKE_OVERLAP_RATIO) {
        advisories.push({
          kind: "similar-preceding-stake",
          chapterIndex,
          precedingIndex,
          sharedWords,
          words,
        });
      }
    });
  });

  return advisories;
}

/**
 * Every rule, one pass, no early return — the parts checker's arrangement: a
 * caller sees everything wrong at once rather than one finding per round
 * trip.
 */
export function checkChapterOutlineBatch(input: ChapterBatchCheckInput): ChapterBatchReport {
  const { chapters, threads, partTargetWordCount } = input;
  const defects: ChapterBatchDefect[] = [];

  const { minChapters, maxChapters } = chapterCalibrationForPartWordCount(partTargetWordCount);

  if (chapters.length < minChapters || chapters.length > maxChapters) {
    defects.push({
      kind: "chapter-count-out-of-range",
      chapterCount: chapters.length,
      minChapters,
      maxChapters,
    });
  }

  defects.push(...checkReferences(chapters, input));

  const choreography = checkThreads(chapters, input);

  defects.push(...choreography.defects);
  defects.push(...checkBudget(chapters, partTargetWordCount));

  const advisories = [
    ...choreography.advisories,
    ...checkStakes(chapters, input.precedingChapters),
  ];

  return {
    acceptable: defects.length === 0,
    chapters: chapters.length,
    threads: threads.length,
    defects,
    advisories,
  };
}
