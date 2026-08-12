/**
 * What `split-into-parts` is asked and what it is allowed to return (CAL-101, §6).
 *
 * The opening move of the plan: from the validated bible, the canonical
 * direction and the target length, the parts of the novel — each carrying the
 * five things the specification names (§5.7): objectif dramatique, état
 * initial, basculement, état final, fils narratifs concernés. The backlog's
 * bar is not that the fields exist — it is that **every part has an
 * identifiable basculement and a final state different from its initial
 * state**, and that is what this contract is shaped around.
 *
 * **The basculement is a pair, structurally.** `tippingPoint` carries the
 * concrete event and what that event makes irreversible. A vague basculement —
 * *les choses changent peu à peu* — cannot fill the `irreversibility` half,
 * because nothing names what can no longer be restored; it is refused by its
 * own shape, not by a checker reading its wording (`StyleConstraint`'s move).
 * The same half is what carries *état final ≠ état initial*: the
 * irreversibility **is** the difference, stated once, and `checkPartStructure`
 * (`./check`) only catches the degenerate echo of one state into the other.
 *
 * **Threads are declared by the answer and named by index.** No `Thread` row
 * can exist yet — `Thread.openingChapterId` is NOT NULL and no chapter exists
 * before CAL-102 — so the answer carries its own thread list (label and
 * narrative promise, the `Thread` columns' own spellings) and each part names
 * the threads it concerns as positions in that list, never as labels repeated
 * and never as identifiers (§6, `factDecomposition`'s device). The indexes'
 * lower bound is a `.check()` rather than a `.min()`, so no untested `minimum`
 * keyword enters the JSON Schema the structured-output subset has to accept —
 * CAL-090's move, for CAL-093's reason.
 *
 * **The count adapts to the target length, in two layers.** The array bounds
 * here are the static envelope (`PART_COUNT_RANGE`) the structured-output
 * subset can carry; the range the *ask* actually allows is derived from the
 * ask's own `targetWordCount` by `partCalibrationForWordCount` and enforced
 * after the fact by `checkPartStructure` — one function serving the prompt's
 * variables and the gate, so the two cannot disagree.
 *
 * **No score, structurally** (cahier des charges 1195–1199), as CAL-075,
 * CAL-076, CAL-079, CAL-081, CAL-088 and CAL-089: the only numeric paths in
 * the answer are the thread indexes, and `schema.test.ts` pins that.
 */

import { FREEDOM_LEVELS } from "@calepin/shared/freedom-level";
import { z } from "zod";

import { PART_COUNT_RANGE } from "../target-length/calibrate";

const CHARS_PER_WORD = 7;
const OVERRUN_FACTOR = 2;

/** Package-internal, never on `index.ts` — the rule stated once, as elsewhere. */
function ceilingFor(wordTarget: number): number {
  return Math.ceil(wordTarget * CHARS_PER_WORD * OVERRUN_FACTOR);
}

/**
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern. The two states
 * get the room a situation needs, the objective and the event stay at the
 * sentence scale a part-level statement should hold, and the irreversibility
 * is the shortest: one thing that can no longer be undone, not a paragraph.
 */
export const PART_WORD_TARGETS = {
  /** The stake the part plays for — what is being fought over, at this height. */
  dramaticObjective: 40,
  /** Where things stand when the part opens. */
  initialState: 60,
  /** The concrete event that tips the part — one scene someone could point at. */
  tippingPointEvent: 40,
  /** What that event makes irreversible — what can no longer be restored. */
  irreversibility: 30,
  /** Where things stand when the part closes — showing the irreversibility. */
  finalState: 60,
  /** The promise a thread makes to the reader — `Thread.narrativePromise`'s wording. */
  narrativePromise: 25,
} as const;

