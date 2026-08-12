import { describe, expect, it } from "vitest";

import { checkPartStructure, type PartStructureCheckInput } from "./check";
import { aPartStructure } from "./fixtures";
import type { PartStructure } from "./schema";

/** The fixture as the checker reads it — the same projection `verifyPartStructure` makes. */
function checkInputOf(
  structure: PartStructure,
  novelTargetWordCount: number,
): PartStructureCheckInput {
  return {
    novelTargetWordCount,
    threads: structure.threads.map(({ label }) => ({ label })),
    parts: structure.parts.map((part) => ({
      title: part.title,
      dramaticObjective: part.dramaticObjective,
      initialState: part.initialState,
      finalState: part.finalState,
      threadIndexes: part.threadIndexes,
    })),
  };
}

function partAt(structure: PartStructure, index: number) {
  const part = structure.parts[index];
  if (part === undefined) throw new Error("the fixture holds no such part");
  return part;
}

describe("checkPartStructure", () => {
  it("reports a clean four-part structure clean, at the length it was carved for", () => {
    const report = checkPartStructure(checkInputOf(aPartStructure(), 65_000));

    expect(report).toEqual({
      acceptable: true,
      parts: 4,
      threads: 3,
      defects: [],
      advisories: [],
    });
  });

  /**
   * The acceptance criterion of CAL-101's command — *le découpage s'adapte
   * réellement* — as a refusal: the same answers change verdict when only the
   * target length moves, with no model in the room.
   */
  it("accepts a split at one target length and refuses it at another", () => {
    const fourParts = aPartStructure();

    // Four parts fit a standard novel (range [3, 5])…
    expect(checkPartStructure(checkInputOf(fourParts, 65_000)).acceptable).toBe(true);
    // …and are too many for the custom floor (range [2, 2]).
    expect(checkPartStructure(checkInputOf(fourParts, 20_000)).defects).toContainEqual({
      kind: "part-count-out-of-range",
      partCount: 4,
      minParts: 2,
      maxParts: 2,
    });

    // Three parts fit a short novel (range [2, 3])…
    const threeParts = { ...fourParts, parts: fourParts.parts.slice(0, 3) };
    expect(checkPartStructure(checkInputOf(threeParts, 37_500)).acceptable).toBe(true);
    // …and are too few for a long one (range [4, 6]) or a very long custom one.
    expect(checkPartStructure(checkInputOf(threeParts, 95_000)).defects).toContainEqual({
      kind: "part-count-out-of-range",
      partCount: 3,
      minParts: 4,
      maxParts: 6,
    });
    expect(checkPartStructure(checkInputOf(threeParts, 200_000)).acceptable).toBe(false);
  });

  it("refuses two parts holding the same title, whatever the typography", () => {
    const structure = aPartStructure();
    partAt(structure, 3).title = "LE CHANTIER";

    const report = checkPartStructure(checkInputOf(structure, 65_000));

    expect(report.acceptable).toBe(false);
    expect(report.defects).toContainEqual({
      kind: "duplicate-part-title",
      partIndex: 3,
      firstPartIndex: 0,
    });
  });

  it("refuses two threads holding the same label, whatever the typography", () => {
    const structure = aPartStructure();
    structure.threads[2] = {
      label: "La dette de MEIDA",
      narrativePromise: "Une promesse distincte.",
    };

    const report = checkPartStructure(checkInputOf(structure, 65_000));

    expect(report.defects).toContainEqual({
      kind: "duplicate-thread-label",
      threadIndex: 2,
      firstThreadIndex: 0,
    });
  });

  it("refuses an index that resolves to no declared thread, negative or past the list", () => {
    const structure = aPartStructure();
    partAt(structure, 0).threadIndexes = [-1, 7];

    const report = checkPartStructure(checkInputOf(structure, 65_000));

    expect(report.defects).toContainEqual({ kind: "unknown-thread-index", partIndex: 0, index: 0 });
    expect(report.defects).toContainEqual({ kind: "unknown-thread-index", partIndex: 0, index: 1 });
  });

  it("refuses a part naming the same thread twice", () => {
    const structure = aPartStructure();
    partAt(structure, 0).threadIndexes = [0, 0];

    const report = checkPartStructure(checkInputOf(structure, 65_000));

    expect(report.defects).toContainEqual({
      kind: "duplicate-thread-reference",
      partIndex: 0,
      index: 1,
      firstIndex: 0,
    });
  });

  it("refuses a declared thread no part carries", () => {
    const structure = aPartStructure();
    partAt(structure, 0).threadIndexes = [0];
    partAt(structure, 2).threadIndexes = [0, 1];
    partAt(structure, 3).threadIndexes = [1];

    const report = checkPartStructure(checkInputOf(structure, 65_000));

    expect(report.defects).toContainEqual({ kind: "orphan-thread", threadIndex: 2 });
  });

  it("refuses a part whose final state repeats its initial state", () => {
    const structure = aPartStructure();
    const part = partAt(structure, 1);
    part.finalState = part.initialState.toUpperCase();

    const report = checkPartStructure(checkInputOf(structure, 65_000));

    expect(report.defects).toContainEqual({ kind: "unchanged-state", partIndex: 1 });
  });

  // Row-capability (CAL-108, CAL-110): a hand-added part starts empty, and an
  // empty field skips the checks that read it instead of failing them.
  it("skips the state and stake checks over a row whose planning fields are null", () => {
    const input = checkInputOf(aPartStructure(), 65_000);
    const parts = [...input.parts];
    const firstPart = parts[0];
    if (firstPart === undefined) throw new Error("the fixture holds no part");
    parts[0] = { ...firstPart, dramaticObjective: null, initialState: null, finalState: null };

    const report = checkPartStructure({ ...input, parts });

    expect(report.acceptable).toBe(true);
    expect(report.advisories).toEqual([]);
  });

  it("reports two parts arguing the same stake, and never refuses for it", () => {
    const structure = aPartStructure();
    partAt(structure, 1).dramaticObjective = partAt(structure, 0).dramaticObjective;

    const report = checkPartStructure(checkInputOf(structure, 65_000));

    expect(report.acceptable).toBe(true);
    expect(report.defects).toEqual([]);

    const finding = report.advisories.find((advisory) => advisory.kind === "similar-stakes");
    if (finding === undefined || finding.kind !== "similar-stakes") {
      throw new Error("the advisory was not reported");
    }
    expect(finding.partIndex).toBe(1);
    expect(finding.otherPartIndex).toBe(0);
    // An identical stake shares every content word with itself.
    expect(finding.sharedWords).toBe(finding.words);
    expect(finding.words).toBeGreaterThan(0);
  });

  it("reports a thread raised and settled inside one part, and never refuses for it", () => {
    const structure = aPartStructure();
    partAt(structure, 0).threadIndexes = [0];
    partAt(structure, 2).threadIndexes = [0, 1];

    const report = checkPartStructure(checkInputOf(structure, 65_000));

    expect(report.acceptable).toBe(true);
    expect(report.advisories).toContainEqual({
      kind: "single-part-thread",
      threadIndex: 2,
      partIndex: 3,
    });
  });
});
