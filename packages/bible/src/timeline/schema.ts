/**
 * What `build-timeline` is asked and what it is allowed to return (CAL-093, §6).
 *
 * The sixth bible mission, and the specification's *Chronologie* (§5.6): les
 * événements antérieurs au roman, les événements prévus, l'âge des personnages
 * à chaque événement, les durées entre les événements.
 *
 * The backlog's acceptance criterion is an **absence** — *la chronologie
 * générée ne contient aucun âge ni aucune durée incompatible* — and it names
 * the reason it is hard: this is where a model produces silent arithmetic
 * errors, *un personnage de 34 ans qui avait 12 ans il y a 30 ans*. A firmer
 * prompt does not close that; a calculation does (`./arithmetic`). What this
 * contract owes the calculation is a shape it can actually read.
 *
 * **The redundancy is the mechanism, and CAL-017 built the schema for it.**
 * `TimelineEvent` stores two placements that may disagree, deliberately: *the
 * disagreement is the inconsistent duration CAL-093 has to detect, and a schema
 * that made them mutually exclusive would delete the evidence before the
 * detector could read it.* The same holds one level up.
 * `TimelineEventParticipant.declaredAge` is what the text asserts, never a
 * cache of the computation — it is the thing the computation is compared
 * *against*, and without it *detect an incompatible age* has no left-hand side.
 * So this contract asks the model to state one instant more than one way, on
 * purpose, and `./arithmetic` is what turns that redundancy into detection.
 *
 * **Two arrays, not a category field.** `backstoryEvents` and `plannedEvents`
 * are separate, and `resolveTimelineEvents` (`./rows`) writes
 * `TimelineEvent.category` from **which array the entry came out of** —
 * CAL-092's `isSupernatural` device, for §6's reason, and CAL-080's warning
 * that a demand a model can evade by declaration teaches it to lie in the
 * declaration. It buys two things beyond that:
 *
 *   1. `NARRATED` becomes **unrepresentable** rather than merely absent from a
 *      union. The initial chronology cannot narrate anything — nothing is
 *      written yet — and integrating the events actually told is CAL-133's,
 *      which is why the backlog's content line for this task says *antérieurs*
 *      and *prévus* and stops there.
 *   2. A category that disagrees with its own day becomes two independent
 *      statements contradicting each other, which is something a calculation
 *      can see. Declared as one field beside a number, it would be a
 *      self-report, and a self-report is what the split exists to refuse.
 *
 * **Two demands the column deliberately does not make.** A column must accept
 * an author entering a timeline half-way through; a mission is where one can
 * demand. So `declaredAge` is **required** here while
 * `timeline_event_participants_declared_age_check` leaves it nullable, and
 * every event must **resolve to a day** (`event-undated`, checked in
 * `./arithmetic` because resolution spans rows) while
 * `timeline_events_placement_check` accepts a bare ordering anchor. Without
 * either, a model could satisfy this schema and leave the calculation nothing
 * to read — which is the same failure the two-array split closes, one field
 * over.
 *
 * **This schema holds a row; `./arithmetic` holds what spans rows.** Five of
 * the six CHECK constraints `20260808113131_add_timeline` carries are mirrored
 * below, so a chronology that parses is a chronology that inserts. The sixth —
 * `timeline_events_distinct_preceding_check` — is not, because it compares
 * identifiers and this contract carries names: a self-anchor is caught in
 * `./verify`, where the verbatim matcher lives and where *the same name typed
 * twice ways* is one name. That boundary is CAL-017's own, restated: what no
 * CHECK can express is exactly what the detector owns.
 *
 * **No score, structurally** (cahier des charges 1195–1199), as CAL-075,
 * CAL-076, CAL-079, CAL-081, CAL-088, CAL-089, CAL-091 and CAL-092 — with the
 * one carve-out that is not one. `absoluteDay`, `daysAfterPreceding` and
 * `declaredAge` are numbers, and every one of them measures **time**, never
 * quality: the day axis is a position, a duration is a length, an age is an
 * age. `schema.test.ts` walks the parsed answer and pins that the numeric paths
 * are exactly those three, which is the same assertion `age` earns in the
 * character sheet.
 */

import { FREEDOM_LEVELS } from "@calepin/shared/freedom-level";
import { z } from "zod";

import { CHARACTER_LABEL_CHAR_CEILING, establishedCharacterSchema } from "../character/schema";
import { ceilingFor } from "../identity/schema";

