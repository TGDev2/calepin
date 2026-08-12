/**
 * What `build-chapter-outline` is asked and what it is allowed to return
 * (CAL-102, §6).
 *
 * **One generation answers one part, as a batch.** The backlog's own delivery
 * constraint — *génère par lots cohérents à l'échelle de la partie* — is the
 * contract's shape: the answer is the ordered chapter plans of ONE part, and
 * the four bars the command sets (a dramatic function and a consequence on
 * every chapter, no stake repeated, every revelation prepared, no thread left
 * open without a planned closing chapter) are properties of a *sequence* that
 * no per-chapter contract could state. The project-wide `outline` write
 * target serializes batches, and that is load-bearing: batch N's ask carries
 * digests of batches 1..N−1.
 *
 * **The sixteen attributes, minus the two that are not the answer's.** The
 * numéro is derived — order *is* the answer, and the fractional order keys
 * are minted at persistence (CAL-019); the threads are actions into the
 * ask's own vocabulary, not prose. `dramaticFunction` and `consequence` are
 * **required** here where the `ChapterOutline` columns are nullable — the
 * `Part` precedent: the mission owes every field, a hand-added row starts
 * empty, and CAL-110's audit is what reports the gap.
 *
 * **Every revelation names what plants it.** A revelation is a pair — the
 * content and the preparation — plus exactly one preparing reference: an
 * earlier chapter of this batch, or one of the ask's preceding chapters
 * (CAL-084's tied-branches device). *Chaque révélation préparée* is thereby
 * structural and arithmetic; the reference is check-only, and `./resolve`
 * stores no position, because a stored position is rewritten by every move
 * (the `orderKey` doctrine).
 *
 * **Thread actions come in three lists.** opens / continues / closes, each a
 * list of positions in the ask's thread vocabulary — the row's `ThreadStatus`
 * is written from which list an action came out of, never from a declaration
 * (CAL-092/093/094's device). The three lists are disjoint within a chapter,
 * so a thread opened and closed in the same chapter is unrepresentable.
 *
 * **The ask carries each thread's assignment plan.** `assignedPartIndexes` is
 * the part structure's own declaration of which parts a thread concerns; the
 * part's duties are derived from it (assigned = `partIndex` listed, to close
 * = last listed), never stored beside it — a stored copy is a second answer
 * able to disagree. It is what lets `./check` hold *aucun fil ouvert sans
 * chapitre de fermeture prévu* at every batch rather than only at the last:
 * a thread whose last concerned part leaves it open would be unclosable by
 * any later batch, since acting on an unassigned thread is a defect.
 *
 * **The count adapts to the part's own target, in two layers.** The array
 * bounds here are the static envelope (`PART_CHAPTER_COUNT_RANGE`); the range
 * the ask actually allows is derived from the ask's own `partTargetWordCount`
 * by `chapterCalibrationForPartWordCount` and enforced by `./check` — one
 * function serving the prompt's variables and the gate (CAL-101's
 * discipline).
 *
 * **No score, structurally** (cahier des charges 1195–1199), as every mission
 * before it: every numeric path in the answer is a position, a day or a
 * length, and `schema.test.ts` pins the list.
 */

import { FREEDOM_LEVELS } from "@calepin/shared/freedom-level";
import { z } from "zod";

import { partCastMemberSchema } from "../parts/schema";
import {
  CHAPTER_TARGET_WORD_COUNT_RANGE,
  PART_CHAPTER_COUNT_RANGE,
  PART_COUNT_RANGE,
} from "../target-length/calibrate";

const CHARS_PER_WORD = 7;
const OVERRUN_FACTOR = 2;

/** Package-internal, never on `index.ts` — the rule stated once, as elsewhere. */
function ceilingFor(wordTarget: number): number {
  return Math.ceil(wordTarget * CHARS_PER_WORD * OVERRUN_FACTOR);
}

