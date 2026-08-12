import { describe, expect, it } from "vitest";

import {
  CANON_FACT_CAUSAL_MARKERS,
  CANON_FACT_COORDINATION_MARKERS,
  CANON_FACT_NEGATION_MARKERS,
  CANON_FACT_STATEMENT_DEFECT_LABELS,
  CANON_FACT_STATEMENT_DEFECTS,
  CANON_FACT_TEMPORAL_MARKERS,
  type CanonFactStatementDefectKind,
  checkCanonFactStatement,
  isAtomicCanonFactStatement,
} from "./atomicity";

function kindsOf(statement: string): readonly CanonFactStatementDefectKind[] {
  return checkCanonFactStatement(statement).map((defect) => defect.kind);
}

describe("checkCanonFactStatement", () => {
  describe("a statement that says one thing", () => {
    it.each([
      "Le manoir possède une cave.",
      "Nora est la fille de Madeleine.",
      "L'accident a coûté la vue à Paul.",
      "Madeleine garde la clé du grenier sur elle.",
      "Le manoir compte douze pièces.",
    ])("accepts %#", (statement) => {
      expect(checkCanonFactStatement(statement)).toEqual([]);
      expect(isAtomicCanonFactStatement(statement)).toBe(true);
    });
  });

  describe("what it refuses", () => {
    it("finds two assertions joined by a conjunction", () => {
      expect(kindsOf("Le manoir est grand et froid.")).toEqual(["coordination"]);
    });

    it("finds an alternative, which states no fact at all", () => {
      expect(kindsOf("Nora habite Lyon ou le manoir.")).toEqual(["coordination"]);
    });

    it("finds a temporal scope written into the statement", () => {
      expect(kindsOf("Nora vit seule depuis l'accident.")).toEqual(["temporal-clause"]);
    });

    it("finds a temporal clause hidden behind an elision", () => {
      expect(kindsOf("Madeleine habite le manoir jusqu'à sa vente.")).toEqual(["temporal-clause"]);
    });

    it("finds a cause, which is two facts and a claim about their relation", () => {
      expect(kindsOf("Nora est partie parce que le manoir a brûlé.")).toEqual(["causal-clause"]);
    });

    it("reads the longer marker, so a two-word one is not reported as its second half", () => {
      expect(checkCanonFactStatement("Nora est partie parce que le manoir a brûlé.")).toEqual([
        { kind: "causal-clause", marker: "parce que", wordIndex: 3 },
      ]);
    });

    it("finds a negation, where the polarity belongs in the truth value", () => {
      expect(kindsOf("Le manoir ne possède pas de cave.")).toEqual(["negation"]);
    });

    it("finds a negation written without its first half", () => {
      expect(kindsOf("Aucun registre mentionne la cave.")).toEqual(["negation"]);
    });

    it("finds a second sentence", () => {
      expect(kindsOf("Le manoir compte douze pièces. La cave manque.")).toEqual(["sentence-break"]);
    });

    it("finds two clauses welded by a semicolon", () => {
      expect(kindsOf("Le manoir compte douze pièces ; la cave manque.")).toEqual([
        "sentence-break",
      ]);
    });

    it("reports every marker it finds, in the order they appear", () => {
      const defects = checkCanonFactStatement(
        "Nora vit seule depuis l'accident et Paul enseigne au collège.",
      );

      expect(defects.map((defect) => defect.kind)).toEqual(["temporal-clause", "coordination"]);
      expect(defects.map((defect) => defect.wordIndex)).toEqual([3, 6]);
    });
  });

  describe("what it deliberately lets through", () => {
    it.each([
      "Le père de Nora est l'homme qui a bâti le manoir.",
      "Le grenier que Madeleine ferme donne sur la cour.",
      "Le manoir dont Madeleine est propriétaire domine le fleuve.",
      "Le collège où Paul enseigne date du siècle dernier.",
      "Nora, la fille de Madeleine, tient une librairie.",
    ])("accepts a referent identified rather than a second fact asserted, %#", (statement) => {
      expect(checkCanonFactStatement(statement)).toEqual([]);
    });

    it("keeps the article distinct from the temporal marker it is accented apart from", () => {
      expect(checkCanonFactStatement("Madeleine soigne des enfants.")).toEqual([]);
      expect(kindsOf("Madeleine soigne dès l'aube.")).toEqual(["temporal-clause"]);
    });

    it("does not split a hyphenated word into a marker", () => {
      expect(checkCanonFactStatement("Paul enseigne l'après-midi.")).toEqual([]);
    });

    it("does not read an abbreviated date as a second sentence", () => {
      expect(checkCanonFactStatement("L'accident date du 12 nov. 1998.")).toEqual([]);
    });
  });

  describe("the vocabulary", () => {
    it("names no marker under two kinds", () => {
      const all = [
        ...CANON_FACT_COORDINATION_MARKERS,
        ...CANON_FACT_TEMPORAL_MARKERS,
        ...CANON_FACT_CAUSAL_MARKERS,
        ...CANON_FACT_NEGATION_MARKERS,
      ];

      expect(new Set(all).size).toBe(all.length);
    });

    it("holds every marker to at most two words, which is what the scan reads", () => {
      const all = [
        ...CANON_FACT_COORDINATION_MARKERS,
        ...CANON_FACT_TEMPORAL_MARKERS,
        ...CANON_FACT_CAUSAL_MARKERS,
        ...CANON_FACT_NEGATION_MARKERS,
      ];

      for (const marker of all) {
        expect(marker.split(" ").length).toBeLessThanOrEqual(2);
        expect(marker).toBe(marker.toLowerCase());
      }
    });

    it("glosses every defect, and only those", () => {
      expect(Object.keys(CANON_FACT_STATEMENT_DEFECT_LABELS).sort()).toEqual(
        [...CANON_FACT_STATEMENT_DEFECTS].sort(),
      );
    });

    it("reports only kinds the closed list holds, and markers from the tables", () => {
      const declared = new Set<string>([
        ...CANON_FACT_COORDINATION_MARKERS,
        ...CANON_FACT_TEMPORAL_MARKERS,
        ...CANON_FACT_CAUSAL_MARKERS,
        ...CANON_FACT_NEGATION_MARKERS,
      ]);

      const defects = checkCanonFactStatement(
        "Nora ne vit seule depuis l'accident ; Paul est parti parce que le manoir a brûlé.",
      );

      expect(defects.length).toBeGreaterThan(0);

      for (const defect of defects) {
        expect(CANON_FACT_STATEMENT_DEFECTS).toContain(defect.kind);
        if (defect.marker !== null) expect(declared.has(defect.marker)).toBe(true);
      }
    });
  });
});

/**
 * The backlog's requirement, as a suite: a composed statement is refused, the
 * elementary facts it breaks into are each accepted, and the composite is what
 * the declared decomposition has to fail on — `verify.test.ts` holds the last
 * half, because it needs an ask.
 */
describe("decomposition", () => {
  const composite = "Nora vit seule au manoir depuis l'accident, qui a coûté la vue à Paul.";

  it("refuses the composed statement", () => {
    expect(isAtomicCanonFactStatement(composite)).toBe(false);
    expect(kindsOf(composite)).toContain("temporal-clause");
  });

  it.each(["Nora vit seule.", "Nora habite le manoir.", "L'accident a coûté la vue à Paul."])(
    "accepts elementary part %#",
    (part) => {
      expect(checkCanonFactStatement(part)).toEqual([]);
    },
  );

  it("keeps the scope out of the parts, which is where the contract carries it", () => {
    for (const part of ["Nora vit seule.", "Nora habite le manoir."]) {
      expect(kindsOf(part)).not.toContain("temporal-clause");
    }
  });
});
