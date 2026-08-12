/**
 * Reads a chronology back against itself and against the ask, before anything
 * is persisted (CAL-093).
 *
 * Two jobs, in that order. The names first — an anchor must name an event that
 * exists, a presence must name somebody in the cast, and nothing may be named
 * twice — and then the arithmetic (`./arithmetic`), which is where the task's
 * acceptance criterion actually lives. The order is not stylistic: an anchor
 * nobody can resolve has no day, and every arithmetic conclusion drawn from it
 * would be a guess about a chronology that cannot be laid out at all.
 *
 * **One regime, and it is refusal.** Every sibling section can repair an answer
 * — drop the duplicate place, clear the quotation that is not there — because
 * their list entries are independent of one another. A chronology's are not.
 * Dropping an event orphans whatever was anchored to it; clearing a declared
 * age deletes the very statement the arithmetic exists to read. There is
 * nothing to drop and nothing to clear, so the answer stands or falls whole:
 * CAL-084's and CAL-088's position, reached from the shape rather than chosen.
 * That is also what the task asks for in so many words — *rejette toute
 * chronologie incohérente en signalant précisément l'incohérence*.
 *
 * **Names are compared through the verbatim matcher's own reduction**
 * (`sameWords`), never by string equality, for `verifyWorldBible`'s reason:
 * typography is what a model retypes wrong, and two spellings of one character
 * are one character. Where a name has to be written back, the **ask's**
 * spelling wins — `resolveCharacterSheet`'s discipline, one section over.
 *
 * Every reported field is an index, a day, an age or a closed identifier —
 * never a name, a summary or a date label, all of which are literary content
 * (§9). What the author reads on screen is built by `apps/web` from these
 * positions and the answer it already holds, the division
 * `project-action-error.ts` draws.
 */

import { sameWords } from "@calepin/shared/text";

import {
  checkTimelineArithmetic,
  type TimelineArithmeticCharacter,
  type TimelineArithmeticEvent,
  type TimelineArithmeticParticipant,
  type TimelineArithmeticReport,
  type TimelineInconsistency,
} from "./arithmetic";
import {
  type BibleTimelineInput,
  type DatedTimeline,
  datedTimelineSchema,
  TIMELINE_INITIAL_CATEGORIES,
  type TimelineEvent,
  type TimelineEventList,
} from "./schema";

/**
 * The brand on `globalThis`'s shared symbol registry via `Symbol.for`, for the
 * reason `VerifiedWorldBible` uses one: the packages are compiled from source
 * into more than one chunk graph (§12), and a `unique symbol` per chunk would
 * be several brands pretending to be one.
 */
export const VERIFIED_BIBLE_TIMELINE_BRAND: unique symbol = Symbol.for(
  "calepin.VerifiedBibleTimeline",
);

/**
 * A chronology that went through `verifyBibleTimeline` — minted only there,
 * never serialised: a value that crossed JSON has lost the brand and must be
 * re-verified, not trusted.
 *
 * `resolveTimelineEvents` and `resolveTimelineParticipants` (`./rows`) take
 * this and not a `DatedTimeline`, which is what turns the acceptance criterion
 * — *la chronologie générée ne contient aucun âge ni aucune durée incompatible*
 * — from a rule somebody has to remember into a thing the type system will not
 * let a caller skip.
 */
export type VerifiedBibleTimeline = DatedTimeline & {
  readonly [VERIFIED_BIBLE_TIMELINE_BRAND]: true;
};

export function isVerifiedBibleTimeline(value: unknown): value is VerifiedBibleTimeline {
  return typeof value === "object" && value !== null && VERIFIED_BIBLE_TIMELINE_BRAND in value;
}

/**
 * What verification decided. Refused: nothing is salvaged, and the remedy —
 * re-ask, or show the author — is the caller's. Verified: the chronology to
 * keep, with the report of what the calculation was actually able to establish.
 */
export type BibleTimelineVerification =
  | {
      readonly outcome: "refused";
      readonly inconsistencies: readonly TimelineInconsistency[];
    }
  | {
      readonly outcome: "verified";
      readonly timeline: VerifiedBibleTimeline;
      readonly report: TimelineArithmeticReport;
    };

