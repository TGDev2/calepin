/**
 * The calculatory validation of a chronology (CAL-093).
 *
 * The backlog asks for *une validation calculatoire post-génération,
 * indépendante du modèle, qui vérifie la cohérence arithmétique des âges, des
 * dates et des durées*. Independence is the load-bearing word: nothing here
 * asks anything of a model, and nothing here reads the answer's own opinion of
 * itself. It reads numbers and decides whether they can all be true at once.
 *
 * **Independent of the answer, too.** Every reference is an **index** into the
 * arrays the caller handed in — never a name, never an identifier. That buys
 * three things at once. A database row satisfies this input as readily as a
 * model's answer, which is what lets CAL-133 re-run the same arithmetic over
 * the events a chapter actually told and CAL-131 read it for the *âge
 * incompatible avec la chronologie* control. It keeps the rule runnable with no
 * database, which is what §8 asks of a rule. And it makes the report §9-safe by
 * construction rather than by care: there is no field a name or a summary could
 * occupy.
 *
 * **What it answers, and what it does not.** Arithmetic, never plausibility. It
 * can say that a character cannot be 34 now and have been 12 thirty years ago;
 * it cannot say whether an event should exist, whether a gap is dramatically
 * right, or whether a past is interesting. That is the line every verifier in
 * this package draws — provenance, never sufficiency — moved one field over.
 *
 * **Erring permissive is the correct direction.** CAL-017 recorded the reason
 * when it made an age an interval rather than a number: *a detector that cries
 * wolf is turned off, and then the requirement is lost rather than met.* So
 * every comparison here is widened by the uncertainty the chronology itself
 * declares, by the drift a 365-day year accumulates against the calendar
 * (`leapDayAllowance`), and by nothing else. A finding means the numbers cannot
 * be reconciled **even at their most forgiving reading**.
 *
 * **What that costs, stated rather than hidden.** An age pins a birth day only
 * to within a year, so two ages a year apart from the truth can still share a
 * birth day and pass. That is a limit of what an age *is*, not of this
 * implementation — a chronology that also stated birth days could be held much
 * tighter, and `Character` has no column for one. What follows is that the
 * check is decisive about errors of two years and more (the backlog's own
 * example is eight) and only sometimes decisive about one, and that a
 * chronology dated to the decade is barely checked at all. Rather than let
 * silence read as approval, `unverifiableAges` counts the characters the
 * statements failed to pin, and `AGE_VERIFIABILITY_WINDOW_DAYS` is where that
 * line is drawn.
 */

import { DAYS_PER_YEAR } from "./age";
import { resolveTimeline } from "./resolve";
import type { TimelineEventCategoryInput, TimelinePrecisionInput } from "./schema";
import type { TimelinePlacement } from "./types";

/**
 * How far a stated moment may be off, in days, for each precision — half the
 * width of what the member denotes.
 *
 * CAL-017 stored the precision and deliberately left the interpretation here:
 * *the tolerance in days behind each `TimelinePrecision` member is a narrative
 * rule that belongs to the detector.* This is that rule, stated once.
 *
 * The numbers are half-widths because a stated day is the middle of what the
 * label covers: *printemps 1892* names about ninety days, so the day it stands
 * for is within forty-five of the one written down. `DAY` is zero, which is
 * what makes an exact chronology checked exactly.
 */
export const TIMELINE_PRECISION_TOLERANCE_DAYS: Readonly<Record<TimelinePrecisionInput, number>> = {
  DAY: 0,
  MONTH: 15,
  SEASON: 45,
  YEAR: 182,
  DECADE: 1_826,
};

/**
 * Every way a chronology can fail to add up.
 *
 * Closed, and closed on purpose: a report that named its findings in prose
 * could not be logged (§9) and could not be branched on. The first five are
 * about how the events are placed, the next two about what the placement then
 * implies, and the last three about who is present and how old they are.
 *
 * `duplicate-event-name`, `unknown-character` and `duplicate-participant` are
 * produced by `./verify` rather than here — they are questions about names, and
 * this module has none. They share this vocabulary because they end up in one
 * report: the author is shown *what is wrong with this chronology*, not a
 * taxonomy of which pass noticed it.
 */
