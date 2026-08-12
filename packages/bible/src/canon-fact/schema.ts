/**
 * What `extract-initial-facts` is asked and what it is allowed to return
 * (CAL-094, §6).
 *
 * The seventh bible mission, and the specification's *Faits canoniques* (§5.6):
 * *chaque fait canonique doit être formulé de manière atomique*, and a fact may
 * be *permanent*, *vrai pendant une période*, *faux après un événement* or
 * *connu de certains personnages seulement*.
 *
 * The backlog's acceptance criterion is three adjectives — *atomiques, non
 * redondants et correctement portés temporellement* — and each is answered by a
 * different mechanism. Atomicity is `./atomicity`, a rule over the statement
 * itself; non-redundancy is `./dedup`; the temporal scope is this file, because
 * it is a matter of what the answer is allowed to *be*.
 *
 * **Three arrays, not a `validity` field.** `canon_facts_validity_check` already
 * states the rule in SQL: `PERMANENT` sets no bound column at all,
 * `DURING_PERIOD` sets at least one bound and no event, `UNTIL_EVENT` sets its
 * event and nothing else. So the answer carries `permanentFacts`, `periodFacts`
 * and `endedFacts` with **different shapes** — a permanent fact has no bound
 * field to leave empty, an ended fact has no bound field at all — and
 * `resolveInitialCanonFacts` (`./rows`) writes `CanonFact.validity` from which
 * array the entry came out of. CAL-092's `isSupernatural` device and CAL-093's
 * `category` device, a third time, for §6's reason and for CAL-080's: a demand a
 * model can evade by declaration teaches it to lie in the declaration. Here it
 * buys something neither of those did — the database CHECK becomes a property of
 * the type, so a fact that parses is a fact that inserts, and *a period fact
 * placed by nothing* is unrepresentable rather than merely refused.
 *
 * **`knownBy` declares a belief state, never a sheet stance.** The sheet's
 * `CHARACTER_KNOWLEDGE_STANCES` exists because a sheet is the one place both
 * canon axes are authored in the same breath, so its vocabulary names the
 * compound cases and `knowledgeStanceToBelief` reads the world off the stance.
 * Here `isTrue` is declared by the fact itself, and a stance would be a
 * **second** answer able to contradict it — the arrangement `Project.status`,
 * `AnalysisSectionRevision` and `CanonFactBeliefState`'s own absent `KNOWS` all
 * refuse. The sheet's stances still reach this mission, as the prefixes
 * `resolveCharacterSheet` writes into the corpus, and that function stays the
 * definition of what they mean. *La liste des personnages qui le connaissent* is
 * then `beliefMatchesWorld(isTrue, state)`: derived, never stored.
 *
 * **A basis is required, and unlike CAL-088's it carries no argument.** The
 * quotation is what decides `CanonFactSource` without believing a declaration
 * (§6) and what makes an invented canon fact impossible rather than merely
 * unlikely — the canon is what every later chapter is checked against. A third
 * field arguing for the fact would restate the statement: what CAL-088 needed an
 * argument for, a fact says in its own words.
 *
 * **Two demands the columns deliberately do not make.** A period bound requires
 * its day, its precision *and* its label, where `canon_facts_validity_check`
 * accepts words alone — because `factInForceOn` answers `null` for a words-only
 * bound, and a caller that receives null must report nothing. And every fact
 * owes a basis, where the column owes only a `source` member. A column must
 * accept an author entering a fact half-way through (CAL-098); a mission is
 * where one can demand. CAL-093's boundary, restated.
 */

import { FREEDOM_LEVELS } from "@calepin/shared/freedom-level";
import { z } from "zod";

import { CHARACTER_LABEL_CHAR_CEILING, establishedCharacterSchema } from "../character/schema";
import { ceilingFor } from "../identity/schema";
import { TIMELINE_DAY_BOUND, TIMELINE_PRECISIONS } from "../timeline/schema";
import { CANON_FACT_BELIEF_STATES, type CanonFactValidity } from "./types";