/**
 * The two lists flattened into the one order everything downstream indexes by:
 * the backstory, then the plan.
 *
 * A single sequence is what lets an anchor cross from one list to the other —
 * a planned event is very often placed relative to something in the past — and
 * what lets `./arithmetic` stay ignorant of the answer's shape entirely.
 */
export function flattenTimeline(answer: DatedTimeline): readonly TimelineEvent[] {
  return [...answer.backstoryEvents, ...answer.plannedEvents];
}

/**
 * Which of the answer's own lists a flat index falls in, and where.
 *
 * The translation a screen needs: `./arithmetic` reports positions in the
 * flattened chronology, because that is the only vocabulary a database row and
 * a model answer share, and an author reads *the third planned event*. Null for
 * an index outside the answer, which is a caller's mistake rather than a
 * chronology's.
 */
export function locateTimelineEvent(
  answer: DatedTimeline,
  eventIndex: number,
): { readonly list: TimelineEventList; readonly index: number } | null {
  if (!Number.isInteger(eventIndex) || eventIndex < 0) return null;

  if (eventIndex < answer.backstoryEvents.length) {
    return { list: "backstoryEvents", index: eventIndex };
  }

  const index = eventIndex - answer.backstoryEvents.length;

  return index < answer.plannedEvents.length ? { list: "plannedEvents", index } : null;
}

/**
 * Reads a parsed answer back against the ask and against arithmetic.
 *
 * The answer has already been parsed by `datedTimelineSchema` (§6), so every
 * placement is well formed on its own row — a day has its precision, a duration
 * has its anchor and is not negative, an age is not negative. What is left is
 * everything that spans rows, which is the whole of what a CHECK constraint
 * cannot see and the whole of what this task exists to catch.
 */
export function verifyBibleTimeline(
  answer: DatedTimeline,
  input: BibleTimelineInput,
): BibleTimelineVerification {
  const events = flattenTimeline(answer);

  // Gate one. With two events sharing a name there is no fact of the matter
  // about which one an anchor names, so resolving anchors afterwards would be
  // picking one and reporting on a chronology nobody wrote.
  const duplicates = findDuplicateNames(events);
  if (duplicates.length > 0) return { outcome: "refused", inconsistencies: duplicates };

  // Gate two. Every name the answer uses must land in a vocabulary the ask
  // closed or the answer itself declared; an unresolved one has no index, and
  // an index is all `./arithmetic` speaks.
  const references: TimelineInconsistency[] = [];
  const resolved = events.map((event, index) =>
    resolveEvent(event, index, events, input, answer.backstoryEvents.length, references),
  );

  if (references.length > 0) return { outcome: "refused", inconsistencies: references };

  const characters: readonly TimelineArithmeticCharacter[] = input.cast.map((member) => ({
    ageAtOpening: member.ageAtOpening,
  }));

  const report = checkTimelineArithmetic({
    events: resolved.map((entry) => entry.arithmetic),
    characters,
  });

  if (!report.consistent) {
    return { outcome: "refused", inconsistencies: report.inconsistencies };
  }

  const settled = resolved.map((entry) => entry.settled);

  return {
    outcome: "verified",
    timeline: mint({
      backstoryEvents: settled.slice(0, answer.backstoryEvents.length),
      plannedEvents: settled.slice(answer.backstoryEvents.length),
    }),
    report,
  };
}

/**
 * Two events of one chronology carrying one name.
 *
 * `TimelineEvent` holds `@@unique([bibleId, name])`, so a chronology that
 * verifies is a chronology that inserts — `verifyWorldBible`'s rule, and the
 * failure it avoids is the same one: an answer that passes here and dies at the
 * second statement of a transaction that has already written half a bible.
 */
function findDuplicateNames(events: readonly TimelineEvent[]): readonly TimelineInconsistency[] {
  const found: TimelineInconsistency[] = [];

  events.forEach((event, index) => {
    const first = events.findIndex((other) => sameWords(other.name, event.name));

    if (first !== index) {
      found.push({ kind: "duplicate-event-name", eventIndex: index, firstEventIndex: first });
    }
  });

  return found;
}

