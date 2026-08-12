/**
 * Splitting one chapter plan into two, and the arithmetic that says nothing
 * was lost doing it (CAL-106).
 *
 * The other half of the pair `order/position.ts` named: *a split is
 * `orderKeyAt` at `indexOf(source) + 1`*. The source chapter **keeps its id**
 * and becomes the first half, so every reference that stays there is untouched
 * by construction and only what moves to the second half is rewritten — the
 * merge's own economy, read from the other end.
 *
 * **An arbitration, not a proposal.** What this module parses and checks is
 * the author's final word: which character, which fact and which thread action
 * lands on which half, and what each half's prose says. A model *proposes* one
 * (`./split-mission`), and `resolveChapterSplitProposal` turns its answer into
 * exactly this type — so a person and a model produce the same thing and the
 * screen has one thing to arbitrate. That is the *one schema, two write paths*
 * device `parseAnalysisSectionEdit` and `parseDirectionContent` already use,
 * with the model on the second path rather than the first.
 *
 * **Non-loss is arithmetic, and it refuses.** Every character, every fact and
 * every thread action the source carried has to appear on at least one half —
 * `dropped-*` — and nothing may appear that the source did not carry —
 * `unknown-*`, because a split redistributes and adding is CAL-107's. Those
 * two families together are *aucune information ne doit être perdue dans
 * l'opération*, stated as a property of the write rather than as a hope about
 * the answer.
 *
 * **Prose is accounted for, never refused.** A split legitimately rewrites: two
 * halves of one chapter each need their own objective, and demanding the
 * source's sentence back verbatim would make the operation useless. So each
 * half's prose is compared against the source's through
 * `createVerbatimMatcher` and what is *not* a passage of it comes back as a
 * `rewritten-prose` advisory — the author sees exactly which fields are new
 * words rather than a cut. The comparison runs half-inside-source, never the
 * reverse: a half holds a piece of the source, so the containment that means
 * something is that direction.
 *
 * **The same two refusals as the merge.** A written chapter and a locked plan
 * are refused here too, and for the same reason: re-cutting a chapter that
 * already holds prose is a manuscript decision. As there, the consequence is
 * that no derived column can move, so the write takes no project row lock.
 *
 * Everything here is pure and structural, and the report is kinds, ids and
 * counts — safe to log whole (§9).
 */

import { fail, fromValidationIssues, type Result, succeed } from "@calepin/shared/errors";
import { createVerbatimMatcher } from "@calepin/shared/text";
import { z } from "zod";

import { contentWordsOf, STAKE_OVERLAP_RATIO, stakeOverlap } from "../stake/overlap";
import { CHAPTER_TARGET_WORD_COUNT_RANGE, chapterWordBudgetGap } from "../target-length/calibrate";
import {
  CHAPTER_PROSE_COLUMNS,
  CHAPTER_THREAD_ACTION_LISTS,
  type ChapterCutSource,
  type ChapterProseColumn,
  type ChapterThreadActionListName,
  unionIds,
} from "./cut";
import { CHAPTER_LABEL_CHAR_CEILING, CHAPTER_PERIOD_PRECISIONS } from "./schema";

/** The two chapters a split produces, named rather than numbered. */
export const CHAPTER_SPLIT_HALVES = ["first", "second"] as const;

export type ChapterSplitHalfName = (typeof CHAPTER_SPLIT_HALVES)[number];

/**
 * How long one prose column of an arbitrated half may be.
 *
 * Deliberately **not** `CHAPTER_CHAR_CEILINGS`: those bound what the *mission*
 * is asked for, one chapter's worth of field. An arbitration carries whatever
 * the plan already holds — including text a previous merge joined out of two
 * chapters — so a bound derived from the mission's would refuse to undo an
 * operation the product itself offers. This is an input-size guard on a server
 * action, not a narrative rule; what a chapter's plan should say is CAL-110's.
 */
export const CHAPTER_SPLIT_PROSE_CHAR_CEILING = 8_000;