/**
 * How many entries the ask and the answer carry.
 *
 * The three fact lists may each be **empty**, and that is load-bearing rather
 * than lax: a novel whose past holds nothing that ends is a novel with no
 * `endedFacts`, and a floor there would buy an invented boundary — precisely the
 * kind of assertion the checkers downstream would then have to defend. What is
 * floored is the **total** (`CANON_FACT_TOTAL_COUNTS`), because that is the
 * demand the backlog actually makes of the pass as a whole.
 *
 * Subjects: zero to six. Zero because a fact of the world concerns no character
 * and no place — *l'accident a eu lieu en novembre 1998* names an instant, not
 * an entity — and six because a fact concerning seven things has stopped being
 * atomic and will be caught one file over.
 *
 * `decomposedFacts`: at least two. One is not a decomposition, it is a rewrite.
 *
 * `knownBy` matches the cast's own ceiling rather than sitting below it, and
 * that equality is load-bearing: `./verify` merges two duplicate facts by
 * absorbing the beliefs of one into the other, and a ceiling under the cast's
 * would let an honest merge produce a fact the schema then refuses to re-parse.
 * One stance per character is already held by `@@unique([factId, characterId])`
 * and by the drop `./verify` applies, so forty is the true maximum anyway.
 */
export const CANON_FACT_LIST_COUNTS = {
  permanentFacts: { min: 0, max: 60 },
  periodFacts: { min: 0, max: 30 },
  endedFacts: { min: 0, max: 20 },
  decompositions: { min: 0, max: 20 },
  decomposedFacts: { min: 2, max: 8 },
  subjects: { min: 0, max: 6 },
  knownBy: { min: 0, max: 40 },
  cast: { min: 1, max: 40 },
  places: { min: 0, max: 40 },
  events: { min: 0, max: 60 },
  knownFacts: { min: 0, max: 300 },
} as const;

/**
 * How many facts the whole answer carries, across the three lists.
 *
 * Twelve at least. An identity, a style, a cast, a world and a chronology cannot
 * honestly yield fewer than a dozen atomic statements, so the floor is a demand
 * for prioritisation rather than for invention — CAL-076's argument, and the
 * number `./verify` re-parses against after it has dropped what it had to
 * (lesson 80: both numbers from the same constant).
 *
 * Eighty at most, which is what the mission's output cap holds once each fact
 * carries a statement, a quotation, its subjects and its beliefs. A pass that
 * wanted more is a pass that should have been run again against `knownFacts`.
 */
export const CANON_FACT_TOTAL_COUNTS = { min: 12, max: 80 } as const;

/** At least two sections so the canon answers to more than one upstream. */
export const CANON_FACT_SOURCE_COUNTS = { min: 2, max: 64 } as const;

/** The longest passage one source entry carries — a section, never a text. */
export const CANON_FACT_SOURCE_CHAR_CEILING = 8_000;

/** The longest key or label the composer may give one source. */
export const CANON_FACT_SOURCE_KEY_CHAR_CEILING = 80;

/**
 * A name is a handle, never a paragraph: it is what a subject, a belief and an
 * ending event point at, and what `@@unique([bibleId, name])` makes exact on
 * `Character`, `Place` and `TimelineEvent` alike.
 */
export const CANON_FACT_LABEL_CHAR_CEILING = CHARACTER_LABEL_CHAR_CEILING;

/**
 * The lengths the prompt asks for, in words — rendered as variables and enforced
 * below as character ceilings, the CAL-055 pattern.
 */
export const CANON_FACT_WORD_TARGETS = {
  /** One assertion, affirmative, self-contained. Twenty words is already long. */
  statement: 20,
  /** The passage the fact rests on, quoted whole rather than stitched. */
  quotation: 40,
  /** The composed wording a decomposition started from. */
  composite: 40,
  /** The author's own wording of a bound: *l'hiver qui suit l'accident*. */
  boundLabel: 10,
  /** One event of the chronology, as the ask shows it. */
  eventSummary: 40,
  /** A fact already recorded, which may predate this discipline. */
  knownStatement: 40,
} as const;

