/**
 * Merging two adjacent chapter plans into one (CAL-106).
 *
 * The absorbing half of the pair CAL-019 already named: *a merge calls
 * nothing at all, since removing a row leaves every remaining key untouched*
 * (`order/position.ts`). No order key is written here and no chapter is
 * renumbered; what this module decides is the **sixteen attributes and the
 * reference graph**, which `order/stability.test.ts` left to this task in so
 * many words — *repoint what pointed at the absorbed id, and nothing else*.
 *
 * **The survivor is the first chapter.** It keeps its id, its part and its
 * place in the reading order, so every reference that already named it is
 * untouched by construction; only what named the absorbed chapter moves. The
 * alternative — minting a third chapter and deleting both — would break every
 * reference at once, for nothing.
 *
 * **Consolidation is arithmetic, and it never erases.** Prose is joined behind
 * one fixed French connector (`resolveBibleStyle`'s move, `WORLD_FORBIDS_
 * CONNECTOR`'s and `PART_TIPPING_POINT_CONNECTOR`'s), characters and facts are
 * unioned, the period becomes the union interval at the coarser of the two
 * precisions (interval arithmetic, CAL-093's permissive direction), and the
 * target word counts are **summed and never clamped** — which is what keeps a
 * part's word budget invariant under a merge, the number CAL-103's gap
 * indicator reads.
 *
 * **Three attributes cannot be joined, and they are named rather than
 * dropped.** A chapter has one place, one focal character and one period
 * precision. Where the two chapters disagree, the merge keeps the first's and
 * reports a `ChapterMergeLoss`; the repository refuses the write unless the
 * caller acknowledged it (`acknowledgeObsolescence`'s device, CAL-086), which
 * is what makes *aucune information ne doit être perdue* a property of the
 * statement rather than of a screen. The demoted focal character is added to
 * the survivor's cast, so what is lost is a role and never a person.
 *
 * **A written chapter and a locked plan refuse the merge.** Deleting the
 * absorbed row cascades its `ChapterRevision`, and behind it its summaries and
 * its quality-issue passages: merging prose is a manuscript decision, not a
 * plan one. The refusal has a second effect worth stating — no derived column
 * can move, so the write needs no project row lock, exactly as `moveChapter`
 * needs none.
 *
 * Every input type here is **structural and nullable-tolerant**, the device
 * `checkChapterOutlineBatch` established: a database row satisfies it as
 * readily as a fixture, which is what lets one implementation serve the
 * screen, the repository and the tests. The report carries ids, kinds and
 * counts and nothing else — safe to log whole (§9); naming a place or a
 * character in French is the screen's, from rows it has already read.
 */

import { fail, fromValidationIssues, type Result, succeed } from "@calepin/shared/errors";
import { z } from "zod";

import { compareOrderKeys } from "../order/key";
import type { OrderedChapter } from "../order/types";
import { CHAPTER_PERIOD_PRECISIONS, type ChapterPeriodPrecision } from "./schema";

/**
 * What joins two chapters' prose in the merged plan. A connective adverb
 * rather than a bare separator, so the consolidated sentence still reads as
 * one chapter happening in two movements — `STYLE_VIOLATION_CONNECTOR`'s
 * reason, and the same domain-owned French copy: the author reads the words
 * the plan screen will show them.
 */
export const CHAPTER_MERGE_CONNECTOR = "Puis :";

/**
 * What joins two headings — the working titles and the period labels. A middle
 * dot rather than the connector above, because a title is a label and not a
 * sentence.
 */
export const CHAPTER_MERGE_TITLE_CONNECTOR = "·";

/**
 * The defect kinds — closed, so the report can be branched on and logged (§9).
 * Each refuses the merge whole: there is no half of this operation worth
 * performing.
 */
export const CHAPTER_MERGE_DEFECT_KINDS = [
  "same-chapter",
  "different-parts",
  "not-adjacent",
  "chapter-written",
  "plan-locked",
] as const;

export type ChapterMergeDefectKind = (typeof CHAPTER_MERGE_DEFECT_KINDS)[number];

/**
 * The three single-valued attributes a merge cannot join. Not defects — the
 * merge is still the right operation — but the write refuses until the caller
 * has acknowledged them.
 */
