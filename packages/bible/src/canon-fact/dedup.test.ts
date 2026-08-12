import { describe, expect, it } from "vitest";

import { CANON_FACT_NEGATION_MARKERS } from "./atomicity";
import {
  CANON_FACT_NEAR_DUPLICATE_RATIO,
  CANON_FACT_STOP_WORDS,
  canonFactKey,
  canonFactStatementKey,
  type DeduplicableCanonFact,
  deduplicateCanonFacts,
} from "./dedup";

function aFact(
  statement: string,
  overrides: Partial<DeduplicableCanonFact> = {},
): DeduplicableCanonFact {
  return {
    statement,
    isTrue: true,
    validity: "PERMANENT",
    validFromDay: null,
    validUntilDay: null,
    endingEventKey: null,
    subjectKeys: ["character Nora"],
    beliefs: [],
    ...overrides,
  };
}

describe("canonFactKey", () => {
  describe("what it holds to be one fact", () => {
    it("ignores the typography a model retypes wrong", () => {
      expect(canonFactKey(aFact("Le manoir possède une cave."))).toBe(
        canonFactKey(aFact("le  manoir possède une cave")),
      );
    });

    it("ignores the determiner, which cannot change what is asserted", () => {
      expect(canonFactKey(aFact("Le manoir possède une cave."))).toBe(
        canonFactKey(aFact("Ce manoir possède la cave.")),
      );
    });

    it("ignores an elision, so the article inside a contraction goes too", () => {
      expect(canonFactStatementKey("L'accident a blessé Paul.", true)).toBe(
        canonFactStatementKey("Accident a blessé Paul", true),
      );
    });

    it("sorts the subjects, since a subject set is unordered", () => {
      expect(canonFactKey(aFact("x", { subjectKeys: ["place Lyon", "character Nora"] }))).toBe(
        canonFactKey(aFact("x", { subjectKeys: ["character Nora", "place Lyon"] })),
      );
    });
  });

  describe("what it keeps apart", () => {
    it("keeps the word order, so a relation is not reversible", () => {
      expect(canonFactKey(aFact("Nora aime Paul."))).not.toBe(
        canonFactKey(aFact("Paul aime Nora.")),
      );
    });

    it("keeps a preposition, which decides what a movement means", () => {
      expect(canonFactKey(aFact("Nora vient de Lyon."))).not.toBe(
        canonFactKey(aFact("Nora vient à Lyon.")),
      );
    });

    it("keeps the verb, which no determiner rule may strip", () => {
      expect(canonFactKey(aFact("Nora a une sœur."))).not.toBe(
        canonFactKey(aFact("Nora est une sœur.")),
      );
    });

    it("keeps the truth value, so a fact and its opposite are two facts", () => {
      expect(canonFactKey(aFact("x"))).not.toBe(canonFactKey(aFact("x", { isTrue: false })));
    });

    it("keeps the temporal case, so a scoped fact is not the permanent one", () => {
      expect(canonFactKey(aFact("x"))).not.toBe(
        canonFactKey(aFact("x", { validity: "DURING_PERIOD", validFromDay: -10 })),
      );
    });

    it("keeps the bounds, so two periods are not one", () => {
      expect(canonFactKey(aFact("x", { validity: "DURING_PERIOD", validFromDay: -10 }))).not.toBe(
        canonFactKey(aFact("x", { validity: "DURING_PERIOD", validFromDay: -20 })),
      );
    });

    it("keeps the subjects, so the same wording about two people is two facts", () => {
      expect(canonFactKey(aFact("x"))).not.toBe(
        canonFactKey(aFact("x", { subjectKeys: ["character Paul"] })),
      );
    });
  });
});