/** The character ceilings the schemas below enforce. */
export const CANON_FACT_CHAR_CEILINGS = {
  statement: ceilingFor(CANON_FACT_WORD_TARGETS.statement),
  quotation: ceilingFor(CANON_FACT_WORD_TARGETS.quotation),
  composite: ceilingFor(CANON_FACT_WORD_TARGETS.composite),
  boundLabel: ceilingFor(CANON_FACT_WORD_TARGETS.boundLabel),
  eventSummary: ceilingFor(CANON_FACT_WORD_TARGETS.eventSummary),
  knownStatement: ceilingFor(CANON_FACT_WORD_TARGETS.knownStatement),
} as const;

/**
 * Where a passage of the corpus comes from — and the vocabulary that decides
 * `CanonFact.source`, since `./rows` reads the member off the entry a fact
 * quotes rather than off anything the answer declares (§6).
 *
 * `source-text` stands alone against five bible kinds, which is exactly the
 * split `CanonFactSource` draws between `SOURCE_TEXT` and `BIBLE`.
 *
 * `style` is out for the reason `worldBibleInputSchema` and
 * `bibleTimelineInputSchema` both state: no fact of the world reads a register,
 * and an unused input would make the idempotency digest reopen the canon on
 * every retune of the prose (CAL-058). `direction` and `analysis` are out for a
 * different reason, and it is about what a quotation *means* here. The direction
 * is a proposal and the analysis is a diagnostic of a text; a fact quoting
 * either would be canon resting on something the bible has not yet committed
 * to. `identity` is where the direction has already become the novel's own
 * statement, and the source text is quotable directly.
 */
export const CANON_FACT_SOURCE_KINDS = [
  "source-text",
  "identity",
  "character",
  "relationship",
  "world",
  "timeline",
] as const;

export type CanonFactSourceKind = (typeof CANON_FACT_SOURCE_KINDS)[number];

/** What a fact can be *about* — `CanonFactSubject`'s two columns, as words. */
export const CANON_FACT_SUBJECT_KINDS = ["character", "place"] as const;

export type CanonFactSubjectKind = (typeof CANON_FACT_SUBJECT_KINDS)[number];

const label = z.string().trim().min(1).max(CANON_FACT_LABEL_CHAR_CEILING);

function prose(ceiling: number): z.ZodString {
  return z.string().trim().min(1).max(ceiling);
}

/**
 * One passage the canon is drawn from — the shape every bible ask uses, with
 * this contract's own vocabulary.
 *
 * Unlike its five siblings this corpus is also a **citation vocabulary**:
 * `canonFactBasisSchema` names one of these keys and quotes this text, and
 * `./verify` reads the quotation back against it. CAL-088's device, and the
 * argument is CAL-084's — a model can cite only what it was actually shown, so
 * a citation to something outside the composed context is impossible by
 * construction rather than merely wrong.
 */
export const canonFactSourceSchema = z.strictObject({
  kind: z.enum(CANON_FACT_SOURCE_KINDS),
  key: z.string().trim().min(1).max(CANON_FACT_SOURCE_KEY_CHAR_CEILING),
  /** French, what the model reads above the passage. */
  label: z.string().trim().min(1).max(CANON_FACT_SOURCE_KEY_CHAR_CEILING),
  text: z.string().trim().min(1).max(CANON_FACT_SOURCE_CHAR_CEILING),
});

export type CanonFactSourceEntry = z.infer<typeof canonFactSourceSchema>;

/** One place already in the bible — half of the closed subject vocabulary. */
export const canonFactPlaceSchema = z.strictObject({
  name: label,
  summary: prose(CANON_FACT_CHAR_CEILINGS.eventSummary).nullable(),
});