export const TIMELINE_INCONSISTENCY_KINDS = [
  "duplicate-event-name",
  "unknown-anchor",
  "self-anchor",
  "chain-cycle",
  "event-undated",
  "date-contradicts-chain",
  "chain-runs-backwards",
  "category-contradicts-day",
  "unknown-character",
  "duplicate-participant",
  "age-conflict",
] as const;

export type TimelineInconsistencyKind = (typeof TIMELINE_INCONSISTENCY_KINDS)[number];

/** Where one assertion about a character's age comes from. */
export const TIMELINE_AGE_STATEMENT_SOURCES = ["cast", "participation"] as const;

export type TimelineAgeStatementSource = (typeof TIMELINE_AGE_STATEMENT_SOURCES)[number];

/**
 * One assertion that a character is a given age at a given moment.
 *
 * The two sources are the two independent things the bible says about an age,
 * and the whole age check is the question of whether they can agree.
 * `Character.age` is an age at day 0 — the day the novel opens, which is the
 * instant the column names for it — and each presence at an event is another,
 * elsewhere on the axis.
 *
 * `eventIndex` and `participantIndex` are null exactly when the source is the
 * cast, CAL-077's discipline: an absence written rather than a field omitted.
 */
export interface TimelineAgeStatement {
  readonly source: TimelineAgeStatementSource;
  /** Position in the cast the caller handed in. */
  readonly characterIndex: number;
  /** Position in the chronology, or null for the cast's own statement. */
  readonly eventIndex: number | null;
  /** Position within that event's presences, or null for the cast's. */
  readonly participantIndex: number | null;
  /** Where on the axis the assertion is made. */
  readonly day: number;
  /** How far that day could be off. Zero at the opening, which is the origin. */
  readonly toleranceDays: number;
  readonly declaredAge: number;
}

/**
 * One thing that does not add up, and everything a caller needs to say where —
 * positions, days, ages and closed identifiers, and nothing else (§9).
 *
 * A union rather than one shape with a dozen nullable fields, because *signaler
 * précisément l'incohérence* is the requirement: what a reader needs to be told
 * about a contradicted date is two days and a tolerance, and what they need to
 * be told about an age is the two statements that cannot both hold. Flattening
 * those into one interface would make every consumer re-derive which fields are
 * meaningful for which kind.
 */
export type TimelineInconsistency =
  /** Two events of one chronology carry the same name — `@@unique([bibleId, name])`. */
  | {
      readonly kind: "duplicate-event-name";
      readonly eventIndex: number;
      readonly firstEventIndex: number;
    }
  /** The anchor names an event that is not in the chronology handed in. */
  | { readonly kind: "unknown-anchor"; readonly eventIndex: number }
  /** An event placed after itself. */
  | { readonly kind: "self-anchor"; readonly eventIndex: number }
  /** A loop no order can satisfy, reported once, at the event that closes it. */
  | { readonly kind: "chain-cycle"; readonly eventIndex: number }
  /** The chain never reaches a date, so nothing about this event is computable. */
  | { readonly kind: "event-undated"; readonly eventIndex: number }
  /** The stated date and the duration since the anchor name different days. */
  | {
      readonly kind: "date-contradicts-chain";
      readonly eventIndex: number;
      readonly anchorEventIndex: number;
      readonly statedDay: number;
      readonly impliedDay: number;
      /** The combined slack the two readings were allowed before disagreeing. */
      readonly toleranceDays: number;
    }
  /**
   * Anchored after an event it is dated before — the sign error the duration
   * check cannot see, because this pair states no duration to disagree with.
   */
  | {
      readonly kind: "chain-runs-backwards";
      readonly eventIndex: number;
      readonly anchorEventIndex: number;
      readonly day: number;
      readonly anchorDay: number;
      readonly toleranceDays: number;
    }
  /** Placed before the opening but dated after it, or the other way round. */
  | {
      readonly kind: "category-contradicts-day";
      readonly eventIndex: number;
      readonly category: TimelineEventCategoryInput;
      readonly day: number;
      readonly toleranceDays: number;
    }
  /** A presence names somebody who is not in the cast. */
  | {
      readonly kind: "unknown-character";
      readonly eventIndex: number;
      readonly participantIndex: number;
    }
  /** One character present twice at one event — `@@unique([eventId, characterId])`. */
  | {
      readonly kind: "duplicate-participant";
      readonly eventIndex: number;
      readonly participantIndex: number;
      readonly firstParticipantIndex: number;
    }
  /** Two assertions about one character's age that no birth day satisfies. */
  | {
      readonly kind: "age-conflict";
      readonly characterIndex: number;
      /**
       * The statements that cannot be reconciled with the reading most of the
       * others agree on — the culprits, not merely a pair that happens to
       * disagree.
       *
       * A pair would be sound (on a line, an empty intersection always has a
       * disjoint pair in it) and routinely misleading. When a character is 34 at
       * the opening and correctly 20 twenty years earlier, those two statements
       * fix **the same** birth window, so a fold reporting *the last two that
       * clashed* can name the correct statement and never mention the bible's
       * own age. Reporting what disagrees with the consensus names the one
       * number the author has to change, and names all of them at once when
       * there are several.
       */
      readonly outliers: readonly TimelineAgeStatement[];
      /** How many statements the reading they contradict accounts for. */
      readonly agreeing: number;
    };