/** The defect kinds — closed, so the report can be branched on and logged (§9). */
export const CHAPTER_SPLIT_DEFECT_KINDS = [
  "chapter-written",
  "plan-locked",
  "dropped-character",
  "dropped-fact",
  "dropped-thread-action",
  "unknown-character",
  "unknown-fact",
  "unknown-thread-action",
  "duplicated-thread-endpoint",
  "thread-closes-before-opens",
  "focal-not-present",
  "period-outside-source-span",
  "word-budget-out-of-tolerance",
] as const;

export type ChapterSplitDefectKind = (typeof CHAPTER_SPLIT_DEFECT_KINDS)[number];

/** The advisory kinds — reported beside the defects, never a refusal. */
export const CHAPTER_SPLIT_ADVISORY_KINDS = [
  "similar-stakes",
  "half-below-envelope",
  "rewritten-prose",
] as const;

export type ChapterSplitAdvisoryKind = (typeof CHAPTER_SPLIT_ADVISORY_KINDS)[number];

/** One finding that refuses the split. */
export type ChapterSplitDefect =
  | {
      readonly kind: "chapter-written";
      readonly chapterId: string;
      readonly revisionCount: number;
    }
  | { readonly kind: "plan-locked"; readonly chapterId: string }
  | { readonly kind: "dropped-character"; readonly characterId: string }
  | { readonly kind: "dropped-fact"; readonly factId: string }
  | {
      readonly kind: "dropped-thread-action";
      readonly threadId: string;
      readonly list: ChapterThreadActionListName;
    }
  | {
      readonly kind: "unknown-character";
      readonly characterId: string;
      readonly half: ChapterSplitHalfName;
    }
  | {
      readonly kind: "unknown-fact";
      readonly factId: string;
      readonly half: ChapterSplitHalfName;
    }
  | {
      readonly kind: "unknown-thread-action";
      readonly threadId: string;
      readonly list: ChapterThreadActionListName;
      readonly half: ChapterSplitHalfName;
    }
  | {
      readonly kind: "duplicated-thread-endpoint";
      readonly threadId: string;
      readonly list: "opens" | "closes";
    }
  | { readonly kind: "thread-closes-before-opens"; readonly threadId: string }
  | { readonly kind: "focal-not-present"; readonly half: ChapterSplitHalfName }
  | { readonly kind: "period-outside-source-span"; readonly half: ChapterSplitHalfName }
  | {
      readonly kind: "word-budget-out-of-tolerance";
      readonly declaredTotal: number;
      readonly sourceTargetWordCount: number;
      readonly minTotal: number;
      readonly maxTotal: number;
    };

/** One finding a person weighs, never a refusal. */
export type ChapterSplitAdvisory =
  | {
      readonly kind: "similar-stakes";
      /** Distinct content words the two halves' objectives share. */
      readonly sharedWords: number;
      /** Distinct content words of the larger objective — the ratio's denominator. */
      readonly words: number;
    }
  | {
      readonly kind: "half-below-envelope";
      readonly half: ChapterSplitHalfName;
      readonly targetWordCount: number;
      readonly minWords: number;
    }
  | {
      readonly kind: "rewritten-prose";
      readonly half: ChapterSplitHalfName;
      readonly column: ChapterProseColumn;
    };

const proseColumn = z.string().trim().min(1).max(CHAPTER_SPLIT_PROSE_CHAR_CEILING).nullable();

const identifier = z.string().trim().min(1);

/**
 * One of the two chapters a split produces, in the `ChapterOutline` columns'
 * own spellings and their own nullability: an arbitration writes rows, and a
 * hand-added plan is allowed to be empty — what a chapter's plan *should* say
 * is CAL-110's audit, not this contract's.
 */
