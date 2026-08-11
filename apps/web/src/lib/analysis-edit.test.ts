import { ANALYSIS_SECTIONS } from "@calepin/analysis";
import { PROVENANCE_STATES } from "@calepin/shared/provenance";
import { describe, expect, it } from "vitest";

import {
  analysisPath,
  PROVENANCE_LABELS,
  readAnalysisSection,
  readPostedElements,
  readText,
} from "./analysis-edit";

/**
 * The form reading, which is the one place a browser's bytes become elements.
 * The rules it must not invent are asserted elsewhere; what is asserted here is
 * that it drops exactly what the editor renders and nothing the author typed.
 */

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);

  return data;
}

describe("readAnalysisSection", () => {
  it("accepts every section the domain declares", () => {
    for (const section of ANALYSIS_SECTIONS) {
      expect(readAnalysisSection(section)).toBe(section);
    }
  });

  it("refuses anything else", () => {
    expect(readAnalysisSection("THEMES_")).toBeNull();
    expect(readAnalysisSection("")).toBeNull();
    expect(readAnalysisSection(null)).toBeNull();
    expect(readAnalysisSection(17)).toBeNull();
  });
});

describe("readText", () => {
  it("trims, and answers null for a field that carried nothing", () => {
    expect(readText("  du texte  ")).toBe("du texte");
    expect(readText("   ")).toBeNull();
    expect(readText(undefined)).toBeNull();
  });
});

describe("readPostedElements", () => {
  it("reads a listed section row by row, lineage included", () => {
    const posted = readPostedElements(
      form({
        rowCount: "2",
        "lineage.0": "lin_a",
        "kind.0": "FACTUAL",
        "label.0": "Un titre",
        "statement.0": "Un énoncé.",
        "evidence.0": "Un fragment.",
        "kind.1": "INTERPRETATION",
        "label.1": "Un autre",
        "statement.1": "Un autre énoncé.",
        "evidence.1": "",
      }),
      { listed: true },
    );

    expect(posted).toEqual([
      {
        lineageId: "lin_a",
        kind: "FACTUAL",
        label: "Un titre",
        statement: "Un énoncé.",
        evidence: "Un fragment.",
      },
      {
        lineageId: null,
        kind: "INTERPRETATION",
        label: "Un autre",
        statement: "Un autre énoncé.",
        evidence: null,
      },
    ]);
  });

  it("ignores the label of a paragraph section rather than passing it on", () => {
    const posted = readPostedElements(
      form({
        rowCount: "1",
        "kind.0": "FACTUAL",
        "label.0": "un titre qui n'a rien à faire là",
        "statement.0": "Un énoncé.",
      }),
      { listed: false },
    );

    expect(posted[0]?.label).toBeNull();
  });

  it("drops a row the author marked for removal", () => {
    const posted = readPostedElements(
      form({
        rowCount: "2",
        "lineage.0": "lin_a",
        "kind.0": "FACTUAL",
        "label.0": "Gardé",
        "statement.0": "Un énoncé.",
        "remove.1": "1",
        "lineage.1": "lin_b",
        "kind.1": "FACTUAL",
        "label.1": "Supprimé",
        "statement.1": "Un autre énoncé.",
      }),
      { listed: true },
    );

    expect(posted.map((element) => element.lineageId)).toEqual(["lin_a"]);
  });

  it("drops a spare row the author never filled in", () => {
    const posted = readPostedElements(
      form({
        rowCount: "2",
        "lineage.0": "lin_a",
        "kind.0": "FACTUAL",
        "label.0": "Gardé",
        "statement.0": "Un énoncé.",
        "kind.1": "INTERPRETATION",
        "label.1": "",
        "statement.1": "   ",
      }),
      { listed: true },
    );

    expect(posted).toHaveLength(1);
  });

  it("keeps an existing element the author emptied, so the domain can refuse it", () => {
    const posted = readPostedElements(
      form({
        rowCount: "1",
        "lineage.0": "lin_a",
        "kind.0": "FACTUAL",
        "label.0": "Un titre",
        "statement.0": "",
      }),
      { listed: true },
    );

    // Emptying a field is not the same gesture as ticking "supprimer", and
    // treating it as one would delete an element nobody asked to delete.
    expect(posted).toEqual([
      { lineageId: "lin_a", kind: "FACTUAL", label: "Un titre", statement: "", evidence: null },
    ]);
  });

  it("passes the marker through untouched, whatever it says", () => {
    const posted = readPostedElements(
      form({ rowCount: "1", "kind.0": "PAS_UN_MARQUEUR", "statement.0": "Un énoncé." }),
      { listed: false },
    );

    // Deciding whether it is a marker is the schema's job, not this module's.
    expect(posted[0]?.kind).toBe("PAS_UN_MARQUEUR");
  });

  it("refuses a row count that did not come from the editor", () => {
    for (const rowCount of ["-1", "2.5", "1e9", "beaucoup", ""]) {
      expect(readPostedElements(form({ rowCount }), { listed: true })).toEqual([]);
    }
  });
});

describe("PROVENANCE_LABELS", () => {
  it("names every state the pattern can produce", () => {
    expect(Object.keys(PROVENANCE_LABELS).sort()).toEqual([...PROVENANCE_STATES].sort());
  });

  it("says the three origins the backlog asks for, in French", () => {
    expect(PROVENANCE_LABELS.proposed.label).toBe("Proposition du modèle");
    expect(PROVENANCE_LABELS.accepted.label).toBe("Élément validé");
    expect(PROVENANCE_LABELS.edited.label).toBe("Modification manuelle");
    expect(PROVENANCE_LABELS["user-written"].label).toBe("Rédigé par vous");
  });
});

describe("analysisPath", () => {
  it("escapes the project id and carries the query", () => {
    expect(analysisPath("a/b")).toBe("/projects/a%2Fb/analysis");
    expect(analysisPath("p1", { edit: "THEMES" })).toBe("/projects/p1/analysis?edit=THEMES");
  });
});
