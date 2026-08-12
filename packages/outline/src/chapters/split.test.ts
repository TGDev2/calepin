/**
 * The split's conservation arithmetic (CAL-106).
 *
 * Every refusal is proved with its converse, so a passing suite says the rule
 * *bites* rather than that the code ran. The fixtures are technical: what is
 * under test is where a reference lands, never what it says (§9).
 */

import { describe, expect, it } from "vitest";

import type { ChapterCutOutline, ChapterCutSource } from "./cut";
import { CHAPTER_MERGE_CONNECTOR } from "./merge";
import {
  CHAPTER_SPLIT_ADVISORY_KINDS,
  CHAPTER_SPLIT_DEFECT_KINDS,
  CHAPTER_SPLIT_PROSE_CHAR_CEILING,
  type ChapterSplitArbitration,
  type ChapterSplitHalf,
  checkChapterSplit,
  parseChapterSplitArbitration,
} from "./split";

function anOutline(overrides: Partial<ChapterCutOutline> = {}): ChapterCutOutline {
  return {
    workingTitle: "titre-source",
    targetWordCount: 4_000,
    focalCharacterId: "character-1",
    placeId: "place-1",
    periodStartDay: 10,
    periodEndDay: 20,
    periodPrecision: "DAY",
    periodLabel: "label-source",
    dramaticFunction: `fonction-un ${CHAPTER_MERGE_CONNECTOR} fonction-deux`,
    immediateGoal: `objectif-un ${CHAPTER_MERGE_CONNECTOR} objectif-deux`,
    obstacle: `obstacle-un ${CHAPTER_MERGE_CONNECTOR} obstacle-deux`,
    decision: `decision-un ${CHAPTER_MERGE_CONNECTOR} decision-deux`,
    revelation: `revelation-un ${CHAPTER_MERGE_CONNECTOR} revelation-deux`,
    consequence: `consequence-un ${CHAPTER_MERGE_CONNECTOR} consequence-deux`,
    detailedSummary: `resume-un ${CHAPTER_MERGE_CONNECTOR} resume-deux`,
    lockedAt: null,
    characterIds: ["character-1", "character-2"],
    factIds: ["fact-1", "fact-2"],
    ...overrides,
  };
}

function aSource(overrides: Partial<ChapterCutSource> = {}): ChapterCutSource {
  return {
    id: "chapter-1",
    partId: "part-1",
    orderKey: "i",
    revisionCount: 0,
    outline: anOutline(),
    opensThreadIds: ["thread-1"],
    continuesThreadIds: ["thread-2"],
    closesThreadIds: ["thread-3"],
    ...overrides,
  };
}

function aHalf(overrides: Partial<ChapterSplitHalf> = {}): ChapterSplitHalf {
  return {
    workingTitle: "titre-moitie",
    targetWordCount: 2_000,
    focalCharacterId: "character-1",
    placeId: "place-1",
    periodStartDay: 10,
    periodEndDay: 15,
    periodPrecision: "DAY",
    periodLabel: "label-moitie",
    dramaticFunction: "fonction-un",
    immediateGoal: "objectif-un",
    obstacle: "obstacle-un",
    decision: "decision-un",
    revelation: "revelation-un",
    consequence: "consequence-un",
    detailedSummary: "resume-un",
    characterIds: ["character-1"],
    factIds: ["fact-1"],
    opensThreadIds: ["thread-1"],
    continuesThreadIds: [],
    closesThreadIds: [],
    ...overrides,
  };
}

/** The arbitration that puts back exactly what the merge joined. */
function anArbitration(
  first: Partial<ChapterSplitHalf> = {},
  second: Partial<ChapterSplitHalf> = {},
): ChapterSplitArbitration {
  return {
    chapterId: "chapter-1",
    first: aHalf(first),
    second: aHalf({
      periodStartDay: 16,
      periodEndDay: 20,
      dramaticFunction: "fonction-deux",
      immediateGoal: "objectif-deux",
      obstacle: "obstacle-deux",
      decision: "decision-deux",
      revelation: "revelation-deux",
      consequence: "consequence-deux",
      detailedSummary: "resume-deux",
      characterIds: ["character-2"],
      focalCharacterId: "character-2",
      factIds: ["fact-2"],
      opensThreadIds: [],
      continuesThreadIds: ["thread-2"],
      closesThreadIds: ["thread-3"],
      ...second,
    }),
  };
}