export const chapterSplitHalfSchema = z.strictObject({
  workingTitle: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING).nullable(),
  targetWordCount: z.int().positive().nullable(),
  focalCharacterId: identifier.nullable(),
  placeId: identifier.nullable(),
  periodStartDay: z.int().nullable(),
  periodEndDay: z.int().nullable(),
  periodPrecision: z.enum(CHAPTER_PERIOD_PRECISIONS).nullable(),
  periodLabel: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING).nullable(),
  dramaticFunction: proseColumn,
  immediateGoal: proseColumn,
  obstacle: proseColumn,
  decision: proseColumn,
  revelation: proseColumn,
  consequence: proseColumn,
  detailedSummary: proseColumn,
  characterIds: z.array(identifier),
  factIds: z.array(identifier),
  opensThreadIds: z.array(identifier),
  continuesThreadIds: z.array(identifier),
  closesThreadIds: z.array(identifier),
});

export type ChapterSplitHalf = z.infer<typeof chapterSplitHalfSchema>;

/** What the author finally decided — the write's whole input. */
export const chapterSplitArbitrationSchema = z
  .strictObject({
    chapterId: identifier,
    first: chapterSplitHalfSchema,
    second: chapterSplitHalfSchema,
  })
  .check((ctx) => {
    for (const half of CHAPTER_SPLIT_HALVES) {
      const value = ctx.value[half];

      // `chapter_outlines_period_order_check`'s rule and
      // `chapter_outlines_period_precision_check`'s pairing, held at the
      // contract so a refusal names the field rather than the constraint.
      if (
        value.periodStartDay !== null &&
        value.periodEndDay !== null &&
        value.periodEndDay < value.periodStartDay
      ) {
        ctx.issues.push({
          code: "custom",
          message: "a half's period ends before it starts",
          path: [half, "periodEndDay"],
          input: ctx.value,
        });
      }

      const placed = value.periodStartDay !== null || value.periodEndDay !== null;

      if (placed !== (value.periodPrecision !== null)) {
        ctx.issues.push({
          code: "custom",
          message: "a half states a period without a precision, or the reverse",
          path: [half, "periodPrecision"],
          input: ctx.value,
        });
      }

      for (const [field, ids] of [
        ["characterIds", value.characterIds],
        ["factIds", value.factIds],
      ] as const) {
        if (new Set(ids).size !== ids.length) {
          ctx.issues.push({
            code: "custom",
            message: "a half names the same reference twice",
            path: [half, field],
            input: ctx.value,
          });
        }
      }

      // The three lists disjoint within a half — CAL-102's rule, which is what
      // makes opened-and-closed-in-one-chapter unrepresentable rather than
      // merely refused.
      const actions = [
        ...value.opensThreadIds,
        ...value.continuesThreadIds,
        ...value.closesThreadIds,
      ];

      if (new Set(actions).size !== actions.length) {
        ctx.issues.push({
          code: "custom",
          message: "a half acts on the same thread twice",
          path: [half, "opensThreadIds"],
          input: ctx.value,
        });
      }
    }
  });

export type ChapterSplitArbitration = z.infer<typeof chapterSplitArbitrationSchema>;

/** What the split found, in kinds, ids and counts — safe to log whole (§9). */
export interface ChapterSplitReport {
  /** No defect stands; advisories do not weigh here. */
  readonly acceptable: boolean;
  readonly chapterId: string;
  readonly defects: readonly ChapterSplitDefect[];
  readonly advisories: readonly ChapterSplitAdvisory[];
  readonly redistributed: {
    readonly characters: number;
    readonly facts: number;
    readonly threadActions: number;
  };
}

/** Every character the source carried, its focal included. */
function sourceCharacterIds(source: ChapterCutSource): readonly string[] {
  const focal = source.outline?.focalCharacterId;

  return unionIds(
    source.outline?.characterIds ?? [],
    focal === null || focal === undefined ? [] : [focal],
  );
}

function threadActionsOf(
  chapter: Pick<ChapterCutSource, "opensThreadIds" | "continuesThreadIds" | "closesThreadIds">,
): Readonly<Record<ChapterThreadActionListName, readonly string[]>> {
  return {
    opens: chapter.opensThreadIds,
    continues: chapter.continuesThreadIds,
    closes: chapter.closesThreadIds,
  };
}

