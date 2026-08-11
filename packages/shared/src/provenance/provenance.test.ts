import { describe, expect, it } from "vitest";

import { CONTENT_ORIGINS, type ContentOrigin, PROVENANCE_STATES } from "./origins";
import {
  carryProvenance,
  originAfterEdit,
  type PreviousElement,
  resolveProvenanceState,
} from "./provenance";

/**
 * The pattern's three rules, each asserted rather than described:
 * origin is monotone, an untouched element keeps what it had, and being
 * validated is derived from the two facts that are stored.
 */

const previousFrom = (
  entries: readonly (readonly [string, ContentOrigin, string])[],
): ReadonlyMap<string, PreviousElement<string>> =>
  new Map(entries.map(([lineageId, origin, content]) => [lineageId, { origin, content }]));

const sameText = (a: string, b: string) => a === b;

describe("resolveProvenanceState", () => {
  it("names a model proposal nobody has passed over", () => {
    expect(resolveProvenanceState({ origin: "GENERATED", reviewedByAuthor: false })).toBe(
      "proposed",
    );
  });

  it("names a model proposal the author read and kept", () => {
    expect(resolveProvenanceState({ origin: "GENERATED", reviewedByAuthor: true })).toBe(
      "accepted",
    );
  });

  it("names the author's own words, whatever the revision says", () => {
    for (const reviewedByAuthor of [true, false]) {
      expect(resolveProvenanceState({ origin: "EDITED", reviewedByAuthor })).toBe("edited");
      expect(resolveProvenanceState({ origin: "USER_WRITTEN", reviewedByAuthor })).toBe(
        "user-written",
      );
    }
  });

  it("is total over the origins, and onto the states", () => {
    const produced = new Set(
      CONTENT_ORIGINS.flatMap((origin) =>
        [true, false].map((reviewedByAuthor) =>
          resolveProvenanceState({ origin, reviewedByAuthor }),
        ),
      ),
    );

    expect([...produced].sort()).toEqual([...PROVENANCE_STATES].sort());
  });
});

describe("originAfterEdit", () => {
  it("gives an element with no ancestor to the author", () => {
    expect(originAfterEdit(null, false)).toBe("USER_WRITTEN");
    expect(originAfterEdit(null, true)).toBe("USER_WRITTEN");
  });

  it("leaves an untouched element exactly as it was", () => {
    for (const origin of CONTENT_ORIGINS) {
      expect(originAfterEdit(origin, false)).toBe(origin);
    }
  });

  it("never hands an edited element back to the model", () => {
    for (const origin of CONTENT_ORIGINS) {
      expect(originAfterEdit(origin, true)).not.toBe("GENERATED");
    }
  });

  it("keeps the author's own element theirs rather than demoting it to EDITED", () => {
    expect(originAfterEdit("USER_WRITTEN", true)).toBe("USER_WRITTEN");
    expect(originAfterEdit("GENERATED", true)).toBe("EDITED");
    expect(originAfterEdit("EDITED", true)).toBe("EDITED");
  });

  it("is idempotent: editing twice says no more than editing once", () => {
    const once = originAfterEdit("GENERATED", true);

    expect(originAfterEdit(once, true)).toBe(once);
  });
});

describe("carryProvenance", () => {
  const previous = previousFrom([
    ["lin_a", "GENERATED", "a"],
    ["lin_b", "GENERATED", "b"],
    ["lin_c", "EDITED", "c"],
  ]);

  it("keeps an untouched proposal readable as a proposal", () => {
    const { elements } = carryProvenance({
      previous,
      submitted: [
        { lineageId: "lin_a", content: "a" },
        { lineageId: "lin_b", content: "b rewritten" },
        { lineageId: "lin_c", content: "c" },
      ],
      isUnchanged: sameText,
    });

    expect(elements).toEqual([
      { lineageId: "lin_a", origin: "GENERATED", content: "a" },
      { lineageId: "lin_b", origin: "EDITED", content: "b rewritten" },
      { lineageId: "lin_c", origin: "EDITED", content: "c" },
    ]);
  });

  it("asks the store to mint a lineage for an element the author added", () => {
    const { elements } = carryProvenance({
      previous,
      submitted: [
        { lineageId: "lin_a", content: "a" },
        { lineageId: null, content: "d" },
      ],
      isUnchanged: sameText,
    });

    expect(elements[1]).toEqual({ lineageId: null, origin: "USER_WRITTEN", content: "d" });
  });

  it("treats an unknown lineage as a new element rather than trusting it", () => {
    const { elements } = carryProvenance({
      previous,
      submitted: [{ lineageId: "lin_from_another_project", content: "x" }],
      isUnchanged: sameText,
    });

    expect(elements).toEqual([{ lineageId: null, origin: "USER_WRITTEN", content: "x" }]);
  });

  it("never hands the store the same lineage twice", () => {
    const { elements } = carryProvenance({
      previous,
      submitted: [
        { lineageId: "lin_a", content: "a" },
        { lineageId: "lin_a", content: "a again" },
      ],
      isUnchanged: sameText,
    });

    expect(elements.map((element) => element.lineageId)).toEqual(["lin_a", null]);
    expect(elements[1]?.origin).toBe("USER_WRITTEN");
  });

  it("drops an element the author removed, and says the section moved", () => {
    const { elements, unchanged } = carryProvenance({
      previous,
      submitted: [
        { lineageId: "lin_a", content: "a" },
        { lineageId: "lin_c", content: "c" },
      ],
      isUnchanged: sameText,
    });

    expect(elements.map((element) => element.lineageId)).toEqual(["lin_a", "lin_c"]);
    expect(unchanged).toBe(false);
  });

  it("reports a form posted back untouched as unchanged", () => {
    const { unchanged } = carryProvenance({
      previous,
      submitted: [
        { lineageId: "lin_a", content: "a" },
        { lineageId: "lin_b", content: "b" },
        { lineageId: "lin_c", content: "c" },
      ],
      isUnchanged: sameText,
    });

    expect(unchanged).toBe(true);
  });

  it("reports a reorder as a change even when every element is untouched", () => {
    const { elements, unchanged } = carryProvenance({
      previous,
      submitted: [
        { lineageId: "lin_c", content: "c" },
        { lineageId: "lin_b", content: "b" },
        { lineageId: "lin_a", content: "a" },
      ],
      isUnchanged: sameText,
    });

    expect(unchanged).toBe(false);
    // Reordering is not authorship: every origin survives the move.
    expect(elements.map((element) => element.origin)).toEqual(["EDITED", "GENERATED", "GENERATED"]);
  });

  it("accepts an empty previous revision — the author writing a section from nothing", () => {
    const { elements, unchanged } = carryProvenance({
      previous: previousFrom([]),
      submitted: [{ lineageId: null, content: "first" }],
      isUnchanged: sameText,
    });

    expect(elements).toEqual([{ lineageId: null, origin: "USER_WRITTEN", content: "first" }]);
    expect(unchanged).toBe(false);
  });

  it("reports an untouched empty section as unchanged", () => {
    const { elements, unchanged } = carryProvenance({
      previous: previousFrom([]),
      submitted: [],
      isUnchanged: sameText,
    });

    expect(elements).toEqual([]);
    expect(unchanged).toBe(true);
  });
});
