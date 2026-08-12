import { describe, expect, it } from "vitest";

import { contentWordsOf, STAKE_OVERLAP_RATIO, stakeOverlap } from "./overlap";

describe("contentWordsOf", () => {
  it("strips the stop words and keeps the words that carry the stake", () => {
    const words = contentWordsOf("Obtenir le chantier de la fresque pour la famille");

    expect(words).toEqual(new Set(["obtenir", "chantier", "fresque", "famille"]));
  });

  it("keeps accents significant — dès is not the article des", () => {
    expect(contentWordsOf("dès l'aube")).toEqual(new Set(["dès", "aube"]));
    expect(contentWordsOf("des aubes")).toEqual(new Set(["aubes"]));
  });

  it("splits elisions so l'atelier and atelier compare as one word", () => {
    expect(contentWordsOf("l'atelier")).toEqual(new Set(["atelier"]));
  });

  it("answers the empty set for text holding only stop words", () => {
    expect(contentWordsOf("de la à le").size).toBe(0);
  });
});

describe("stakeOverlap", () => {
  it("counts the shared words over the larger set — the strict direction", () => {
    const overlap = stakeOverlap(
      contentWordsOf("sauver l'atelier des Ferrand"),
      contentWordsOf("sauver l'atelier"),
    );

    expect(overlap).toEqual({ sharedWords: 2, words: 3 });
    expect(overlap.sharedWords / overlap.words).toBeLessThan(STAKE_OVERLAP_RATIO);
  });

  it("answers a full overlap for an identical stake", () => {
    const stake = contentWordsOf("établir qui a organisé la ruine de l'atelier");
    const overlap = stakeOverlap(stake, stake);

    expect(overlap.sharedWords).toBe(overlap.words);
    expect(overlap.words).toBeGreaterThan(0);
  });
});
