/**
 * What `split-chapter-outline` is asked and what it is allowed to return
 * (CAL-106, §6).
 *
 * **Its own mission, not `build-chapter-outline` re-rendered.** That one plans
 * a whole part against a frame that does not exist yet; this one is handed one
 * chapter that already exists and asked where to cut it — under a constraint
 * no batch ask can state, that **everything the chapter carried comes out the
 * other side**. The answer's shape is the difference: two halves *and* an
 * exhaustive account of what went where.
 *
 * **The redistribution is declared, element by element, with its reason.** The
 * backlog asks for *une redistribution motivée des attributs*; a `placements`
 * entry per character, per fact, per thread action and per prose column, each
 * carrying a `placement` and a short `reason`, is that requirement as a shape.
 * Its **totality is the answer-level proof of non-loss**: nothing in a flat
 * pair of halves can tell a deliberate redistribution from half the chapter
 * quietly dropped, and a declaration that must cover every element can
 * (`factDecompositionSchema`'s device, CAL-094).
 *
 * **A declaration is checked only where it could flatter the answer.** A
 * placement claiming `first`, `second`, `both` or `divided` claims the source's
 * own wording was *kept*, and each of the four is verified against the halves
 * through `createVerbatimMatcher`; `rewritten` claims nothing and is taken at
 * its word. Claiming a copy that is not there is the lie that hides a rewrite
 * behind a reassuring word; claiming a rewrite that turned out to be a copy
 * costs nobody anything (the `dimensionTreatments` and `OutOfNormCapability`
 * device, pointed at the half of the declaration that can lie).
 *
 * **A proposal resolves into an arbitration.** `resolveChapterSplitProposal`
 * hands back exactly the `ChapterSplitArbitration` a person would have filled
 * in by hand, so the screen has one thing to arbitrate and the repository one
 * thing to write — *one schema, two write paths*, with a model on the second.
 * Verification runs the conservation arithmetic through `checkChapterSplit`
 * itself rather than restating it, so a verified proposal is by construction
 * an arbitration the write will accept.
 *
 * **No score, structurally** (cahier des charges 1195–1199), as every mission
 * before it: every numeric path in the answer is a position, a day or a
 * length, and `split-mission.test.ts` pins the list.
 */

import { FREEDOM_LEVELS } from "@calepin/shared/freedom-level";
import { createVerbatimMatcher, sameWords } from "@calepin/shared/text";
import { z } from "zod";

import {
  CHAPTER_PROSE_COLUMNS,
  CHAPTER_THREAD_ACTION_LISTS,
  type ChapterCutSource,
  type ChapterProseColumn,
  type ChapterThreadActionListName,
} from "./cut";
import { CHAPTER_REVELATION_CONNECTOR } from "./resolve";
import {
  CHAPTER_INPUT_LIST_COUNTS,
  CHAPTER_INPUT_PROSE_CHAR_CEILING,
  CHAPTER_LABEL_CHAR_CEILING,
  CHAPTER_LIST_COUNTS,
  CHAPTER_PERIOD_PRECISIONS,
  chapterCanonFactSchema,
  type PlannedChapter,
  plannedChapterSchema,
  precedingChapterDigestSchema,
} from "./schema";
import {
  CHAPTER_SPLIT_HALVES,
  CHAPTER_SPLIT_PROSE_CHAR_CEILING,
  type ChapterSplitArbitration,
  type ChapterSplitHalf,
  type ChapterSplitHalfName,
  type ChapterSplitReport,
  checkChapterSplit,
} from "./split";

const identifier = z.string().trim().min(1);

/** How long one placement's reason and one cut-point sentence may be. */
export const CHAPTER_SPLIT_WORD_TARGETS = {
  /** What happens at the cut — the concrete moment the chapter breaks at. */
  cutMoment: 25,
  /** Why the cut lands there rather than anywhere else. */
  cutRationale: 30,
  /** Why one element goes where it goes. */
  placementReason: 20,
} as const;

const CHARS_PER_WORD = 7;
const OVERRUN_FACTOR = 2;

