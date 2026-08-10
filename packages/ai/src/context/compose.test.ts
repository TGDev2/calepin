/**
 * The composer, end to end (CAL-054) — and the acceptance criterion of the
 * backlog: the context transmitted to write chapter 12 never contains the full
 * text of the eleven chapters before it.
 *
 * Every fixture is synthetic — numbered markers, repeated filler — never prose
 * (§8), and no assertion judges wording: what is asserted is presence, absence
 * and counts.
 */

import type { AppError, Result } from "@calepin/shared/errors";
import { describe, expect, it } from "vitest";

import { MISSION_REGISTRY } from "../mission-registry";
import { composeSceneContext } from "./compose";
import type { PrecedingChapterSummary, SceneContextInput } from "./types";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function unwrapError<T>(result: Result<T>): AppError {
  if (result.ok) {
    throw new Error("the composition was expected to fail");
  }

  return result.error;
}

/** A target-length chapter, synthetically: ~1 800 numbered words. */
function fullChapterText(chapter: number): string {
  return Array.from({ length: 1_800 }, (_, i) => `mot-${chapter}-${i}`).join(" ");
}

const CHAPTER_NUMBERS = Array.from({ length: 11 }, (_, i) => i + 1);

/** The honest chapter-12 input: summaries and bounded excerpts, never texts. */
function chapterTwelveInput(overrides: Partial<SceneContextInput> = {}): SceneContextInput {
  const precedingChapters: readonly PrecedingChapterSummary[] = CHAPTER_NUMBERS.map((chapter) => {
    const distance = 12 - chapter;

    return {
      id: `chapter-${chapter}`,
      distance,
      briefSummary: `Résumé du chapitre ${chapter} : repère-${chapter}.`,
      ...(distance <= 2
        ? { detailedSummary: `Résumé détaillé du chapitre ${chapter} : détail-${chapter}.` }
        : {}),
    };
  });

  return {
    language: "français",
    bibleStyle: "Récit au passé simple, à la troisième personne — marqueur-style.",
    chapterOutline: "Plan du chapitre 12 : marqueur-plan ; obstacle, décision, conséquence.",
    targetWordCount: 2_000,
    authorInstructions: ["Consigne pour ce chapitre : marqueur-consigne."],
    freedomConstraints: ["Contrainte de fidélité : marqueur-contrainte."],
    outlineEntityIds: ["char-a", "place-b"],
    canonFacts: [
      {
        id: "fact-named",
        statement: "Fait engagé par le plan : marqueur-fait-nommé.",
        isNamedByOutline: true,
        subjectIds: [],
      },
      {
        id: "fact-linked",
        statement: "Fait concernant un personnage du chapitre : marqueur-fait-lié.",
        isNamedByOutline: false,
        subjectIds: ["char-a"],
      },
      {
        id: "fact-stranger",
        statement: "Fait sans lien avec ce chapitre : marqueur-fait-étranger.",
        isNamedByOutline: false,
        subjectIds: ["char-z"],
      },
    ],
    precedingChapters,
    continuityExcerpts: [
      { id: "end-of-11", distance: 1, priority: 1, text: fullChapterText(11).slice(-600) },
      { id: "scene-of-9", distance: 3, priority: 2, text: fullChapterText(9).slice(0, 400) },
    ],
    ...overrides,
  };
}

describe("composeSceneContext — the acceptance criterion", () => {
  it("writes chapter 12 without the full text of any of the eleven preceding chapters", () => {
    const { prompt, report } = unwrap(composeSceneContext(chapterTwelveInput()));
    const rendered = `${prompt.system}\n${prompt.text}`;

    for (const chapter of CHAPTER_NUMBERS) {
      expect(rendered).not.toContain(fullChapterText(chapter));
    }

    // What replaces the texts is present: summaries for every chapter, detail
    // for the nearest two, and the bounded excerpts continuity asked for.
    for (const chapter of CHAPTER_NUMBERS.slice(0, 9)) {
      expect(rendered).toContain(`repère-${chapter}.`);
    }
    expect(rendered).toContain("détail-10.");
    expect(rendered).toContain("détail-11.");
    expect(rendered).toContain(fullChapterText(11).slice(-600));

    expect(report.estimatedTokens).toBeLessThanOrEqual(report.budgetTokens);
    expect(report.budgetTokens).toBe(MISSION_REGISTRY["write-scene"].contextBudgetTokens);
    expect(report.degradationStepsApplied).toBe(0);
  });

  it("assembles the seven ingredients around the mission's own prompt", () => {
    const { prompt, report } = unwrap(composeSceneContext(chapterTwelveInput()));
    const rendered = `${prompt.system}\n${prompt.text}`;

    for (const marker of [
      "marqueur-style",
      "marqueur-plan",
      "marqueur-consigne",
      "marqueur-contrainte",
      "marqueur-fait-nommé",
    ]) {
      expect(rendered).toContain(marker);
    }

    expect(prompt.missionId).toBe("write-scene");
    expect(report.promptId).toBe("write-scene");
    expect(report.promptVersion).toBeGreaterThanOrEqual(1);
  });

  it("keeps only the facts the chapter actually engages", () => {
    const { prompt, report } = unwrap(composeSceneContext(chapterTwelveInput()));

    expect(prompt.text).toContain("marqueur-fait-lié");
    expect(prompt.text).not.toContain("marqueur-fait-étranger");
    expect(report.facts).toEqual({ offered: 3, selected: 2 });
  });

  it("reports counts and identifiers only", () => {
    const { report } = unwrap(composeSceneContext(chapterTwelveInput()));

    expect(report.summaries).toEqual({ offered: 11, detailed: 2, brief: 9, dropped: 0 });
    expect(report.excerpts).toEqual({ offered: 2, selected: 2 });
  });
});

