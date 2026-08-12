/**
 * The merge, attribute by attribute (CAL-106).
 *
 * Every fixture is technical: what is under test is where an attribute lands,
 * never what it says, so §9 costs this suite nothing.
 */

import { describe, expect, it } from "vitest";

import type { OrderedChapter } from "../order/types";
import { CHAPTER_PROSE_COLUMNS, type ChapterCutOutline, type ChapterCutSource } from "./cut";
import {
  CHAPTER_MERGE_CONNECTOR,
  CHAPTER_MERGE_DEFECT_KINDS,
  CHAPTER_MERGE_LOSS_KINDS,
  CHAPTER_MERGE_TITLE_CONNECTOR,
  type ChapterMergeOutcome,
  parseChapterMergeRequest,
  planChapterMerge,
} from "./merge";

function anOutline(overrides: Partial<ChapterCutOutline> = {}): ChapterCutOutline {
  return {
    workingTitle: "title-a",
    targetWordCount: 3_000,
    focalCharacterId: "character-1",
    placeId: "place-1",
    periodStartDay: 10,
    periodEndDay: 12,
    periodPrecision: "DAY",
    periodLabel: "label-a",
    dramaticFunction: "function-a",
    immediateGoal: "goal-a",
    obstacle: "obstacle-a",
    decision: "decision-a",
    revelation: "revelation-a",
    consequence: "consequence-a",
    detailedSummary: "summary-a",
    lockedAt: null,
    characterIds: ["character-1", "character-2"],
    factIds: ["fact-1"],
    ...overrides,
  };
}

function aChapter(overrides: Partial<ChapterCutSource> = {}): ChapterCutSource {
  return {
    id: "chapter-1",
    partId: "part-1",
    orderKey: "i",
    revisionCount: 0,
    outline: anOutline(),
    opensThreadIds: [],
    continuesThreadIds: [],
    closesThreadIds: [],
    ...overrides,
  };
}

/** The two chapters of the default pair, adjacent in one part. */
function aPair(
  first: Partial<ChapterCutSource> = {},
  second: Partial<ChapterCutSource> = {},
): { first: ChapterCutSource; second: ChapterCutSource; siblings: OrderedChapter[] } {
  const one = aChapter({ id: "chapter-1", orderKey: "i", ...first });
  const two = aChapter({
    id: "chapter-2",
    orderKey: "r",
    outline: anOutline({
      workingTitle: "title-b",
      targetWordCount: 2_000,
      periodStartDay: 14,
      periodEndDay: 20,
      periodLabel: "label-b",
      dramaticFunction: "function-b",
      immediateGoal: "goal-b",
      obstacle: "obstacle-b",
      decision: "decision-b",
      revelation: "revelation-b",
      consequence: "consequence-b",
      detailedSummary: "summary-b",
      characterIds: ["character-2", "character-3"],
      factIds: ["fact-2"],
    }),
    ...second,
  });

  return {
    first: one,
    second: two,
    siblings: [
      { id: one.id, partId: one.partId, orderKey: one.orderKey },
      { id: two.id, partId: two.partId, orderKey: two.orderKey },
      { id: "chapter-3", partId: "part-1", orderKey: "u" },
    ],
  };
}

function acceptable(outcome: ChapterMergeOutcome) {
  if (!outcome.acceptable) {
    throw new Error(`expected an acceptable merge, got ${JSON.stringify(outcome.report.defects)}`);
  }

  return outcome;
}