export const CHAPTER_SPLIT_CHAR_CEILINGS = {
  cutMoment: Math.ceil(CHAPTER_SPLIT_WORD_TARGETS.cutMoment * CHARS_PER_WORD * OVERRUN_FACTOR),
  cutRationale: Math.ceil(
    CHAPTER_SPLIT_WORD_TARGETS.cutRationale * CHARS_PER_WORD * OVERRUN_FACTOR,
  ),
  placementReason: Math.ceil(
    CHAPTER_SPLIT_WORD_TARGETS.placementReason * CHARS_PER_WORD * OVERRUN_FACTOR,
  ),
} as const;

/**
 * The most placements one answer carries: the source's whole cast, its facts,
 * its thread actions across the three lists, and the seven prose columns.
 */
export const CHAPTER_SPLIT_PLACEMENT_MAX =
  CHAPTER_LIST_COUNTS.presentCharacters.max +
  CHAPTER_LIST_COUNTS.factsPerChapter.max +
  CHAPTER_LIST_COUNTS.threadActionsPerList.max * CHAPTER_THREAD_ACTION_LISTS.length +
  CHAPTER_PROSE_COLUMNS.length;

/** What a placement is about. */
export const CHAPTER_SPLIT_ELEMENT_KINDS = ["character", "fact", "thread-action", "prose"] as const;

export type ChapterSplitElementKind = (typeof CHAPTER_SPLIT_ELEMENT_KINDS)[number];

/**
 * Where an element goes.
 *
 * Three of the five apply to anything: `first`, `second`, `both`. Two are prose
 * alone, because a reference is moved or copied and can be neither reworded nor
 * cut in half, while a sentence can be either — and naming both cases is what
 * keeps the declaration total. `divided` is the ordinary outcome of splitting a
 * chapter: each half keeps a *different* passage of what the column said, which
 * is neither one half taking it nor both repeating it.
 */
export const CHAPTER_SPLIT_PLACEMENTS = [
  "first",
  "second",
  "both",
  "divided",
  "rewritten",
] as const;

/** The two a reference cannot be — checked by the placement schema. */
export const CHAPTER_SPLIT_PROSE_ONLY_PLACEMENTS = ["divided", "rewritten"] as const;

export type ChapterSplitPlacementName = (typeof CHAPTER_SPLIT_PLACEMENTS)[number];

/** What one placement names, in the ask's own vocabulary — never an id (§6). */
export interface ChapterSplitElement {
  readonly kind: ChapterSplitElementKind;
  /** Position in the ask's cast, fact or thread list. Null for prose. */
  readonly index: number | null;
  /** Which action list. Null unless the kind is a thread action. */
  readonly list: ChapterThreadActionListName | null;
  /** Which column. Null unless the kind is prose. */
  readonly column: ChapterProseColumn | null;
}

export const chapterSplitPlacementSchema = z
  .strictObject({
    kind: z.enum(CHAPTER_SPLIT_ELEMENT_KINDS),
    /** Required-but-nullable throughout: an absence said, never a field skipped. */
    index: z.int().nullable(),
    list: z.enum(CHAPTER_THREAD_ACTION_LISTS).nullable(),
    column: z.enum(CHAPTER_PROSE_COLUMNS).nullable(),
    placement: z.enum(CHAPTER_SPLIT_PLACEMENTS),
    reason: z.string().trim().min(1).max(CHAPTER_SPLIT_CHAR_CEILINGS.placementReason),
  })
  .check((ctx) => {
    const { kind, index, list, column, placement } = ctx.value;
    const push = (message: string, path: string): void => {
      ctx.issues.push({ code: "custom", message, path: [path], input: ctx.value });
    };

    if (kind === "prose") {
      if (column === null) push("a prose placement names no column", "column");
      if (index !== null) push("a prose placement names a position", "index");
      if (list !== null) push("a prose placement names an action list", "list");

      return;
    }

    if (column !== null) push("a reference placement names a column", "column");
    if (index === null || index < 0) push("a reference placement names no position", "index");

    // A character, a fact and a thread action are moved or copied — never
    // reworded, and never cut in half.
    if ((CHAPTER_SPLIT_PROSE_ONLY_PLACEMENTS as readonly string[]).includes(placement)) {
      push("a reference placement claims a rewrite or a division", "placement");
    }

    if (kind === "thread-action") {
      if (list === null) push("a thread placement names no action list", "list");

      // An opening and a closing are single columns on `Thread`: no answer can
      // put one on both halves, so the shape does not let it be said.
      if (list !== "continues" && placement === "both") {
        push("a thread endpoint cannot be held by both halves", "placement");
      }

      return;
    }

    if (list !== null) push("a reference placement names an action list", "list");
  });

