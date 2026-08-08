/**
 * The shapes the plan is reasoned about in (CAL-019).
 *
 * Structural, not Prisma types: a narrative rule must run without a database
 * (CLAUDE.md §8), and the repository layer that will read these rows does not
 * exist yet (CAL-023). A caller passes its own row type and gets its own row
 * type back.
 */

/** What placing a part in the plan needs, and nothing else. */
export interface OrderedPart {
  id: string;
  orderKey: string;
}

/** What placing a chapter in the plan needs: its part, and its place in it. */
export interface OrderedChapter {
  id: string;
  partId: string;
  orderKey: string;
}

/**
 * A chapter with the number a reader sees.
 *
 * The number is here and not on the row. It is a rendering of the position —
 * recomputed on every read, continuous across the parts, and therefore
 * impossible to leave stale after a move. Nothing ever stores it, so nothing
 * can cite it: a reference is an id.
 */
export interface NumberedChapter<TChapter> {
  chapter: TChapter;
  number: number;
}

/** One part of the plan, with its chapters in reading order. */
export interface ResolvedPart<TPart, TChapter> {
  part: TPart;
  chapters: NumberedChapter<TChapter>[];
}

/**
 * The plan in reading order, twice over: grouped by part, which is how the plan
 * screen shows it (CAL-104), and flat, which is how the manuscript reads it.
 * Both hold the same chapter objects with the same numbers.
 */
export interface ResolvedOutline<TPart, TChapter> {
  parts: ResolvedPart<TPart, TChapter>[];
  chapters: NumberedChapter<TChapter>[];
}
