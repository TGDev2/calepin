/**
 * What `detect-bible-contradictions` is asked and what it may return
 * (CAL-099, §6).
 *
 * The half of the coherence check no calculation reaches. `canonFactKey`
 * compares content words in order, so *le père de Nora est vivant* held true
 * and held false is arithmetic — and *le père de Nora repose au cimetière*
 * beside *son père lui écrit chaque hiver* is not. CAL-094 wrote that boundary
 * down in its own review: a deterministic key leaves *the same fact said in
 * different words* standing as two facts, and this mission is what owns it.
 * The same holds one table over for two world rules that cannot both govern.
 *
 * **The answer names an index, never an identifier** (§6). A model may point at
 * the third fact it was shown; it does not choose a primary key. The ask's own
 * two arrays are therefore the whole vocabulary an answer may draw on — CAL-084's
 * device, reached here for a second reason: with no quotation to verify, the
 * index *is* the anchor, so closing the index space closes everything.
 *
 * **No corpus, deliberately.** Every sibling bible mission carries `sources`,
 * because every one of them owes a verbatim citation to something upstream.
 * This one owes none: it judges the bible against itself, and what it points at
 * is already in the ask. A `sources` field would be an input no field of the
 * answer reads, which `bibleStyleInputSchema` already refuses on the
 * idempotency key's behalf (CAL-058).
 *
 * **No score, structurally**, as CAL-075, CAL-076, CAL-079, CAL-081, CAL-088,
 * CAL-089, CAL-090, CAL-091 and CAL-092. The only numeric paths in the whole
 * contract are the two indexes of a pair, and an index measures nothing —
 * `schema.test.ts` walks a parsed answer and states that as the carve-out
 * `age` already is one section over. There is no *severity*, no *confidence*
 * and no *strength*: a pair is a contradiction or it is not reported, and the
 * prompt says so.
 *
 * **Both lists may be empty.** A bible that holds together is the common case
 * and the good one; a contract with a floor would teach the model to invent a
 * contradiction to fill it, which is `outOfNormCapabilities`' argument one
 * section over and `RELATIONSHIP_LIST_COUNTS.asymmetries`' before it. What the
 * ask does demand is something to compare: fewer than two elements between the
 * two arrays is not a question anybody can answer.
 */

import { z } from "zod";

import { CANON_FACT_VALIDITIES } from "../canon-fact/types";
import { ceilingFor } from "../identity/schema";

/**
 * How much of the bible one ask carries, and how much an answer may return.
 *
 * `facts` reaches three hundred because the canon is the one bible section that
 * grows without bound and the whole of it has to be comparable in one pass —
 * a contradiction between fact 4 and fact 280 is exactly the one no human
 * notices. `worldRules` stays small because `WORLD_LIST_COUNTS` already keeps
 * it small.
 *
 * The answer's ceilings are the honest reading of what a bible can hold: past
 * twenty opposed pairs the bible is not contradictory, it is unfinished, and
 * the author needs the first twenty fixed before the rest means anything.
 */
export const BIBLE_CONTRADICTION_LIST_COUNTS = {
  facts: { min: 0, max: 300 },
  worldRules: { min: 0, max: 24 },
  subjects: { min: 0, max: 6 },
  opposedFacts: { min: 0, max: 20 },
  contradictoryRules: { min: 0, max: 12 },
  bounds: { min: 0, max: 12 },
} as const;

/** Two elements at least, or there is nothing to compare. */
export const BIBLE_CONTRADICTION_MINIMUM_ELEMENTS = 2;

/** A name or a rule's handle is a heading, not a paragraph. */
export const BIBLE_CONTRADICTION_LABEL_CHAR_CEILING = 80;

/**
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern.
 */
export const BIBLE_CONTRADICTION_WORD_TARGETS = {
  /** One canonical statement, as the canon stores it. */
  statement: 20,
  /** The French label of a fact's period, when it has one. */
  validityLabel: 10,
  /** One rule of the world, as the world stores it. */
  rule: 35,
  /** One limit, cost or failure condition, as `describeWorldBounds` phrases it. */
  bound: 25,
  /** Why the two cannot both hold — the argument, not the verdict. */
  explanation: 60,
  /** What the author can do about it, in one act. */
  proposedFix: 40,
} as const;

export const BIBLE_CONTRADICTION_CHAR_CEILINGS = {
  statement: ceilingFor(BIBLE_CONTRADICTION_WORD_TARGETS.statement),
  validityLabel: ceilingFor(BIBLE_CONTRADICTION_WORD_TARGETS.validityLabel),
  rule: ceilingFor(BIBLE_CONTRADICTION_WORD_TARGETS.rule),
  bound: ceilingFor(BIBLE_CONTRADICTION_WORD_TARGETS.bound),
  explanation: ceilingFor(BIBLE_CONTRADICTION_WORD_TARGETS.explanation),
  proposedFix: ceilingFor(BIBLE_CONTRADICTION_WORD_TARGETS.proposedFix),
} as const;

function prose(ceiling: number): z.ZodString {
  return z.string().trim().min(1).max(ceiling);
}

const label = z.string().trim().min(1).max(BIBLE_CONTRADICTION_LABEL_CHAR_CEILING);

/**
 * One canonical fact, as the mission is shown it.
 *
 * The statement, its truth value and its period — the three things that decide
 * whether two facts can both hold — plus the subjects, because *le père est
 * vivant* said of two different characters is two facts and not one. The
 * per-character beliefs are deliberately absent: a contradiction is about what
 * is true in the world, and what a character believes about it is the one thing
 * that may legitimately disagree with the world (`CanonFactBelief`'s whole
 * reason for existing). Showing them would invite the model to report the
 * product's central feature as a defect.
 */