describe("composeSceneContext — what it refuses", () => {
  it("refuses a full chapter travelling as a continuity excerpt", () => {
    const error = unwrapError(
      composeSceneContext(
        chapterTwelveInput({
          continuityExcerpts: [
            { id: "smuggled", distance: 5, priority: 1, text: fullChapterText(7) },
          ],
        }),
      ),
    );

    expect(error.code).toBe("CONTEXT_ITEM_OVERSIZED");
    expect(error.category).toBe("validation");
    // The path names the kind and the id — never the text (§9).
    expect(error.fieldPath).toBe("continuityExcerpts.smuggled");
  });

  it("refuses a full chapter travelling as a detailed summary", () => {
    const input = chapterTwelveInput();
    const error = unwrapError(
      composeSceneContext({
        ...input,
        precedingChapters: input.precedingChapters.map((chapter) =>
          chapter.id === "chapter-3"
            ? { ...chapter, detailedSummary: fullChapterText(3) }
            : chapter,
        ),
      }),
    );

    expect(error.code).toBe("CONTEXT_ITEM_OVERSIZED");
    expect(error.fieldPath).toBe("precedingChapters.chapter-3.detailedSummary");
  });

  it("fails cleanly when the non-degradable material alone exceeds the budget", () => {
    // Facts are never dropped — a fact dropped to save tokens invites the
    // contradiction the product exists to prevent — so enough of them is the
    // one honest way past the ladder's bottom.
    const statements = Array.from({ length: 460 }, (_, i) => {
      const label = `fait-${i} `;

      return {
        id: `fact-${i}`,
        statement: label + "f".repeat(550 - label.length),
        isNamedByOutline: true,
        subjectIds: [],
      };
    });
    const error = unwrapError(
      composeSceneContext(
        chapterTwelveInput({
          canonFacts: statements,
          precedingChapters: [],
          continuityExcerpts: [],
        }),
      ),
    );

    expect(error.code).toBe("CONTEXT_BUDGET_EXCEEDED");
    expect(error.category).toBe("validation");
    expect(error.retryable).toBe(false);
  });
});

describe("composeSceneContext — the degradation ladder", () => {
  it("drops the farthest summaries first, and never the nearest", () => {
    const manyChapters: readonly PrecedingChapterSummary[] = Array.from({ length: 210 }, (_, i) => {
      const distance = i + 1;
      const label = `résumé-d${distance} `;

      return {
        id: `far-${distance}`,
        distance,
        briefSummary: label + "s".repeat(1_150 - label.length),
      };
    });

    const { prompt, report } = unwrap(
      composeSceneContext(
        chapterTwelveInput({
          precedingChapters: manyChapters,
          continuityExcerpts: [],
          canonFacts: [],
        }),
      ),
    );

    expect(report.degradationStepsApplied).toBeGreaterThan(0);
    expect(report.summaries.dropped).toBeGreaterThan(0);
    expect(report.summaries.dropped).toBeLessThanOrEqual(10);
    expect(report.summaries.brief + report.summaries.dropped).toBe(210);
    expect(report.estimatedTokens).toBeLessThanOrEqual(report.budgetTokens);

    expect(prompt.text).toContain("résumé-d1 ");
    expect(prompt.text).not.toContain("résumé-d210 ");
  });

  it("composes chapter 1 from nothing at all", () => {
    const { report } = unwrap(
      composeSceneContext(
        chapterTwelveInput({
          canonFacts: [],
          precedingChapters: [],
          continuityExcerpts: [],
          outlineEntityIds: [],
        }),
      ),
    );

    expect(report.degradationStepsApplied).toBe(0);
    expect(report.facts).toEqual({ offered: 0, selected: 0 });
    expect(report.summaries).toEqual({ offered: 0, detailed: 0, brief: 0, dropped: 0 });
    expect(report.excerpts).toEqual({ offered: 0, selected: 0 });
  });
});