function checkConservation(
  source: ChapterCutSource,
  arbitration: ChapterSplitArbitration,
): readonly ChapterSplitDefect[] {
  const defects: ChapterSplitDefect[] = [];
  const { first, second } = arbitration;

  const characters = new Set(sourceCharacterIds(source));
  const facts = new Set(source.outline?.factIds ?? []);
  const placedCharacters = new Set([...first.characterIds, ...second.characterIds]);
  const placedFacts = new Set([...first.factIds, ...second.factIds]);

  for (const characterId of characters) {
    if (!placedCharacters.has(characterId)) {
      defects.push({ kind: "dropped-character", characterId });
    }
  }

  for (const factId of facts) {
    if (!placedFacts.has(factId)) {
      defects.push({ kind: "dropped-fact", factId });
    }
  }

  for (const half of CHAPTER_SPLIT_HALVES) {
    for (const characterId of arbitration[half].characterIds) {
      if (!characters.has(characterId)) {
        defects.push({ kind: "unknown-character", characterId, half });
      }
    }

    for (const factId of arbitration[half].factIds) {
      if (!facts.has(factId)) {
        defects.push({ kind: "unknown-fact", factId, half });
      }
    }
  }

  const sourceActions = threadActionsOf(source);
  const halfActions = {
    first: threadActionsOf(first),
    second: threadActionsOf(second),
  } as const;

  for (const list of CHAPTER_THREAD_ACTION_LISTS) {
    const placed = new Set([...halfActions.first[list], ...halfActions.second[list]]);

    for (const threadId of sourceActions[list]) {
      if (!placed.has(threadId)) {
        defects.push({ kind: "dropped-thread-action", threadId, list });
      }
    }

    const offered = new Set(sourceActions[list]);

    for (const half of CHAPTER_SPLIT_HALVES) {
      for (const threadId of halfActions[half][list]) {
        if (!offered.has(threadId)) {
          defects.push({ kind: "unknown-thread-action", threadId, list, half });
        }
      }
    }

    // An opening and a closing are single columns on `Thread`: two halves
    // cannot both hold one. A continuation is a row per chapter, so both may.
    if (list !== "continues") {
      for (const threadId of halfActions.first[list]) {
        if (halfActions.second[list].includes(threadId)) {
          defects.push({ kind: "duplicated-thread-endpoint", threadId, list });
        }
      }
    }
  }

  // A thread the second half opens and the first half closes is closed before
  // it exists — the one ordering a split can break on its own.
  for (const threadId of halfActions.second.opens) {
    if (halfActions.first.closes.includes(threadId)) {
      defects.push({ kind: "thread-closes-before-opens", threadId });
    }
  }

  return defects;
}

function checkHalves(
  source: ChapterCutSource,
  arbitration: ChapterSplitArbitration,
): readonly ChapterSplitDefect[] {
  const defects: ChapterSplitDefect[] = [];

  for (const half of CHAPTER_SPLIT_HALVES) {
    const value = arbitration[half];

    if (value.focalCharacterId !== null && !value.characterIds.includes(value.focalCharacterId)) {
      defects.push({ kind: "focal-not-present", half });
    }

    const start = source.outline?.periodStartDay ?? null;
    const end = source.outline?.periodEndDay ?? null;

    if (start === null || end === null) continue;

    const outside = [value.periodStartDay, value.periodEndDay].some(
      (day) => day !== null && (day < start || day > end),
    );

    if (outside) {
      // A split cuts a span; it does not move the chapter on the chronology.
      defects.push({ kind: "period-outside-source-span", half });
    }
  }

  const sourceTarget = source.outline?.targetWordCount ?? null;
  const { targetWordCount: firstTarget } = arbitration.first;
  const { targetWordCount: secondTarget } = arbitration.second;

  // Disarmed by any null, `checkChapterOutlineBatch`'s own doctrine: a sum
  // with a hole in it verifies nothing, and the silence is CAL-110's to report.
  if (sourceTarget !== null && firstTarget !== null && secondTarget !== null) {
    const declaredTotal = firstTarget + secondTarget;
    const gap = chapterWordBudgetGap(declaredTotal, sourceTarget);

    if (!gap.withinTolerance) {
      defects.push({
        kind: "word-budget-out-of-tolerance",
        declaredTotal,
        sourceTargetWordCount: sourceTarget,
        minTotal: gap.minTotal,
        maxTotal: gap.maxTotal,
      });
    }
  }

  return defects;
}