/**
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern. The dramatic
 * quartet stays at the sentence scale a plan-level statement should hold;
 * the detailed summary is `SUMMARY_WORD_TARGETS`' detailed figure and the
 * preceding digest its brief one, both restated because a domain may not
 * import a domain (§3.2).
 */
export const CHAPTER_WORD_TARGETS = {
  /** What the chapter does to the novel — the MVP bar's first half. */
  dramaticFunction: 25,
  /** What the focal character is after, in this chapter — the chapter's stake. */
  immediateGoal: 25,
  /** What stands in the way. */
  obstacle: 25,
  /** What is decided under that obstacle. */
  decision: 25,
  /** What the reader learns — the revelation's content. */
  revelationContent: 30,
  /** What plants the revelation, in the preparing chapter. */
  revelationPreparation: 30,
  /** What is different after the chapter — the MVP bar's second half. */
  consequence: 30,
  /** The detailed summary — the résumé détaillé of spec §5.7. */
  detailedSummary: 200,
  /** One preceding chapter's digest in the ask — the brief-summary figure. */
  precedingSummary: 50,
} as const;

/** The character ceilings the schemas below enforce. */
export const CHAPTER_CHAR_CEILINGS = {
  dramaticFunction: ceilingFor(CHAPTER_WORD_TARGETS.dramaticFunction),
  immediateGoal: ceilingFor(CHAPTER_WORD_TARGETS.immediateGoal),
  obstacle: ceilingFor(CHAPTER_WORD_TARGETS.obstacle),
  decision: ceilingFor(CHAPTER_WORD_TARGETS.decision),
  revelationContent: ceilingFor(CHAPTER_WORD_TARGETS.revelationContent),
  revelationPreparation: ceilingFor(CHAPTER_WORD_TARGETS.revelationPreparation),
  consequence: ceilingFor(CHAPTER_WORD_TARGETS.consequence),
  detailedSummary: ceilingFor(CHAPTER_WORD_TARGETS.detailedSummary),
  precedingSummary: ceilingFor(CHAPTER_WORD_TARGETS.precedingSummary),
} as const;

/** A title, a name, a thread label and a period label are headings, not paragraphs. */
export const CHAPTER_LABEL_CHAR_CEILING = 80;

/** The longest prose one typed input entry carries — a paragraph, never a section. */
export const CHAPTER_INPUT_PROSE_CHAR_CEILING = 2_000;

/** A canon fact is one atomic sentence (CAL-094); its passage stays that size. */
export const CHAPTER_FACT_STATEMENT_CHAR_CEILING = 400;

/**
 * How many entries one chapter's lists carry. Present characters: one at
 * least, because the focal character is present by definition; fifteen at
 * most — a scene reads a cast, not a census. Facts and thread actions are
 * bounded by their vocabularies' own ceilings.
 */
export const CHAPTER_LIST_COUNTS = {
  presentCharacters: { min: 1, max: 15 },
  factsPerChapter: { min: 0, max: 12 },
  threadActionsPerList: { max: 12 },
} as const;

/**
 * How many entries the ask's lists carry. Threads and cast keep the part
 * contract's own ceilings; the preceding digests are bounded to what the
 * mission's context budget can honestly carry — the composer selects beyond
 * that, which is its degradation problem (CAL-054), not the contract's.
 */
export const CHAPTER_INPUT_LIST_COUNTS = {
  threads: { min: 1, max: 12 },
  cast: { min: 1, max: 40 },
  places: { min: 1, max: 20 },
  canonFacts: { min: 0, max: 120 },
  precedingChapters: { min: 0, max: 60 },
} as const;

/**
 * The `TimelinePrecision` members, spelled as the enum spells them — the §4.2
 * carve-out (`TIMELINE_PRECISIONS`' own arrangement, restated here because a
 * domain may not import a domain), pinned against the enum by
 * `prisma/schema.test.ts`. A chapter's period lands on the same day axis the
 * timeline arithmetic reads (CAL-093), so CAL-131 can hold a chapter to the
 * chronology with no translation.
 */
export const CHAPTER_PERIOD_PRECISIONS = ["DAY", "MONTH", "SEASON", "YEAR", "DECADE"] as const;