export type ChapterSplitPlacement = z.infer<typeof chapterSplitPlacementSchema>;

/** One character of the ask's cast, with the id business code resolved (§6). */
export const chapterSplitCastMemberSchema = z.strictObject({
  characterId: identifier,
  name: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING),
  plannedArc: z.string().trim().min(1).max(CHAPTER_INPUT_PROSE_CHAR_CEILING).nullable(),
});

export type ChapterSplitCastMember = z.infer<typeof chapterSplitCastMemberSchema>;

/** One place the chapter may be set in. */
export const chapterSplitPlaceSchema = z.strictObject({
  placeId: identifier,
  name: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING),
  description: z.string().trim().min(1).max(CHAPTER_INPUT_PROSE_CHAR_CEILING).nullable(),
});

export type ChapterSplitPlace = z.infer<typeof chapterSplitPlaceSchema>;

/**
 * One thread the source chapter acts on — the whole vocabulary, because the
 * redistribution's universe is exactly what the chapter already holds. A
 * thread the chapter does not touch has nothing to be redistributed.
 */
export const chapterSplitThreadSchema = z.strictObject({
  threadId: identifier,
  label: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING),
  narrativePromise: z.string().trim().min(1).max(CHAPTER_INPUT_PROSE_CHAR_CEILING),
});

export type ChapterSplitThread = z.infer<typeof chapterSplitThreadSchema>;

/**
 * The chapter as it stands, in the ask's own vocabulary. Nullable throughout,
 * because it is a row: a hand-added plan starts empty. The prose takes the
 * arbitration's generous ceiling rather than the mission's, since the chapter
 * being split may itself hold text a previous merge joined.
 */
export const chapterSplitSourceSchema = z.strictObject({
  workingTitle: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING).nullable(),
  targetWordCount: z.int().positive().nullable(),
  focalCharacterName: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING).nullable(),
  presentCharacterNames: z
    .array(z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING))
    .max(CHAPTER_LIST_COUNTS.presentCharacters.max),
  placeName: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING).nullable(),
  periodStartDay: z.int().nullable(),
  periodEndDay: z.int().nullable(),
  periodPrecision: z.enum(CHAPTER_PERIOD_PRECISIONS).nullable(),
  periodLabel: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING).nullable(),
  dramaticFunction: z.string().trim().min(1).max(CHAPTER_SPLIT_PROSE_CHAR_CEILING).nullable(),
  immediateGoal: z.string().trim().min(1).max(CHAPTER_SPLIT_PROSE_CHAR_CEILING).nullable(),
  obstacle: z.string().trim().min(1).max(CHAPTER_SPLIT_PROSE_CHAR_CEILING).nullable(),
  decision: z.string().trim().min(1).max(CHAPTER_SPLIT_PROSE_CHAR_CEILING).nullable(),
  revelation: z.string().trim().min(1).max(CHAPTER_SPLIT_PROSE_CHAR_CEILING).nullable(),
  consequence: z.string().trim().min(1).max(CHAPTER_SPLIT_PROSE_CHAR_CEILING).nullable(),
  detailedSummary: z.string().trim().min(1).max(CHAPTER_SPLIT_PROSE_CHAR_CEILING).nullable(),
  factIndexes: z.array(z.int()).max(CHAPTER_LIST_COUNTS.factsPerChapter.max),
  opensThreadIndexes: z.array(z.int()).max(CHAPTER_LIST_COUNTS.threadActionsPerList.max),
  continuesThreadIndexes: z.array(z.int()).max(CHAPTER_LIST_COUNTS.threadActionsPerList.max),
  closesThreadIndexes: z.array(z.int()).max(CHAPTER_LIST_COUNTS.threadActionsPerList.max),
});