export const contradictionFactSchema = z.strictObject({
  statement: prose(BIBLE_CONTRADICTION_CHAR_CEILINGS.statement),
  isTrue: z.boolean(),
  validity: z.enum(CANON_FACT_VALIDITIES),
  /** How the period reads in French, or null when the fact is permanent. */
  validityLabel: prose(BIBLE_CONTRADICTION_CHAR_CEILINGS.validityLabel).nullable(),
  subjects: z
    .array(label)
    .min(BIBLE_CONTRADICTION_LIST_COUNTS.subjects.min)
    .max(BIBLE_CONTRADICTION_LIST_COUNTS.subjects.max),
});

export type ContradictionFact = z.infer<typeof contradictionFactSchema>;

/**
 * One rule of the world, as the mission is shown it — the statement and the
 * bounds `describeWorldBounds` phrases, which is where a rule stops being a
 * declaration and starts being something another rule can contradict.
 */
export const contradictionRuleSchema = z.strictObject({
  name: label,
  statement: prose(BIBLE_CONTRADICTION_CHAR_CEILINGS.rule),
  isSupernatural: z.boolean(),
  bounds: z
    .array(prose(BIBLE_CONTRADICTION_CHAR_CEILINGS.bound))
    .min(BIBLE_CONTRADICTION_LIST_COUNTS.bounds.min)
    .max(BIBLE_CONTRADICTION_LIST_COUNTS.bounds.max),
});

export type ContradictionRule = z.infer<typeof contradictionRuleSchema>;

export const bibleContradictionsInputSchema = z
  .strictObject({
    facts: z
      .array(contradictionFactSchema)
      .min(BIBLE_CONTRADICTION_LIST_COUNTS.facts.min)
      .max(BIBLE_CONTRADICTION_LIST_COUNTS.facts.max),
    worldRules: z
      .array(contradictionRuleSchema)
      .min(BIBLE_CONTRADICTION_LIST_COUNTS.worldRules.min)
      .max(BIBLE_CONTRADICTION_LIST_COUNTS.worldRules.max),
  })
  .check((context) => {
    const { facts, worldRules } = context.value;
    if (facts.length + worldRules.length >= BIBLE_CONTRADICTION_MINIMUM_ELEMENTS) return;

    context.issues.push({
      code: "custom",
      input: context.value,
      path: ["facts"],
      message: "a bible contradiction ask offers fewer than two elements to compare",
    });
  });

export type BibleContradictionsInput = z.infer<typeof bibleContradictionsInputSchema>;

/**
 * One pair that cannot both hold.
 *
 * Bounded below by a `.check()` rather than by `.min(0)` so no `minimum`
 * keyword enters the JSON Schema the structured-output subset has to accept —
 * CAL-090's precedent, for CAL-093's reason. The two indexes must differ, which
 * is the one self-contradiction a model can produce without leaving the
 * contract: a pair naming one element twice reports nothing and would still
 * parse.
 */
/**
 * One pair, and the same contract for both lists.
 *
 * Two facts and two rules are two questions with one shape, so they take one
 * schema rather than two identical ones — the choice `parseAnalysisSectionEdit`
 * made about a manual and a generated write path, read here as *a pair is a
 * pair*. What tells them apart is the list an entry came out of, which is also
 * what `resolveBibleContradictions` writes the check identifier from: CAL-092's
 * `isSupernatural` device, and §6's rule that a marker is never the model's.
 */
export const contradictionPairSchema = z
  .strictObject({
    firstIndex: z.int(),
    secondIndex: z.int(),
    explanation: prose(BIBLE_CONTRADICTION_CHAR_CEILINGS.explanation),
    proposedFix: prose(BIBLE_CONTRADICTION_CHAR_CEILINGS.proposedFix),
  })
  .check((context) => {
    const { firstIndex, secondIndex } = context.value;

    if (firstIndex < 0 || secondIndex < 0) {
      context.issues.push({
        code: "custom",
        input: context.value,
        path: ["firstIndex"],
        message: "a contradiction names a negative index",
      });
    }

    if (firstIndex === secondIndex) {
      context.issues.push({
        code: "custom",
        input: context.value,
        path: ["secondIndex"],
        message: "a contradiction names the same element twice",
      });
    }
  });

export type ContradictionPair = z.infer<typeof contradictionPairSchema>;

export const bibleContradictionsSchema = z.strictObject({
  /** Two canonical facts that cannot both be true of the same world. */
  opposedFacts: z
    .array(contradictionPairSchema)
    .min(BIBLE_CONTRADICTION_LIST_COUNTS.opposedFacts.min)
    .max(BIBLE_CONTRADICTION_LIST_COUNTS.opposedFacts.max),
  /** Two rules of the world that cannot both govern it. */
  contradictoryRules: z
    .array(contradictionPairSchema)
    .min(BIBLE_CONTRADICTION_LIST_COUNTS.contradictoryRules.min)
    .max(BIBLE_CONTRADICTION_LIST_COUNTS.contradictoryRules.max),
});

export type BibleContradictions = z.infer<typeof bibleContradictionsSchema>;

/** The two lists an answer carries, in the order a report walks them. */
export const BIBLE_CONTRADICTION_LISTS = ["opposedFacts", "contradictoryRules"] as const;
export type BibleContradictionList = (typeof BIBLE_CONTRADICTION_LISTS)[number];