/** The character ceilings the schema below enforces. */
export const PART_CHAR_CEILINGS = {
  dramaticObjective: ceilingFor(PART_WORD_TARGETS.dramaticObjective),
  initialState: ceilingFor(PART_WORD_TARGETS.initialState),
  tippingPointEvent: ceilingFor(PART_WORD_TARGETS.tippingPointEvent),
  irreversibility: ceilingFor(PART_WORD_TARGETS.irreversibility),
  finalState: ceilingFor(PART_WORD_TARGETS.finalState),
  narrativePromise: ceilingFor(PART_WORD_TARGETS.narrativePromise),
} as const;

/** A part's title and a thread's label are headings, not paragraphs. */
export const PART_LABEL_CHAR_CEILING = 80;

/**
 * How many entries the answer's two lists carry, beyond the parts' own
 * envelope (`PART_COUNT_RANGE`, owned by the calibration).
 *
 * Threads: two at least, because the specification asks for the *principaux
 * fils* in the plural and a single-thread plan has nothing to braid; twelve at
 * most, the parts' own ceiling — more threads than parts stops being a plan.
 * Per part: one at least — a part concerned by no thread advances nothing —
 * and at most every thread there is.
 */
export const PART_LIST_COUNTS = {
  threads: { min: 2, max: 12 },
  threadsPerPart: { min: 1, max: 12 },
} as const;

/**
 * One narrative thread the plan will braid — `Thread`'s own columns, ahead of
 * the row exactly as `novelPotentialAssessmentSchema` was ahead of any row
 * storing it: the row belongs to the task that has chapters for the thread to
 * open in (CAL-102).
 */
export const partThreadSchema = z.strictObject({
  /** Unique across the answer — `Thread`'s `@@unique([outlineId, label])`, ahead of the row. */
  label: z.string().trim().min(1).max(PART_LABEL_CHAR_CEILING),
  /** The promise the thread makes to the reader. */
  narrativePromise: z.string().trim().min(1).max(PART_CHAR_CEILINGS.narrativePromise),
});

export type PartThread = z.infer<typeof partThreadSchema>;

/**
 * The basculement: the concrete event, and what it makes irreversible.
 *
 * Both halves required, never nullable — a part whose tipping point changes
 * nothing has no `irreversibility` to write, and *cette partie ne bascule pas*
 * is not a shape the contract has. The irreversibility is also what the final
 * state must show, which is how *état final ≠ état initial* is carried by the
 * pair rather than promised by the prompt.
 */
export const partTippingPointSchema = z.strictObject({
  /** The concrete event — one scene someone could point at. */
  event: z.string().trim().min(1).max(PART_CHAR_CEILINGS.tippingPointEvent),
  /** What can no longer be restored once the event has happened. */
  irreversibility: z.string().trim().min(1).max(PART_CHAR_CEILINGS.irreversibility),
});

export type PartTippingPoint = z.infer<typeof partTippingPointSchema>;

/**
 * One part as the mission answers it — the `Part` columns' own spellings, so
 * persistence, when its task comes, is a copy and not a translation. The
 * columns are nullable because a hand-added part starts empty; the *mission*
 * owes every field, so here they are required.
 */
export const plannedPartSchema = z
  .strictObject({
    /** Unique across the answer — `Part`'s `@@unique([outlineId, title])`. */
    title: z.string().trim().min(1).max(PART_LABEL_CHAR_CEILING),
    dramaticObjective: z.string().trim().min(1).max(PART_CHAR_CEILINGS.dramaticObjective),
    initialState: z.string().trim().min(1).max(PART_CHAR_CEILINGS.initialState),
    tippingPoint: partTippingPointSchema,
    finalState: z.string().trim().min(1).max(PART_CHAR_CEILINGS.finalState),
    /** Positions in the answer's own `threads` list — never a label, never an id (§6). */
    threadIndexes: z
      .array(z.int())
      .min(PART_LIST_COUNTS.threadsPerPart.min)
      .max(PART_LIST_COUNTS.threadsPerPart.max),
  })
  .check((ctx) => {
    // Bounded below by a `.check()` rather than by `.min(0)` so no `minimum`
    // keyword enters the JSON Schema the structured-output subset has to
    // accept — CAL-090's precedent, for CAL-093's reason.
    ctx.value.threadIndexes.forEach((threadIndex, index) => {
      if (threadIndex < 0) {
        ctx.issues.push({
          code: "custom",
          message: "a part names a negative thread index",
          path: ["threadIndexes", index],
          input: ctx.value,
        });
      }
    });
  });