export const CHAPTER_MERGE_LOSS_KINDS = ["place", "focal-character", "period-precision"] as const;

export type ChapterMergeLossKind = (typeof CHAPTER_MERGE_LOSS_KINDS)[number];

/**
 * The seven prose columns a merge joins rather than picks between. Named once
 * so the join, the split's redistribution and their tests read one list; the
 * working title and the period label are headings and take the other
 * connector.
 */
export const CHAPTER_PROSE_COLUMNS = [
  "dramaticFunction",
  "immediateGoal",
  "obstacle",
  "decision",
  "revelation",
  "consequence",
  "detailedSummary",
] as const;

export type ChapterProseColumn = (typeof CHAPTER_PROSE_COLUMNS)[number];

/** One finding that refuses the merge. */
export type ChapterMergeDefect =
  | { readonly kind: "same-chapter" }
  | { readonly kind: "different-parts" }
  | { readonly kind: "not-adjacent" }
  | {
      readonly kind: "chapter-written";
      readonly chapterId: string;
      readonly revisionCount: number;
    }
  | { readonly kind: "plan-locked"; readonly chapterId: string };

/** One attribute the merge keeps on one side only, named so nothing is silent. */
export type ChapterMergeLoss =
  | { readonly kind: "place"; readonly keptPlaceId: string; readonly droppedPlaceId: string }
  | {
      readonly kind: "focal-character";
      readonly keptCharacterId: string;
      /** Kept as a present character — a role is lost, never a person. */
      readonly demotedCharacterId: string;
    }
  | {
      readonly kind: "period-precision";
      readonly keptPrecision: ChapterPeriodPrecision;
      readonly droppedPrecision: ChapterPeriodPrecision;
    };

/**
 * A chapter's plan as the merge reads it — the `ChapterOutline` columns' own
 * spellings and their own nullability, plus the two link tables as id lists.
 */
export interface MergeableChapterOutline {
  readonly workingTitle: string | null;
  readonly targetWordCount: number | null;
  readonly focalCharacterId: string | null;
  readonly placeId: string | null;
  readonly periodStartDay: number | null;
  readonly periodEndDay: number | null;
  readonly periodPrecision: ChapterPeriodPrecision | null;
  readonly periodLabel: string | null;
  readonly dramaticFunction: string | null;
  readonly immediateGoal: string | null;
  readonly obstacle: string | null;
  readonly decision: string | null;
  readonly revelation: string | null;
  readonly consequence: string | null;
  readonly detailedSummary: string | null;
  readonly lockedAt: Date | null;
  readonly characterIds: readonly string[];
  readonly factIds: readonly string[];
}

/** A chapter as the merge reads it — the spine, its plan and its thread actions. */
export interface MergeableChapter {
  readonly id: string;
  readonly partId: string;
  readonly orderKey: string;
  /** How many revisions the chapter already holds — non-zero refuses the merge. */
  readonly revisionCount: number;
  /** Null for a chapter with no plan row yet. */
  readonly outline: MergeableChapterOutline | null;
  readonly opensThreadIds: readonly string[];
  readonly continuesThreadIds: readonly string[];
  readonly closesThreadIds: readonly string[];
}

/** The merged `ChapterOutline` column values. */
export interface MergedChapterOutline {
  readonly workingTitle: string | null;
  readonly targetWordCount: number | null;
  readonly focalCharacterId: string | null;
  readonly placeId: string | null;
  readonly periodStartDay: number | null;
  readonly periodEndDay: number | null;
  readonly periodPrecision: ChapterPeriodPrecision | null;
  readonly periodLabel: string | null;
  readonly dramaticFunction: string | null;
  readonly immediateGoal: string | null;
  readonly obstacle: string | null;
  readonly decision: string | null;
  readonly revelation: string | null;
  readonly consequence: string | null;
  readonly detailedSummary: string | null;
}