/** One character present at one event, as the arithmetic reads it. */
export interface TimelineArithmeticParticipant {
  /** Position in the cast — never a name and never an identifier (§6). */
  readonly characterIndex: number;
  /**
   * The age the chronology asserts here, or null when it asserts none.
   *
   * Nullable although the mission's own contract requires it, because a
   * database row's is nullable: a presence the author typed in asserts nothing
   * until they say so, and a statement nobody made cannot contradict one.
   */
  readonly declaredAge: number | null;
}

/** One event, reduced to what the arithmetic reads of it. */
export interface TimelineArithmeticEvent {
  readonly category: TimelineEventCategoryInput;
  readonly absoluteDay: number | null;
  readonly datePrecision: TimelinePrecisionInput | null;
  /** Position in this same array — never a name and never an identifier (§6). */
  readonly precedingEventIndex: number | null;
  readonly daysAfterPreceding: number | null;
  readonly durationPrecision: TimelinePrecisionInput | null;
  readonly participants: readonly TimelineArithmeticParticipant[];
}

/** One character, reduced to the one number an age is anchored to. */
export interface TimelineArithmeticCharacter {
  /** `Character.age` — the age on day 0, or null when the bible does not say. */
  readonly ageAtOpening: number | null;
}

export interface TimelineArithmeticInput {
  readonly events: readonly TimelineArithmeticEvent[];
  readonly characters: readonly TimelineArithmeticCharacter[];
}

/**
 * What the calculation found. `consistent` is the one boolean a caller branches
 * on; the rest is counts and findings, all safe to log (§9).
 *
 * `ageStatements` is worth reporting rather than obvious: a chronology that
 * passes with two age statements has been checked far less than one that passes
 * with sixty, and nothing downstream can recover the number afterwards without
 * re-reading the chronology.
 */
export interface TimelineArithmeticReport {
  readonly consistent: boolean;
  readonly events: number;
  readonly ageStatements: number;
  /**
   * How many characters the age statements left too loosely pinned to have
   * excluded an error of a whole year — see `AGE_VERIFIABILITY_WINDOW_DAYS`.
   *
   * Reported because **silence must not read as approval**. A chronology dated
   * entirely to the decade passes this check trivially: the slack is six years,
   * so no age error of any plausible size can fail it. Without this number a
   * caller cannot tell a chronology that was checked and held from one that
   * could not be checked at all, and a repair loop would read the second as the
   * first. It is a count, so it is safe to log (§9).
   */
  readonly unverifiableAges: number;
  readonly inconsistencies: readonly TimelineInconsistency[];
}

