/**
 * The `split-chapter-outline` contract (CAL-106).
 *
 * Fixtures are technical (§9). What is under test is the account of where each
 * element went, never the words that describe it.
 */

import { describe, expect, it } from "vitest";

import type { PlannedChapter } from "./schema";
import {
  CHAPTER_SPLIT_PLACEMENT_MAX,
  CHAPTER_SPLIT_PLACEMENTS,
  CHAPTER_SPLIT_PROSE_ONLY_PLACEMENTS,
  type ChapterSplitInput,
  chapterSplitInputSchema,
  type ChapterSplitPlacement,
  chapterSplitPlacementSchema,
  type ChapterSplitProposal,
  chapterSplitProposalSchema,
  isVerifiedChapterSplitProposal,
  resolveChapterSplitProposal,
  resolveChapterSplitSource,
  verifyChapterSplitProposal,
} from "./split-mission";

function anInput(overrides: Partial<ChapterSplitInput> = {}): ChapterSplitInput {
  return chapterSplitInputSchema.parse({
    bibleVersionNumber: 2,
    chapterId: "chapter-1",
    partTitle: "partie-un",
    partDramaticObjective: "objectif-de-partie",
    partTargetWordCount: 18_000,
    freedomLevel: "BALANCED",
    source: {
      workingTitle: "titre-source",
      targetWordCount: 6_000,
      focalCharacterName: "Alma",
      presentCharacterNames: ["Alma", "Brice"],
      placeName: "Le port",
      periodStartDay: 10,
      periodEndDay: 20,
      periodPrecision: "DAY",
      periodLabel: "label-source",
      dramaticFunction: "fonction alpha et fonction beta",
      immediateGoal: "objectif alpha et objectif beta",
      obstacle: "obstacle alpha et obstacle beta",
      decision: "decision alpha et decision beta",
      revelation: null,
      consequence: "consequence alpha et consequence beta",
      detailedSummary: "resume alpha et resume beta",
      factIndexes: [0],
      opensThreadIndexes: [0],
      continuesThreadIndexes: [],
      closesThreadIndexes: [1],
    },
    precedingChapter: null,
    followingChapter: null,
    cast: [
      { characterId: "character-1", name: "Alma", plannedArc: null },
      { characterId: "character-2", name: "Brice", plannedArc: null },
    ],
    places: [{ placeId: "place-1", name: "Le port", description: null }],
    canonFacts: [{ factId: "fact-1", statement: "un fait" }],
    threads: [
      { threadId: "thread-1", label: "fil un", narrativePromise: "promesse un" },
      { threadId: "thread-2", label: "fil deux", narrativePromise: "promesse deux" },
    ],
    ...overrides,
  });
}

function aHalf(overrides: Partial<PlannedChapter> = {}): PlannedChapter {
  return {
    workingTitle: "titre-moitie",
    targetWordCount: 3_000,
    focalCharacterName: "Alma",
    presentCharacterNames: ["Alma"],
    placeName: "Le port",
    period: { startDay: 10, endDay: 15, precision: "DAY", label: "label-moitie" },
    dramaticFunction: "fonction alpha",
    immediateGoal: "objectif alpha",
    obstacle: "obstacle alpha",
    decision: "decision alpha",
    revelation: null,
    consequence: "consequence alpha",
    detailedSummary: "resume alpha",
    opensThreadIndexes: [0],
    continuesThreadIndexes: [],
    closesThreadIndexes: [],
    factIndexes: [0],
    ...overrides,
  };
}

const PROSE_PLACEMENTS: ChapterSplitPlacement[] = [
  "dramaticFunction",
  "immediateGoal",
  "obstacle",
  "decision",
  "consequence",
  "detailedSummary",
].map((column) => ({
  kind: "prose" as const,
  index: null,
  list: null,
  column: column as ChapterSplitPlacement["column"],
  placement: "rewritten" as const,
  reason: "chaque moitie porte le sien",
}));

function aSecondHalf(overrides: Partial<PlannedChapter> = {}): PlannedChapter {
  return aHalf({
    focalCharacterName: "Brice",
    presentCharacterNames: ["Brice"],
    period: { startDay: 16, endDay: 20, precision: "DAY", label: "label-moitie-deux" },
    dramaticFunction: "fonction beta",
    immediateGoal: "objectif beta",
    obstacle: "obstacle beta",
    decision: "decision beta",
    consequence: "consequence beta",
    detailedSummary: "resume beta",
    opensThreadIndexes: [],
    closesThreadIndexes: [1],
    factIndexes: [],
    ...overrides,
  });
}