/** What the write has to do, and nothing it has to decide. */
export interface ChapterMergePlan {
  readonly survivorId: string;
  readonly absorbedId: string;
  /** Null when neither chapter had a plan row: there is nothing to write. */
  readonly outline: MergedChapterOutline | null;
  /** The union, first chapter's order first, deduplicated. */
  readonly characterIds: readonly string[];
  readonly factIds: readonly string[];
  /** Threads whose `openingChapterId` must move before the absorbed row goes. */
  readonly threadOpeningsToRepoint: readonly string[];
  /** Threads whose `closingChapterId` must move — a `SET NULL` otherwise forgets it. */
  readonly threadClosingsToRepoint: readonly string[];
  /** Threads needing a continuation row created on the survivor. */
  readonly continuationsToMove: readonly string[];
  /** Threads whose continuation row on the survivor is now redundant. */
  readonly continuationsToDrop: readonly string[];
}

/** What the merge found, in kinds, ids and counts — safe to log whole (§9). */
export interface ChapterMergeReport {
  readonly acceptable: boolean;
  readonly survivorId: string;
  readonly absorbedId: string;
  readonly defects: readonly ChapterMergeDefect[];
  /** Empty when nothing would be lost — and then no acknowledgement is asked. */
  readonly losses: readonly ChapterMergeLoss[];
  readonly consolidated: {
    readonly characters: number;
    readonly facts: number;
    readonly threadOpenings: number;
    readonly threadClosings: number;
    readonly continuationsMoved: number;
    readonly continuationsDropped: number;
  };
}

/**
 * The outcome of planning a merge: a report either way, and the write's own
 * instructions when nothing refuses it — `verifyPartStructure`'s shape, and
 * one pass rather than a checker and a planner able to disagree.
 */
export type ChapterMergeOutcome =
  | { readonly acceptable: false; readonly report: ChapterMergeReport }
  | {
      readonly acceptable: true;
      readonly report: ChapterMergeReport;
      readonly plan: ChapterMergePlan;
    };

function joinText(first: string | null, second: string | null, connector: string): string | null {
  if (first === null) return second;
  if (second === null) return first;

  return `${first} ${connector} ${second}`;
}

function unionIds(...lists: readonly (readonly string[])[]): readonly string[] {
  const seen = new Set<string>();
  const union: string[] = [];

  for (const list of lists) {
    for (const id of list) {
      if (seen.has(id)) continue;

      seen.add(id);
      union.push(id);
    }
  }

  return union;
}

/** Later in `CHAPTER_PERIOD_PRECISIONS` is coarser — the enum's own order. */
function coarser(
  first: ChapterPeriodPrecision,
  second: ChapterPeriodPrecision,
): ChapterPeriodPrecision {
  return CHAPTER_PERIOD_PRECISIONS.indexOf(first) >= CHAPTER_PERIOD_PRECISIONS.indexOf(second)
    ? first
    : second;
}

/**
 * The union interval. Every stated day of either chapter is collected, so a
 * half-set period — legal under `chapter_outlines_period_precision_check`,
 * which pairs the precision with *at least one* bound — still widens the span
 * instead of being read as absent.
 */
function mergePeriod(
  first: MergeableChapterOutline | null,
  second: MergeableChapterOutline | null,
): Pick<
  MergedChapterOutline,
  "periodStartDay" | "periodEndDay" | "periodPrecision" | "periodLabel"
> {
  const days = [
    first?.periodStartDay,
    first?.periodEndDay,
    second?.periodStartDay,
    second?.periodEndDay,
  ].filter((day): day is number => day !== null && day !== undefined);

  const precisions = [first?.periodPrecision, second?.periodPrecision].filter(
    (precision): precision is ChapterPeriodPrecision =>
      precision !== null && precision !== undefined,
  );

  const precision = precisions.reduce<ChapterPeriodPrecision | null>(
    (kept, candidate) => (kept === null ? candidate : coarser(kept, candidate)),
    null,
  );

  return {
    periodStartDay: days.length === 0 ? null : Math.min(...days),
    periodEndDay: days.length === 0 ? null : Math.max(...days),
    periodPrecision: precision,
    periodLabel: joinText(
      first?.periodLabel ?? null,
      second?.periodLabel ?? null,
      CHAPTER_MERGE_TITLE_CONNECTOR,
    ),
  };
}