const kinds = (report: { defects: readonly { kind: string }[] }): string[] =>
  report.defects.map((defect) => defect.kind);

describe("checkChapterSplit — the redistribution that keeps everything", () => {
  it("accepts a redistribution that places every reference", () => {
    const report = checkChapterSplit(aSource(), anArbitration());

    expect(report.acceptable).toBe(true);
    expect(report.defects).toEqual([]);
  });

  it("counts what was there to redistribute", () => {
    const report = checkChapterSplit(aSource(), anArbitration());

    expect(report.redistributed).toEqual({ characters: 2, facts: 2, threadActions: 3 });
  });

  it("accepts a reference carried by both halves", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({
        characterIds: ["character-1", "character-2"],
        factIds: ["fact-1", "fact-2"],
      }),
    );

    expect(report.acceptable).toBe(true);
  });

  it("accepts a continuation carried by both halves", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({ continuesThreadIds: ["thread-2"] }),
    );

    expect(report.acceptable).toBe(true);
  });
});

describe("checkChapterSplit — nothing may be lost", () => {
  it("refuses a character neither half keeps", () => {
    const report = checkChapterSplit(aSource(), anArbitration({}, { characterIds: [] }));

    expect(kinds(report)).toContain("dropped-character");
    expect(report.acceptable).toBe(false);
  });

  it("keeps the source's focal character in the conserved set", () => {
    const source = aSource({
      outline: anOutline({ focalCharacterId: "character-9", characterIds: ["character-1"] }),
    });
    const report = checkChapterSplit(source, anArbitration({}, { characterIds: [] }));

    expect(report.defects).toContainEqual({
      kind: "dropped-character",
      characterId: "character-9",
    });
  });

  it("refuses a fact neither half keeps", () => {
    const report = checkChapterSplit(aSource(), anArbitration({}, { factIds: [] }));

    expect(report.defects).toContainEqual({ kind: "dropped-fact", factId: "fact-2" });
  });

  it("refuses a thread action neither half keeps, and names the list", () => {
    const report = checkChapterSplit(aSource(), anArbitration({}, { closesThreadIds: [] }));

    expect(report.defects).toContainEqual({
      kind: "dropped-thread-action",
      threadId: "thread-3",
      list: "closes",
    });
  });

  it("refuses a continuation demoted into an opening rather than kept", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({}, { continuesThreadIds: [], opensThreadIds: ["thread-2"] }),
    );

    expect(kinds(report)).toContain("dropped-thread-action");
    expect(kinds(report)).toContain("unknown-thread-action");
  });
});

describe("checkChapterSplit — nothing may be added", () => {
  it("refuses a character the source did not carry", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({ characterIds: ["character-1", "character-8"] }),
    );

    expect(report.defects).toContainEqual({
      kind: "unknown-character",
      characterId: "character-8",
      half: "first",
    });
  });

  it("refuses a fact the source did not carry", () => {
    const report = checkChapterSplit(aSource(), anArbitration({ factIds: ["fact-1", "fact-8"] }));

    expect(report.defects).toContainEqual({
      kind: "unknown-fact",
      factId: "fact-8",
      half: "first",
    });
  });

  it("refuses a thread action the source did not hold", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({ opensThreadIds: ["thread-1", "thread-7"] }),
    );

    expect(report.defects).toContainEqual({
      kind: "unknown-thread-action",
      threadId: "thread-7",
      list: "opens",
      half: "first",
    });
  });
});