export type ChapterSplitSource = z.infer<typeof chapterSplitSourceSchema>;

/**
 * What one scission was asked — the payload `Generation.input` carries and
 * `generationIdempotencyKey` digests, so asking again after the chapter has
 * moved is a different ask while a redelivered job is the same one (CAL-058).
 */
export const chapterSplitInputSchema = z
  .strictObject({
    /** The version the whole ask is built against — what makes the digest mean something. */
    bibleVersionNumber: z.int().positive(),
    /** The chapter being split. Resolved by business code, never by the model (§6). */
    chapterId: identifier,
    partTitle: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING),
    partDramaticObjective: z
      .string()
      .trim()
      .min(1)
      .max(CHAPTER_INPUT_PROSE_CHAR_CEILING)
      .nullable(),
    partTargetWordCount: z.int().positive(),
    freedomLevel: z.enum(FREEDOM_LEVELS),
    source: chapterSplitSourceSchema,
    /** The chapter before it, or null when it opens the part. */
    precedingChapter: precedingChapterDigestSchema.nullable(),
    /** The chapter after it, or null when it closes the part. */
    followingChapter: precedingChapterDigestSchema.nullable(),
    cast: z
      .array(chapterSplitCastMemberSchema)
      .min(CHAPTER_INPUT_LIST_COUNTS.cast.min)
      .max(CHAPTER_INPUT_LIST_COUNTS.cast.max),
    places: z.array(chapterSplitPlaceSchema).max(CHAPTER_INPUT_LIST_COUNTS.places.max),
    canonFacts: z.array(chapterCanonFactSchema).max(CHAPTER_INPUT_LIST_COUNTS.canonFacts.max),
    threads: z.array(chapterSplitThreadSchema).max(CHAPTER_INPUT_LIST_COUNTS.threads.max),
  })
  .check((ctx) => {
    const push = (message: string, path: (string | number)[]): void => {
      ctx.issues.push({ code: "custom", message, path, input: ctx.value });
    };

    for (const [field, names] of [
      ["cast", ctx.value.cast.map((member) => member.name)],
      ["places", ctx.value.places.map((place) => place.name)],
      ["threads", ctx.value.threads.map((thread) => thread.label)],
    ] as const) {
      if (new Set(names).size !== names.length) push("the ask offers one name twice", [field]);
    }

    const factIds = ctx.value.canonFacts.map((fact) => fact.factId);

    if (new Set(factIds).size !== factIds.length)
      push("the ask offers one fact twice", ["canonFacts"]);

    // An ask whose own source names something it does not offer is broken at
    // composition, before a provider is paid (§6.5's spirit).
    for (const index of ctx.value.source.factIndexes) {
      if (index < 0 || index >= ctx.value.canonFacts.length) {
        push("the source names a fact the ask does not offer", ["source", "factIndexes"]);
      }
    }

    for (const field of [
      "opensThreadIndexes",
      "continuesThreadIndexes",
      "closesThreadIndexes",
    ] as const) {
      for (const index of ctx.value.source[field]) {
        if (index < 0 || index >= ctx.value.threads.length) {
          push("the source names a thread the ask does not offer", ["source", field]);
        }
      }
    }
  });

export type ChapterSplitInput = z.infer<typeof chapterSplitInputSchema>;

/**
 * Where the chapter breaks, and why there. The `StyleConstraint` pair a third
 * time: a cut nobody can argue for cannot fill `rationale`.
 */
export const chapterSplitCutPointSchema = z.strictObject({
  /** The concrete moment the first half ends on. */
  moment: z.string().trim().min(1).max(CHAPTER_SPLIT_CHAR_CEILINGS.cutMoment),
  /** Why that moment and not another. */
  rationale: z.string().trim().min(1).max(CHAPTER_SPLIT_CHAR_CEILINGS.cutRationale),
});