export type ChapterPeriodPrecision = (typeof CHAPTER_PERIOD_PRECISIONS)[number];

/** The French gloss the prompt quotes beside each precision — the timeline's wording. */
export const CHAPTER_PERIOD_PRECISION_LABELS: Readonly<Record<ChapterPeriodPrecision, string>> = {
  DAY: "au jour près",
  MONTH: "au mois près",
  SEASON: "à la saison près",
  YEAR: "à l'année près",
  DECADE: "à la décennie près",
};

/**
 * Where a thread stands when the batch's part opens — the choreography's
 * seed, declared by the ask from what the previous batches did. Not
 * `ThreadStatus`: `CONTINUED` is a row's history, while the walk needs the
 * present — a thread is either not yet opened, currently open, or closed.
 */
export const CHAPTER_THREAD_STATES = ["unopened", "open", "closed"] as const;

export type ChapterThreadState = (typeof CHAPTER_THREAD_STATES)[number];

/**
 * The chapter's période, on the timeline's own axis: a day span, how finely
 * it is known, and the label a reader sees. Every field required — CAL-093's
 * lesson: a field the calculation cannot read is a demand the model can
 * evade, and requiring the days is what keeps CAL-131's arithmetic alive.
 * Deliberately no ordering rule *between* chapters: reading order is
 * dramatic, not chronological, and a flashback is not a defect.
 */
export const chapterPeriodSchema = z
  .strictObject({
    /** Day the period opens, on the chronology's axis — day 0 is the timeline's own origin. */
    startDay: z.int(),
    /** Day the period closes — the same day for a single-day chapter. */
    endDay: z.int(),
    precision: z.enum(CHAPTER_PERIOD_PRECISIONS),
    /** The words a reader sees — « l'été 1912 », « trois jours plus tard ». */
    label: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING),
  })
  .check((ctx) => {
    // `chapter_outlines_period_order_check`'s rule, held at the contract.
    if (ctx.value.endDay < ctx.value.startDay) {
      ctx.issues.push({
        code: "custom",
        message: "a chapter's period ends before it starts",
        path: ["endDay"],
        input: ctx.value,
      });
    }
  });

export type ChapterPeriod = z.infer<typeof chapterPeriodSchema>;

/**
 * A revelation and its preparation — the pair, plus exactly one preparing
 * reference: a position among this batch's earlier chapters, or a position
 * in the ask's preceding-chapter list. Both halves of the prose required —
 * a revelation prepared by nothing cannot fill `preparation`, which is the
 * `StyleConstraint` move — and the reference is what makes *préparée*
 * checkable arithmetic rather than a promise. The indexes are check-only:
 * `./resolve` flattens the prose and stores no position.
 */
export const chapterRevelationSchema = z
  .strictObject({
    /** What the reader learns. */
    content: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.revelationContent),
    /** What plants it, in the preparing chapter — the words, not the address. */
    preparation: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.revelationPreparation),
    /** Position of the preparing chapter inside this batch — earlier than this chapter, or null. */
    preparedByBatchChapterIndex: z.int().nullable(),
    /** Position of the preparing chapter in the ask's preceding list, or null. */
    preparedByPrecedingChapterIndex: z.int().nullable(),
  })
  .check((ctx) => {
    const { preparedByBatchChapterIndex, preparedByPrecedingChapterIndex } = ctx.value;

    // Exactly one reference — CAL-084's tied branches: a null is an answer,
    // and an answer that names two preparing chapters names none.
    if ((preparedByBatchChapterIndex === null) === (preparedByPrecedingChapterIndex === null)) {
      ctx.issues.push({
        code: "custom",
        message: "a revelation must name exactly one preparing chapter",
        path: ["preparedByBatchChapterIndex"],
        input: ctx.value,
      });
    }

    for (const [field, index] of [
      ["preparedByBatchChapterIndex", preparedByBatchChapterIndex],
      ["preparedByPrecedingChapterIndex", preparedByPrecedingChapterIndex],
    ] as const) {
      if (index !== null && index < 0) {
        ctx.issues.push({
          code: "custom",
          message: "a revelation names a negative preparation index",
          path: [field],
          input: ctx.value,
        });
      }
    }
  });