function findAdvisories(
  source: ChapterCutSource,
  arbitration: ChapterSplitArbitration,
): readonly ChapterSplitAdvisory[] {
  const advisories: ChapterSplitAdvisory[] = [];
  const { first, second } = arbitration;

  if (first.immediateGoal !== null && second.immediateGoal !== null) {
    const overlap = stakeOverlap(
      contentWordsOf(first.immediateGoal),
      contentWordsOf(second.immediateGoal),
    );

    // Two halves of one chapter chasing one objective is *la répétition du
    // même enjeu* inside a single cut — lexical, advisory, and CAL-110's to
    // judge, `checkChapterOutlineBatch`'s own regime.
    if (overlap.words > 0 && overlap.sharedWords / overlap.words >= STAKE_OVERLAP_RATIO) {
      advisories.push({
        kind: "similar-stakes",
        sharedWords: overlap.sharedWords,
        words: overlap.words,
      });
    }
  }

  for (const half of CHAPTER_SPLIT_HALVES) {
    const { targetWordCount } = arbitration[half];

    if (targetWordCount !== null && targetWordCount < CHAPTER_TARGET_WORD_COUNT_RANGE.min) {
      advisories.push({
        kind: "half-below-envelope",
        half,
        targetWordCount,
        minWords: CHAPTER_TARGET_WORD_COUNT_RANGE.min,
      });
    }
  }

  for (const column of CHAPTER_PROSE_COLUMNS) {
    const original = source.outline?.[column] ?? null;
    const matches = original === null ? null : createVerbatimMatcher(original);

    for (const half of CHAPTER_SPLIT_HALVES) {
      const written = arbitration[half][column];

      if (written === null) continue;

      // Half inside source, never the reverse: a half holds a piece of the
      // chapter it came out of, so that is the containment that means
      // *this text was cut, not written*.
      if (matches === null || !matches(written)) {
        advisories.push({ kind: "rewritten-prose", half, column });
      }
    }
  }

  return advisories;
}

/**
 * What the split would do to the plan, and every reason it should not.
 *
 * Pure and row-capable: `source` is read fresh inside the writing transaction,
 * never taken from the caller's screen, so the conservation the report attests
 * is conservation against the plan that exists.
 */
export function checkChapterSplit(
  source: ChapterCutSource,
  arbitration: ChapterSplitArbitration,
): ChapterSplitReport {
  const defects: ChapterSplitDefect[] = [];

  if (source.revisionCount > 0) {
    defects.push({
      kind: "chapter-written",
      chapterId: source.id,
      revisionCount: source.revisionCount,
    });
  }

  if (source.outline !== null && source.outline.lockedAt !== null) {
    defects.push({ kind: "plan-locked", chapterId: source.id });
  }

  defects.push(...checkConservation(source, arbitration), ...checkHalves(source, arbitration));

  const actions = threadActionsOf(source);

  return {
    acceptable: defects.length === 0,
    chapterId: source.id,
    defects,
    advisories: findAdvisories(source, arbitration),
    redistributed: {
      characters: sourceCharacterIds(source).length,
      facts: source.outline?.factIds.length ?? 0,
      threadActions: actions.opens.length + actions.continues.length + actions.closes.length,
    },
  };
}

/** Shown when the submitted arbitration cannot even be read — never a field name (§7). */
export const MALFORMED_SPLIT_MESSAGE =
  "Cette scission n'a pas pu être interprétée. Rechargez le plan.";

/** A server-action argument crossed a serialisation boundary, so it is parsed (§6). */
export function parseChapterSplitArbitration(submitted: unknown): Result<ChapterSplitArbitration> {
  const parsed = chapterSplitArbitrationSchema.safeParse(submitted);

  if (!parsed.success) {
    return fail(fromValidationIssues(parsed.error, { userMessage: MALFORMED_SPLIT_MESSAGE }));
  }

  return succeed(parsed.data);
}