function aProposal(overrides: Partial<ChapterSplitProposal> = {}): ChapterSplitProposal {
  return {
    cutPoint: { moment: "quand la porte se ferme", rationale: "le rythme casse la" },
    first: aHalf(),
    second: aSecondHalf(),
    placements: [
      {
        kind: "character",
        index: 0,
        list: null,
        column: null,
        placement: "first",
        reason: "elle porte la premiere moitie",
      },
      {
        kind: "character",
        index: 1,
        list: null,
        column: null,
        placement: "second",
        reason: "il arrive apres la coupure",
      },
      {
        kind: "fact",
        index: 0,
        list: null,
        column: null,
        placement: "first",
        reason: "le fait est etabli avant la coupure",
      },
      {
        kind: "thread-action",
        index: 0,
        list: "opens",
        column: null,
        placement: "first",
        reason: "le fil ouvre au debut",
      },
      {
        kind: "thread-action",
        index: 1,
        list: "closes",
        column: null,
        placement: "second",
        reason: "le fil se referme a la fin",
      },
      ...PROSE_PLACEMENTS,
    ],
    ...overrides,
  };
}

/** Every numeric path the answer holds — the "no score" walker. */
function numericPaths(value: unknown, path: string[] = []): string[] {
  if (typeof value === "number") return [path.join(".")];

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => numericPaths(entry, [...path, String(index)]));
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) => numericPaths(entry, [...path, key]));
  }

  return [];
}