describe("planChapterMerge", () => {
  it("keeps the first chapter and absorbs the second", () => {
    const { first, second, siblings } = aPair();
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.survivorId).toBe("chapter-1");
    expect(plan.absorbedId).toBe("chapter-2");
  });

  it("joins every prose column behind the connector, in reading order", () => {
    const { first, second, siblings } = aPair();
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    for (const column of CHAPTER_PROSE_COLUMNS) {
      expect(plan.outline?.[column]).toBe(
        `${String(first.outline?.[column])} ${CHAPTER_MERGE_CONNECTOR} ${String(
          second.outline?.[column],
        )}`,
      );
    }
  });

  it("joins the headings behind the title connector", () => {
    const { first, second, siblings } = aPair();
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline?.workingTitle).toBe(`title-a ${CHAPTER_MERGE_TITLE_CONNECTOR} title-b`);
    expect(plan.outline?.periodLabel).toBe(`label-a ${CHAPTER_MERGE_TITLE_CONNECTOR} label-b`);
  });

  it("carries a column stated on one side only, unchanged and unconnected", () => {
    const { first, second, siblings } = aPair(
      { outline: anOutline({ obstacle: null, revelation: null }) },
      { outline: anOutline({ obstacle: "obstacle-b", revelation: null }) },
    );
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline?.obstacle).toBe("obstacle-b");
    expect(plan.outline?.revelation).toBeNull();
  });

  it("sums the target word counts, so the part's budget does not move", () => {
    const { first, second, siblings } = aPair();
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline?.targetWordCount).toBe(5_000);
  });

  it("sums past the admissible chapter length rather than clamping", () => {
    const { first, second, siblings } = aPair(
      { outline: anOutline({ targetWordCount: 7_000 }) },
      { outline: anOutline({ targetWordCount: 6_000 }) },
    );
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline?.targetWordCount).toBe(13_000);
  });

  it("leaves the target null when neither chapter states one", () => {
    const { first, second, siblings } = aPair(
      { outline: anOutline({ targetWordCount: null }) },
      { outline: anOutline({ targetWordCount: null }) },
    );
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline?.targetWordCount).toBeNull();
  });

  it("unions the characters and the facts, keeping the first chapter's order", () => {
    const { first, second, siblings } = aPair();
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.characterIds).toEqual(["character-1", "character-2", "character-3"]);
    expect(plan.factIds).toEqual(["fact-1", "fact-2"]);
  });

  it("takes the union interval of the two periods", () => {
    const { first, second, siblings } = aPair();
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline?.periodStartDay).toBe(10);
    expect(plan.outline?.periodEndDay).toBe(20);
  });

  it("widens the precision to the coarser of the two", () => {
    const { first, second, siblings } = aPair(
      { outline: anOutline({ periodPrecision: "DAY" }) },
      { outline: anOutline({ periodPrecision: "SEASON" }) },
    );
    const { plan, report } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline?.periodPrecision).toBe("SEASON");
    expect(report.losses).toEqual([
      { kind: "period-precision", keptPrecision: "SEASON", droppedPrecision: "DAY" },
    ]);
  });

  it("takes the stated period whole when only one chapter is placed", () => {
    const { first, second, siblings } = aPair(
      {
        outline: anOutline({
          periodStartDay: null,
          periodEndDay: null,
          periodPrecision: null,
          periodLabel: null,
        }),
      },
      { outline: anOutline({ periodStartDay: 30, periodEndDay: 33, periodPrecision: "MONTH" }) },
    );
    const { plan, report } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline?.periodStartDay).toBe(30);
    expect(plan.outline?.periodEndDay).toBe(33);
    expect(plan.outline?.periodPrecision).toBe("MONTH");
    expect(report.losses).toEqual([]);
  });

  it("writes no plan at all when neither chapter has one", () => {
    const { first, second, siblings } = aPair({ outline: null }, { outline: null });
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline).toBeNull();
    expect(plan.characterIds).toEqual([]);
  });
});

