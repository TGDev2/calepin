/**
 * The two summarising compositions (CAL-055).
 *
 * Every fixture here is synthetic filler — `mot-3-17`, not prose. §9 binds the
 * test names and the test files too, and a summariser's suite is exactly where
 * a "realistic" excerpt would feel harmless.
 */

import type { AppError, Result } from "@calepin/shared/errors";
import { describe, expect, it } from "vitest";

import { MISSION_REGISTRY } from "../mission-registry";
import { CONTEXT_ITEM_CEILINGS } from "./policy";
import {
  composeChapterSummaryContext,
  type ComposedSummaryContext,
  composePartSummaryContext,
} from "./summarize";

function unwrap(result: Result<ComposedSummaryContext>): ComposedSummaryContext {
  if (!result.ok) throw new Error(`the composition failed: ${result.error.code}`);

  return result.value;
}

function unwrapError(result: Result<ComposedSummaryContext>): AppError {
  if (result.ok) throw new Error("the composition was expected to fail");

  return result.error;
}

/** `words` synthetic tokens, none of which a reader could read as a novel. */
function filler(label: string, words: number): string {
  return Array.from({ length: words }, (_, i) => `mot-${label}-${i}`).join(" ");
}

function chapterInput(overrides: Partial<Parameters<typeof composeChapterSummaryContext>[0]> = {}) {
  return {
    language: "français",
    chapterText: filler("ch", 1_800),
    briefWordTarget: 50,
    detailedWordTarget: 200,
    ...overrides,
  };
}

/**
 * `count` chapters whose summaries stay under their per-item ceilings.
 *
 * The defaults are deliberately well inside them — a synthetic token here is
 * about eleven characters, so ninety words already estimates at a third of the
 * brief ceiling, and a fixture that trips the entry check would be testing the
 * ceiling rather than the ladder.
 */
function partChapters(count: number, briefWords = 40, detailedWords = 160) {
  return Array.from({ length: count }, (_, i) => ({
    id: `chapter-${i + 1}`,
    briefSummary: filler(`b${i + 1}`, briefWords),
    detailedSummary: filler(`d${i + 1}`, detailedWords),
  }));
}

function partInput(overrides: Partial<Parameters<typeof composePartSummaryContext>[0]> = {}) {
  return {
    language: "français",
    partTitle: "Première partie",
    wordTarget: 200,
    plannedArc: ["Objectif dramatique : marqueur-objectif."],
    chapters: partChapters(6),
    ...overrides,
  };
}

describe("composeChapterSummaryContext", () => {
  it("renders the mission's current prompt and carries the version to record", () => {
    const { prompt, report } = unwrap(composeChapterSummaryContext(chapterInput()));

    expect(prompt.missionId).toBe("summarize-chapter");
    expect(prompt.promptId).toBe("summarize-chapter");
    expect(prompt.version).toBeGreaterThanOrEqual(2);
    expect(prompt.system).not.toContain("{{");
    expect(prompt.text).not.toContain("{{");
    expect(report.promptVersion).toBe(prompt.version);
    expect(report.budgetTokens).toBe(MISSION_REGISTRY["summarize-chapter"].contextBudgetTokens);
  });

  // The two word targets are the domain's, and they must reach the model as
  // numbers rather than as a wording this layer invented.
  it("states the two lengths it was handed", () => {
    const { prompt } = unwrap(
      composeChapterSummaryContext(chapterInput({ briefWordTarget: 50, detailedWordTarget: 200 })),
    );

    expect(prompt.text).toContain("50");
    expect(prompt.text).toContain("200");
  });

  // The five kinds of material CAL-055 asks the prompt to prioritise, and the
  // one it asks it to drop. Asserted on the rendered text because a prompt that
  // silently loses a clause is the failure this task exists to prevent.
  it("asks for what carries consequence and excludes what does not", () => {
    const { prompt } = unwrap(composeChapterSummaryContext(chapterInput()));

    for (const clause of ["conséquences", "décisions", "révélations", "changements d'état"]) {
      expect(prompt.text.toLowerCase()).toContain(clause.toLowerCase());
    }

    expect(prompt.text).toContain("changements de relation");
    expect(prompt.text).toContain("décor sans effet narratif");
  });

  it("carries the chapter it is asked to summarise, in full", () => {
    const chapterText = filler("subject", 500);
    const { prompt } = unwrap(composeChapterSummaryContext(chapterInput({ chapterText })));

    expect(prompt.text).toContain(chapterText);
  });

  // There is no ladder, and there could not be one: a summary of half a chapter
  // reads exactly like a summary of the chapter, and nothing downstream can
  // tell the difference. Over budget is a failure, not a quieter composition.
  it("fails rather than summarise part of a chapter", () => {
    const budget = MISSION_REGISTRY["summarize-chapter"].contextBudgetTokens;
    const failure = unwrapError(
      composeChapterSummaryContext(chapterInput({ chapterText: filler("huge", budget) })),
    );

    expect(failure.code).toBe("CONTEXT_BUDGET_EXCEEDED");
    expect(failure.category).toBe("validation");
    expect(failure.retryable).toBe(false);
  });
});