export type ChapterSplitCutPoint = z.infer<typeof chapterSplitCutPointSchema>;

/**
 * The answer to `split-chapter-outline`: two chapter plans and an exhaustive
 * account of where each of the source's elements went.
 *
 * The halves are `plannedChapterSchema` values — a produced half is a peer of
 * a planned chapter, `directionReplacementSchema`'s reuse of
 * `directionProposalSchema` — which is also why a chapter too short to yield
 * two halves inside `CHAPTER_TARGET_WORD_COUNT_RANGE` is refused here and
 * still splittable by hand: the mission's floors bound what a model is asked
 * for, never what an author may decide.
 */
export const chapterSplitProposalSchema = z.strictObject({
  cutPoint: chapterSplitCutPointSchema,
  first: plannedChapterSchema,
  second: plannedChapterSchema,
  placements: z.array(chapterSplitPlacementSchema).max(CHAPTER_SPLIT_PLACEMENT_MAX),
});

export type ChapterSplitProposal = z.infer<typeof chapterSplitProposalSchema>;

/** The defect kinds this verification adds on top of `checkChapterSplit`'s. */
export const CHAPTER_SPLIT_PROPOSAL_DEFECT_KINDS = [
  "unknown-character-name",
  "unknown-place-name",
  "missing-placement",
  "duplicate-placement",
  "unknown-placement-target",
  "placement-contradicted",
] as const;

export type ChapterSplitProposalDefectKind = (typeof CHAPTER_SPLIT_PROPOSAL_DEFECT_KINDS)[number];

export type ChapterSplitProposalDefect =
  | {
      readonly kind: "unknown-character-name";
      readonly half: ChapterSplitHalfName;
      readonly index: number;
    }
  | { readonly kind: "unknown-place-name"; readonly half: ChapterSplitHalfName }
  | { readonly kind: "missing-placement"; readonly element: ChapterSplitElement }
  | { readonly kind: "duplicate-placement"; readonly placementIndex: number }
  | { readonly kind: "unknown-placement-target"; readonly placementIndex: number }
  | { readonly kind: "placement-contradicted"; readonly placementIndex: number };

export interface ChapterSplitProposalReport {
  readonly acceptable: boolean;
  readonly defects: readonly ChapterSplitProposalDefect[];
  /**
   * The conservation arithmetic, run over the arbitration the proposal
   * resolves to — null when a name could not be resolved and there was
   * nothing to run it on.
   */
  readonly split: ChapterSplitReport | null;
}

/**
 * The brand on `globalThis`'s shared symbol registry via `Symbol.for`, for the
 * reason every Calepin brand is: the packages are compiled from source into
 * more than one chunk graph (§12).
 */
export const VERIFIED_CHAPTER_SPLIT_PROPOSAL_BRAND: unique symbol = Symbol.for(
  "calepin.VerifiedChapterSplitProposal",
);

export type VerifiedChapterSplitProposal = ChapterSplitProposal & {
  readonly [VERIFIED_CHAPTER_SPLIT_PROPOSAL_BRAND]: true;
};

export function isVerifiedChapterSplitProposal(
  value: unknown,
): value is VerifiedChapterSplitProposal {
  return (
    typeof value === "object" && value !== null && VERIFIED_CHAPTER_SPLIT_PROPOSAL_BRAND in value
  );
}

export type ChapterSplitProposalVerification =
  | { readonly outcome: "refused"; readonly report: ChapterSplitProposalReport }
  | {
      readonly outcome: "verified";
      readonly proposal: VerifiedChapterSplitProposal;
      readonly report: ChapterSplitProposalReport;
    };

/**
 * The chapter the ask describes, in ids — what `checkChapterSplit` reads.
 *
 * Derived from the ask rather than taken beside it, so the refusal and the ask
 * cannot disagree about what was there to redistribute. The two fields no ask
 * carries are the two that would refuse it outright: a chapter with revisions
 * or a locked plan never reaches a generation (the repository refuses first),
 * so they are zero and null here by construction.
 */
