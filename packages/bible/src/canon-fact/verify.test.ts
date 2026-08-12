import { describe, expect, it } from "vitest";

import {
  CANON_FACT_DROP_REASONS,
  CANON_FACT_TOTAL_COUNTS,
  type CanonFactDroppedEntry,
  type CanonFactDropReason,
  type EndedFact,
  flattenCanonFacts,
  type InitialCanonFacts,
  type InitialCanonFactsInput,
  isVerifiedInitialCanonFacts,
  locateCanonFact,
  type PermanentFact,
  type VerifiedInitialCanonFacts,
  verifyInitialCanonFacts,
} from ".";
import { aCanonFacts, anInitialCanonFactsInput } from "./fixtures";

/**
 * Every deliberately broken canon below is the fixture with **one** thing
 * changed. That is what makes a firing test mean something: the check found the
 * mutation rather than something that was wrong from the start.
 */
function mutate(index: number, patch: Partial<PermanentFact>): InitialCanonFacts {
  const facts = aCanonFacts();

  return {
    ...facts,
    permanentFacts: facts.permanentFacts.map((fact, at) =>
      at === index ? { ...fact, ...patch } : fact,
    ),
  };
}

function mutateEnded(patch: Partial<EndedFact>): InitialCanonFacts {
  const facts = aCanonFacts();

  return { ...facts, endedFacts: facts.endedFacts.map((fact) => ({ ...fact, ...patch })) };
}

/** The fixture cut back to the contract's own floor, and nothing else changed. */
function atTheFloor(): InitialCanonFacts {
  const facts = aCanonFacts();
  const permanentFacts = facts.permanentFacts.slice(
    0,
    CANON_FACT_TOTAL_COUNTS.min - facts.periodFacts.length - facts.endedFacts.length,
  );

  return { ...facts, permanentFacts, decompositions: [] };
}

function verified(
  facts: InitialCanonFacts = aCanonFacts(),
  input: InitialCanonFactsInput = anInitialCanonFactsInput(),
): { facts: VerifiedInitialCanonFacts; dropped: readonly CanonFactDroppedEntry[] } {
  const verification = verifyInitialCanonFacts(facts, input);

  if (verification.outcome !== "verified") {
    throw new Error("the canon was expected to verify");
  }

  return { facts: verification.facts, dropped: verification.dropped };
}

function droppedFrom(
  facts: InitialCanonFacts,
  input: InitialCanonFactsInput = anInitialCanonFactsInput(),
): readonly CanonFactDroppedEntry[] {
  const verification = verifyInitialCanonFacts(facts, input);

  return verification.dropped;
}

function reasonsOf(
  facts: InitialCanonFacts,
  input: InitialCanonFactsInput = anInitialCanonFactsInput(),
): readonly CanonFactDropReason[] {
  return droppedFrom(facts, input).map((entry) => entry.reason);
}

