/**
 * Traceability — the pattern CAL-073 establishes and the bible, the outline and
 * the chapters reuse.
 *
 * The specification's principle 4.2 asks that the origin of every element stay
 * readable after the author has edited it. Three rules make that true, and all
 * three are here rather than in a domain, because a domain may not import a
 * domain (§3.2) and four epics need the same answer.
 *
 * **1. An element has an identity that outlives the revision holding it.**
 * Every container this pattern applies to is append-only — a section revision,
 * a chapter revision — so editing writes *new* rows and the old ones stay as
 * they were. A row is therefore the wrong place to hang the identity of the
 * thing it holds: nothing could be carried forward, and nothing could point at
 * an element across two revisions. That identity is a `lineageId`, minted when
 * an element first appears and copied by every later revision that keeps it.
 * It is what carries provenance below, and what lets an annotation survive a
 * rewrite of the section around it.
 *
 * **2. Origin is monotone.** `originAfterEdit` never returns `GENERATED` — a
 * human edit cannot make an element the model's again, and once an element is
 * the author's it stays the author's. Only a generation writes `GENERATED`, and
 * it writes new content with it. That monotonicity *is* "l'origine reste
 * lisible après édition", written as a total function instead of as a habit a
 * caller has to remember.
 *
 * **3. Being validated is derived, never stored.** An element still marked
 * `GENERATED` inside a revision a person authored is one that person read and
 * kept — `accepted`. Storing that beside the origin would be a second answer
 * able to disagree with the two rows that already hold the first one, which is
 * the reason `AnalysisSectionRevision` carries no `isCurrent` column and
 * `Project.status` is recomputed rather than asserted.
 *
 * Nothing here reads a database, a clock or a text. It is four pure functions
 * over identifiers and enum members, so it carries no literary content by
 * construction (§9) — the content it walks over is opaque to it, compared only
 * through the caller's own `isUnchanged`.
 */

import type { ContentOrigin, ProvenanceState } from "./origins";

/** What the two stored facts say about one element, ready to be resolved. */
export interface Provenance {
  /** The element's own origin — the column. */
  readonly origin: ContentOrigin;
  /**
   * Whether the revision holding the element was authored by a person rather
   * than by a generation. The container's fact, not the element's, which is
   * why it is a parameter here and not a second column there.
   */
  readonly reviewedByAuthor: boolean;
}

/**
 * What to tell the reader about one element.
 *
 * Total over `ContentOrigin`, and the only place the four states are decided.
 * A screen renders what this returns; it never re-derives it from the origin
 * itself, which is how two screens come to disagree.
 */
export function resolveProvenanceState({ origin, reviewedByAuthor }: Provenance): ProvenanceState {
  switch (origin) {
    case "USER_WRITTEN":
      return "user-written";
    case "EDITED":
      return "edited";
    case "GENERATED":
      return reviewedByAuthor ? "accepted" : "proposed";
  }
}

/**
 * The origin an element takes in the revision a person is writing.
 *
 * `previous` is `null` for an element that has no ancestor — the author added
 * it, so it is theirs. An element that came through untouched keeps whatever it
 * had, which is the rule the whole pattern exists for: a proposal the author
 * left alone is still visibly a proposal, ten edits of its neighbours later.
 */
export function originAfterEdit(previous: ContentOrigin | null, changed: boolean): ContentOrigin {
  if (previous === null) return "USER_WRITTEN";
  if (!changed) return previous;

  // Not a ternary on `previous === "GENERATED"`: the point is that the only
  // member this function may return for an element that had an ancestor is
  // EDITED or USER_WRITTEN, and never GENERATED. Spelling both out says so.
  return previous === "USER_WRITTEN" ? "USER_WRITTEN" : "EDITED";
}

/** One element of the revision being replaced, keyed by lineage by the caller. */
export interface PreviousElement<T> {
  readonly origin: ContentOrigin;
  readonly content: T;
}

/** One element as the author submitted it. `lineageId` is null for a new one. */
export interface SubmittedElement<T> {
  readonly lineageId: string | null;
  readonly content: T;
}

/** One element of the revision about to be written. */
export interface CarriedElement<T> {
  /** `null` when the element is new and the store must mint a lineage for it. */
  readonly lineageId: string | null;
  readonly origin: ContentOrigin;
  readonly content: T;
}

export interface CarryProvenanceInput<T> {
  /**
   * The current revision's elements by lineage, **in position order** — the
   * order is what `unchanged` compares against, so an insertion-ordered `Map`
   * is required rather than merely convenient.
   */
  readonly previous: ReadonlyMap<string, PreviousElement<T>>;
  readonly submitted: readonly SubmittedElement<T>[];
  /** Whether the author left this element's content exactly as it was. */
  readonly isUnchanged: (previous: T, submitted: T) => boolean;
}

export interface CarriedProvenance<T> {
  readonly elements: readonly CarriedElement<T>[];
  /**
   * `true` when the submission adds, removes, reorders and rewrites nothing.
   * A caller writes no revision for it, the rule `updateSourceText` already
   * applies to a form posted back untouched: a history padded with duplicates
   * is a history nobody can read.
   */
  readonly unchanged: boolean;
}

/**
 * Carries provenance from the current revision of a container into the one the
 * author is about to write.
 *
 * **An unknown lineage is treated as a new element**, never trusted. The value
 * arrives from a form, so it may be stale (a revision written since the page
 * was rendered), it may be a duplicate, and it may be another project's. Minting
 * a fresh lineage for it is the answer that cannot go wrong: the worst case is
 * an element that loses its annotations, against a forged one silently
 * inheriting a stranger's. The store's uniqueness constraint on
 * `(revision, lineage)` is the second half of that guarantee, and this function
 * never hands it a duplicate.
 */
export function carryProvenance<T>({
  previous,
  submitted,
  isUnchanged,
}: CarryProvenanceInput<T>): CarriedProvenance<T> {
  const order = [...previous.keys()];
  const claimed = new Set<string>();
  const elements: CarriedElement<T>[] = [];

  let unchanged = submitted.length === previous.size;

  for (const [index, element] of submitted.entries()) {
    const lineageId = element.lineageId;
    const ancestor =
      lineageId === null || claimed.has(lineageId) ? undefined : previous.get(lineageId);

    if (lineageId === null || ancestor === undefined) {
      elements.push({ lineageId: null, origin: "USER_WRITTEN", content: element.content });
      unchanged = false;
      continue;
    }

    claimed.add(lineageId);

    const changed = !isUnchanged(ancestor.content, element.content);
    if (changed || order[index] !== lineageId) unchanged = false;

    elements.push({
      lineageId,
      origin: originAfterEdit(ancestor.origin, changed),
      content: element.content,
    });
  }

  return { elements, unchanged };
}