export type PlannedPart = z.infer<typeof plannedPartSchema>;

/**
 * The answer to `split-into-parts`: the declared threads, then the parts that
 * braid them, in reading order — the order *is* the answer, and the fractional
 * order keys are minted at persistence (`orderKeysBetween`), never here.
 */
export const partStructureSchema = z
  .strictObject({
    threads: z
      .array(partThreadSchema)
      .min(PART_LIST_COUNTS.threads.min)
      .max(PART_LIST_COUNTS.threads.max),
    parts: z.array(plannedPartSchema).min(PART_COUNT_RANGE.min).max(PART_COUNT_RANGE.max),
  })
  .check((ctx) => {
    // An index past the declared list is malformed, not merely wrong, so the
    // schema refuses it before any check runs; `checkPartStructure` holds the
    // same rule again for the callers that hand it rows instead of an answer.
    const threadCount = ctx.value.threads.length;

    ctx.value.parts.forEach((part, partIndex) => {
      part.threadIndexes.forEach((threadIndex, index) => {
        if (threadIndex >= threadCount) {
          ctx.issues.push({
            code: "custom",
            message: "a part names a thread the answer does not declare",
            path: ["parts", partIndex, "threadIndexes", index],
            input: ctx.value,
          });
        }
      });
    });
  });

export type PartStructure = z.infer<typeof partStructureSchema>;

/**
 * Where a passage of the corpus comes from — the two upstreams a découpage
 * answers to. The bible's own sections arrive as `identity` entries because
 * the identity is where the validated bible states what the novel *is*; the
 * cast and the planned events have structure the parts read, so they travel
 * as typed lists beside the corpus rather than as passages inside it.
 */
export const PART_SOURCE_KINDS = ["direction", "identity"] as const;

export type PartSourceKind = (typeof PART_SOURCE_KINDS)[number];

/**
 * How many passages one ask carries — `STYLE_SOURCE_COUNTS`'s reasoning: two
 * at least so the split answers to both upstreams, and a ceiling that refuses
 * a dump (§5.8) without shaping the composer's granularity.
 */
export const PART_SOURCE_COUNTS = { min: 2, max: 32 } as const;

/** The longest passage one source entry carries — a section, never a text. */
export const PART_SOURCE_CHAR_CEILING = 8_000;

/** The longest key or label the composer may give one source. */
export const PART_SOURCE_KEY_CHAR_CEILING = 80;

/** The longest prose one typed input entry carries — a paragraph, never a section. */
export const PART_INPUT_PROSE_CHAR_CEILING = 2_000;

/**
 * How many entries the ask's two typed lists carry. The cast's ceiling is the
 * character contract's own (`CANON_FACT_LIST_COUNTS.cast`'s figure); the
 * planned events' is the timeline's planned ceiling.
 */
export const PART_INPUT_LIST_COUNTS = {
  characters: { min: 1, max: 40 },
  plannedEvents: { min: 0, max: 40 },
} as const;

/** One passage the split stays answerable to — `styleSourceSchema`'s shape. */
export const partSourceSchema = z.strictObject({
  kind: z.enum(PART_SOURCE_KINDS),
  key: z.string().trim().min(1).max(PART_SOURCE_KEY_CHAR_CEILING),
  /** French, what the model reads above the passage. */
  label: z.string().trim().min(1).max(PART_SOURCE_KEY_CHAR_CEILING),
  text: z.string().trim().min(1).max(PART_SOURCE_CHAR_CEILING),
});

export type PartSource = z.infer<typeof partSourceSchema>;