export type ChapterRevelation = z.infer<typeof chapterRevelationSchema>;

/**
 * One chapter plan as the mission answers it — the `ChapterOutline` columns'
 * own spellings, so persistence, when its task comes, is a copy and not a
 * translation. The columns are nullable because a hand-added plan starts
 * empty; the *mission* owes every field, so here they are required —
 * `dramaticFunction` and `consequence` first among them, the MVP's own bar
 * as shape. `placeName` and `revelation` are required-but-nullable (CAL-077):
 * *no offered place fits* and *nothing is revealed* are answers written,
 * never fields skipped.
 *
 * Characters and places are named, never identified: the names are checked
 * against the ask's offered lists and written back in the ask's spelling
 * (CAL-090's device), and resolving a name to a `Character.id` or `Place.id`
 * is business code's, with a live scope (§6).
 */
export const plannedChapterSchema = z
  .strictObject({
    /** The titre provisoire — `ChapterOutline.workingTitle`. */
    workingTitle: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING),
    /** The longueur cible, in words — bounded by `.check` below, summed by the batch gate. */
    targetWordCount: z.int(),
    /** The personnage focal — one of the ask's cast, and present below. */
    focalCharacterName: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING),
    /** The personnages présents — the ask's cast spellings. */
    presentCharacterNames: z
      .array(z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING))
      .min(CHAPTER_LIST_COUNTS.presentCharacters.min)
      .max(CHAPTER_LIST_COUNTS.presentCharacters.max),
    /** The lieu — one of the ask's places, or null when none fits. */
    placeName: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING).nullable(),
    period: chapterPeriodSchema,
    dramaticFunction: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.dramaticFunction),
    immediateGoal: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.immediateGoal),
    obstacle: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.obstacle),
    decision: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.decision),
    /** The révélation éventuelle — null is the answer « rien n'est révélé ». */
    revelation: chapterRevelationSchema.nullable(),
    consequence: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.consequence),
    detailedSummary: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.detailedSummary),
    /** Threads this chapter opens — positions in the ask's thread list. */
    opensThreadIndexes: z.array(z.int()).max(CHAPTER_LIST_COUNTS.threadActionsPerList.max),
    /** Threads this chapter carries forward without settling. */
    continuesThreadIndexes: z.array(z.int()).max(CHAPTER_LIST_COUNTS.threadActionsPerList.max),
    /** Threads this chapter closes — the planned closing chapters of the imperative. */
    closesThreadIndexes: z.array(z.int()).max(CHAPTER_LIST_COUNTS.threadActionsPerList.max),
    /** The faits canoniques concernés — positions in the ask's fact list. */
    factIndexes: z
      .array(z.int())
      .min(CHAPTER_LIST_COUNTS.factsPerChapter.min)
      .max(CHAPTER_LIST_COUNTS.factsPerChapter.max),
  })
  .check((ctx) => {
    // Every numeric bound of ours is a `.check()`, so no untested `minimum`
    // or `maximum` keyword enters the JSON Schema the structured-output
    // subset has to accept — CAL-090's move, for CAL-093's reason.
    const { targetWordCount } = ctx.value;

    if (
      targetWordCount < CHAPTER_TARGET_WORD_COUNT_RANGE.min ||
      targetWordCount > CHAPTER_TARGET_WORD_COUNT_RANGE.max
    ) {
      ctx.issues.push({
        code: "custom",
        message: "a chapter declares a target outside the admissible chapter length",
        path: ["targetWordCount"],
        input: ctx.value,
      });
    }

    const lists = [
      ["opensThreadIndexes", ctx.value.opensThreadIndexes],
      ["continuesThreadIndexes", ctx.value.continuesThreadIndexes],
      ["closesThreadIndexes", ctx.value.closesThreadIndexes],
    ] as const;
    const seenThreads = new Set<number>();

    for (const [field, indexes] of lists) {
      indexes.forEach((threadIndex, index) => {
        if (threadIndex < 0) {
          ctx.issues.push({
            code: "custom",
            message: "a chapter names a negative thread index",
            path: [field, index],
            input: ctx.value,
          });
          return;
        }

        // Disjoint across the three lists and within each: one action per
        // thread per chapter, which is what makes opened-and-closed-in-one-
        // chapter unrepresentable rather than merely refused.
        if (seenThreads.has(threadIndex)) {
          ctx.issues.push({
            code: "custom",
            message: "a chapter acts on the same thread twice",
            path: [field, index],
            input: ctx.value,
          });
        }
        seenThreads.add(threadIndex);
      });
    }

    const seenFacts = new Set<number>();

    ctx.value.factIndexes.forEach((factIndex, index) => {
      if (factIndex < 0) {
        ctx.issues.push({
          code: "custom",
          message: "a chapter names a negative fact index",
          path: ["factIndexes", index],
          input: ctx.value,
        });
        return;
      }

      if (seenFacts.has(factIndex)) {
        ctx.issues.push({
          code: "custom",
          message: "a chapter names the same fact twice",
          path: ["factIndexes", index],
          input: ctx.value,
        });
      }
      seenFacts.add(factIndex);
    });

    // Exact equality on the already-trimmed strings: the schema holds the
    // answer's own self-consistency, and typography variants are the
    // checker's `sameWords` business when it re-holds the rule for rows.
    if (!ctx.value.presentCharacterNames.includes(ctx.value.focalCharacterName)) {
      ctx.issues.push({
        code: "custom",
        message: "a chapter's focal character is not among its present characters",
        path: ["focalCharacterName"],
        input: ctx.value,
      });
    }
  });