export function resolveChapterSplitSource(input: ChapterSplitInput): ChapterCutSource {
  const { source } = input;
  const characterId = (name: string): string | null =>
    input.cast.find((member) => sameWords(member.name, name))?.characterId ?? null;
  const threadIds = (indexes: readonly number[]): readonly string[] =>
    indexes.flatMap((index) => {
      const thread = input.threads[index];

      return thread === undefined ? [] : [thread.threadId];
    });

  return {
    id: input.chapterId,
    partId: "",
    orderKey: "",
    revisionCount: 0,
    outline: {
      workingTitle: source.workingTitle,
      targetWordCount: source.targetWordCount,
      focalCharacterId:
        source.focalCharacterName === null ? null : characterId(source.focalCharacterName),
      placeId:
        source.placeName === null
          ? null
          : (input.places.find((place) => sameWords(place.name, source.placeName ?? ""))?.placeId ??
            null),
      periodStartDay: source.periodStartDay,
      periodEndDay: source.periodEndDay,
      periodPrecision: source.periodPrecision,
      periodLabel: source.periodLabel,
      dramaticFunction: source.dramaticFunction,
      immediateGoal: source.immediateGoal,
      obstacle: source.obstacle,
      decision: source.decision,
      revelation: source.revelation,
      consequence: source.consequence,
      detailedSummary: source.detailedSummary,
      lockedAt: null,
      characterIds: source.presentCharacterNames.flatMap((name) => {
        const id = characterId(name);

        return id === null ? [] : [id];
      }),
      factIds: source.factIndexes.flatMap((index) => {
        const fact = input.canonFacts[index];

        return fact === undefined ? [] : [fact.factId];
      }),
    },
    opensThreadIds: threadIds(source.opensThreadIndexes),
    continuesThreadIds: threadIds(source.continuesThreadIndexes),
    closesThreadIds: threadIds(source.closesThreadIndexes),
  };
}

function resolveHalf(half: PlannedChapter, input: ChapterSplitInput): ChapterSplitHalf | null {
  const characterIds: string[] = [];

  for (const name of half.presentCharacterNames) {
    const member = input.cast.find((candidate) => sameWords(candidate.name, name));

    if (member === undefined) return null;

    characterIds.push(member.characterId);
  }

  const place =
    half.placeName === null
      ? null
      : (input.places.find((candidate) => sameWords(candidate.name, half.placeName ?? "")) ?? null);

  if (half.placeName !== null && place === null) return null;

  const focal = input.cast.find((candidate) => sameWords(candidate.name, half.focalCharacterName));
  const threadIds = (indexes: readonly number[]): string[] =>
    indexes.flatMap((index) => {
      const thread = input.threads[index];

      return thread === undefined ? [] : [thread.threadId];
    });

  return {
    workingTitle: half.workingTitle,
    targetWordCount: half.targetWordCount,
    focalCharacterId: focal?.characterId ?? null,
    placeId: place?.placeId ?? null,
    periodStartDay: half.period.startDay,
    periodEndDay: half.period.endDay,
    periodPrecision: half.period.precision,
    periodLabel: half.period.label,
    dramaticFunction: half.dramaticFunction,
    immediateGoal: half.immediateGoal,
    obstacle: half.obstacle,
    decision: half.decision,
    revelation:
      half.revelation === null
        ? null
        : `${half.revelation.content} ${CHAPTER_REVELATION_CONNECTOR} ${half.revelation.preparation}`,
    consequence: half.consequence,
    detailedSummary: half.detailedSummary,
    characterIds,
    factIds: half.factIndexes.flatMap((index) => {
      const fact = input.canonFacts[index];

      return fact === undefined ? [] : [fact.factId];
    }),
    opensThreadIds: threadIds(half.opensThreadIndexes),
    continuesThreadIds: threadIds(half.continuesThreadIndexes),
    closesThreadIds: threadIds(half.closesThreadIndexes),
  };
}