function findDefects(
  first: MergeableChapter,
  second: MergeableChapter,
  siblings: readonly OrderedChapter[],
): readonly ChapterMergeDefect[] {
  const defects: ChapterMergeDefect[] = [];

  if (first.id === second.id) {
    // Nothing below means anything about one chapter merged with itself.
    return [{ kind: "same-chapter" }];
  }

  if (first.partId !== second.partId) {
    // Deliberately refused rather than absorbed across the boundary: a part's
    // tipping point is dramatic structure, and moving a chapter between parts
    // is `moveChapter`'s decision, made in the open (CAL-105).
    defects.push({ kind: "different-parts" });
  } else {
    const ordered = siblings
      .filter((chapter) => chapter.partId === first.partId)
      .slice()
      .sort(
        (left, right) =>
          compareOrderKeys(left.orderKey, right.orderKey) || left.id.localeCompare(right.id),
      );
    const firstIndex = ordered.findIndex((chapter) => chapter.id === first.id);
    const secondIndex = ordered.findIndex((chapter) => chapter.id === second.id);

    // A reversed pair lands here too, and is refused rather than quietly
    // swapped: the caller named a survivor, and honouring the other one would
    // consolidate into a chapter nobody pointed at.
    if (firstIndex === -1 || secondIndex !== firstIndex + 1) {
      defects.push({ kind: "not-adjacent" });
    }
  }

  for (const chapter of [first, second]) {
    if (chapter.revisionCount > 0) {
      defects.push({
        kind: "chapter-written",
        chapterId: chapter.id,
        revisionCount: chapter.revisionCount,
      });
    }

    if (chapter.outline !== null && chapter.outline.lockedAt !== null) {
      defects.push({ kind: "plan-locked", chapterId: chapter.id });
    }
  }

  return defects;
}

function findLosses(
  first: MergeableChapterOutline | null,
  second: MergeableChapterOutline | null,
): readonly ChapterMergeLoss[] {
  const losses: ChapterMergeLoss[] = [];

  // Nothing can disagree while one side states nothing: a chapter with no plan
  // row contributes no place, no focal character and no precision.
  if (first === null || second === null) {
    return losses;
  }

  if (first.placeId !== null && second.placeId !== null && first.placeId !== second.placeId) {
    losses.push({ kind: "place", keptPlaceId: first.placeId, droppedPlaceId: second.placeId });
  }

  if (
    first.focalCharacterId !== null &&
    second.focalCharacterId !== null &&
    first.focalCharacterId !== second.focalCharacterId
  ) {
    losses.push({
      kind: "focal-character",
      keptCharacterId: first.focalCharacterId,
      demotedCharacterId: second.focalCharacterId,
    });
  }

  if (
    first.periodPrecision !== null &&
    second.periodPrecision !== null &&
    first.periodPrecision !== second.periodPrecision
  ) {
    const kept = coarser(first.periodPrecision, second.periodPrecision);

    losses.push({
      kind: "period-precision",
      keptPrecision: kept,
      droppedPrecision:
        kept === first.periodPrecision ? second.periodPrecision : first.periodPrecision,
    });
  }

  return losses;
}

/**
 * The merge of `second` into `first`, or the reasons it cannot happen.
 *
 * `siblings` is the part's chapters as they stand — read fresh inside the
 * writing transaction, never taken from a caller's screen, `planChapterMove`'s
 * own discipline: adjacency is decided here, from the order that exists.
 */
