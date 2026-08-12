/**
 * The `Part` column values and the thread rows-to-be, from a **verified**
 * answer only (CAL-101).
 *
 * `Part` stores the basculement as one free text; this is where the pair
 * becomes that text — the event, then what it makes irreversible, joined by
 * one fixed French connector — so persistence, when its task comes, is a copy
 * and not a translation. `resolveBibleStyle`'s role, one epic earlier:
 * flattening without erasing, the irreversibility staying visible in the
 * stored text the author reviews.
 *
 * Order is the answer's own: the parts come back in reading order and the
 * fractional order keys are minted at persistence (`orderKeysBetween`), never
 * here. A part's threads come back as the answer's own labels — the indexes
 * resolved, since a stored row has no answer to point into — and matching a
 * label to a `Thread` row, once chapters exist for threads to open in
 * (CAL-102), is business code's, with a live scope in hand (§6).
 */

import type { VerifiedPartStructure } from "./verify";

/**
 * What separates the event from what it makes irreversible in the stored
 * text. A clause, not a bare colon, so the resolved sentence still says what
 * the second half *is* — `STYLE_VIOLATION_CONNECTOR`'s reason, and the same
 * domain-owned French copy: the author reads the words the writing context
 * will quote.
 */
export const PART_TIPPING_POINT_CONNECTOR = "Irréversible :";

/** One thread as `Thread` will store it, label and promise. */
export interface ResolvedThreadRow {
  readonly label: string;
  readonly narrativePromise: string;
}

/** One part's column values, plus the threads it concerns by label. */
export interface ResolvedPartRow {
  readonly title: string;
  readonly dramaticObjective: string;
  readonly initialState: string;
  /** The pair flattened behind `PART_TIPPING_POINT_CONNECTOR`. */
  readonly tippingPoint: string;
  readonly finalState: string;
  readonly threadLabels: readonly string[];
}

export interface ResolvedPartStructure {
  readonly threads: readonly ResolvedThreadRow[];
  /** In the answer's own reading order. */
  readonly parts: readonly ResolvedPartRow[];
}

/** The row values, entry for entry and in the answer's own order. */
export function resolvePartStructure(structure: VerifiedPartStructure): ResolvedPartStructure {
  const threads = structure.threads.map((thread) => ({
    label: thread.label,
    narrativePromise: thread.narrativePromise,
  }));

  return {
    threads,
    parts: structure.parts.map((part) => ({
      title: part.title,
      dramaticObjective: part.dramaticObjective,
      initialState: part.initialState,
      tippingPoint: `${part.tippingPoint.event} ${PART_TIPPING_POINT_CONNECTOR} ${part.tippingPoint.irreversibility}`,
      finalState: part.finalState,
      threadLabels: part.threadIndexes.map((threadIndex) => {
        const thread = threads[threadIndex];

        // The brand promises every index resolves; one that does not is a
        // programming error, not a condition to handle (§7).
        if (thread === undefined) {
          throw new Error("a verified part structure names a thread it does not declare");
        }

        return thread.label;
      }),
    })),
  };
}