/**
 * The days a character could have been born on, given that they are
 * `declaredAge` on a day known to within `toleranceDays`.
 *
 * The primitive the whole age check is built on, and the reason it is a *birth
 * window* rather than a comparison of ages: a birth day is the one thing all of
 * a character's ages are statements about, so intersecting windows turns any
 * number of assertions into one question with one answer. Comparing ages
 * pairwise answers the same question n² times and reports it n−1 times.
 *
 * An age is completed years — a person is 12 from their twelfth birthday until
 * the day before their thirteenth — so `age(d) = floor((d − b) / Y)`, and
 *
 * ```
 *   a = floor((d − b) / Y)   ⟺   aY ≤ d − b < (a + 1)Y
 *                            ⟺   d − (a + 1)Y < b ≤ d − aY
 * ```
 *
 * which on integer days is the closed range below. Widening `d` by ±t widens
 * both ends by t, and the window is never empty: it is `2t + Y − 1` days wide.
 *
 * This is the same arithmetic as `ageRangeAt` (CAL-017) read from the other
 * end, and `arithmetic.test.ts` pins the two against each other over sampled
 * days so neither can drift into being a second answer able to disagree with
 * the first.
 */
export function birthDayWindow(
  declaredAge: number,
  day: number,
  toleranceDays = 0,
): { readonly earliest: number; readonly latest: number } {
  return {
    earliest: day - toleranceDays - (declaredAge + 1) * DAYS_PER_YEAR + 1,
    latest: day + toleranceDays - declaredAge * DAYS_PER_YEAR,
  };
}

/** How far a moment stated at this precision may be off. Null states nothing. */
export function toleranceOf(precision: TimelinePrecisionInput | null): number {
  return precision === null ? 0 : TIMELINE_PRECISION_TOLERANCE_DAYS[precision];
}

/**
 * The days a 365-day year loses against the calendar the model was counting on.
 *
 * `DAYS_PER_YEAR` is 365 and the Gregorian year is not, so a span of `n` years
 * measured in real dates is about `n / 4` days longer than this axis makes it.
 * Over a lifetime that is enough to push a **correct** chronology past the
 * fold's slack: a character born in July 1832, 59 at an opening in July 1892 and
 * correctly 20 at an event in July 1852, is out by 370 days where the exact
 * arithmetic allows 364 — and is reported as a contradiction that does not
 * exist.
 *
 * One leap day every four years is the allowance, applied per statement, which
 * covers the drift between any two of them. It costs no detection worth having:
 * what it hides is sub-year, and the fold is already blind below a year.
 */
export function leapDayAllowance(years: number): number {
  return Math.ceil(Math.abs(years) / LEAP_YEAR_PERIOD);
}

const LEAP_YEAR_PERIOD = 4;

/**
 * How wide a character's surviving birth window may be before the fold has
 * stopped proving anything.
 *
 * Two years. One statement alone pins a birth to a year — that is the whole of
 * what an age says — so anything at or above two years means the statements
 * failed to narrow each other, and an error of a full year would have passed
 * unseen. The companion condition is arithmetic of a simpler kind: fewer than
 * two statements is nothing to cross-check at all.
 *
 * It is a limit of the method rather than a fault in the chronology, which is
 * why crossing it is counted and never reported as an inconsistency.
 */
export const AGE_VERIFIABILITY_WINDOW_DAYS = 2 * DAYS_PER_YEAR;

/**
 * Reads a chronology's numbers back against each other.
 *
 * The passes run in the order the answers depend on each other, and the first
 * one is a gate rather than a stage: without a sound anchor graph no event has
 * a day, so every later finding would be a guess about a chronology that cannot
 * be laid out at all. Reporting *this event has no date* for forty events
 * because two of them form a loop is exactly the noise that gets a detector
 * switched off, so the graph failures are returned alone.
 */