/**
 * The `TimelinePrecision` members, spelled as the enum spells them — the §4.2
 * carve-out, `CHARACTER_IMPORTANCES`' reason: the list follows the column.
 * `prisma/schema.test.ts` pins the pair.
 *
 * The schema stores the choice; what each member *means in days* is a narrative
 * rule and lives in `./arithmetic`, which is where CAL-017 left it.
 */
export const TIMELINE_PRECISIONS = ["DAY", "MONTH", "SEASON", "YEAR", "DECADE"] as const;

export type TimelinePrecisionInput = (typeof TIMELINE_PRECISIONS)[number];

/** The French gloss the prompt quotes beside each precision. */
export const TIMELINE_PRECISION_LABELS: Readonly<Record<TimelinePrecisionInput, string>> = {
  DAY: "au jour près",
  MONTH: "au mois près",
  SEASON: "à la saison près",
  YEAR: "à l'année près",
  DECADE: "à la décennie près",
};

/**
 * The `TimelineEventCategory` members, spelled as the enum spells them — the
 * same carve-out and the same pin.
 */
export const TIMELINE_EVENT_CATEGORIES = ["BACKSTORY", "NARRATED", "PLANNED"] as const;

export type TimelineEventCategoryInput = (typeof TIMELINE_EVENT_CATEGORIES)[number];

/**
 * The two an *initial* chronology writes, in the order the day axis puts them.
 *
 * A strict subset, and the strictness is the point rather than an omission: at
 * the moment this mission runs no chapter exists, so no event has been
 * narrated. It is a tuple rather than a filter over the enum so that the pairing
 * with the answer's two arrays is stated once and can be pinned — `rows.ts`
 * indexes it, and `schema.test.ts` asserts both that it is a subset and that
 * `NARRATED` is not in it.
 */
export const TIMELINE_INITIAL_CATEGORIES = ["BACKSTORY", "PLANNED"] as const;

export type TimelineInitialCategory = (typeof TIMELINE_INITIAL_CATEGORIES)[number];

/**
 * How many entries the chronology's lists carry.
 *
 * Backstory: three at least. One is a premise and two are a pair; a past a
 * later chapter can actually draw on takes a third, and the floor is a demand
 * for prioritisation rather than for invention (CAL-076's argument). Twenty at
 * most, past which the ask has become a family history.
 *
 * Planned: five at least — the novel's own spine, and fewer than five events
 * for a whole novel is an outline refusing to commit. Forty at most: this is
 * the chronology, not the chapter plan (CAL-102 owns that), so a number that
 * approaches a chapter count has stopped being a different level of detail.
 *
 * Participants: **may be empty**, and that is load-bearing in the same way
 * `outOfNormCapabilities`' zero floor is. An event of the world rather than of
 * a person — a war breaks out, a law passes — names nobody, and a floor of one
 * would produce an invented presence, which is precisely the kind of assertion
 * the arithmetic would then have to check.
 */
export const TIMELINE_LIST_COUNTS = {
  backstoryEvents: { min: 3, max: 20 },
  plannedEvents: { min: 5, max: 40 },
  participants: { min: 0, max: 12 },
  cast: { min: 1, max: 40 },
} as const;

/**
 * How many passages one ask carries — `WORLD_SOURCE_COUNTS`'s reasoning: two at
 * least so the chronology answers to more than one upstream, and a generous
 * ceiling that refuses a dump (§5.8) without shaping the composer's granularity.
 */
export const TIMELINE_SOURCE_COUNTS = { min: 2, max: 64 } as const;

/** The longest passage one source entry carries — a section, never a text. */
export const TIMELINE_SOURCE_CHAR_CEILING = 8_000;

/** The longest key or label the composer may give one source. */
export const TIMELINE_SOURCE_KEY_CHAR_CEILING = 80;

/**
 * An event's name is a heading, not a paragraph — and it is the handle
 * everything else in this contract points at: `precedingEventName` anchors to
 * it, and `TimelineEvent` carries `@@unique([bibleId, name])` so it is what a
 * locked event will be cited by when it blocks a generation (CAL-095).
 */
export const TIMELINE_LABEL_CHAR_CEILING = 80;

/**
 * The furthest the day axis may reach, either side of the opening.
 *
 * Ten thousand years, which is past any chronology a novel needs and well
 * inside the `int4` the column is. Bounded rather than open because an
 * unbounded contract would let through a value the `INSERT` refuses, and
 * because it keeps the birth-day arithmetic in `./arithmetic` far from the
 * range where an integer stops being exact.
 */