describe("verifyInitialCanonFacts", () => {
  describe("a canon whose quotations and names all hold", () => {
    it("verifies, and drops nothing", () => {
      const { facts, dropped } = verified();

      expect(dropped).toEqual([]);
      expect(flattenCanonFacts(facts)).toHaveLength(flattenCanonFacts(aCanonFacts()).length);
    });

    it("brands what it returns, so nothing unchecked can be resolved", () => {
      expect(isVerifiedInitialCanonFacts(verified().facts)).toBe(true);
      expect(isVerifiedInitialCanonFacts(aCanonFacts())).toBe(false);
    });

    it("counts what it kept", () => {
      const verification = verifyInitialCanonFacts(aCanonFacts(), anInitialCanonFactsInput());

      if (verification.outcome !== "verified") throw new Error("expected a verified canon");

      expect(verification.report).toMatchObject({
        answered: 17,
        verified: 17,
        permanent: 14,
        period: 2,
        ended: 1,
        decompositions: 1,
      });
    });
  });

  describe("the passage a fact rests on", () => {
    it("drops a fact naming a source the ask never offered", () => {
      expect(
        reasonsOf(mutate(0, { basis: { sourceKey: "absente", quotation: "une cave" } })),
      ).toEqual(["unknown-source"]);
    });

    it("drops a fact whose quotation is not in the passage it names", () => {
      expect(
        reasonsOf(
          mutate(0, { basis: { sourceKey: "texte-source", quotation: "une cave voûtée" } }),
        ),
      ).toEqual(["unverified-quotation"]);
    });

    it("drops a fact quoting a passage of another section", () => {
      expect(
        reasonsOf(
          mutate(0, { basis: { sourceKey: "monde", quotation: "Il compte douze pièces" } }),
        ),
      ).toEqual(["unverified-quotation"]);
    });

    it("drops a quotation stitched out of two runs of the passage", () => {
      expect(
        reasonsOf(
          mutate(0, { basis: { sourceKey: "texte-source", quotation: "Le manoir compte" } }),
        ),
      ).toEqual(["unverified-quotation"]);
    });
  });

  describe("the statement itself", () => {
    it("drops a fact carrying its own temporal scope", () => {
      expect(
        reasonsOf(mutate(4, { statement: "Madeleine exerce la médecine depuis trente ans." })),
      ).toEqual(["composite-statement"]);
    });

    it("drops a fact carrying two assertions", () => {
      expect(
        reasonsOf(mutate(2, { statement: "Le manoir compte douze pièces et un grenier." })),
      ).toEqual(["composite-statement"]);
    });

    it("drops a negated statement, where the polarity belongs in the truth value", () => {
      expect(reasonsOf(mutate(0, { statement: "Le manoir ne possède pas de cave." }))).toEqual([
        "composite-statement",
      ]);
    });
  });

  describe("the names the answer uses", () => {
    it("drops a fact anchored to an event outside the chronology", () => {
      expect(reasonsOf(mutateEnded({ endedByEventName: "le départ de Paul" }))).toEqual([
        "unknown-event",
      ]);
    });

    it("drops one subject naming nobody, and keeps the fact", () => {
      const dropped = droppedFrom(
        mutate(1, { subjects: [{ kind: "character", name: "Inconnu" }] }),
      );

      expect(dropped).toEqual([
        {
          list: "permanentFacts",
          index: 1,
          reason: "unknown-subject",
          entry: { list: "subjects", index: 0 },
        },
      ]);
      expect(
        verified(mutate(1, { subjects: [{ kind: "character", name: "Inconnu" }] })).facts
          .permanentFacts[1]?.subjects,
      ).toEqual([]);
    });

    it("drops a subject named under the wrong kind", () => {
      expect(reasonsOf(mutate(1, { subjects: [{ kind: "character", name: "Lyon" }] }))).toEqual([
        "unknown-subject",
      ]);
    });

    it("drops the same entity named twice as a subject of one fact", () => {
      expect(
        reasonsOf(
          mutate(1, {
            subjects: [
              { kind: "place", name: "le manoir" },
              { kind: "place", name: "LE MANOIR" },
            ],
          }),
        ),
      ).toEqual(["duplicate-subject"]);
    });

    it("drops a belief naming nobody in the cast", () => {
      expect(
        reasonsOf(mutate(10, { knownBy: [{ characterName: "Inconnu", state: "UNAWARE" }] })),
      ).toEqual(["unknown-character"]);
    });

    it("drops a second stance for one character on one fact", () => {
      expect(
        reasonsOf(
          mutate(10, {
            knownBy: [
              { characterName: "Nora", state: "UNAWARE" },
              { characterName: "nora", state: "BELIEVES_TRUE" },
            ],
          }),
        ),
      ).toEqual(["duplicate-belief"]);
    });
  });

  describe("the spelling it writes back", () => {
    it("takes the cast's, never the model's echo of it", () => {
      const { facts } = verified(
        mutate(10, { knownBy: [{ characterName: "NORA", state: "UNAWARE" }] }),
      );

      expect(facts.permanentFacts[10]?.knownBy[0]?.characterName).toBe("Nora");
    });

    it("takes the places' too", () => {
      const { facts } = verified(mutate(1, { subjects: [{ kind: "place", name: "Le Manoir" }] }));

      expect(facts.permanentFacts[1]?.subjects[0]?.name).toBe("le manoir");
    });

    it("takes the chronology's, so a lookup afterwards is exact", () => {
      const { facts } = verified(mutateEnded({ endedByEventName: "La Vente Du Manoir" }));

      expect(facts.endedFacts[0]?.endedByEventName).toBe("la vente du manoir");
    });
  });

  describe("what another fact already says", () => {
    it("keeps one of two facts that say the same thing, and merges the beliefs", () => {
      const facts = aCanonFacts();
      const original = facts.permanentFacts[10];

      if (original === undefined) throw new Error("the fixture no longer holds that fact");

      // No decomposition here: appending a fact moves every position after it,
      // and the fixture's decomposition points at two of them by index.
      const withDuplicate: InitialCanonFacts = {
        ...facts,
        decompositions: [],
        permanentFacts: [
          ...facts.permanentFacts,
          { ...original, knownBy: [{ characterName: "Paul", state: "BELIEVES_FALSE" }] },
        ],
      };

      const verification = verifyInitialCanonFacts(withDuplicate, anInitialCanonFactsInput());

      if (verification.outcome !== "verified") throw new Error("expected a verified canon");

      expect(verification.dropped.map((entry) => entry.reason)).toEqual(["duplicate-fact"]);
      expect(
        verification.facts.permanentFacts[10]?.knownBy.map((belief) => belief.characterName),
      ).toEqual(["Nora", "Madeleine", "Paul"]);
    });

    it("drops a fact the bible already holds", () => {
      const input = anInitialCanonFactsInput();
      const dropped = droppedFrom(aCanonFacts(), {
        ...input,
        knownFacts: [{ statement: "le manoir possède la cave", isTrue: false }],
      });

      expect(dropped.map((entry) => entry.reason)).toEqual(["already-known"]);
    });
  });

  describe("the decomposition it was told about", () => {
    function withDecomposition(
      composite: string,
      factIndexes: readonly number[],
    ): InitialCanonFacts {
      return { ...aCanonFacts(), decompositions: [{ composite, factIndexes: [...factIndexes] }] };
    }

    it("keeps a decomposition whose composite is genuinely composed", () => {
      const { facts } = verified();

      expect(facts.decompositions).toHaveLength(1);
    });

    it("drops a decomposition of a statement that was already atomic", () => {
      expect(reasonsOf(withDecomposition("Nora vit seule.", [9, 14]))).toEqual([
        "fake-decomposition",
      ]);
    });

    it("drops a decomposition pointing outside the answer", () => {
      expect(reasonsOf(withDecomposition("Nora vit seule depuis l'accident.", [9, 900]))).toEqual([
        "unknown-decomposed-fact",
      ]);
    });

    it("drops a decomposition naming one part twice", () => {
      expect(reasonsOf(withDecomposition("Nora vit seule depuis l'accident.", [9, 9]))).toEqual([
        "duplicate-decomposed-fact",
      ]);
    });

    it("drops a decomposition one of whose parts did not survive", () => {
      const broken = mutate(9, { statement: "Nora habite le manoir depuis l'accident." });
      const reasons = reasonsOf({
        ...broken,
        decompositions: [
          { composite: "Nora vit seule au manoir depuis l'accident.", factIndexes: [9, 14] },
        ],
      });

      expect(reasons).toEqual(["composite-statement", "dropped-decomposed-fact"]);
    });
  });

  describe("the floor", () => {
    it("verifies a canon that sits exactly on it", () => {
      const facts = atTheFloor();

      expect(flattenCanonFacts(facts)).toHaveLength(CANON_FACT_TOTAL_COUNTS.min);
      expect(verified(facts).dropped).toEqual([]);
    });

    it("refuses the whole answer once one drop takes it below", () => {
      const facts = atTheFloor();
      const verification = verifyInitialCanonFacts(
        {
          ...facts,
          permanentFacts: facts.permanentFacts.map((fact, at) =>
            at === 0 ? { ...fact, basis: { sourceKey: "absente", quotation: "x" } } : fact,
          ),
        },
        anInitialCanonFactsInput(),
      );

      expect(verification.outcome).toBe("refused");
      if (verification.outcome !== "refused") return;

      expect(verification.refusals).toEqual(["below-floor"]);
      expect(verification.dropped.map((entry) => entry.reason)).toEqual(["unknown-source"]);
    });
  });

  describe("what it reports", () => {
    it("names only reasons the closed list holds", () => {
      const dropped = droppedFrom(mutate(0, { statement: "Le manoir ne possède pas de cave." }));

      for (const entry of dropped) expect(CANON_FACT_DROP_REASONS).toContain(entry.reason);
    });

    it("carries no word of the canon", () => {
      const facts = aCanonFacts();
      const verification = verifyInitialCanonFacts(facts, anInitialCanonFactsInput());

      if (verification.outcome !== "verified") throw new Error("expected a verified canon");

      const serialised = JSON.stringify({
        dropped: verification.dropped,
        report: verification.report,
      });

      for (const fact of flattenCanonFacts(facts)) {
        expect(serialised).not.toContain(fact.statement);
        expect(serialised).not.toContain(fact.basis.quotation);

        for (const subject of fact.subjects) expect(serialised).not.toContain(subject.name);
      }

      for (const decomposition of facts.decompositions) {
        expect(serialised).not.toContain(decomposition.composite);
      }
    });
  });
});

describe("flattenCanonFacts", () => {
  it("puts the permanent facts first, which is the order everything indexes by", () => {
    const facts = aCanonFacts();
    const flat = flattenCanonFacts(facts);

    expect(flat.slice(0, facts.permanentFacts.length)).toEqual(facts.permanentFacts);
    expect(flat.at(-1)).toEqual(facts.endedFacts[0]);
  });
});

describe("locateCanonFact", () => {
  it("translates a position back into the answer's own lists", () => {
    const facts = aCanonFacts();

    expect(locateCanonFact(facts, 0)).toEqual({ list: "permanentFacts", index: 0 });
    expect(locateCanonFact(facts, facts.permanentFacts.length)).toEqual({
      list: "periodFacts",
      index: 0,
    });
    expect(locateCanonFact(facts, flattenCanonFacts(facts).length - 1)).toEqual({
      list: "endedFacts",
      index: 0,
    });
  });

  it("answers nothing for a position outside the answer", () => {
    expect(locateCanonFact(aCanonFacts(), -1)).toBeNull();
    expect(locateCanonFact(aCanonFacts(), 900)).toBeNull();
  });
});
