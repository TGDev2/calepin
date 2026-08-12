import { describe, expect, it } from "vitest";

import { aCanonFacts, anInitialCanonFactsInput } from "./fixtures";
import {
  CANON_FACT_SOURCE_BY_KIND,
  countCanonFactRows,
  type ResolvedCanonFactRow,
  resolveInitialCanonFacts,
} from "./rows";
import { CANON_FACT_SOURCE_KINDS } from "./schema";
import { CANON_FACT_SOURCES } from "./types";
import { verifyInitialCanonFacts } from "./verify";

function resolved(): readonly ResolvedCanonFactRow[] {
  const input = anInitialCanonFactsInput();
  const verification = verifyInitialCanonFacts(aCanonFacts(), input);

  if (verification.outcome !== "verified") throw new Error("the fixture no longer verifies");

  return resolveInitialCanonFacts(verification.facts, input);
}

function rowFor(statement: string): ResolvedCanonFactRow {
  const row = resolved().find((candidate) => candidate.statement === statement);

  if (row === undefined) throw new Error("the fixture no longer holds that fact");

  return row;
}

describe("resolveInitialCanonFacts", () => {
  describe("the temporal case, which the answer never declares", () => {
    it("follows the list the fact came out of", () => {
      expect(rowFor("Le manoir possède une cave.").validity).toBe("PERMANENT");
      expect(rowFor("Nora vit seule.").validity).toBe("DURING_PERIOD");
      expect(rowFor("Madeleine habite le manoir.").validity).toBe("UNTIL_EVENT");
    });

    it("writes a permanent fact with no bound and no ending event", () => {
      const row = rowFor("Le manoir possède une cave.");

      expect([
        row.validFromDay,
        row.validFromPrecision,
        row.validFromLabel,
        row.validUntilDay,
        row.validUntilPrecision,
        row.validUntilLabel,
        row.invalidatedByEventName,
      ]).toEqual([null, null, null, null, null, null, null]);
    });

    it("writes a period fact with at least one bound and no ending event", () => {
      const row = rowFor("Nora vit seule.");

      expect(row.invalidatedByEventName).toBeNull();
      expect(row.validFromDay).toBe(-7_300);
      expect(row.validFromPrecision).toBe("YEAR");
      expect(row.validFromLabel).toBe("l'accident");
      expect(row.validUntilDay).toBeNull();
    });

    it("carries both bounds of a closed period", () => {
      const row = rowFor("Le manoir demeure inhabité.");

      expect(row.validFromDay).toBe(-7_300);
      expect(row.validUntilDay).toBe(400);
      expect(row.validUntilPrecision).toBe("MONTH");
    });

    it("writes an ended fact with its event and no bound", () => {
      const row = rowFor("Madeleine habite le manoir.");

      expect(row.invalidatedByEventName).toBe("la vente du manoir");
      expect([row.validFromDay, row.validUntilDay, row.validFromLabel]).toEqual([null, null, null]);
    });
  });

  describe("the provenance", () => {
    it("follows the kind of the passage the fact quotes", () => {
      expect(rowFor("Le manoir possède une cave.").source).toBe("SOURCE_TEXT");
      expect(rowFor("Nora est la fille de Madeleine.").source).toBe("BIBLE");
      expect(rowFor("Madeleine possède le manoir.").source).toBe("BIBLE");
    });

    it("maps every corpus kind, and reaches only the two a bible pass can write", () => {
      expect(Object.keys(CANON_FACT_SOURCE_BY_KIND).sort()).toEqual(
        [...CANON_FACT_SOURCE_KINDS].sort(),
      );
      expect([...new Set(Object.values(CANON_FACT_SOURCE_BY_KIND))].sort()).toEqual([
        "BIBLE",
        "SOURCE_TEXT",
      ]);

      for (const source of Object.values(CANON_FACT_SOURCE_BY_KIND)) {
        expect(CANON_FACT_SOURCES).toContain(source);
      }
    });
  });

  it("writes no lifecycle state, which is the author's to move", () => {
    for (const row of resolved()) {
      expect(row).not.toHaveProperty("status");
      expect(row).not.toHaveProperty("lockedAt");
    }
  });

  it("carries the subjects and the beliefs by name, never by identifier", () => {
    const row = rowFor("Le père de Nora reste en vie.");

    expect(row.subjects).toEqual([{ kind: "character", name: "Nora" }]);
    expect(row.beliefs).toEqual([
      { characterName: "Nora", state: "UNAWARE" },
      { characterName: "Madeleine", state: "BELIEVES_TRUE" },
    ]);
  });

  it("keeps the truth value the canon stated, not the one the wording suggests", () => {
    expect(rowFor("Le manoir possède une cave.").isTrue).toBe(false);
    expect(rowFor("Le père de Nora reste en vie.").isTrue).toBe(true);
  });

  it("refuses to resolve a fact whose source the ask never offered", () => {
    const input = anInitialCanonFactsInput();
    const verification = verifyInitialCanonFacts(aCanonFacts(), input);

    if (verification.outcome !== "verified") throw new Error("the fixture no longer verifies");

    expect(() =>
      resolveInitialCanonFacts(verification.facts, {
        ...input,
        sources: input.sources.slice(0, 2),
      }),
    ).toThrowError(/source/u);
  });
});

describe("countCanonFactRows", () => {
  it("counts without needing a verified canon, since counting is not a write", () => {
    expect(countCanonFactRows(aCanonFacts())).toEqual({
      facts: 17,
      permanent: 14,
      period: 2,
      ended: 1,
      subjects: 23,
      beliefs: 2,
      decompositions: 1,
    });
  });
});