/**
 * One member of the cast whose arc the parts carve. The arc is
 * required-but-nullable (CAL-077's discipline): a sheet may declare none, and
 * a null is that absence written rather than a field the composer forgot.
 */
export const partCastMemberSchema = z.strictObject({
  name: z.string().trim().min(1).max(PART_LABEL_CHAR_CEILING),
  plannedArc: z.string().trim().min(1).max(PART_INPUT_PROSE_CHAR_CEILING).nullable(),
});

export type PartCastMember = z.infer<typeof partCastMemberSchema>;

/**
 * One planned event of the reference chronology — the spine the parts
 * distribute. Summary required-but-nullable, `plannedArc`'s reason.
 */
export const partPlannedEventSchema = z.strictObject({
  name: z.string().trim().min(1).max(PART_LABEL_CHAR_CEILING),
  summary: z.string().trim().min(1).max(PART_INPUT_PROSE_CHAR_CEILING).nullable(),
});

export type PartPlannedEvent = z.infer<typeof partPlannedEventSchema>;

/**
 * What one découpage was asked — the payload `Generation.input` carries and
 * `generationIdempotencyKey` digests (CAL-058).
 *
 * Content-addressed as the style's ask is: the corpus travels as text, so
 * editing the canonical direction is a different ask, while a job the queue
 * redelivers is the same one. `bibleVersionNumber` pins *which* validated
 * bible (CAL-100's savepoint) the parts were carved against — re-validating
 * mints a new version and legitimately reopens the ask. `targetWordCount` is
 * in because the answer reads it twice: the prompt quotes it and the count
 * gate re-derives the admissible range from it — unlike the style's ask,
 * which reads no length and therefore carries none.
 */
export const partStructureInputSchema = z
  .strictObject({
    /** The canonical direction the split serves. */
    directionId: z.string().trim().min(1),
    /** CAL-100's savepoint — which validated bible the parts answer to. */
    bibleVersionNumber: z.int().positive(),
    /** The project's resolved target, in words — what the count gate derives its range from. */
    targetWordCount: z.int().positive(),
    freedomLevel: z.enum(FREEDOM_LEVELS),
    sources: z.array(partSourceSchema).min(PART_SOURCE_COUNTS.min).max(PART_SOURCE_COUNTS.max),
    /** The cast, principals first — the composer's order is part of the ask. */
    characters: z
      .array(partCastMemberSchema)
      .min(PART_INPUT_LIST_COUNTS.characters.min)
      .max(PART_INPUT_LIST_COUNTS.characters.max),
    /** The reference chronology's planned events, in its own order. */
    plannedEvents: z
      .array(partPlannedEventSchema)
      .min(PART_INPUT_LIST_COUNTS.plannedEvents.min)
      .max(PART_INPUT_LIST_COUNTS.plannedEvents.max),
  })
  .check((ctx) => {
    const seenKeys = new Set<string>();

    ctx.value.sources.forEach((source, index) => {
      if (seenKeys.has(source.key)) {
        ctx.issues.push({
          code: "custom",
          message: "one source key offered twice in a part-structure ask",
          path: ["sources", index, "key"],
          input: ctx.value,
        });
      }
      seenKeys.add(source.key);
    });

    const seenNames = new Set<string>();

    ctx.value.characters.forEach((member, index) => {
      if (seenNames.has(member.name)) {
        ctx.issues.push({
          code: "custom",
          message: "one character offered twice in a part-structure ask",
          path: ["characters", index, "name"],
          input: ctx.value,
        });
      }
      seenNames.add(member.name);
    });

    const seenEvents = new Set<string>();

    ctx.value.plannedEvents.forEach((event, index) => {
      if (seenEvents.has(event.name)) {
        ctx.issues.push({
          code: "custom",
          message: "one planned event offered twice in a part-structure ask",
          path: ["plannedEvents", index, "name"],
          input: ctx.value,
        });
      }
      seenEvents.add(event.name);
    });
  });

export type PartStructureInput = z.infer<typeof partStructureInputSchema>;