export function checkTimelineArithmetic(input: TimelineArithmeticInput): TimelineArithmeticReport {
  const { events, characters } = input;

  const graphFailures = checkAnchorGraph(events);

  if (graphFailures.length > 0) {
    return {
      consistent: false,
      events: events.length,
      ageStatements: 0,
      unverifiableAges: characters.length,
      inconsistencies: graphFailures,
    };
  }

  const placements: TimelinePlacement[] = events.map((event, index) => ({
    id: String(index),
    absoluteDay: event.absoluteDay,
    precedingEventId: event.precedingEventIndex === null ? null : String(event.precedingEventIndex),
    daysAfterPreceding: event.daysAfterPreceding,
    dateToleranceDays: toleranceOf(event.datePrecision),
    durationToleranceDays: toleranceOf(event.durationPrecision),
  }));

  const resolved = resolveTimeline(placements);

  if (resolved.ok === false) {
    // Unreachable: `checkAnchorGraph` above refuses every input `resolveTimeline`
    // refuses, and it refuses them with an index this one cannot report. Reaching
    // here means the two disagree about what a sound chain is, which is a defect
    // in this file rather than in a chronology — so it throws (§7).
    throw new Error("a chronology with a sound anchor graph failed to resolve", {
      cause: resolved.error,
    });
  }

  // Back into the caller's own order, so an index in the report is an index in
  // the array that was handed in rather than in the chronological one.
  const dayOf = new Array<number | null>(events.length).fill(null);
  const toleranceDaysOf = new Array<number>(events.length).fill(0);

  for (const entry of resolved.value) {
    const index = Number(entry.event.id);
    dayOf[index] = entry.day;
    toleranceDaysOf[index] = entry.toleranceDays;
  }

  const inconsistencies: TimelineInconsistency[] = [
    ...checkPlacements(events, dayOf, toleranceDaysOf),
  ];

  const statements = collectAgeStatements(events, characters, dayOf, toleranceDaysOf);
  const ages = checkAges(statements, characters.length);

  inconsistencies.push(...ages.inconsistencies);

  return {
    consistent: inconsistencies.length === 0,
    events: events.length,
    ageStatements: statements.length,
    unverifiableAges: ages.unverifiable,
    inconsistencies,
  };
}

/**
 * The anchor graph, before any day is computed.
 *
 * Each event has at most one anchor, so this is a functional graph and a walk
 * down the chain finds a loop without recursion or a stack — which also means
 * a chronology of any size is checked in one pass over each event.
 *
 * A cycle is reported **once**, at the event the walk re-enters: every event in
 * a loop is equally guilty, and naming all of them would tell the author the
 * same fact several times.
 */
function checkAnchorGraph(
  events: readonly TimelineArithmeticEvent[],
): readonly TimelineInconsistency[] {
  const found: TimelineInconsistency[] = [];

  events.forEach((event, index) => {
    const anchor = event.precedingEventIndex;
    if (anchor === null) return;

    if (anchor === index) {
      found.push({ kind: "self-anchor", eventIndex: index });
      return;
    }

    if (!Number.isInteger(anchor) || anchor < 0 || anchor >= events.length) {
      found.push({ kind: "unknown-anchor", eventIndex: index });
    }
  });

  if (found.length > 0) return found;

  const settled = new Array<boolean>(events.length).fill(false);
  const onPath = new Array<boolean>(events.length).fill(false);

  for (let start = 0; start < events.length; start += 1) {
    if (settled[start] === true) continue;

    const path: number[] = [];
    let node: number | null = start;

    while (node !== null) {
      if (onPath[node] === true) {
        found.push({ kind: "chain-cycle", eventIndex: node });
        break;
      }

      if (settled[node] === true) break;

      onPath[node] = true;
      path.push(node);
      node = events[node]?.precedingEventIndex ?? null;
    }

    for (const walked of path) {
      onPath[walked] = false;
      settled[walked] = true;
    }
  }

  return found;
}

/**
 * What each event's resolved day then implies about the event itself: whether
 * it has one at all, whether it sits on the side of the opening its category
 * claims, and whether the two placements agree when it carries both.
 */
