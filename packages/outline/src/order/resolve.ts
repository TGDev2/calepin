/**
 * Reading the plan in order, and numbering it (CAL-019).
 *
 * The database stores where every row sits — a part's key inside the plan, a
 * chapter's key inside its part — and stores no number at all. Turning the two
 * keys into "chapter 7 of 42" is a rule, so it lives here rather than in a
 * query, exactly as `resolveTimeline` turns two placements into a chronology.
 *
 * That the number is computed is the point, not an inconvenience. A stored one
 * is rewritten by every insertion and every move, and anything that cited it
 * would follow it to the wrong chapter.
 */

import { fail, type Result, succeed, ValidationError } from "@calepin/shared/errors";

import { compareOrderKeys } from "./key";
import type {
  NumberedChapter,
  OrderedChapter,
  OrderedPart,
  ResolvedOutline,
  ResolvedPart,
} from "./types";

const UNKNOWN_PART_MESSAGE = "chapter belongs to a part absent from the given plan";

/**
 * Every part in order, every chapter in order inside its part, and the number
 * each chapter carries — counted across the whole novel, so the first chapter
 * of the second part follows the last of the first.
 *
 * A chapter naming a part that is not in the list is refused as a value (§7)
 * rather than dropped: it means the caller passed a partial plan and would
 * otherwise get a numbering that silently skips chapters — the same reading
 * `resolveTimeline` gives a dangling anchor.
 *
 * The order is total and deterministic. Two rows the keys cannot separate fall
 * back to their id, so the same plan renders identically on two reads; the
 * database forbids the tie in the first place, `@@unique([partId, orderKey])`.
 */
export function resolveOutline<TPart extends OrderedPart, TChapter extends OrderedChapter>(
  parts: readonly TPart[],
  chapters: readonly TChapter[],
): Result<ResolvedOutline<TPart, TChapter>, ValidationError> {
  const grouped = new Map<string, TChapter[]>(parts.map((part) => [part.id, []]));

  for (const chapter of chapters) {
    const siblings = grouped.get(chapter.partId);
    if (siblings === undefined) {
      return fail(
        new ValidationError({ message: UNKNOWN_PART_MESSAGE, fieldPath: "chapter.partId" }),
      );
    }
    siblings.push(chapter);
  }

  const orderedParts = [...parts].sort(byOrderKeyThenId);
  const resolvedParts: ResolvedPart<TPart, TChapter>[] = [];
  const flat: NumberedChapter<TChapter>[] = [];

  for (const part of orderedParts) {
    const numbered = (grouped.get(part.id) ?? []).sort(byOrderKeyThenId).map((chapter) => {
      const entry = { chapter, number: flat.length + 1 };
      flat.push(entry);
      return entry;
    });

    resolvedParts.push({ part, chapters: numbered });
  }

  return succeed({ parts: resolvedParts, chapters: flat });
}

function byOrderKeyThenId(left: OrderedPart, right: OrderedPart): number {
  const byKey = compareOrderKeys(left.orderKey, right.orderKey);
  if (byKey !== 0) return byKey;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