export type PlannedChapter = z.infer<typeof plannedChapterSchema>;

/**
 * The answer to `build-chapter-outline`: one part's chapter plans, in reading
 * order — the order *is* the answer (no `number` field anywhere, CAL-019),
 * and the fractional order keys are minted at persistence, never here.
 */
export const chapterOutlineBatchSchema = z
  .strictObject({
    chapters: z
      .array(plannedChapterSchema)
      .min(PART_CHAPTER_COUNT_RANGE.min)
      .max(PART_CHAPTER_COUNT_RANGE.max),
  })
  .check((ctx) => {
    // A batch reference must point strictly earlier — a revelation prepared
    // by itself or by a later chapter is prepared by nothing. The preceding
    // list's upper bound is the checker's: the schema cannot see the ask.
    ctx.value.chapters.forEach((chapter, chapterIndex) => {
      const batchIndex = chapter.revelation?.preparedByBatchChapterIndex ?? null;

      if (batchIndex !== null && batchIndex >= chapterIndex) {
        ctx.issues.push({
          code: "custom",
          message: "a revelation is prepared by a later chapter of the batch",
          path: ["chapters", chapterIndex, "revelation", "preparedByBatchChapterIndex"],
          input: ctx.value,
        });
      }
    });
  });

export type ChapterOutlineBatch = z.infer<typeof chapterOutlineBatchSchema>;

/**
 * One thread as the ask offers it: the `Thread` columns' wording, where the
 * choreography starts from (`state`), and the part structure's own
 * declaration of which parts carry it (`assignedPartIndexes`, ascending).
 * The part's duties are derived — assigned when `partIndex` is listed, to
 * close when `partIndex` is the last listed — never stored beside the list.
 */
export const chapterBatchThreadSchema = z.strictObject({
  label: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING),
  narrativePromise: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.precedingSummary),
  state: z.enum(CHAPTER_THREAD_STATES),
  /** The parts concerned by this thread, as the part structure declared them. */
  assignedPartIndexes: z.array(z.int().min(0)).min(1).max(PART_COUNT_RANGE.max),
});

export type ChapterBatchThread = z.infer<typeof chapterBatchThreadSchema>;