/** Every element of the source a placement has to account for. */
function elementsOf(input: ChapterSplitInput): readonly ChapterSplitElement[] {
  const { source } = input;
  const elements: ChapterSplitElement[] = [];

  for (const name of source.presentCharacterNames) {
    const index = input.cast.findIndex((member) => sameWords(member.name, name));

    elements.push({ kind: "character", index, list: null, column: null });
  }

  for (const index of source.factIndexes) {
    elements.push({ kind: "fact", index, list: null, column: null });
  }

  for (const list of CHAPTER_THREAD_ACTION_LISTS) {
    const indexes =
      list === "opens"
        ? source.opensThreadIndexes
        : list === "continues"
          ? source.continuesThreadIndexes
          : source.closesThreadIndexes;

    for (const index of indexes) {
      elements.push({ kind: "thread-action", index, list, column: null });
    }
  }

  for (const column of CHAPTER_PROSE_COLUMNS) {
    if (source[column] === null) continue;

    elements.push({ kind: "prose", index: null, list: null, column });
  }

  return elements;
}

function sameElement(left: ChapterSplitElement, right: ChapterSplitElement): boolean {
  return (
    left.kind === right.kind &&
    left.index === right.index &&
    left.list === right.list &&
    left.column === right.column
  );
}

function holdsElement(
  half: PlannedChapter,
  element: ChapterSplitElement,
  input: ChapterSplitInput,
): boolean {
  if (element.kind === "character") {
    const member = element.index === null ? undefined : input.cast[element.index];

    return (
      member !== undefined &&
      half.presentCharacterNames.some((name) => sameWords(name, member.name))
    );
  }

  if (element.kind === "fact") {
    return element.index !== null && half.factIndexes.includes(element.index);
  }

  if (element.kind === "thread-action") {
    if (element.index === null) return false;

    const indexes =
      element.list === "opens"
        ? half.opensThreadIndexes
        : element.list === "continues"
          ? half.continuesThreadIndexes
          : half.closesThreadIndexes;

    return indexes.includes(element.index);
  }

  return false;
}

/** What a half says in one prose column — the revelation flattened to its content. */
function proseOf(half: PlannedChapter, column: ChapterProseColumn): string | null {
  return column === "revelation"
    ? half.revelation === null
      ? null
      : half.revelation.content
    : half[column];
}

function keepsProse(
  half: PlannedChapter,
  column: ChapterProseColumn,
  input: ChapterSplitInput,
): boolean {
  const original = input.source[column];

  if (original === null) return false;

  const written = proseOf(half, column);

  if (written === null) return false;

  // Half inside source, `checkChapterSplit`'s own direction: a half holds a
  // piece of the chapter it came out of.
  return createVerbatimMatcher(original)(written);
}

function checkPlacements(
  proposal: ChapterSplitProposal,
  input: ChapterSplitInput,
): readonly ChapterSplitProposalDefect[] {
  const defects: ChapterSplitProposalDefect[] = [];
  const expected = elementsOf(input);
  const halves = { first: proposal.first, second: proposal.second } as const;

  proposal.placements.forEach((placement, placementIndex) => {
    const element: ChapterSplitElement = {
      kind: placement.kind,
      index: placement.index,
      list: placement.list,
      column: placement.column,
    };

    if (!expected.some((candidate) => sameElement(candidate, element))) {
      defects.push({ kind: "unknown-placement-target", placementIndex });
      return;
    }

    const firstMatch = proposal.placements.findIndex((candidate) =>
      sameElement(
        {
          kind: candidate.kind,
          index: candidate.index,
          list: candidate.list,
          column: candidate.column,
        },
        element,
      ),
    );

    if (firstMatch < placementIndex) {
      defects.push({ kind: "duplicate-placement", placementIndex });
      return;
    }

    // A claim is checked only where it could flatter the answer: `rewritten`
    // claims nothing, so nothing is held against it — see the header.
    if (placement.placement === "rewritten") return;

    const column = placement.kind === "prose" ? placement.column : null;
    const holds =
      column === null
        ? (half: ChapterSplitHalfName): boolean => holdsElement(halves[half], element, input)
        : (half: ChapterSplitHalfName): boolean => keepsProse(halves[half], column, input);

    const inFirst = holds("first");
    const inSecond = holds("second");
    // `both` and `divided` differ only in whether the two halves kept the same
    // passage or two of them — the distinction a split is usually about.
    const sameText =
      column === null ||
      sameWords(proseOf(halves.first, column) ?? "", proseOf(halves.second, column) ?? "");
    const declared =
      placement.placement === "first"
        ? inFirst && !inSecond
        : placement.placement === "second"
          ? inSecond && !inFirst
          : placement.placement === "divided"
            ? inFirst && inSecond && !sameText
            : inFirst && inSecond && sameText;

    if (!declared) defects.push({ kind: "placement-contradicted", placementIndex });
  });

  for (const element of expected) {
    if (
      !proposal.placements.some((placement) =>
        sameElement(
          {
            kind: placement.kind,
            index: placement.index,
            list: placement.list,
            column: placement.column,
          },
          element,
        ),
      )
    ) {
      defects.push({ kind: "missing-placement", element });
    }
  }

  return defects;
}

