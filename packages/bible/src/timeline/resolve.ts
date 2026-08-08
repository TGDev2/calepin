/**
 * Reconstructing a chronology in order (CAL-017).
 *
 * The schema stores two ways of placing an event — a day on the axis, and an
 * anchor with an optional duration — and an event may carry both. Putting the
 * two together into one order is a narrative rule, so it lives here rather than
 * in a query: PostgreSQL can sort the dated events, but not the ones that are
 * only known to come after another.
 */

import { fail, type Result, succeed, ValidationError } from "@calepin/shared/errors";

import type { ResolvedTimelineEvent, TimelinePlacement } from "./types";

/**
 * Where an event sits, once its chain has been walked.
 *
 * `day` is the position on the axis, `null` when the chain never reaches an
 * absolute date. `baseDay` is the day of the nearest dated ancestor, which is
 * what an undated event is ordered by: an event known only to happen after one
 * dated at day 100 belongs just after it, not at the end of the chronology.
 * `hops` counts the steps since that ancestor, so a chain keeps its own order,
 * and `rootId` groups the chains that never reach a date at all.
 */
interface Placement {
  day: number | null;
  baseDay: number | null;
  rootId: string;
  hops: number;
}

const CYCLE_MESSAGE = "timeline chain contains a cycle";
const DANGLING_ANCHOR_MESSAGE = "timeline anchor is absent from the given events";

/**
 * Every event of a bible, in chronological order, with the day each resolves
 * to.
 *
 * The order is total and deterministic. It reads:
 *
 * 1. by the day of the nearest dated ancestor — the event's own day when it has
 *    one, so dated events sort by date and an undated event follows the last
 *    date known before it;
 * 2. then by distance from that date, so a chain stays in its own order;
 * 3. then by id, so two events the data cannot separate still come back in the
 *    same order on every read.
 *
 * Chains that never reach a date come last, grouped by chain rather than
 * interleaved — an order the data does not support is not invented, but the
 * order it does support is never lost either.
 *
 * Two inputs are refused rather than guessed at, both as values (§7): a cycle,
 * which no order can satisfy and which the database cannot forbid beyond the
 * one-step case, and an anchor absent from the list, which means the caller
 * passed a partial chronology and would silently receive a partial order.
 */
export function resolveTimeline<TEvent extends TimelinePlacement>(
  events: readonly TEvent[],
): Result<ResolvedTimelineEvent<TEvent>[], ValidationError> {
  const byId = new Map<string, TEvent>(events.map((event) => [event.id, event]));
  const placements = new Map<string, Placement>();
  const visiting = new Set<string>();

  let failure: ValidationError | undefined;

  function place(event: TEvent): Placement | undefined {
    const known = placements.get(event.id);
    if (known !== undefined) return known;

    if (visiting.has(event.id)) {
      // The row-level check forbids an event anchored to itself; a longer loop
      // spans rows and only shows up here.
      failure ??= new ValidationError({
        message: CYCLE_MESSAGE,
        fieldPath: "precedingEventId",
        userMessage:
          "La chronologie contient une boucle : un événement finit par se précéder lui-même. Corrigez l'enchaînement pour pouvoir la remettre dans l'ordre.",
      });
      return undefined;
    }

    visiting.add(event.id);
    const placement = placeUnvisited(event);
    visiting.delete(event.id);

    if (placement !== undefined) placements.set(event.id, placement);
    return placement;
  }

  function placeUnvisited(event: TEvent): Placement | undefined {
    // A stated date roots the chain here, whatever anchor the event also
    // carries. The two disagreeing is the inconsistency CAL-093 reports, and
    // reporting it is not this function's job — ordering by the author's own
    // date is the reading that does not silently overrule them.
    if (event.absoluteDay !== null) {
      return { day: event.absoluteDay, baseDay: event.absoluteDay, rootId: event.id, hops: 0 };
    }

    if (event.precedingEventId === null) {
      // Unreachable through the database: timeline_events_placement_check makes
      // an event with neither placement unstorable. Handled anyway, because a
      // caller may build a list by hand and an unplaced event still has to come
      // back somewhere rather than disappear.
      return { day: null, baseDay: null, rootId: event.id, hops: 0 };
    }

    const anchor = byId.get(event.precedingEventId);
    if (anchor === undefined) {
      failure ??= new ValidationError({
        message: DANGLING_ANCHOR_MESSAGE,
        fieldPath: "precedingEventId",
      });
      return undefined;
    }

    const anchorPlacement = place(anchor);
    if (anchorPlacement === undefined) return undefined;

    const day =
      anchorPlacement.day !== null && event.daysAfterPreceding !== null
        ? anchorPlacement.day + event.daysAfterPreceding
        : null;

    return {
      day,
      baseDay: day ?? anchorPlacement.baseDay,
      rootId: anchorPlacement.rootId,
      hops: day === null ? anchorPlacement.hops + 1 : 0,
    };
  }

  const resolved: { event: TEvent; placement: Placement }[] = [];
  for (const event of events) {
    const placement = place(event);
    if (placement === undefined) return fail(failure ?? new ValidationError());
    resolved.push({ event, placement });
  }

  resolved.sort((left, right) => compare(left, right));

  return succeed(resolved.map(({ event, placement }) => ({ event, day: placement.day })));
}

function compare(
  left: { event: TimelinePlacement; placement: Placement },
  right: { event: TimelinePlacement; placement: Placement },
): number {
  const a = left.placement;
  const b = right.placement;

  if (a.baseDay === null || b.baseDay === null) {
    // An undated chain comes after everything the axis can place.
    if (a.baseDay !== b.baseDay) return a.baseDay === null ? 1 : -1;
    if (a.rootId !== b.rootId) return a.rootId < b.rootId ? -1 : 1;
  } else if (a.baseDay !== b.baseDay) {
    return a.baseDay - b.baseDay;
  }

  if (a.hops !== b.hops) return a.hops - b.hops;
  if (a.rootId !== b.rootId) return a.rootId < b.rootId ? -1 : 1;

  // The last resort, and it is not decoration: without it two events the data
  // cannot separate would come back in whatever order the database returned
  // them, so the same chronology would render differently on two reads.
  return left.event.id < right.event.id ? -1 : left.event.id > right.event.id ? 1 : 0;
}