describe("planChapterMerge — the reference graph", () => {
  it("repoints every opening and every closing of the absorbed chapter", () => {
    const { first, second, siblings } = aPair(
      {},
      { opensThreadIds: ["thread-1"], closesThreadIds: ["thread-2"] },
    );
    const { plan, report } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.threadOpeningsToRepoint).toEqual(["thread-1"]);
    expect(plan.threadClosingsToRepoint).toEqual(["thread-2"]);
    expect(report.consolidated.threadOpenings).toBe(1);
    expect(report.consolidated.threadClosings).toBe(1);
  });

  it("moves a continuation the survivor does not already hold", () => {
    const { first, second, siblings } = aPair({}, { continuesThreadIds: ["thread-9"] });
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.continuationsToMove).toEqual(["thread-9"]);
    expect(plan.continuationsToDrop).toEqual([]);
  });

  it("does not double a continuation both chapters already carry", () => {
    const { first, second, siblings } = aPair(
      { continuesThreadIds: ["thread-9"] },
      { continuesThreadIds: ["thread-9"] },
    );
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.continuationsToMove).toEqual([]);
    expect(plan.continuationsToDrop).toEqual([]);
  });

  it("drops a continuation the merged chapter now opens or closes", () => {
    const { first, second, siblings } = aPair(
      { continuesThreadIds: ["thread-3"] },
      { closesThreadIds: ["thread-3"] },
    );
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.continuationsToDrop).toEqual(["thread-3"]);
    expect(plan.continuationsToMove).toEqual([]);
  });

  it("lets one chapter both open and close a thread once it has absorbed the other", () => {
    const { first, second, siblings } = aPair(
      { opensThreadIds: ["thread-4"] },
      { closesThreadIds: ["thread-4"] },
    );
    const { plan } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.threadClosingsToRepoint).toEqual(["thread-4"]);
    expect(plan.continuationsToMove).toEqual([]);
  });
});

describe("planChapterMerge — the three losses", () => {
  it("reports nothing to acknowledge when the two chapters agree", () => {
    const { first, second, siblings } = aPair();
    const { report } = acceptable(planChapterMerge(first, second, siblings));

    expect(report.losses).toEqual([]);
  });

  it("keeps the first place and names the dropped one", () => {
    const { first, second, siblings } = aPair(
      { outline: anOutline({ placeId: "place-1" }) },
      { outline: anOutline({ placeId: "place-2" }) },
    );
    const { plan, report } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline?.placeId).toBe("place-1");
    expect(report.losses).toEqual([
      { kind: "place", keptPlaceId: "place-1", droppedPlaceId: "place-2" },
    ]);
  });

  it("takes the only stated place without calling it a loss", () => {
    const { first, second, siblings } = aPair(
      { outline: anOutline({ placeId: null }) },
      { outline: anOutline({ placeId: "place-2" }) },
    );
    const { plan, report } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline?.placeId).toBe("place-2");
    expect(report.losses).toEqual([]);
  });

  it("demotes the absorbed focal character into the cast rather than losing them", () => {
    const { first, second, siblings } = aPair(
      { outline: anOutline({ focalCharacterId: "character-1", characterIds: ["character-1"] }) },
      { outline: anOutline({ focalCharacterId: "character-7", characterIds: [] }) },
    );
    const { plan, report } = acceptable(planChapterMerge(first, second, siblings));

    expect(plan.outline?.focalCharacterId).toBe("character-1");
    expect(plan.characterIds).toContain("character-7");
    expect(report.losses).toEqual([
      {
        kind: "focal-character",
        keptCharacterId: "character-1",
        demotedCharacterId: "character-7",
      },
    ]);
  });

  it("reports every loss of a pair that disagrees on all three", () => {
    const { first, second, siblings } = aPair(
      {},
      {
        outline: anOutline({
          placeId: "place-2",
          focalCharacterId: "character-7",
          periodPrecision: "YEAR",
        }),
      },
    );
    const { report } = acceptable(planChapterMerge(first, second, siblings));

    expect(report.losses.map((loss) => loss.kind).sort()).toEqual(
      [...CHAPTER_MERGE_LOSS_KINDS].sort(),
    );
  });
});

