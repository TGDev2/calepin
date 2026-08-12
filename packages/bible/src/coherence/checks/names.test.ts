import { describe, expect, it } from "vitest";

import { aBibleContent, aCanonFact } from "../fixtures";
import { type BibleContentRows, buildBibleCoherenceSubject } from "../subject";
import { checkUndeclaredNames, extractNameCandidates } from "./names";

function findings(content: BibleContentRows) {
  return checkUndeclaredNames(buildBibleCoherenceSubject(content));
}

function withStatement(statement: string): BibleContentRows {
  return { ...aBibleContent(), canonFacts: [aCanonFact({ statement })] };
}

describe("extractNameCandidates", () => {
  it("never takes the first word of a sentence — it is capitalised for its position", () => {
    expect(extractNameCandidates("Nora referme la porte.")).toEqual([]);
  });

  it("takes a capitalised word inside a sentence", () => {
    expect(extractNameCandidates("elle attend Étienne depuis la veille")).toEqual([["Étienne"]]);
  });

  it("splits an elision, so the name after it is not the head of the sentence", () => {
    expect(extractNameCandidates("la maison d'Étienne brûle")).toEqual([["Étienne"]]);
  });

  it("keeps a name made of several words, particles included", () => {
    expect(extractNameCandidates("elle traverse le Val des Cendres à pied")).toEqual([
      ["Val", "des", "Cendres"],
    ]);
  });

  it("keeps a hyphenated name whole", () => {
    expect(extractNameCandidates("il écrit à Jean-Pierre chaque hiver")).toEqual([["Jean-Pierre"]]);
  });

  it("treats a quotation mark as the start of a sentence", () => {
    // The single largest source of false positives this check could have had:
    // a line of dialogue opens with a capital exactly as a sentence does.
    expect(extractNameCandidates("elle répond : « Personne ne descend ici »")).toEqual([]);
  });

  it("treats a dash and a colon as sentence boundaries too", () => {
    expect(extractNameCandidates("il hésite — Peut-être, dit-il")).toEqual([]);
  });
});

describe("checkUndeclaredNames", () => {
  it("says nothing about a bible whose names are all declared", () => {
    expect(findings(aBibleContent())).toEqual([]);
  });

  it("reports a name the bible uses and never declares", () => {
    const [finding, ...rest] = findings(
      withStatement("la clef appartenait à Étienne avant la vente"),
    );

    expect(rest).toEqual([]);
    expect(finding?.checkId).toBe("bible-undeclared-name");
    expect(finding?.severity).toBe("MAJOR");
    expect(finding?.anchor).toEqual(["name:étienne"]);
    expect(finding?.explanation).toContain("Étienne");
  });

  it("says nothing when the name is a declared character given a surname", () => {
    // Matching the whole phrase would report a character every time the bible
    // gives her a family name. Any shared token is enough.
    expect(findings(withStatement("la clef appartenait à Nora Vallin avant la vente"))).toEqual([]);
  });

  it("says nothing when the name is a declared place", () => {
    expect(findings(withStatement("la clef ouvre encore Le Vallon"))).toEqual([]);
  });

  it("drops a civil title and a month rather than reporting them", () => {
    expect(
      findings(withStatement("la vente eut lieu en Novembre devant Monsieur le notaire")),
    ).toEqual([]);
  });

  it("reports one finding for a name that appears in two sections", () => {
    const content = aBibleContent();
    const broken: BibleContentRows = {
      ...content,
      canonFacts: [aCanonFact({ statement: "la clef appartenait à Étienne" })],
      characters: content.characters.map((character) =>
        character.name === "Victor"
          ? { ...character, secret: "il a vu partir Étienne cette nuit-là" }
          : character,
      ),
    };

    const found = findings(broken);

    expect(found).toHaveLength(1);
    expect(found[0]?.explanation).toContain("un fait canonique");
    expect(found[0]?.explanation).toContain("une fiche personnage");
  });

  it("gives two typographies of one name a single identity, so a decision survives a retyped word", () => {
    // A non-breaking hyphen is what a model — or a word processor — substitutes
    // without anybody noticing. Two rows would mean the author arbitrating the
    // same name twice.
    const nonBreakingHyphen = String.fromCodePoint(0x2011);
    const content = aBibleContent();
    const broken: BibleContentRows = {
      ...content,
      canonFacts: [
        aCanonFact({ id: "fact-a", statement: "la clef ouvrait Sainte-Anne" }),
        aCanonFact({
          id: "fact-b",
          statement: `la lettre nommait Sainte${nonBreakingHyphen}Anne`,
          beliefs: [],
          subjects: [],
        }),
      ],
    };

    expect(findings(broken)).toHaveLength(1);
  });

  it("reports nothing when the bible holds no prose at all", () => {
    expect(
      findings({
        identity: null,
        style: null,
        world: null,
        places: [],
        worldRules: [],
        characters: [],
        relationships: [],
        timeline: [],
        canonFacts: [],
      }),
    ).toEqual([]);
  });
});