describe("chapterSplitProposalSchema", () => {
  it("accepts a well-formed proposal", () => {
    expect(chapterSplitProposalSchema.safeParse(aProposal()).success).toBe(true);
  });

  it("refuses a cut point with no argument for it", () => {
    const proposal = aProposal({
      cutPoint: { moment: "quand la porte se ferme", rationale: "" },
    });

    expect(chapterSplitProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("refuses an unknown field rather than ignoring it", () => {
    expect(chapterSplitProposalSchema.safeParse({ ...aProposal(), commentary: "…" }).success).toBe(
      false,
    );
  });

  it("carries no score anywhere — every number is a position, a day or a length", () => {
    const paths = new Set(
      numericPaths(aProposal()).map((path) => path.replace(/\.\d+(?=\.|$)/g, ".*")),
    );

    expect([...paths].sort()).toEqual([
      "first.factIndexes.*",
      "first.opensThreadIndexes.*",
      "first.period.endDay",
      "first.period.startDay",
      "first.targetWordCount",
      "placements.*.index",
      "second.closesThreadIndexes.*",
      "second.period.endDay",
      "second.period.startDay",
      "second.targetWordCount",
    ]);
  });

  it("bounds the placements by what one chapter can hold", () => {
    expect(CHAPTER_SPLIT_PLACEMENT_MAX).toBe(15 + 12 + 36 + 7);
  });
});

describe("chapterSplitPlacementSchema", () => {
  const placement = (overrides: Partial<ChapterSplitPlacement>): unknown => ({
    kind: "character",
    index: 0,
    list: null,
    column: null,
    placement: "first",
    reason: "une raison",
    ...overrides,
  });

  it("refuses a prose placement with no column", () => {
    expect(
      chapterSplitPlacementSchema.safeParse(placement({ kind: "prose", index: null })).success,
    ).toBe(false);
  });

  it("refuses a prose placement that also names a position", () => {
    expect(
      chapterSplitPlacementSchema.safeParse(
        placement({ kind: "prose", index: 0, column: "obstacle" }),
      ).success,
    ).toBe(false);
  });

  it("refuses a reference placement claiming a rewrite", () => {
    expect(
      chapterSplitPlacementSchema.safeParse(placement({ placement: "rewritten" })).success,
    ).toBe(false);
  });

  it("refuses a thread endpoint held by both halves", () => {
    expect(
      chapterSplitPlacementSchema.safeParse(
        placement({ kind: "thread-action", list: "opens", placement: "both" }),
      ).success,
    ).toBe(false);
  });

  it("accepts a continuation held by both halves", () => {
    expect(
      chapterSplitPlacementSchema.safeParse(
        placement({ kind: "thread-action", list: "continues", placement: "both" }),
      ).success,
    ).toBe(true);
  });

  it("refuses a reference placement claiming a division", () => {
    expect(chapterSplitPlacementSchema.safeParse(placement({ placement: "divided" })).success).toBe(
      false,
    );
  });

  it("offers five placements, two of them prose-only", () => {
    expect([...CHAPTER_SPLIT_PLACEMENTS]).toEqual([
      "first",
      "second",
      "both",
      "divided",
      "rewritten",
    ]);
    expect([...CHAPTER_SPLIT_PROSE_ONLY_PLACEMENTS]).toEqual(["divided", "rewritten"]);
  });
});

describe("chapterSplitInputSchema", () => {
  it("refuses an ask whose source names a fact it does not offer", () => {
    expect(() => anInput({ canonFacts: [] })).toThrow();
  });

  it("refuses an ask whose source names a thread it does not offer", () => {
    expect(() => anInput({ threads: [] })).toThrow();
  });

  it("refuses an ask offering one name twice", () => {
    expect(() =>
      anInput({
        cast: [
          { characterId: "character-1", name: "Alma", plannedArc: null },
          { characterId: "character-9", name: "Alma", plannedArc: null },
        ],
      }),
    ).toThrow();
  });
});

describe("resolveChapterSplitSource", () => {
  it("reads the chapter the ask describes back in ids", () => {
    const source = resolveChapterSplitSource(anInput());

    expect(source.id).toBe("chapter-1");
    expect(source.outline?.focalCharacterId).toBe("character-1");
    expect(source.outline?.placeId).toBe("place-1");
    expect(source.outline?.characterIds).toEqual(["character-1", "character-2"]);
    expect(source.outline?.factIds).toEqual(["fact-1"]);
    expect(source.opensThreadIds).toEqual(["thread-1"]);
    expect(source.closesThreadIds).toEqual(["thread-2"]);
  });

  it("says the chapter is unwritten and unlocked, because a locked one never got here", () => {
    const source = resolveChapterSplitSource(anInput());

    expect(source.revisionCount).toBe(0);
    expect(source.outline?.lockedAt).toBeNull();
  });
});

describe("verifyChapterSplitProposal", () => {
  it("verifies a proposal that accounts for every element", () => {
    const verification = verifyChapterSplitProposal(aProposal(), anInput());

    expect(verification.outcome).toBe("verified");
    expect(verification.report.split?.acceptable).toBe(true);
  });

  it("brands what it verifies", () => {
    const verification = verifyChapterSplitProposal(aProposal(), anInput());

    if (verification.outcome !== "verified") throw new Error("expected a verified proposal");

    expect(isVerifiedChapterSplitProposal(verification.proposal)).toBe(true);
  });

  it("refuses a proposal that leaves one element unaccounted for", () => {
    const proposal = aProposal();
    const verification = verifyChapterSplitProposal(
      { ...proposal, placements: proposal.placements.slice(1) },
      anInput(),
    );

    expect(verification.report.defects).toContainEqual({
      kind: "missing-placement",
      element: { kind: "character", index: 0, list: null, column: null },
    });
  });

  it("refuses a placement declared twice", () => {
    const proposal = aProposal();
    const first = proposal.placements[0];

    if (first === undefined) throw new Error("the fixture lost its placements");

    const verification = verifyChapterSplitProposal(
      { ...proposal, placements: [...proposal.placements, first] },
      anInput(),
    );

    expect(verification.report.defects.map((defect) => defect.kind)).toContain(
      "duplicate-placement",
    );
  });

  it("refuses a placement naming something the source never held", () => {
    const proposal = aProposal();
    const verification = verifyChapterSplitProposal(
      {
        ...proposal,
        placements: [
          ...proposal.placements,
          {
            kind: "fact",
            index: 7,
            list: null,
            column: null,
            placement: "first",
            reason: "un fait que la source ne porte pas",
          },
        ],
      },
      anInput(),
    );

    expect(verification.report.defects.map((defect) => defect.kind)).toContain(
      "unknown-placement-target",
    );
  });

  it("refuses a declaration the halves contradict", () => {
    const proposal = aProposal();
    const verification = verifyChapterSplitProposal(
      {
        ...proposal,
        placements: proposal.placements.map((placement) =>
          placement.kind === "fact" ? { ...placement, placement: "second" as const } : placement,
        ),
      },
      anInput(),
    );

    expect(verification.report.defects.map((defect) => defect.kind)).toContain(
      "placement-contradicted",
    );
  });

  it("verifies a column each half kept a different piece of, declared divided", () => {
    const proposal = aProposal();
    const placements = proposal.placements.map((placement) =>
      placement.column === "obstacle" ? { ...placement, placement: "divided" as const } : placement,
    );

    expect(verifyChapterSplitProposal({ ...proposal, placements }, anInput()).outcome).toBe(
      "verified",
    );
  });

  it("refuses a column claimed for one half that the other kept a piece of too", () => {
    const proposal = aProposal();
    const placements = proposal.placements.map((placement) =>
      placement.column === "obstacle" ? { ...placement, placement: "first" as const } : placement,
    );

    expect(
      verifyChapterSplitProposal({ ...proposal, placements }, anInput()).report.defects.map(
        (defect) => defect.kind,
      ),
    ).toContain("placement-contradicted");
  });

  it("verifies a column claimed for one half when the other wrote new words", () => {
    const proposal = aProposal({ second: aSecondHalf({ obstacle: "tout autre chose ici" }) });
    const placements = proposal.placements.map((placement) =>
      placement.column === "obstacle" ? { ...placement, placement: "first" as const } : placement,
    );

    expect(verifyChapterSplitProposal({ ...proposal, placements }, anInput()).outcome).toBe(
      "verified",
    );
  });

  it("refuses a claimed copy the half never made", () => {
    const proposal = aProposal({ first: aHalf({ obstacle: "tout autre chose ici" }) });
    const placements = proposal.placements.map((placement) =>
      placement.column === "obstacle" ? { ...placement, placement: "first" as const } : placement,
    );

    expect(
      verifyChapterSplitProposal({ ...proposal, placements }, anInput()).report.defects.map(
        (defect) => defect.kind,
      ),
    ).toContain("placement-contradicted");
  });

  it("takes a claimed rewrite at its word", () => {
    // The same half, the same new words — but declared `rewritten`, which
    // claims nothing and is therefore held to nothing.
    const proposal = aProposal({ first: aHalf({ obstacle: "tout autre chose ici" }) });

    expect(verifyChapterSplitProposal(proposal, anInput()).outcome).toBe("verified");
  });

  it("refuses a half naming a character the ask does not offer", () => {
    const verification = verifyChapterSplitProposal(
      aProposal({
        first: aHalf({ focalCharacterName: "Carine", presentCharacterNames: ["Carine"] }),
      }),
      anInput(),
    );

    expect(verification.report.defects).toContainEqual({
      kind: "unknown-character-name",
      half: "first",
      index: 0,
    });
    expect(verification.report.split).toBeNull();
  });

  it("runs the conservation arithmetic itself rather than restating it", () => {
    const proposal = aProposal();
    const verification = verifyChapterSplitProposal(
      {
        ...proposal,
        second: aHalf({
          focalCharacterName: "Alma",
          presentCharacterNames: ["Alma"],
          period: { startDay: 16, endDay: 20, precision: "DAY", label: "l" },
          opensThreadIndexes: [],
          closesThreadIndexes: [1],
          factIndexes: [],
        }),
      },
      anInput(),
    );

    // Brice is now on neither half — `checkChapterSplit`'s own defect, reported
    // through this verification rather than duplicated by it.
    expect(verification.report.split?.defects).toContainEqual({
      kind: "dropped-character",
      characterId: "character-2",
    });
  });
});

describe("resolveChapterSplitProposal", () => {
  it("hands back the arbitration a person would have filled in", () => {
    const input = anInput();
    const verification = verifyChapterSplitProposal(aProposal(), input);

    if (verification.outcome !== "verified") throw new Error("expected a verified proposal");

    const arbitration = resolveChapterSplitProposal(verification.proposal, input);

    expect(arbitration.chapterId).toBe("chapter-1");
    expect(arbitration.first.characterIds).toEqual(["character-1"]);
    expect(arbitration.first.focalCharacterId).toBe("character-1");
    expect(arbitration.first.placeId).toBe("place-1");
    expect(arbitration.first.factIds).toEqual(["fact-1"]);
    expect(arbitration.first.opensThreadIds).toEqual(["thread-1"]);
    expect(arbitration.second.closesThreadIds).toEqual(["thread-2"]);
  });
});