/** One place the chapters may be set in — a `Place` row's name, offered by the ask. */
export const chapterPlaceSchema = z.strictObject({
  name: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING),
  description: z.string().trim().min(1).max(CHAPTER_INPUT_PROSE_CHAR_CEILING).nullable(),
});

export type ChapterPlace = z.infer<typeof chapterPlaceSchema>;

/**
 * One canon fact the chapters may concern. The `factId` is the caller's —
 * the answer cites positions, and `./resolve` hands back ids the model never
 * chose (§6).
 */
export const chapterCanonFactSchema = z.strictObject({
  factId: z.string().trim().min(1),
  statement: z.string().trim().min(1).max(CHAPTER_FACT_STATEMENT_CHAR_CEILING),
});

export type ChapterCanonFact = z.infer<typeof chapterCanonFactSchema>;

/**
 * One already-planned chapter of an earlier part, at digest resolution —
 * what the no-repetition bar and a preceding revelation reference read.
 */
export const precedingChapterDigestSchema = z.strictObject({
  workingTitle: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING),
  dramaticFunction: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.dramaticFunction),
  immediateGoal: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.immediateGoal),
  consequence: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.consequence),
  summary: z.string().trim().min(1).max(CHAPTER_CHAR_CEILINGS.precedingSummary),
});

export type PrecedingChapterDigest = z.infer<typeof precedingChapterDigestSchema>;

/**
 * What one batch was asked — the payload `Generation.input` carries and
 * `generationIdempotencyKey` digests (CAL-058).
 *
 * Content-addressed: the part's frame travels as the resolved text
 * `resolvePartStructure` flattened, so re-cutting the parts is a different
 * ask, while a job the queue redelivers is the same one. `partId` names the
 * `Part` row the batch plans — which presumes the executor task persists
 * `Part` rows before composing an ask, `directionId`'s own arrangement.
 * `isFinalPart` is deliberately absent: it is `partIndex === partCount - 1`,
 * and a stored copy is a second answer able to disagree.
 *
 * The ceilings here can, at their extremes, exceed the mission's context
 * budget; selecting under the budget is the composer's degradation problem
 * (CAL-054), not the contract's.
 */
