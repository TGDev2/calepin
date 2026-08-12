import { PROVENANCE_STATES } from "@calepin/shared/provenance";
import { describe, expect, it } from "vitest";

import {
  BIBLE_PROVENANCE_LABELS,
  bibleElementProvenanceState,
  canonFactProvenanceState,
} from "./bible-provenance";

describe("bibleElementProvenanceState", () => {
  it("reads a generated element as proposed before the bible is validated", () => {
    expect(bibleElementProvenanceState({ origin: "GENERATED", bibleValidatedAt: null })).toBe(
      "proposed",
    );
  });

  it("reads a generated element as validated once the bible is", () => {
    expect(bibleElementProvenanceState({ origin: "GENERATED", bibleValidatedAt: new Date() })).toBe(
      "accepted",
    );
  });

  it("reads an edited element as a manual modification, validated or not", () => {
    expect(bibleElementProvenanceState({ origin: "EDITED", bibleValidatedAt: null })).toBe(
      "edited",
    );
    expect(bibleElementProvenanceState({ origin: "EDITED", bibleValidatedAt: new Date() })).toBe(
      "edited",
    );
  });

  it("reads a user-written element as the author's own, validated or not", () => {
    expect(bibleElementProvenanceState({ origin: "USER_WRITTEN", bibleValidatedAt: null })).toBe(
      "user-written",
    );
  });
});

describe("canonFactProvenanceState", () => {
  it("reads a confirmed fact as validated whatever proposed it", () => {
    expect(canonFactProvenanceState({ source: "BIBLE", status: "CONFIRMED" })).toBe("accepted");
    expect(canonFactProvenanceState({ source: "USER", status: "CONFIRMED" })).toBe("accepted");
  });

  it("reads an unconfirmed hand-entered fact as the author's own", () => {
    expect(canonFactProvenanceState({ source: "USER", status: "PROPOSED" })).toBe("user-written");
  });

  it("reads an unconfirmed extracted fact as a proposal awaiting arbitration", () => {
    expect(canonFactProvenanceState({ source: "SOURCE_TEXT", status: "PROPOSED" })).toBe(
      "proposed",
    );
    expect(canonFactProvenanceState({ source: "CHAPTER", status: "REJECTED" })).toBe("proposed");
  });

  it("never claims a fact was edited: the column that would say so does not exist", () => {
    for (const source of ["SOURCE_TEXT", "BIBLE", "CHAPTER", "USER"] as const) {
      for (const status of ["PROPOSED", "CONFIRMED", "REJECTED"] as const) {
        expect(canonFactProvenanceState({ source, status })).not.toBe("edited");
      }
    }
  });
});

describe("BIBLE_PROVENANCE_LABELS", () => {
  it("covers every provenance state, once each", () => {
    expect(Object.keys(BIBLE_PROVENANCE_LABELS).sort()).toEqual([...PROVENANCE_STATES].sort());
  });

  it("gives each state a label distinct from every other", () => {
    const labels = Object.values(BIBLE_PROVENANCE_LABELS).map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