export const TIMELINE_DAY_BOUND = 3_650_000;

/**
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern.
 */
export const TIMELINE_WORD_TARGETS = {
  /** One event, told for what the novel needs of it — not a scene. */
  summary: 40,
  /** The author's own wording of when it happens: *printemps 1892*. */
  dateLabel: 10,
} as const;

/** The character ceilings the schemas below enforce. */
export const TIMELINE_CHAR_CEILINGS = {
  summary: ceilingFor(TIMELINE_WORD_TARGETS.summary),
  dateLabel: ceilingFor(TIMELINE_WORD_TARGETS.dateLabel),
} as const;

/**
 * Where a passage of the corpus comes from — the four upstreams a chronology
 * answers to.
 *
 * The world's three plus `world` itself, and both halves of that are argued.
 * `world` is in because a chronology is placed in an era and runs under the
 * rules that era allows: how long a journey takes, what a person can survive,
 * whether a century is a plausible gap. `style` is out for the reason
 * `worldBibleInputSchema` states — nothing in a date, a duration or an age
 * reads a register, and an unused input would make the idempotency digest
 * reopen the chronology on every retune of the prose (CAL-058).
 */
export const TIMELINE_SOURCE_KINDS = ["direction", "identity", "world", "analysis"] as const;

export type TimelineSourceKind = (typeof TIMELINE_SOURCE_KINDS)[number];

const label = z.string().trim().min(1).max(TIMELINE_LABEL_CHAR_CEILING);

function prose(ceiling: number): z.ZodString {
  return z.string().trim().min(1).max(ceiling);
}

/**
 * One passage the chronology stays answerable to — `worldSourceSchema`'s shape
 * with this contract's own vocabulary. Context, not a citation vocabulary: no
 * basis is asked of the answer, CAL-089's and CAL-090's regime, because a
 * chronology invents the novel's past rather than quoting it.
 */
export const timelineSourceSchema = z.strictObject({
  kind: z.enum(TIMELINE_SOURCE_KINDS),
  key: z.string().trim().min(1).max(TIMELINE_SOURCE_KEY_CHAR_CEILING),
  /** French, what the model reads above the passage. */
  label: z.string().trim().min(1).max(TIMELINE_SOURCE_KEY_CHAR_CEILING),
  text: z.string().trim().min(1).max(TIMELINE_SOURCE_CHAR_CEILING),
});

export type TimelineSource = z.infer<typeof timelineSourceSchema>;

/**
 * One character already in the bible, as the ask offers them — the closed
 * vocabulary `participants[].characterName` must land in, plus the one number
 * every age check is anchored to.
 *
 * `establishedCharacterSchema` extended rather than restated, so the cast a
 * chronology is shown is the same shape a sheet and a relations ask are shown.
 * `ageAtOpening` is `Character.age`: the age **on day 0**, the day the novel
 * opens, which is the instant the column names for it. Required-but-nullable
 * (CAL-077), and the null carries real weight rather than covering an edge
 * case. A character born *during* the novel has no age at the opening at all —
 * their age there would be negative, and `characters_age_check` forbids that —
 * so the honest answer is null, and `./arithmetic` folds them from their
 * presences alone. Writing `0` instead is the trap: it asserts a birth within
 * the year *before* the opening, which then contradicts every later presence
 * and reports a conflict in a chronology that has none.
 */
export const timelineCastMemberSchema = establishedCharacterSchema
  .extend({
    ageAtOpening: z.int().nullable(),
  })
  .check((ctx) => {
    // `characters_age_check` backstops the same bound at the row.
    if (ctx.value.ageAtOpening !== null && ctx.value.ageAtOpening < 0) {
      ctx.issues.push({
        code: "custom",
        message: "a character's age at the opening cannot be negative",
        path: ["ageAtOpening"],
        input: ctx.value,
      });
    }
  });

export type TimelineCastMember = z.infer<typeof timelineCastMemberSchema>;

/**
 * One character present at one event, and how old the chronology says they are
 * there.
 *
 * `declaredAge` is **required**, where the column is nullable, and that single
 * difference is what makes the age arithmetic unevadable. The specification
 * asks for *l'âge des personnages à chaque événement*: it is a deliverable, not
 * an option. Left nullable, a model could place every character at every event
 * and assert nothing, satisfying the contract while leaving `./arithmetic`
 * with no statement to intersect — CAL-080's lesson, applied to a number
 * instead of to a declaration.
 *
 * Non-negative, mirroring `timeline_event_participants_declared_age_check`, and
 * unbounded above for `Character.age`'s reason: a character can be eight
 * hundred. A character present *before their birth* is therefore not expressed
 * as a negative age here — it comes out of the fold as an age no birth day can
 * satisfy, which is the same finding reached without a special case.
 */