describe("deduplicateCanonFacts", () => {
  it("keeps everything when nothing repeats", () => {
    const result = deduplicateCanonFacts([
      aFact("Le manoir possède une cave."),
      aFact("Paul enseigne au collège.", { subjectKeys: ["character Paul"] }),
    ]);

    expect(result.kept).toEqual([0, 1]);
    expect(result.report.duplications).toEqual([]);
  });

  it("keeps the first of two facts that say the same thing", () => {
    const result = deduplicateCanonFacts([
      aFact("Le manoir possède une cave."),
      aFact("le manoir possède la cave"),
    ]);

    expect(result.kept).toEqual([0]);
    expect(result.report.duplications).toEqual([{ kind: "duplicate", index: 1, firstIndex: 0 }]);
  });

  it("carries the duplicate's beliefs into the fact that survives", () => {
    const result = deduplicateCanonFacts([
      aFact("x", { beliefs: [{ characterKey: "Nora", state: "UNAWARE" }] }),
      aFact("x", {
        beliefs: [
          { characterKey: "Nora", state: "UNAWARE" },
          { characterKey: "Paul", state: "BELIEVES_TRUE" },
        ],
      }),
    ]);

    expect(result.merges).toEqual([{ index: 1, intoIndex: 0, beliefIndexes: [1] }]);
  });

  it("keeps both when one character is given two stances, and says so", () => {
    const result = deduplicateCanonFacts([
      aFact("x", { beliefs: [{ characterKey: "Nora", state: "UNAWARE" }] }),
      aFact("x", { beliefs: [{ characterKey: "Nora", state: "BELIEVES_TRUE" }] }),
    ]);

    expect(result.kept).toEqual([0, 1]);
    expect(result.merges).toEqual([]);
    expect(result.report.duplications).toEqual([
      {
        kind: "contradictory-duplicate",
        index: 1,
        firstIndex: 0,
        beliefIndex: 0,
        firstBeliefIndex: 0,
      },
    ]);
  });

  it("drops what the bible already holds, including what was refused", () => {
    const result = deduplicateCanonFacts(
      [aFact("Le manoir possède une cave.", { isTrue: false })],
      [{ statement: "le manoir possède la cave", isTrue: false }],
    );

    expect(result.kept).toEqual([]);
    expect(result.report.known).toBe(1);
    expect(result.report.duplications).toEqual([
      { kind: "already-known", index: 0, knownIndex: 0 },
    ]);
  });

  it("does not read an already-known fact as known when the truth value differs", () => {
    const result = deduplicateCanonFacts(
      [aFact("Le manoir possède une cave.", { isTrue: false })],
      [{ statement: "Le manoir possède une cave.", isTrue: true }],
    );

    expect(result.kept).toEqual([0]);
  });

  it("reports a near-duplicate and keeps both, since one extends the other", () => {
    const result = deduplicateCanonFacts([
      aFact("Nora possède une voiture."),
      aFact("Nora possède une voiture rouge."),
    ]);

    expect(result.kept).toEqual([0, 1]);
    expect(result.report.duplications).toEqual([
      { kind: "near-duplicate", index: 1, firstIndex: 0, sharedWords: 3, words: 4 },
    ]);
  });

  it("says nothing about two facts sharing less than the ratio", () => {
    const result = deduplicateCanonFacts([
      aFact("Nora possède une voiture."),
      aFact("Nora possède une maison ancienne."),
    ]);

    expect(result.report.duplications).toEqual([]);
  });

  it("does not compare two facts about different entities", () => {
    const result = deduplicateCanonFacts([
      aFact("Nora possède une voiture."),
      aFact("Nora possède une voiture rouge.", { subjectKeys: ["character Paul"] }),
    ]);

    expect(result.report.duplications).toEqual([]);
  });

  it("counts what it did", () => {
    const result = deduplicateCanonFacts([
      aFact("Le manoir possède une cave."),
      aFact("le manoir possède la cave"),
      aFact("Paul enseigne au collège.", { subjectKeys: ["character Paul"] }),
    ]);

    expect(result.report).toMatchObject({ total: 3, kept: 2, merged: 1, known: 0 });
  });
});

describe("the deduplication vocabulary", () => {
  it("strips no negation, which would make a fact and its opposite one", () => {
    const stopped = new Set<string>(CANON_FACT_STOP_WORDS);

    for (const marker of CANON_FACT_NEGATION_MARKERS) {
      expect(stopped.has(marker)).toBe(false);
    }
  });

  it("strips nothing twice", () => {
    expect(new Set(CANON_FACT_STOP_WORDS).size).toBe(CANON_FACT_STOP_WORDS.length);
  });

  it("sets the near-duplicate bar high enough that one differing word is not a match", () => {
    expect(CANON_FACT_NEAR_DUPLICATE_RATIO).toBeGreaterThan(0.5);
    expect(CANON_FACT_NEAR_DUPLICATE_RATIO).toBeLessThan(1);
  });

  it("carries no word of a statement in what it reports", () => {
    const facts = [
      aFact("Le manoir possède une cave."),
      aFact("le manoir possède la cave"),
      aFact("Nora possède une voiture rouge."),
      aFact("Nora possède une voiture."),
    ];
    const serialised = JSON.stringify(deduplicateCanonFacts(facts).report);

    for (const fact of facts) {
      expect(serialised).not.toContain(fact.statement);
    }

    for (const word of ["manoir", "cave", "voiture", "Nora"]) {
      expect(serialised).not.toContain(word);
    }
  });
});