/**
 * Runs the placement account and then the conservation arithmetic itself,
 * through `checkChapterSplit` over the arbitration the answer resolves to —
 * one rule, one implementation, so a verified proposal is by construction an
 * arbitration the write accepts.
 */
export function verifyChapterSplitProposal(
  answer: ChapterSplitProposal,
  input: ChapterSplitInput,
): ChapterSplitProposalVerification {
  const defects: ChapterSplitProposalDefect[] = [];
  const resolved: Partial<Record<ChapterSplitHalfName, ChapterSplitHalf>> = {};

  for (const half of CHAPTER_SPLIT_HALVES) {
    const value = resolveHalf(answer[half], input);

    if (value === null) {
      const unknownName = answer[half].presentCharacterNames.findIndex(
        (name) => !input.cast.some((member) => sameWords(member.name, name)),
      );

      defects.push(
        unknownName === -1
          ? { kind: "unknown-place-name", half }
          : { kind: "unknown-character-name", half, index: unknownName },
      );
      continue;
    }

    resolved[half] = value;
  }

  defects.push(...checkPlacements(answer, input));

  const first = resolved.first;
  const second = resolved.second;

  if (first === undefined || second === undefined) {
    return { outcome: "refused", report: { acceptable: false, defects, split: null } };
  }

  const split = checkChapterSplit(resolveChapterSplitSource(input), {
    chapterId: input.chapterId,
    first,
    second,
  });
  const report: ChapterSplitProposalReport = {
    acceptable: defects.length === 0 && split.acceptable,
    defects,
    split,
  };

  if (!report.acceptable) return { outcome: "refused", report };

  return { outcome: "verified", proposal: mint(answer), report };
}

/**
 * Re-parsed before the brand goes on, `verifyChapterOutlineBatch`'s discipline:
 * the schema is the only authority on whether what is being certified is still
 * a split proposal.
 */
function mint(proposal: ChapterSplitProposal): VerifiedChapterSplitProposal {
  const parsed = chapterSplitProposalSchema.safeParse(proposal);

  if (!parsed.success) {
    throw new Error("a verified chapter split proposal no longer parses", { cause: parsed.error });
  }

  return { ...parsed.data, [VERIFIED_CHAPTER_SPLIT_PROPOSAL_BRAND]: true };
}

/**
 * The proposal as the arbitration the screen shows and the repository writes.
 *
 * From a **verified** proposal only: the brand promises the names resolved and
 * the conservation held, so a reference that does not resolve here is a
 * programming error rather than a condition to handle (§7).
 */
export function resolveChapterSplitProposal(
  proposal: VerifiedChapterSplitProposal,
  input: ChapterSplitInput,
): ChapterSplitArbitration {
  const first = resolveHalf(proposal.first, input);
  const second = resolveHalf(proposal.second, input);

  if (first === null || second === null) {
    throw new Error("a verified chapter split proposal names something the ask does not offer");
  }

  return { chapterId: input.chapterId, first, second };
}