describe("checkChapterSplit — the thread endpoints", () => {
  it("refuses one opening claimed by both halves", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({}, { opensThreadIds: ["thread-1"] }),
    );

    expect(report.defects).toContainEqual({
      kind: "duplicated-thread-endpoint",
      threadId: "thread-1",
      list: "opens",
    });
  });

  it("refuses one closing claimed by both halves", () => {
    const report = checkChapterSplit(aSource(), anArbitration({ closesThreadIds: ["thread-3"] }));

    expect(report.defects).toContainEqual({
      kind: "duplicated-thread-endpoint",
      threadId: "thread-3",
      list: "closes",
    });
  });

  it("refuses a thread the second half opens and the first half closes", () => {
    const source = aSource({ opensThreadIds: ["thread-1"], closesThreadIds: ["thread-1"] });
    const report = checkChapterSplit(
      source,
      anArbitration(
        { opensThreadIds: [], closesThreadIds: ["thread-1"] },
        { opensThreadIds: ["thread-1"], closesThreadIds: [] },
      ),
    );

    expect(report.defects).toContainEqual({
      kind: "thread-closes-before-opens",
      threadId: "thread-1",
    });
  });

  it("accepts the same thread opened first and closed second", () => {
    const source = aSource({
      opensThreadIds: ["thread-1"],
      continuesThreadIds: [],
      closesThreadIds: ["thread-1"],
    });
    const report = checkChapterSplit(
      source,
      anArbitration(
        { opensThreadIds: ["thread-1"], continuesThreadIds: [], closesThreadIds: [] },
        { opensThreadIds: [], continuesThreadIds: [], closesThreadIds: ["thread-1"] },
      ),
    );

    expect(report.acceptable).toBe(true);
  });
});

describe("checkChapterSplit — the halves themselves", () => {
  it("refuses a half focalised on a character it does not hold", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({ focalCharacterId: "character-2", characterIds: ["character-1"] }),
    );

    expect(report.defects).toContainEqual({ kind: "focal-not-present", half: "first" });
  });

  it("refuses a half placed outside the source's own span", () => {
    const report = checkChapterSplit(aSource(), anArbitration({ periodStartDay: 5 }));

    expect(report.defects).toContainEqual({
      kind: "period-outside-source-span",
      half: "first",
    });
  });

  it("accepts halves that partition the source's span", () => {
    const report = checkChapterSplit(aSource(), anArbitration());

    expect(kinds(report)).not.toContain("period-outside-source-span");
  });

  it("refuses two targets that do not sum back to the source's", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({ targetWordCount: 1_000 }, { targetWordCount: 1_000 }),
    );

    expect(kinds(report)).toContain("word-budget-out-of-tolerance");
  });

  it("accepts two targets inside the tolerance", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({ targetWordCount: 2_200 }, { targetWordCount: 1_900 }),
    );

    expect(kinds(report)).not.toContain("word-budget-out-of-tolerance");
  });

  it("disarms the budget when any target is unstated", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({ targetWordCount: null }, { targetWordCount: 500 }),
    );

    expect(kinds(report)).not.toContain("word-budget-out-of-tolerance");
  });
});

describe("checkChapterSplit — the same two refusals as the merge", () => {
  it("refuses a chapter that already holds a revision", () => {
    const report = checkChapterSplit(aSource({ revisionCount: 3 }), anArbitration());

    expect(report.defects).toContainEqual({
      kind: "chapter-written",
      chapterId: "chapter-1",
      revisionCount: 3,
    });
  });

  it("refuses a locked plan", () => {
    const report = checkChapterSplit(
      aSource({ outline: anOutline({ lockedAt: new Date("2026-01-01T00:00:00.000Z") }) }),
      anArbitration(),
    );

    expect(report.defects).toContainEqual({ kind: "plan-locked", chapterId: "chapter-1" });
  });
});