function checkPlacements(
  events: readonly TimelineArithmeticEvent[],
  dayOf: readonly (number | null)[],
  toleranceDaysOf: readonly number[],
): readonly TimelineInconsistency[] {
  const found: TimelineInconsistency[] = [];

  events.forEach((event, index) => {
    const day = dayOf[index] ?? null;

    if (day === null) {
      found.push({ kind: "event-undated", eventIndex: index });
      return;
    }

    const toleranceDays = toleranceDaysOf[index] ?? 0;

    // Read at its most forgiving: a backstory event is only wrong when even its
    // earliest reading falls *after* the opening day, and a later one only when
    // even its latest still falls before it.
    //
    // Day 0 itself is deliberately not a contradiction either way. It is the day
    // the novel opens, and the axis counts days: an event earlier that same
    // morning is honestly anterior and has no other day to be written on.
    // Refusing it would be the detector crying wolf over a resolution the schema
    // does not have.
    const contradicted =
      event.category === "BACKSTORY" ? day - toleranceDays > 0 : day + toleranceDays < 0;

    if (contradicted) {
      found.push({
        kind: "category-contradicts-day",
        eventIndex: index,
        category: event.category,
        day,
        toleranceDays,
      });
    }

    const anchorIndex = event.precedingEventIndex;

    // The case CAL-017 built the schema for. An event may carry a stated date
    // *and* a duration since another event; `resolveTimeline` roots it at the
    // stated date rather than overruling the author, and comparing the two is
    // this function's job and nobody else's.
    if (event.absoluteDay === null || anchorIndex === null) return;

    const anchorDay = dayOf[anchorIndex] ?? null;
    if (anchorDay === null) return;

    // No duration to disagree with, but the anchor still says *after*. A stated
    // date that lands before it is the sign error the comparison below cannot
    // see, and it is exactly *une durée incohérente entre deux événements* with
    // the duration left implicit.
    if (event.daysAfterPreceding === null) {
      const slack = toleranceOf(event.datePrecision) + (toleranceDaysOf[anchorIndex] ?? 0);

      if (event.absoluteDay + slack < anchorDay) {
        found.push({
          kind: "chain-runs-backwards",
          eventIndex: index,
          anchorEventIndex: anchorIndex,
          day: event.absoluteDay,
          anchorDay,
          toleranceDays: slack,
        });
      }

      return;
    }

    const impliedDay = anchorDay + event.daysAfterPreceding;
    const slack =
      toleranceOf(event.datePrecision) +
      (toleranceDaysOf[anchorIndex] ?? 0) +
      toleranceOf(event.durationPrecision);

    if (Math.abs(event.absoluteDay - impliedDay) > slack) {
      found.push({
        kind: "date-contradicts-chain",
        eventIndex: index,
        anchorEventIndex: anchorIndex,
        statedDay: event.absoluteDay,
        impliedDay,
        toleranceDays: slack,
      });
    }
  });

  return found;
}

/**
 * Every assertion the chronology makes about somebody's age, in one list.
 *
 * The cast's own is a statement like any other — `Character.age` is an age at
 * day 0 and nothing more — which is what lets one fold handle the case where
 * the bible states an age and the case where it does not. A presence at an
 * event the axis cannot place contributes nothing: an age at an unknown moment
 * constrains no birth day.
 *
 * Sorted so the fold is deterministic and reads forward in time, which is also
 * the order the reported pair comes back in.
 */
function collectAgeStatements(
  events: readonly TimelineArithmeticEvent[],
  characters: readonly TimelineArithmeticCharacter[],
  dayOf: readonly (number | null)[],
  toleranceDaysOf: readonly number[],
): readonly TimelineAgeStatement[] {
  const statements: TimelineAgeStatement[] = [];

  characters.forEach((character, characterIndex) => {
    if (character.ageAtOpening === null) return;

    statements.push({
      source: "cast",
      characterIndex,
      eventIndex: null,
      participantIndex: null,
      day: 0,
      toleranceDays: 0,
      declaredAge: character.ageAtOpening,
    });
  });

  events.forEach((event, eventIndex) => {
    const day = dayOf[eventIndex] ?? null;
    if (day === null) return;

    event.participants.forEach((participant, participantIndex) => {
      if (participant.declaredAge === null) return;
      if (characters[participant.characterIndex] === undefined) return;

      statements.push({
        source: "participation",
        characterIndex: participant.characterIndex,
        eventIndex,
        participantIndex,
        day,
        toleranceDays: toleranceDaysOf[eventIndex] ?? 0,
        declaredAge: participant.declaredAge,
      });
    });
  });

  return statements.sort(compareStatements);
}

function compareStatements(left: TimelineAgeStatement, right: TimelineAgeStatement): number {
  if (left.day !== right.day) return left.day - right.day;
  // The cast's statement first among equals: it is the bible's own, and a
  // conflict reads better anchored to it than to whichever presence sorted
  // first by accident.
  if (left.source !== right.source) return left.source === "cast" ? -1 : 1;
  if (left.eventIndex !== right.eventIndex)
    return (left.eventIndex ?? -1) - (right.eventIndex ?? -1);

  return (left.participantIndex ?? -1) - (right.participantIndex ?? -1);
}

/** The birth days one statement leaves open, calendar drift included. */
interface BirthWindow {
  readonly earliest: number;
  readonly latest: number;
}

