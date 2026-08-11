import { describe, expect, it } from "vitest";

import {
  CHARACTER_KNOWLEDGE_STANCE_LABELS,
  CHARACTER_KNOWLEDGE_STANCE_PREFIXES,
  CHARACTER_KNOWLEDGE_STANCE_VERBS,
  CHARACTER_KNOWLEDGE_STANCES,
  knowledgeStanceToBelief,
} from "./knowledge";

describe("knowledgeStanceToBelief", () => {
  it("maps every stance — the derivation CAL-094 imports is total", () => {
    for (const stance of CHARACTER_KNOWLEDGE_STANCES) {
      const mapped = knowledgeStanceToBelief(stance);

      expect(typeof mapped.isTrue).toBe("boolean");
      expect(mapped.belief).toMatch(/\S/);
    }
  });

  it("decides both canon axes from one stance, pair for pair", () => {
    expect(knowledgeStanceToBelief("knows")).toEqual({ isTrue: true, belief: "BELIEVES_TRUE" });
    expect(knowledgeStanceToBelief("believes-wrongly")).toEqual({
      isTrue: false,
      belief: "BELIEVES_TRUE",
    });
    expect(knowledgeStanceToBelief("unaware")).toEqual({ isTrue: true, belief: "UNAWARE" });
    expect(knowledgeStanceToBelief("denies")).toEqual({ isTrue: true, belief: "BELIEVES_FALSE" });
  });

  it("reaches every belief state — nothing the canon can store is unsayable", () => {
    const beliefs = new Set(
      CHARACTER_KNOWLEDGE_STANCES.map((stance) => knowledgeStanceToBelief(stance).belief),
    );

    expect([...beliefs].sort()).toEqual(["BELIEVES_FALSE", "BELIEVES_TRUE", "UNAWARE"]);
  });

  it("never maps to a stored KNOWS — knowing stays derived", () => {
    // `CanonFactBeliefState` has no KNOWS member on purpose; `knows` on a
    // sheet is a true fact believed true, which `beliefMatchesWorld` reads
    // back as knowing.
    for (const stance of CHARACTER_KNOWLEDGE_STANCES) {
      expect(knowledgeStanceToBelief(stance).belief).not.toBe("KNOWS");
    }
  });
});

describe("the stance copy", () => {
  it("glosses and prefixes every stance", () => {
    for (const stance of CHARACTER_KNOWLEDGE_STANCES) {
      expect(CHARACTER_KNOWLEDGE_STANCE_LABELS[stance]).toMatch(/\S/);
      expect(CHARACTER_KNOWLEDGE_STANCE_PREFIXES[stance]).toMatch(/\S/);
    }
  });

  it("keeps the four prefixes distinct — the stance must survive flattening", () => {
    const prefixes = CHARACTER_KNOWLEDGE_STANCES.map(
      (stance) => CHARACTER_KNOWLEDGE_STANCE_PREFIXES[stance],
    );

    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("gives every stance a verb, and keeps the four distinct", () => {
    const verbs = CHARACTER_KNOWLEDGE_STANCES.map(
      (stance) => CHARACTER_KNOWLEDGE_STANCE_VERBS[stance],
    );

    for (const verb of verbs) {
      expect(verb).toMatch(/\S/);
    }

    expect(new Set(verbs).size).toBe(verbs.length);
  });

  it("spells each prefix as its own verb, capitalised — one wording, not two", () => {
    // The pin the prefixes' doc comment names: written out rather than
    // computed, so no locale-dependent `toUpperCase` sits between the author
    // and the words they read — and so the two tables can never drift.
    for (const stance of CHARACTER_KNOWLEDGE_STANCES) {
      const verb = CHARACTER_KNOWLEDGE_STANCE_VERBS[stance];
      const capitalised = `${verb.slice(0, 1).toUpperCase()}${verb.slice(1)}`;

      expect(CHARACTER_KNOWLEDGE_STANCE_PREFIXES[stance]).toBe(`${capitalised} :`);
    }
  });
});