export const chapterOutlineBatchInputSchema = z
  .strictObject({
    /** CAL-100's savepoint — which validated bible the plans answer to. */
    bibleVersionNumber: z.int().positive(),
    /** The `Part` row this batch plans. */
    partId: z.string().trim().min(1),
    /** The part's position in reading order, from zero. */
    partIndex: z.int().min(0),
    /** How many parts the plan holds. */
    partCount: z.int().positive(),
    partTitle: z.string().trim().min(1).max(CHAPTER_LABEL_CHAR_CEILING),
    /** The part's frame, as `resolvePartStructure` flattened it. */
    partDramaticObjective: z.string().trim().min(1).max(CHAPTER_INPUT_PROSE_CHAR_CEILING),
    partInitialState: z.string().trim().min(1).max(CHAPTER_INPUT_PROSE_CHAR_CEILING),
    partTippingPoint: z.string().trim().min(1).max(CHAPTER_INPUT_PROSE_CHAR_CEILING),
    partFinalState: z.string().trim().min(1).max(CHAPTER_INPUT_PROSE_CHAR_CEILING),
    /** The part's share of the novel, in words — what the count gate and the budget derive from. */
    partTargetWordCount: z.int().positive(),
    freedomLevel: z.enum(FREEDOM_LEVELS),
    threads: z
      .array(chapterBatchThreadSchema)
      .min(CHAPTER_INPUT_LIST_COUNTS.threads.min)
      .max(CHAPTER_INPUT_LIST_COUNTS.threads.max),
    /** The cast, principals first — `partCastMemberSchema` reused, one contract for one concept. */
    cast: z
      .array(partCastMemberSchema)
      .min(CHAPTER_INPUT_LIST_COUNTS.cast.min)
      .max(CHAPTER_INPUT_LIST_COUNTS.cast.max),
    places: z
      .array(chapterPlaceSchema)
      .min(CHAPTER_INPUT_LIST_COUNTS.places.min)
      .max(CHAPTER_INPUT_LIST_COUNTS.places.max),
    canonFacts: z
      .array(chapterCanonFactSchema)
      .min(CHAPTER_INPUT_LIST_COUNTS.canonFacts.min)
      .max(CHAPTER_INPUT_LIST_COUNTS.canonFacts.max),
    /** Batches 1..N−1's chapters, in reading order — why the write target's serialization is load-bearing. */
    precedingChapters: z
      .array(precedingChapterDigestSchema)
      .min(CHAPTER_INPUT_LIST_COUNTS.precedingChapters.min)
      .max(CHAPTER_INPUT_LIST_COUNTS.precedingChapters.max),
  })
  .check((ctx) => {
    if (ctx.value.partIndex >= ctx.value.partCount) {
      ctx.issues.push({
        code: "custom",
        message: "the ask places the part outside its own count",
        path: ["partIndex"],
        input: ctx.value,
      });
    }

    const seenLabels = new Set<string>();

    ctx.value.threads.forEach((thread, index) => {
      if (seenLabels.has(thread.label)) {
        ctx.issues.push({
          code: "custom",
          message: "one thread offered twice in a chapter-batch ask",
          path: ["threads", index, "label"],
          input: ctx.value,
        });
      }
      seenLabels.add(thread.label);

      // Ascending keeps the ask canonical (one assignment, one digest —
      // CAL-058) and gives uniqueness for free; the bound is the ask's own
      // part count.
      thread.assignedPartIndexes.forEach((partIndex, position) => {
        const previous = position > 0 ? thread.assignedPartIndexes[position - 1] : undefined;

        if (previous !== undefined && partIndex <= previous) {
          ctx.issues.push({
            code: "custom",
            message: "a thread's assigned parts are not strictly ascending",
            path: ["threads", index, "assignedPartIndexes", position],
            input: ctx.value,
          });
        }
        if (partIndex >= ctx.value.partCount) {
          ctx.issues.push({
            code: "custom",
            message: "a thread is assigned to a part outside the plan",
            path: ["threads", index, "assignedPartIndexes", position],
            input: ctx.value,
          });
        }
      });

      // An ask that assigns this part a thread already closed is asking for
      // an action every batch rule refuses — the contradiction is the
      // composer's to resolve, before a provider is paid (§6.5's spirit).
      if (thread.state === "closed" && thread.assignedPartIndexes.includes(ctx.value.partIndex)) {
        ctx.issues.push({
          code: "custom",
          message: "the ask assigns a closed thread to the part",
          path: ["threads", index, "state"],
          input: ctx.value,
        });
      }
    });

    const seenNames = new Set<string>();

    ctx.value.cast.forEach((member, index) => {
      if (seenNames.has(member.name)) {
        ctx.issues.push({
          code: "custom",
          message: "one character offered twice in a chapter-batch ask",
          path: ["cast", index, "name"],
          input: ctx.value,
        });
      }
      seenNames.add(member.name);
    });

    const seenPlaces = new Set<string>();

    ctx.value.places.forEach((place, index) => {
      if (seenPlaces.has(place.name)) {
        ctx.issues.push({
          code: "custom",
          message: "one place offered twice in a chapter-batch ask",
          path: ["places", index, "name"],
          input: ctx.value,
        });
      }
      seenPlaces.add(place.name);
    });

    const seenFactIds = new Set<string>();

    ctx.value.canonFacts.forEach((fact, index) => {
      if (seenFactIds.has(fact.factId)) {
        ctx.issues.push({
          code: "custom",
          message: "one canon fact offered twice in a chapter-batch ask",
          path: ["canonFacts", index, "factId"],
          input: ctx.value,
        });
      }
      seenFactIds.add(fact.factId);
    });
  });

export type ChapterOutlineBatchInput = z.infer<typeof chapterOutlineBatchInputSchema>;
