/**
 * The diagnostic composition (CAL-208).
 *
 * Every fixture here is synthetic filler — `mot-src-17`, not prose. §9 binds
 * the test names and the test files too, and the suite of the one mission whose
 * input is an author's whole starting text is exactly where a "realistic"
 * excerpt would feel harmless.
 */

import type { AppError, Result } from "@calepin/shared/errors";
import { describe, expect, it } from "vitest";

import { MISSION_REGISTRY } from "../mission-registry";
import { currentPrompt } from "../prompts";
import { type ComposedAnalysisContext, composeSourceTextAnalysisContext } from "./analysis";

function unwrap(result: Result<ComposedAnalysisContext>): ComposedAnalysisContext {
  if (!result.ok) throw new Error(`the composition failed: ${result.error.code}`);

  return result.value;
}

function unwrapError(result: Result<ComposedAnalysisContext>): AppError {
  if (result.ok) throw new Error("the composition was expected to fail");

  return result.error;
}

/** `words` synthetic tokens, none of which a reader could read as a novel. */
function filler(label: string, words: number): string {
  return Array.from({ length: words }, (_, i) => `mot-${label}-${i}`).join(" ");
}

function input(overrides: Partial<Parameters<typeof composeSourceTextAnalysisContext>[0]> = {}) {
  return {
    language: "français",
    targetAudience: "Grand public",
    sourceText: filler("src", 400),
    summaryWordTarget: 200,
    potentialWordTarget: 200,
    totalWordBudget: 2_000,
    evidenceWordTarget: 25,
    ...overrides,
  };
}

describe("composeSourceTextAnalysisContext (CAL-208)", () => {
  it("renders the current prompt and stamps the version it came from", () => {
    const composed = unwrap(composeSourceTextAnalysisContext(input()));

    expect(composed.prompt.missionId).toBe("analyze-source-text");
    expect(composed.prompt.promptId).toBe("analyze-source-text");
    expect(composed.prompt.version).toBe(currentPrompt("analyze-source-text").version);
    expect(composed.report.promptVersion).toBe(composed.prompt.version);
  });

  it("fills every hole the resource declares", () => {
    const composed = unwrap(composeSourceTextAnalysisContext(input()));
    const whole = `${composed.prompt.system}\n${composed.prompt.text}`;

    // A placeholder that survived would be shipped to a provider verbatim; that
    // is the one failure `renderPrompt` exists to make loud, and this is the
    // assertion that would catch a variable added to a later prompt version.
    expect(whole).not.toMatch(/\{\{[a-z][a-zA-Z0-9]*\}\}/);
  });

  it("carries the whole source text, the audience and the four targets", () => {
    const sourceText = filler("carried", 120);
    const composed = unwrap(
      composeSourceTextAnalysisContext(
        input({ sourceText, targetAudience: "Lecteurs de littérature générale" }),
      ),
    );

    expect(composed.prompt.text).toContain(sourceText);
    expect(composed.prompt.text).toContain("Lecteurs de littérature générale");
    expect(composed.prompt.text).toContain("2000");
    expect(composed.prompt.text).toContain("25");
  });

  it("writes the project's language into the system half", () => {
    const composed = unwrap(composeSourceTextAnalysisContext(input({ language: "español" })));

    expect(composed.prompt.system).toContain("español");
  });

  it("reports the mission's own budget and an estimate under it", () => {
    const composed = unwrap(composeSourceTextAnalysisContext(input()));
    const budget = MISSION_REGISTRY["analyze-source-text"].contextBudgetTokens;

    expect(composed.report.budgetTokens).toBe(budget);
    expect(composed.report.estimatedTokens).toBeGreaterThan(0);
    expect(composed.report.estimatedTokens).toBeLessThanOrEqual(budget);
  });

  it("never degrades: there is no ladder to walk", () => {
    const short = unwrap(composeSourceTextAnalysisContext(input({ sourceText: filler("a", 50) })));
    const long = unwrap(
      composeSourceTextAnalysisContext(input({ sourceText: filler("b", 20_000) })),
    );

    expect(short.report.degradationStepsApplied).toBe(0);
    // Twenty thousand synthetic tokens is a large text that still fits, and it
    // is reported as un-degraded rather than as trimmed to fit — the property
    // this composer's whole design rests on.
    expect(long.report.degradationStepsApplied).toBe(0);
    expect(long.report.estimatedTokens).toBeGreaterThan(short.report.estimatedTokens);
  });

  it("refuses a text past the budget rather than sending part of it", () => {
    // Sized off the mission's own budget so the case survives a retune of it.
    const budget = MISSION_REGISTRY["analyze-source-text"].contextBudgetTokens;
    const error = unwrapError(
      composeSourceTextAnalysisContext(input({ sourceText: filler("over", budget) })),
    );

    expect(error.code).toBe("CONTEXT_BUDGET_EXCEEDED");
  });

  it("reports nothing a reader could read as the text (§9)", () => {
    const sourceText = filler("secret", 300);
    const composed = unwrap(composeSourceTextAnalysisContext(input({ sourceText })));

    expect(JSON.stringify(composed.report)).not.toContain("mot-secret");
    expect(Object.keys(composed.report).sort()).toEqual([
      "budgetTokens",
      "degradationStepsApplied",
      "estimatedTokens",
      "missionId",
      "promptId",
      "promptVersion",
    ]);
  });
});