export type CanonFactPlace = z.infer<typeof canonFactPlaceSchema>;

/**
 * One event of the chronology, as the ask shows it.
 *
 * It carries its day because a period bound is an **independent assertion by
 * the canon** — `CanonFact`'s own doc comment says so, and calls it
 * `declaredAge`'s pattern rather than CAL-012's drifting copy. A model asked to
 * date a fact without seeing the chronology's own axis would either invent a
 * number or decline to give one; shown the axis, it states a day the detector
 * can then compare (CAL-093, CAL-099).
 */
export const canonFactEventSchema = z.strictObject({
  name: label,
  summary: prose(CANON_FACT_CHAR_CEILINGS.eventSummary),
  /** Days from the day the novel opens, negative before it — or null. */
  absoluteDay: z.int().nullable(),
  dateLabel: prose(CANON_FACT_CHAR_CEILINGS.boundLabel).nullable(),
});

export type CanonFactEvent = z.infer<typeof canonFactEventSchema>;

/**
 * A fact the bible already holds — including one the author **rejected**.
 *
 * `CanonFactStatus`' own doc comment gives the reason the rejected ones are
 * kept: *so re-extraction can deduplicate against what the author already
 * refused instead of re-proposing it forever*. That sentence names this field.
 * Two columns and no more, because what identifies an already-answered question
 * is what it says, not how it was scoped.
 */
export const knownCanonFactSchema = z.strictObject({
  statement: prose(CANON_FACT_CHAR_CEILINGS.knownStatement),
  isTrue: z.boolean(),
});

export type KnownCanonFact = z.infer<typeof knownCanonFactSchema>;

/**
 * What one extraction was asked — the payload `Generation.input` carries and
 * `generationIdempotencyKey` digests (CAL-058).
 *
 * Content-addressed as every bible ask is: the corpus, the cast, the places and
 * the chronology travel as text, so editing any of them is a different ask while
 * a job the queue redelivers is the same one. `knownFacts` is part of the ask
 * for the same reason — extracting again after the author has confirmed and
 * rejected is a genuinely different question.
 *
 * The cast's floor is one and the places' is zero: a fact may concern nobody,
 * but a bible with no character at all has nothing for a belief to attach to.
 * The checks run **before** any generation (principle 6.5).
 */
export const initialCanonFactsInputSchema = z
  .strictObject({
    /** The source text version the bible was produced against. */
    sourceTextVersionId: z.string().trim().min(1),
    /** The canonical direction the bible serves. */
    directionId: z.string().trim().min(1),
    freedomLevel: z.enum(FREEDOM_LEVELS),
    cast: z
      .array(establishedCharacterSchema)
      .min(CANON_FACT_LIST_COUNTS.cast.min)
      .max(CANON_FACT_LIST_COUNTS.cast.max),
    places: z
      .array(canonFactPlaceSchema)
      .min(CANON_FACT_LIST_COUNTS.places.min)
      .max(CANON_FACT_LIST_COUNTS.places.max),
    events: z
      .array(canonFactEventSchema)
      .min(CANON_FACT_LIST_COUNTS.events.min)
      .max(CANON_FACT_LIST_COUNTS.events.max),
    knownFacts: z
      .array(knownCanonFactSchema)
      .min(CANON_FACT_LIST_COUNTS.knownFacts.min)
      .max(CANON_FACT_LIST_COUNTS.knownFacts.max),
    sources: z
      .array(canonFactSourceSchema)
      .min(CANON_FACT_SOURCE_COUNTS.min)
      .max(CANON_FACT_SOURCE_COUNTS.max),
  })
  .check((ctx) => {
    const duplicate = (
      list: "cast" | "places" | "events" | "sources",
      field: "name" | "key",
      values: readonly string[],
      message: string,
    ): void => {
      const seen = new Set<string>();

      values.forEach((value, index) => {
        if (seen.has(value)) {
          ctx.issues.push({
            code: "custom",
            message,
            path: [list, index, field],
            input: ctx.value,
          });
        }
        seen.add(value);
      });
    };

    duplicate(
      "cast",
      "name",
      ctx.value.cast.map((member) => member.name),
      "one character offered twice in a canon fact ask",
    );
    duplicate(
      "places",
      "name",
      ctx.value.places.map((place) => place.name),
      "one place offered twice in a canon fact ask",
    );
    duplicate(
      "events",
      "name",
      ctx.value.events.map((event) => event.name),
      "one event offered twice in a canon fact ask",
    );
    duplicate(
      "sources",
      "key",
      ctx.value.sources.map((source) => source.key),
      "one source key offered twice in a canon fact ask",
    );
  });