/**
 * Per character, the birth days every statement about them leaves open. The
 * intersection running empty **is** the inconsistency, and every age error the
 * chronology can contain is one — a wrong age at an event, a wrong age at the
 * opening, and a character present before they were born all reduce to *no
 * birth day satisfies all of this*.
 *
 * The intersection is checked first and is the whole of the common case: one
 * pass, and a chronology that holds is answered without any of the work below.
 *
 * When it is empty, what is reported is what disagrees with the reading most of
 * the statements support — not a disjoint pair. A pair is always available and
 * is always genuinely in conflict, but it is regularly the wrong two: a correct
 * age stated a whole number of years from the opening pins exactly the window
 * the bible's own `Character.age` pins, so it can absorb the role of *the
 * statement that set the bound* and leave the author reading two statements of
 * which one is right and neither is the anchor. Consensus names the culprits,
 * all of them, in one pass.
 */
function checkAges(
  statements: readonly TimelineAgeStatement[],
  characterCount: number,
): { readonly inconsistencies: readonly TimelineInconsistency[]; readonly unverifiable: number } {
  const inconsistencies: TimelineInconsistency[] = [];
  let unverifiable = 0;

  for (let characterIndex = 0; characterIndex < characterCount; characterIndex += 1) {
    const mine = statements.filter((statement) => statement.characterIndex === characterIndex);

    if (mine.length < 2) {
      // One statement cannot disagree with anything, and none says nothing at
      // all. Counted, because a character the chronology places once is a
      // character whose age was never checked — the quiet half of what
      // `unverifiableAges` exists to report.
      unverifiable += 1;
      continue;
    }

    const windows = mine.map((statement) => windowOf(statement));

    let earliest = Number.NEGATIVE_INFINITY;
    let latest = Number.POSITIVE_INFINITY;

    for (const window of windows) {
      earliest = Math.max(earliest, window.earliest);
      latest = Math.min(latest, window.latest);
    }

    if (earliest <= latest) {
      if (latest - earliest >= AGE_VERIFIABILITY_WINDOW_DAYS) unverifiable += 1;
      continue;
    }

    const outliers = disagreeingWith(mine, windows);

    inconsistencies.push({
      kind: "age-conflict",
      characterIndex,
      outliers,
      agreeing: mine.length - outliers.length,
    });
  }

  return { inconsistencies, unverifiable };
}

function windowOf(statement: TimelineAgeStatement): BirthWindow {
  const exact = birthDayWindow(statement.declaredAge, statement.day, statement.toleranceDays);
  const drift = leapDayAllowance(statement.declaredAge);

  return { earliest: exact.earliest - drift, latest: exact.latest + drift };
}

/**
 * The statements that do not cover the birth day the most of them agree on.
 *
 * The best-supported day is always one window's own earliest, so the candidates
 * are the windows themselves — a scan rather than a sweep, which is the same
 * answer with none of the endpoint bookkeeping, and a character appears in a
 * chronology tens of times rather than thousands.
 *
 * Ties go to a reading the bible's own `Character.age` supports, and then to
 * the statement the fold reached first, which is the earliest in the
 * chronological order `collectAgeStatements` established. Determinism matters
 * here for the reason it matters in `resolveTimeline`'s last comparison: the
 * same chronology must produce the same finding on every read.
 */
function disagreeingWith(
  statements: readonly TimelineAgeStatement[],
  windows: readonly BirthWindow[],
): readonly TimelineAgeStatement[] {
  const covers = (window: BirthWindow | undefined, day: number): boolean =>
    window !== undefined && day >= window.earliest && day <= window.latest;

  let bestDay = 0;
  let bestCount = 0;
  let bestHasCast = false;

  windows.forEach((candidate) => {
    const day = candidate.earliest;
    let count = 0;
    let hasCast = false;

    windows.forEach((window, index) => {
      if (!covers(window, day)) return;

      count += 1;
      if (statements[index]?.source === "cast") hasCast = true;
    });

    if (count > bestCount || (count === bestCount && hasCast && !bestHasCast)) {
      bestDay = day;
      bestCount = count;
      bestHasCast = hasCast;
    }
  });

  return statements.filter((_, index) => !covers(windows[index], bestDay));
}