/**
 * One event, twice over: as positions, which is all `./arithmetic` speaks, and
 * as the event itself with every name it uses **rewritten to the established
 * spelling** — the anchor to the name of the event it resolved to, each
 * presence to the name the ask offered.
 *
 * `resolveCharacterSheet`'s discipline, and it is what makes `./rows` a
 * projection rather than a second resolution: business code looking a name up
 * to reach a `Character.id` or the row it must anchor to finds it spelled
 * exactly as the row spells it, whatever typography the model used.
 */
function resolveEvent(
  event: TimelineEvent,
  index: number,
  events: readonly TimelineEvent[],
  input: BibleTimelineInput,
  backstoryCount: number,
  found: TimelineInconsistency[],
): { readonly arithmetic: TimelineArithmeticEvent; readonly settled: TimelineEvent } {
  let precedingEventIndex: number | null = null;
  let precedingEventName: string | null = null;

  if (event.precedingEventName !== null) {
    const target = event.precedingEventName;
    const anchor = events.findIndex((other) => sameWords(other.name, target));

    if (anchor === -1) {
      found.push({ kind: "unknown-anchor", eventIndex: index });
    } else if (anchor === index) {
      // `timeline_events_distinct_preceding_check` holds the same line at the
      // row, on identifiers; here the two ends are names, which is why the
      // comparison is the matcher's rather than the column's.
      found.push({ kind: "self-anchor", eventIndex: index });
    } else {
      precedingEventIndex = anchor;
      precedingEventName = events[anchor]?.name ?? null;
    }
  }

  const participants: TimelineArithmeticParticipant[] = [];
  const settledParticipants: TimelineEvent["participants"][number][] = [];
  const takenBy = new Map<number, number>();

  event.participants.forEach((participant, participantIndex) => {
    const characterIndex = input.cast.findIndex((member) =>
      sameWords(member.name, participant.characterName),
    );

    if (characterIndex === -1) {
      found.push({ kind: "unknown-character", eventIndex: index, participantIndex });
      return;
    }

    const first = takenBy.get(characterIndex);

    if (first !== undefined) {
      // `@@unique([eventId, characterId])`. Resolved to the cast position first,
      // so two spellings of one character are caught as the one presence the
      // table would have refused.
      found.push({
        kind: "duplicate-participant",
        eventIndex: index,
        participantIndex,
        firstParticipantIndex: first,
      });
      return;
    }

    takenBy.set(characterIndex, participantIndex);
    participants.push({ characterIndex, declaredAge: participant.declaredAge });
    settledParticipants.push({
      characterName: input.cast[characterIndex]?.name ?? participant.characterName,
      declaredAge: participant.declaredAge,
    });
  });

  return {
    arithmetic: {
      // The category is written from which of the answer's two lists the event
      // came out of — `flattenTimeline` put the backstory first — and never
      // from a field the model filled in. §6 applied to a marker, and CAL-092's
      // arrangement for `isSupernatural`.
      category:
        index < backstoryCount ? TIMELINE_INITIAL_CATEGORIES[0] : TIMELINE_INITIAL_CATEGORIES[1],
      absoluteDay: event.absoluteDay,
      datePrecision: event.datePrecision,
      precedingEventIndex,
      daysAfterPreceding: event.daysAfterPreceding,
      durationPrecision: event.durationPrecision,
      participants,
    },
    settled: { ...event, precedingEventName, participants: settledParticipants },
  };
}

/**
 * Re-parsed before the brand goes on, `verifyWorldBible`'s discipline: the
 * names were rewritten to their established spellings above, so this value was
 * reassembled here, and the schema is the only authority on whether what was
 * reassembled is still a chronology.
 */
function mint(timeline: DatedTimeline): VerifiedBibleTimeline {
  const parsed = datedTimelineSchema.safeParse(timeline);

  if (!parsed.success) {
    throw new Error("a verified chronology no longer parses", { cause: parsed.error });
  }

  return { ...parsed.data, [VERIFIED_BIBLE_TIMELINE_BRAND]: true };
}