export type InitialCanonFactsInput = z.infer<typeof initialCanonFactsInputSchema>;

/**
 * The passage a fact rests on, and the corpus entry it came out of.
 *
 * Verbatim and continuous, never stitched — `createVerbatimMatcher` refuses a
 * quotation with a hole, which is the whole point of the rule the analysis
 * established: stitching fragments back together is how a sentence nobody wrote
 * comes to be believed.
 */
export const canonFactBasisSchema = z.strictObject({
  /** Must name a key the ask offered — held by `./verify`. */
  sourceKey: z.string().trim().min(1).max(CANON_FACT_SOURCE_KEY_CHAR_CEILING),
  quotation: prose(CANON_FACT_CHAR_CEILINGS.quotation),
});

export type CanonFactBasis = z.infer<typeof canonFactBasisSchema>;

/** What one fact is about — one `CanonFactSubject` row, named rather than keyed. */
export const canonFactSubjectSchema = z.strictObject({
  kind: z.enum(CANON_FACT_SUBJECT_KINDS),
  /** Must name a member of the ask's cast or places — held by `./verify`. */
  name: label,
});

export type CanonFactSubjectDeclaration = z.infer<typeof canonFactSubjectSchema>;

/**
 * One character's stance on one fact — one `CanonFactBelief` row.
 *
 * A row means the author has decided, and an absent one means they have not,
 * which is weaker than `UNAWARE`: the column's own doc comment draws that
 * distinction and warns against conflating the two. So a character the answer
 * says nothing about is a character with no row, never an implied `UNAWARE`.
 */
export const canonFactBeliefSchema = z.strictObject({
  /** Must name a member of the ask's cast — held by `./verify`. */
  characterName: label,
  state: z.enum(CANON_FACT_BELIEF_STATES),
});

export type CanonFactBeliefDeclaration = z.infer<typeof canonFactBeliefSchema>;

/**
 * One end of a period, as `CanonFact` stores it — the day, how exactly it is
 * known, and the author's own wording beside the number rather than instead of
 * it.
 *
 * All three required, where `canon_facts_validity_check` accepts a bound that is
 * words alone. That is deliberate and it is CAL-093's demand one table over: a
 * words-only bound makes `factInForceOn` answer `null`, and a fact no checker
 * can place is a fact the canon cannot defend.
 */
export const canonFactBoundSchema = z
  .strictObject({
    /** Days from the day the novel opens, negative before it. */
    day: z.int(),
    precision: z.enum(TIMELINE_PRECISIONS),
    label: prose(CANON_FACT_CHAR_CEILINGS.boundLabel),
  })
  .check((ctx) => {
    if (Math.abs(ctx.value.day) > TIMELINE_DAY_BOUND) {
      ctx.issues.push({
        code: "custom",
        message: "a bound sits further from the opening than the axis reaches",
        path: ["day"],
        input: ctx.value,
      });
    }
  });

export type CanonFactBound = z.infer<typeof canonFactBoundSchema>;

/**
 * What every fact carries, whatever its temporal shape.
 *
 * The statement is affirmative and the polarity lives in `isTrue`, exactly as
 * the column requires — which is what lets a planted rumour enter the canon as
 * data without entering it as truth, and what makes two opposite facts
 * comparable to a detector instead of two sentences to a reader.
 */