export const timelineParticipantSchema = z
  .strictObject({
    /** Must name a member of the ask's cast — held by `./verify`. */
    characterName: label,
    /** The age the chronology asserts for them at this event. */
    declaredAge: z.int(),
  })
  .check((ctx) => {
    if (ctx.value.declaredAge < 0) {
      ctx.issues.push({
        code: "custom",
        message: "a declared age cannot be negative",
        path: ["declaredAge"],
        input: ctx.value,
      });
    }
  });

export type TimelineParticipant = z.infer<typeof timelineParticipantSchema>;

/**
 * One event of the chronology, placed the two ways `TimelineEvent` stores.
 *
 * Every field is required-but-nullable rather than optional (CAL-077): an
 * absence is written, never elided, so *this event carries no absolute date* is
 * an answer given rather than a field the model forgot. The five checks below
 * are the row constraints `20260808113131_add_timeline` already holds, restated
 * here so a chronology that parses is a chronology that inserts — and so a
 * malformed placement is refused before a single arithmetic conclusion is drawn
 * from it (§6: parse first, then use).
 */
export const timelineEventSchema = z
  .strictObject({
    /** Unique within the chronology — `@@unique([bibleId, name])`, held by `./verify`. */
    name: label,
    /** What happens, told for what the novel needs of it. */
    summary: prose(TIMELINE_CHAR_CEILINGS.summary),
    /**
     * Days from the day the novel opens, negative before it.
     *
     * When the date is known less exactly than to the day, this is the **middle**
     * of what the label covers, not its first day — *printemps 1892* is the
     * midpoint of the season. The convention is not decoration: `./arithmetic`
     * reads `datePrecision` as a half-width either side of this number, so a
     * chronology writing first days instead would be judged against a window
     * shifted off the period it meant. The prompt states it in those words.
     */
    absoluteDay: z.int().nullable(),
    /** How far either side of that day the truth may sit — set exactly when the day is. */
    datePrecision: z.enum(TIMELINE_PRECISIONS).nullable(),
    /** The author-facing wording of the date, in the novel's own calendar. */
    dateLabel: prose(TIMELINE_CHAR_CEILINGS.dateLabel).nullable(),
    /** The event this one is placed after, named — never an identifier (§6). */
    precedingEventName: label.nullable(),
    /** Days since that event. */
    daysAfterPreceding: z.int().nullable(),
    /** How exactly that duration is known — set exactly when the duration is. */
    durationPrecision: z.enum(TIMELINE_PRECISIONS).nullable(),
    /** Who is there, and how old they are — the arithmetic's left-hand side. */
    participants: z
      .array(timelineParticipantSchema)
      .min(TIMELINE_LIST_COUNTS.participants.min)
      .max(TIMELINE_LIST_COUNTS.participants.max),
  })
  .check((ctx) => {
    const event = ctx.value;

    const refuse = (message: string, path: string): void => {
      ctx.issues.push({ code: "custom", message, path: [path], input: ctx.value });
    };

    // `timeline_events_placement_check`: an event placed by neither is not part
    // of a chronology at all.
    if (event.absoluteDay === null && event.precedingEventName === null) {
      refuse("a timeline event carries neither a date nor an anchor", "absoluteDay");
    }

    // `timeline_events_absolute_date_check`: a day with no precision claims an
    // exactness nobody stated, and a precision with no day qualifies nothing.
    if ((event.absoluteDay === null) !== (event.datePrecision === null)) {
      refuse("a timeline date needs its day and its precision together", "datePrecision");
    }

    // `timeline_events_relative_date_check`, both halves.
    if (event.daysAfterPreceding !== null && event.precedingEventName === null) {
      refuse("a duration needs the event it is counted from", "precedingEventName");
    }

    if ((event.daysAfterPreceding === null) !== (event.durationPrecision === null)) {
      refuse(
        "a timeline duration needs its length and its precision together",
        "durationPrecision",
      );
    }

    // `timeline_events_duration_sign_check`. Zero is allowed: two events may be
    // simultaneous, and the chronology says so by counting no days between them.
    if (event.daysAfterPreceding !== null && event.daysAfterPreceding < 0) {
      refuse("a duration since the preceding event cannot be negative", "daysAfterPreceding");
    }

    if (event.absoluteDay !== null && Math.abs(event.absoluteDay) > TIMELINE_DAY_BOUND) {
      refuse("a day sits further from the opening than the axis reaches", "absoluteDay");
    }

    if (event.daysAfterPreceding !== null && event.daysAfterPreceding > TIMELINE_DAY_BOUND) {
      refuse("a duration is longer than the axis reaches", "daysAfterPreceding");
    }
  });