describe("planChapterMerge — the five refusals", () => {
  it("refuses a chapter merged with itself, and looks no further", () => {
    const { first, siblings } = aPair();
    const outcome = planChapterMerge(first, first, siblings);

    expect(outcome.acceptable).toBe(false);
    expect(outcome.report.defects).toEqual([{ kind: "same-chapter" }]);
  });

  it("refuses a pair straddling two parts", () => {
    const { first, second, siblings } = aPair({}, { partId: "part-2" });
    const outcome = planChapterMerge(first, second, [
      ...siblings.filter((chapter) => chapter.id !== second.id),
      { id: second.id, partId: "part-2", orderKey: "i" },
    ]);

    expect(outcome.report.defects).toEqual([{ kind: "different-parts" }]);
  });

  it("refuses a pair the plan does not read one after the other", () => {
    const { first, siblings } = aPair();
    const distant = aChapter({ id: "chapter-3", orderKey: "u" });
    const outcome = planChapterMerge(first, distant, siblings);

    expect(outcome.report.defects).toEqual([{ kind: "not-adjacent" }]);
  });

  it("refuses the same pair given in reverse rather than swapping it", () => {
    const { first, second, siblings } = aPair();
    const outcome = planChapterMerge(second, first, siblings);

    expect(outcome.report.defects).toEqual([{ kind: "not-adjacent" }]);
  });

  it("refuses a chapter that already holds a revision", () => {
    const { first, second, siblings } = aPair({}, { revisionCount: 2 });
    const outcome = planChapterMerge(first, second, siblings);

    expect(outcome.report.defects).toEqual([
      { kind: "chapter-written", chapterId: "chapter-2", revisionCount: 2 },
    ]);
  });

  it("refuses a locked plan, on either side", () => {
    const { first, second, siblings } = aPair({
      outline: anOutline({ lockedAt: new Date("2026-01-01T00:00:00.000Z") }),
    });
    const outcome = planChapterMerge(first, second, siblings);

    expect(outcome.report.defects).toEqual([{ kind: "plan-locked", chapterId: "chapter-1" }]);
  });

  it("asks for no acknowledgement when it is already refusing", () => {
    const { first, second, siblings } = aPair(
      { revisionCount: 1 },
      { outline: anOutline({ placeId: "place-2" }) },
    );
    const outcome = planChapterMerge(first, second, siblings);

    expect(outcome.acceptable).toBe(false);
    expect(outcome.report.losses).toEqual([]);
  });

  it("declares every defect kind it can produce", () => {
    expect([...CHAPTER_MERGE_DEFECT_KINDS]).toEqual([
      "same-chapter",
      "different-parts",
      "not-adjacent",
      "chapter-written",
      "plan-locked",
    ]);
  });
});

describe("parseChapterMergeRequest", () => {
  it("accepts a well-formed request", () => {
    const parsed = parseChapterMergeRequest({
      survivorChapterId: "chapter-1",
      absorbedChapterId: "chapter-2",
      acknowledgeLoss: false,
    });

    expect(parsed.ok).toBe(true);
  });

  it("refuses a request that leaves the acknowledgement unsaid", () => {
    const parsed = parseChapterMergeRequest({
      survivorChapterId: "chapter-1",
      absorbedChapterId: "chapter-2",
    });

    expect(parsed.ok).toBe(false);
  });

  it("refuses an unknown field rather than ignoring it", () => {
    const parsed = parseChapterMergeRequest({
      survivorChapterId: "chapter-1",
      absorbedChapterId: "chapter-2",
      acknowledgeLoss: true,
      partId: "part-1",
    });

    expect(parsed.ok).toBe(false);
  });

  it("answers in French and names no field", () => {
    const parsed = parseChapterMergeRequest({ survivorChapterId: "" });

    if (parsed.ok) throw new Error("expected a refusal");

    expect(parsed.error.userMessage).toBe(
      "Cette fusion n'a pas pu être interprétée. Rechargez le plan.",
    );
  });
});