const canonFactCoreSchema = z.strictObject({
  /** One assertion, affirmative, atomic — held by `./atomicity`. */
  statement: prose(CANON_FACT_CHAR_CEILINGS.statement),
  /** Its truth in the world of the novel, never in anyone's mind. */
  isTrue: z.boolean(),
  basis: canonFactBasisSchema,
  subjects: z
    .array(canonFactSubjectSchema)
    .min(CANON_FACT_LIST_COUNTS.subjects.min)
    .max(CANON_FACT_LIST_COUNTS.subjects.max),
  /** Who holds a stance on it, and which. */
  knownBy: z
    .array(canonFactBeliefSchema)
    .min(CANON_FACT_LIST_COUNTS.knownBy.min)
    .max(CANON_FACT_LIST_COUNTS.knownBy.max),
});

/**
 * *Permanent* — and the shape says it, because there is no bound field here to
 * leave empty. `num_nonnulls(…) = 0`, as a type.
 */
export const permanentFactSchema = canonFactCoreSchema;

export type PermanentFact = z.infer<typeof permanentFactSchema>;

/**
 * *Vrai pendant une période* — placed by at least one bound, and never by an
 * event, which mirrors `canon_facts_validity_check`'s middle branch.
 *
 * Both bounds are required-but-nullable (CAL-077): a period open at one end is
 * an answer given rather than a field skipped. Both ends inclusive, and when
 * both are numbered the first never exceeds the second —
 * `canon_facts_period_order_check`, restated so a fact that parses is a fact
 * that inserts.
 */
export const periodFactSchema = canonFactCoreSchema
  .extend({
    validFrom: canonFactBoundSchema.nullable(),
    validUntil: canonFactBoundSchema.nullable(),
  })
  .check((ctx) => {
    const fact = ctx.value;

    const refuse = (message: string, path: string): void => {
      ctx.issues.push({ code: "custom", message, path: [path], input: ctx.value });
    };

    if (fact.validFrom === null && fact.validUntil === null) {
      refuse("a period fact is placed by neither of its bounds", "validFrom");
    }

    if (fact.validFrom !== null && fact.validUntil !== null) {
      // Equal bounds are a fact true a single day, which the constraint allows
      // and this contract has no reason to refuse.
      if (fact.validFrom.day > fact.validUntil.day) {
        refuse("a period fact ends before it starts", "validUntil");
      }
    }
  });

export type PeriodFact = z.infer<typeof periodFactSchema>;

/**
 * *Faux après un événement donné* — placed by its event and by nothing else,
 * which mirrors `canon_facts_validity_check`'s last branch.
 *
 * The fact holds strictly **before** that event's day and no longer on it: the
 * event is the moment the world changes, and the day it happens already belongs
 * to the changed world. `factInForceOn` reads it that way and the column's doc
 * comment says it in those words.
 */
export const endedFactSchema = canonFactCoreSchema.extend({
  /** Must name an event the ask offered — held by `./verify`, never an id (§6). */
  endedByEventName: label,
});

export type EndedFact = z.infer<typeof endedFactSchema>;

/**
 * One composed statement, and the atomic facts it was broken into.
 *
 * The backlog's requirement is that a composite fact *soit décomposé en faits
 * élémentaires liés*, and nothing in a flat list of facts can show that the work
 * was done rather than that half the content was quietly dropped. Declaring it
 * makes it checkable, and `./verify` checks three things: the parts exist and
 * are distinct, they are at least two, and — the half that cannot be filled when
 * the declaration is fake — `composite` must itself **fail** the statement
 * checker. A decomposition of something already atomic is padding.
 *
 * `factIndexes` point into `flattenCanonFacts`, which reads the three lists in
 * the order they are declared below. Positions rather than statements repeated:
 * a repeated statement would be a second copy able to drift from the fact it
 * names, and §6 forbids handing a model an identifier to choose.
 */