export type TimelineEvent = z.infer<typeof timelineEventSchema>;

/**
 * The answer to `build-timeline`: the events before the novel opens, and the
 * events it plans to tell.
 *
 * The adjective names the bar. A chronology whose events do not resolve to days
 * and whose presences state no ages is a chronology nothing can be computed
 * from, and computing is the whole task — so *dated* is not a description of
 * what came back, it is what the contract and `./arithmetic` together refuse to
 * do without.
 */
export const datedTimelineSchema = z.strictObject({
  /** événements antérieurs au roman */
  backstoryEvents: z
    .array(timelineEventSchema)
    .min(TIMELINE_LIST_COUNTS.backstoryEvents.min)
    .max(TIMELINE_LIST_COUNTS.backstoryEvents.max),
  /** événements prévus */
  plannedEvents: z
    .array(timelineEventSchema)
    .min(TIMELINE_LIST_COUNTS.plannedEvents.min)
    .max(TIMELINE_LIST_COUNTS.plannedEvents.max),
});

export type DatedTimeline = z.infer<typeof datedTimelineSchema>;

/** Which of the answer's two lists an event or a finding belongs to. */
export const TIMELINE_EVENT_LISTS = ["backstoryEvents", "plannedEvents"] as const;

export type TimelineEventList = (typeof TIMELINE_EVENT_LISTS)[number];

/**
 * What one chronology was asked — the payload `Generation.input` carries and
 * `generationIdempotencyKey` digests (CAL-058).
 *
 * Content-addressed as every bible ask is: the corpus and the cast travel as
 * text, so editing the world or sheeting another character is a different ask,
 * while a job the queue redelivers is the same one.
 *
 * The cast is not context here, unlike in a world ask — it is the closed
 * vocabulary the answer's presences must land in **and** the anchor of every
 * age check, which is why it carries `ageAtOpening` and why its floor is one. A
 * chronology asked with no cast could not be checked at all: there would be
 * nothing for a declared age to contradict.
 *
 * No audience and no target length: no field of a chronology reads either, and
 * an input the answer never uses would make the digest reopen the chronology
 * whenever one is retuned. The checks run **before** any generation
 * (principle 6.5).
 */
export const bibleTimelineInputSchema = z
  .strictObject({
    /** The source text version the upstreams were produced against. */
    sourceTextVersionId: z.string().trim().min(1),
    /** The canonical direction the chronology serves. */
    directionId: z.string().trim().min(1),
    freedomLevel: z.enum(FREEDOM_LEVELS),
    cast: z
      .array(timelineCastMemberSchema)
      .min(TIMELINE_LIST_COUNTS.cast.min)
      .max(TIMELINE_LIST_COUNTS.cast.max),
    sources: z
      .array(timelineSourceSchema)
      .min(TIMELINE_SOURCE_COUNTS.min)
      .max(TIMELINE_SOURCE_COUNTS.max),
  })
  .check((ctx) => {
    const seenNames = new Set<string>();

    ctx.value.cast.forEach((member, index) => {
      if (seenNames.has(member.name)) {
        ctx.issues.push({
          code: "custom",
          message: "one character offered twice in a timeline ask",
          path: ["cast", index, "name"],
          input: ctx.value,
        });
      }
      seenNames.add(member.name);
    });

    const seenKeys = new Set<string>();

    ctx.value.sources.forEach((source, index) => {
      if (seenKeys.has(source.key)) {
        ctx.issues.push({
          code: "custom",
          message: "one source key offered twice in a timeline ask",
          path: ["sources", index, "key"],
          input: ctx.value,
        });
      }
      seenKeys.add(source.key);
    });
  });

export type BibleTimelineInput = z.infer<typeof bibleTimelineInputSchema>;

/**
 * The longest a cast name may be, re-exported from the character sheet's own
 * ceiling so the two cannot drift: a name the sheet accepted must be a name a
 * chronology can carry.
 */
export const TIMELINE_CAST_NAME_CHAR_CEILING = CHARACTER_LABEL_CHAR_CEILING;