describe("checkChapterSplit — the advisories", () => {
  it("reports nothing rewritten when both halves are cut out of the source", () => {
    const report = checkChapterSplit(aSource(), anArbitration());

    expect(report.advisories.filter((advisory) => advisory.kind === "rewritten-prose")).toEqual([]);
  });

  it("names the half and the column whose prose is new words", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({ obstacle: "un obstacle que personne n a écrit avant" }),
    );

    expect(report.advisories).toContainEqual({
      kind: "rewritten-prose",
      half: "first",
      column: "obstacle",
    });
  });

  it("counts a column the source never held as rewritten", () => {
    const report = checkChapterSplit(
      aSource({ outline: anOutline({ revelation: null }) }),
      anArbitration(),
    );

    expect(report.advisories).toContainEqual({
      kind: "rewritten-prose",
      half: "first",
      column: "revelation",
    });
  });

  it("never refuses over rewritten prose", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({ obstacle: "tout autre chose", consequence: "et encore autre chose" }),
    );

    expect(report.acceptable).toBe(true);
  });

  it("reports two halves chasing one objective", () => {
    const report = checkChapterSplit(
      aSource(),
      anArbitration({ immediateGoal: "objectif-un" }, { immediateGoal: "objectif-un" }),
    );

    expect(report.advisories.map((advisory) => advisory.kind)).toContain("similar-stakes");
    expect(report.acceptable).toBe(true);
  });

  it("reports a half aiming below the admissible chapter length", () => {
    const report = checkChapterSplit(
      aSource({ outline: anOutline({ targetWordCount: 1_500 }) }),
      anArbitration({ targetWordCount: 800 }, { targetWordCount: 700 }),
    );

    expect(report.advisories).toContainEqual({
      kind: "half-below-envelope",
      half: "first",
      targetWordCount: 800,
      minWords: 1_000,
    });
    expect(report.acceptable).toBe(true);
  });

  it("declares every kind it can produce", () => {
    expect([...CHAPTER_SPLIT_ADVISORY_KINDS]).toEqual([
      "similar-stakes",
      "half-below-envelope",
      "rewritten-prose",
    ]);
    expect(CHAPTER_SPLIT_DEFECT_KINDS).toHaveLength(13);
  });
});

describe("parseChapterSplitArbitration", () => {
  it("accepts a well-formed arbitration", () => {
    expect(parseChapterSplitArbitration(anArbitration()).ok).toBe(true);
  });

  it("refuses a half whose period ends before it starts", () => {
    const parsed = parseChapterSplitArbitration(
      anArbitration({ periodStartDay: 15, periodEndDay: 10 }),
    );

    expect(parsed.ok).toBe(false);
  });

  it("refuses a half stating days with no precision", () => {
    const parsed = parseChapterSplitArbitration(anArbitration({ periodPrecision: null }));

    expect(parsed.ok).toBe(false);
  });

  it("accepts a half placed nowhere at all", () => {
    const parsed = parseChapterSplitArbitration(
      anArbitration({
        periodStartDay: null,
        periodEndDay: null,
        periodPrecision: null,
        periodLabel: null,
      }),
    );

    expect(parsed.ok).toBe(true);
  });

  it("refuses a half acting twice on one thread", () => {
    const parsed = parseChapterSplitArbitration(
      anArbitration({ opensThreadIds: ["thread-1"], continuesThreadIds: ["thread-1"] }),
    );

    expect(parsed.ok).toBe(false);
  });

  it("refuses a half naming one character twice", () => {
    const parsed = parseChapterSplitArbitration(
      anArbitration({ characterIds: ["character-1", "character-1"] }),
    );

    expect(parsed.ok).toBe(false);
  });

  it("refuses an unknown field rather than ignoring it", () => {
    const parsed = parseChapterSplitArbitration({ ...anArbitration(), partId: "part-1" });

    expect(parsed.ok).toBe(false);
  });

  it("carries the prose a previous merge joined", () => {
    const joined = "mot ".repeat(600).trim();

    expect(joined.length).toBeLessThan(CHAPTER_SPLIT_PROSE_CHAR_CEILING);
    expect(parseChapterSplitArbitration(anArbitration({ detailedSummary: joined })).ok).toBe(true);
  });

  it("answers in French and names no field", () => {
    const parsed = parseChapterSplitArbitration({ chapterId: "" });

    if (parsed.ok) throw new Error("expected a refusal");

    expect(parsed.error.userMessage).toBe(
      "Cette scission n'a pas pu être interprétée. Rechargez le plan.",
    );
  });
});