export const factDecompositionSchema = z.strictObject({
  /** The composed wording this was broken out of — never stored, only checked. */
  composite: prose(CANON_FACT_CHAR_CEILINGS.composite),
  factIndexes: z
    .array(z.int())
    .min(CANON_FACT_LIST_COUNTS.decomposedFacts.min)
    .max(CANON_FACT_LIST_COUNTS.decomposedFacts.max),
});

export type FactDecomposition = z.infer<typeof factDecompositionSchema>;

/**
 * The answer to `extract-initial-facts`: the canon of the bible, one atomic
 * statement at a time.
 *
 * *Atomic* is the adjective the backlog puts first and it is not a description
 * of what came back — it is what this contract, `./atomicity` and `./verify`
 * together refuse to do without. A composite fact is invisible to every detector
 * downstream, because nothing can contradict half of one.
 */
export const initialCanonFactsSchema = z
  .strictObject({
    /** permanent */
    permanentFacts: z
      .array(permanentFactSchema)
      .min(CANON_FACT_LIST_COUNTS.permanentFacts.min)
      .max(CANON_FACT_LIST_COUNTS.permanentFacts.max),
    /** vrai pendant une période */
    periodFacts: z
      .array(periodFactSchema)
      .min(CANON_FACT_LIST_COUNTS.periodFacts.min)
      .max(CANON_FACT_LIST_COUNTS.periodFacts.max),
    /** faux après un événement donné */
    endedFacts: z
      .array(endedFactSchema)
      .min(CANON_FACT_LIST_COUNTS.endedFacts.min)
      .max(CANON_FACT_LIST_COUNTS.endedFacts.max),
    decompositions: z
      .array(factDecompositionSchema)
      .min(CANON_FACT_LIST_COUNTS.decompositions.min)
      .max(CANON_FACT_LIST_COUNTS.decompositions.max),
  })
  .check((ctx) => {
    const total =
      ctx.value.permanentFacts.length + ctx.value.periodFacts.length + ctx.value.endedFacts.length;

    if (total < CANON_FACT_TOTAL_COUNTS.min) {
      ctx.issues.push({
        code: "custom",
        message: "a canon holds fewer facts than the contract's floor",
        path: ["permanentFacts"],
        input: ctx.value,
      });
    }

    if (total > CANON_FACT_TOTAL_COUNTS.max) {
      ctx.issues.push({
        code: "custom",
        message: "a canon holds more facts than the contract's ceiling",
        path: ["permanentFacts"],
        input: ctx.value,
      });
    }
  });

export type InitialCanonFacts = z.infer<typeof initialCanonFactsSchema>;

/**
 * The answer's three fact lists, **in the order everything indexes by**.
 *
 * A tuple rather than a derivation over the object's keys, so the pairing with
 * `CanonFactValidity` is stated once and can be pinned — `./rows` maps it and
 * `schema.test.ts` asserts the pairing is total.
 */
export const CANON_FACT_LISTS = ["permanentFacts", "periodFacts", "endedFacts"] as const;

export type CanonFactList = (typeof CANON_FACT_LISTS)[number];

/**
 * The temporal case each list *is* — the answer's only route to
 * `CanonFact.validity`, and the reason no field of the answer declares one.
 *
 * Written here beside the lists rather than in `./rows`, so that the pairing and
 * the vocabulary it pairs are one declaration. `schema.test.ts` pins it total
 * over both sides, which is what stops a fourth list appearing with no case or a
 * case going unclaimed.
 */
export const CANON_FACT_VALIDITY_BY_LIST: Readonly<Record<CanonFactList, CanonFactValidity>> = {
  permanentFacts: "PERMANENT",
  periodFacts: "DURING_PERIOD",
  endedFacts: "UNTIL_EVENT",
};

/** One fact of the answer, whichever list it came out of. */
export type AnsweredCanonFact = PermanentFact | PeriodFact | EndedFact;