export function planChapterMerge(
  first: MergeableChapter,
  second: MergeableChapter,
  siblings: readonly OrderedChapter[],
): ChapterMergeOutcome {
  const defects = findDefects(first, second, siblings);
  const losses = defects.length === 0 ? findLosses(first.outline, second.outline) : [];

  const demoted = losses.find((loss) => loss.kind === "focal-character");
  const characterIds = unionIds(
    first.outline?.characterIds ?? [],
    second.outline?.characterIds ?? [],
    // The absorbed focal keeps a presence: a merge loses a role, never a person.
    demoted === undefined ? [] : [demoted.demotedCharacterId],
  );
  const factIds = unionIds(first.outline?.factIds ?? [], second.outline?.factIds ?? []);

  const endpoints = new Set([
    ...first.opensThreadIds,
    ...second.opensThreadIds,
    ...first.closesThreadIds,
    ...second.closesThreadIds,
  ]);
  const alreadyContinued = new Set(first.continuesThreadIds);
  // A thread the survivor opens or closes is not also carried forward by it —
  // CAL-102's disjointness, honoured at the row rather than only in an answer.
  const continuationsToMove = second.continuesThreadIds.filter(
    (threadId) => !alreadyContinued.has(threadId) && !endpoints.has(threadId),
  );
  const continuationsToDrop = first.continuesThreadIds.filter((threadId) =>
    endpoints.has(threadId),
  );

  const report: ChapterMergeReport = {
    acceptable: defects.length === 0,
    survivorId: first.id,
    absorbedId: second.id,
    defects,
    losses,
    consolidated: {
      characters: characterIds.length,
      facts: factIds.length,
      threadOpenings: second.opensThreadIds.length,
      threadClosings: second.closesThreadIds.length,
      continuationsMoved: continuationsToMove.length,
      continuationsDropped: continuationsToDrop.length,
    },
  };

  if (defects.length > 0) {
    return { acceptable: false, report };
  }

  const kept = first.outline;
  const absorbed = second.outline;
  const prose = (column: ChapterProseColumn): string | null =>
    joinText(kept?.[column] ?? null, absorbed?.[column] ?? null, CHAPTER_MERGE_CONNECTOR);

  const outline: MergedChapterOutline | null =
    kept === null && absorbed === null
      ? null
      : {
          workingTitle: joinText(
            kept?.workingTitle ?? null,
            absorbed?.workingTitle ?? null,
            CHAPTER_MERGE_TITLE_CONNECTOR,
          ),
          // Summed and never clamped: a part's word budget is the number
          // CAL-103 reads, and a merge must leave it exactly where it was.
          targetWordCount:
            (kept?.targetWordCount ?? null) === null && (absorbed?.targetWordCount ?? null) === null
              ? null
              : (kept?.targetWordCount ?? 0) + (absorbed?.targetWordCount ?? 0),
          focalCharacterId: kept?.focalCharacterId ?? absorbed?.focalCharacterId ?? null,
          placeId: kept?.placeId ?? absorbed?.placeId ?? null,
          ...mergePeriod(kept, absorbed),
          dramaticFunction: prose("dramaticFunction"),
          immediateGoal: prose("immediateGoal"),
          obstacle: prose("obstacle"),
          decision: prose("decision"),
          revelation: prose("revelation"),
          consequence: prose("consequence"),
          detailedSummary: prose("detailedSummary"),
        };

  return {
    acceptable: true,
    report,
    plan: {
      survivorId: first.id,
      absorbedId: second.id,
      outline,
      characterIds,
      factIds,
      threadOpeningsToRepoint: second.opensThreadIds,
      threadClosingsToRepoint: second.closesThreadIds,
      continuationsToMove,
      continuationsToDrop,
    },
  };
}

/** Shown when the submitted merge cannot even be read — never a field name (§7). */
export const MALFORMED_MERGE_MESSAGE =
  "Cette fusion n'a pas pu être interprétée. Rechargez le plan.";

/**
 * What a merge request carries. `acknowledgeLoss` is required rather than
 * optional — CAL-077's discipline, an absence written rather than elided — and
 * the repository refuses the write when it is false while the report names a
 * loss.
 */
export const chapterMergeRequestSchema = z.strictObject({
  survivorChapterId: z.string().trim().min(1),
  absorbedChapterId: z.string().trim().min(1),
  acknowledgeLoss: z.boolean(),
});

export type ChapterMergeRequest = z.infer<typeof chapterMergeRequestSchema>;

/** A server-action argument crossed a serialisation boundary, so it is parsed (§6). */
export function parseChapterMergeRequest(submitted: unknown): Result<ChapterMergeRequest> {
  const parsed = chapterMergeRequestSchema.safeParse(submitted);

  if (!parsed.success) {
    return fail(fromValidationIssues(parsed.error, { userMessage: MALFORMED_MERGE_MESSAGE }));
  }

  return succeed(parsed.data);
}