describe("composePartSummaryContext", () => {
  it("renders the part prompt with its arc and its chapters, in order", () => {
    const input = partInput();
    const { prompt, report } = unwrap(composePartSummaryContext(input));

    expect(prompt.missionId).toBe("summarize-part");
    expect(prompt.text).toContain(input.partTitle);
    expect(prompt.text).toContain("Objectif dramatique : marqueur-objectif.");
    expect(report.chaptersOffered).toBe(6);
    expect(report.degradationStepsApplied).toBe(0);
    expect(report.usedBriefSummariesOnly).toBe(false);

    // Reading order is the caller's and is preserved: a part's arc *is* the
    // order of what happened, so sorting here would be this layer deciding
    // something narrative (§5.7).
    const positions = input.chapters.map((chapter) =>
      prompt.text.indexOf(chapter.detailedSummary ?? chapter.briefSummary),
    );

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("asks for an arc rather than a table of contents", () => {
    const { prompt } = unwrap(composePartSummaryContext(partInput()));

    expect(prompt.text).toContain("N'énumère pas les chapitres");
  });

  it("renders a dash for a part the plan never described", () => {
    const { prompt } = unwrap(composePartSummaryContext(partInput({ plannedArc: [] })));

    expect(prompt.text).toContain("—");
  });

  // The one rung: resolution falls, coverage does not. A part summary missing a
  // chapter is wrong rather than shorter.
  it("falls back to the brief summaries before giving up, and keeps every chapter", () => {
    // Forty chapters whose detailed summaries do not fit the 30 000-token
    // budget and whose brief ones do — each still under its own ceiling.
    const input = partInput({ chapters: partChapters(40, 90, 280) });
    const { prompt, report } = unwrap(composePartSummaryContext(input));

    expect(report.degradationStepsApplied).toBe(1);
    expect(report.usedBriefSummariesOnly).toBe(true);
    expect(report.chaptersOffered).toBe(40);
    expect(report.estimatedTokens).toBeLessThanOrEqual(report.budgetTokens);

    for (const chapter of input.chapters) {
      expect(prompt.text).toContain(chapter.briefSummary);
      expect(prompt.text).not.toContain(chapter.detailedSummary);
    }
  });

  it("fails when even the brief summaries do not fit", () => {
    const chapters = Array.from({ length: 400 }, (_, i) => ({
      id: `chapter-${i + 1}`,
      briefSummary: filler(`b${i + 1}`, 90),
    }));

    const failure = unwrapError(composePartSummaryContext(partInput({ chapters })));

    expect(failure.code).toBe("CONTEXT_BUDGET_EXCEEDED");
  });

  // The same rows feed the writing context, so refusing an oversized one here
  // covers both — and the path names the kind and the chapter, never the text.
  it("refuses a chapter smuggled in as one of its own summaries", () => {
    const smuggled = filler("chapter", CONTEXT_ITEM_CEILINGS.briefSummary * 2);
    const failure = unwrapError(
      composePartSummaryContext(
        partInput({ chapters: [{ id: "chapter-3", briefSummary: smuggled }] }),
      ),
    );

    expect(failure.code).toBe("CONTEXT_ITEM_OVERSIZED");
    expect(failure.fieldPath).toBe("chapters.chapter-3.briefSummary");
  });

  it("refuses it as a detailed summary too", () => {
    const smuggled = filler("chapter", CONTEXT_ITEM_CEILINGS.detailedSummary * 2);
    const failure = unwrapError(
      composePartSummaryContext(
        partInput({
          chapters: [{ id: "chapter-4", briefSummary: filler("b", 40), detailedSummary: smuggled }],
        }),
      ),
    );

    expect(failure.code).toBe("CONTEXT_ITEM_OVERSIZED");
    expect(failure.fieldPath).toBe("chapters.chapter-4.detailedSummary");
  });

  it("reports counts and identifiers only — nothing a reader could read", () => {
    const { report } = unwrap(composePartSummaryContext(partInput()));

    for (const value of Object.values(report)) {
      expect(typeof value === "string" ? value.length < 40 : true).toBe(true);
    }

    expect(Object.keys(report).sort()).toEqual([
      "budgetTokens",
      "chaptersOffered",
      "degradationStepsApplied",
      "estimatedTokens",
      "missionId",
      "promptId",
      "promptVersion",
      "usedBriefSummariesOnly",
    ]);
  });
});
