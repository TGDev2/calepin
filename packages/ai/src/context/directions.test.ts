/**
 * The direction-proposal composition (CAL-210).
 *
 * Every fixture here is synthetic filler — `mot-src-17`, not prose. §9 binds the
 * test names and the test files too, and a mission whose input is an author's
 * whole starting text is exactly where a "realistic" excerpt would feel
 * harmless.
 */

import type { AppError, Result } from "@calepin/shared/errors";
import { freedomConstraints, SOURCE_DIMENSIONS } from "@calepin/shared/freedom-level";
import { describe, expect, it } from "vitest";

import { MISSION_REGISTRY } from "../mission-registry";
import { currentPrompt } from "../prompts";
import {
  type ComposedDirectionProposalsContext,
  composeDirectionProposalsContext,
} from "./directions";

function unwrap(
  result: Result<ComposedDirectionProposalsContext>,
): ComposedDirectionProposalsContext {
  if (!result.ok) throw new Error(`the composition failed: ${result.error.code}`);

  return result.value;
}

function unwrapError(result: Result<ComposedDirectionProposalsContext>): AppError {
  if (result.ok) throw new Error("the composition was expected to fail");

  return result.error;
}

/** `words` synthetic tokens, none of which a reader could read as a novel. */
function filler(label: string, words: number): string {
  return Array.from({ length: words }, (_, i) => `mot-${label}-${i}`).join(" ");
}

function input(overrides: Partial<Parameters<typeof composeDirectionProposalsContext>[0]> = {}) {
  return {
    language: "français",
    targetAudience: "Grand public",
    targetWordCount: 65_000,
    freedomLevel: "BALANCED" as const,
    validatedAnalysis: filler("diag", 200),
    sourceText: filler("src", 400),
    engineAxes: ["axe-1", "axe-2", "axe-3", "axe-4", "axe-5"],
    minEngineDifferences: 2,
    excludedEngines: [],
    directionCount: 3,
    premiseWordTarget: 150,
    conflictWordTarget: 80,
    arcWordTarget: 100,
    endingWordTarget: 50,
    assessmentWordTarget: 120,
    itemWordTarget: 40,
    minNewStakes: 2,
    minMainRisks: 2,
    minElementsKept: 2,
    minElementsTransformed: 1,
    maxPerList: 6,
    ...overrides,
  };
}

describe("composeDirectionProposalsContext (CAL-210)", () => {
  it("renders the current prompt and stamps the version it came from", () => {
    const composed = unwrap(composeDirectionProposalsContext(input()));

    expect(composed.prompt.missionId).toBe("propose-directions");
    expect(composed.prompt.promptId).toBe("propose-directions");
    expect(composed.prompt.version).toBe(currentPrompt("propose-directions").version);
    expect(composed.report.promptVersion).toBe(composed.prompt.version);
  });

  it("fills every hole the resource declares", () => {
    const composed = unwrap(composeDirectionProposalsContext(input()));
    const whole = `${composed.prompt.system}\n${composed.prompt.text}`;

    expect(whole).not.toMatch(/\{\{[a-z]/i);
  });

  it("carries both subjects in full — the diagnostic and the source text", () => {
    const composed = unwrap(composeDirectionProposalsContext(input()));

    expect(composed.prompt.text).toContain(filler("diag", 200));
    expect(composed.prompt.text).toContain(filler("src", 400));
  });

  // §5.5: the clauses are the business layer's rule, quoted rather than
  // restated. Deriving them here is what stops a caller handing a level and a
  // set of clauses that disagree.
  it("quotes the freedom clauses of the level it was given", () => {
    const low = unwrap(composeDirectionProposalsContext(input({ freedomLevel: "LOW" })));
    const high = unwrap(composeDirectionProposalsContext(input({ freedomLevel: "HIGH" })));

    for (const constraint of freedomConstraints("LOW", "direction")) {
      expect(low.prompt.text).toContain(constraint.statement);
    }

    expect(low.prompt.text).not.toBe(high.prompt.text);
  });

  it("names the ten declaration keys rather than restating them in prose", () => {
    const composed = unwrap(composeDirectionProposalsContext(input()));

    for (const dimension of SOURCE_DIMENSIONS) {
      expect(composed.prompt.text).toContain(`« ${dimension} »`);
    }
  });

  // The relaunch's own contract: the count asked for and the engines excluded
  // are what separate a first ask from a targeted re-ask.
  it("asks for the count it was given, and quotes the engines it must avoid", () => {
    const relaunch = unwrap(
      composeDirectionProposalsContext(
        input({ directionCount: 2, excludedEngines: ["moteur-exclu-1"] }),
      ),
    );

    expect(relaunch.prompt.text).toContain("propose 2 directions");
    expect(relaunch.prompt.text).toContain("moteur-exclu-1");
    expect(relaunch.report.directionCount).toBe(2);
    expect(relaunch.report.excludedEngineCount).toBe(1);
  });

  it("renders an empty exclusion list as an absence rather than a hole", () => {
    const first = unwrap(composeDirectionProposalsContext(input()));

    expect(first.report.excludedEngineCount).toBe(0);
    expect(first.prompt.text).toContain("Moteurs narratifs exclus");
  });

  it("refuses a context over the mission's budget rather than shedding a subject", () => {
    const budget = MISSION_REGISTRY["propose-directions"].contextBudgetTokens;
    const error = unwrapError(
      composeDirectionProposalsContext(input({ sourceText: filler("src", budget) })),
    );

    expect(error.code).toBe("CONTEXT_BUDGET_EXCEEDED");
  });

  it("reports no degradation, because there is no ladder", () => {
    const composed = unwrap(composeDirectionProposalsContext(input()));

    expect(composed.report.degradationStepsApplied).toBe(0);
    expect(composed.report.budgetTokens).toBe(
      MISSION_REGISTRY["propose-directions"].contextBudgetTokens,
    );
    expect(composed.report.estimatedTokens).toBeLessThanOrEqual(composed.report.budgetTokens);
  });

  // §9: a composition report is a log line, so it may hold identifiers and
  // numbers and nothing a reader could read as part of the novel.
  it("reports identifiers and numbers only", () => {
    const composed = unwrap(composeDirectionProposalsContext(input()));
    const serialised = JSON.stringify(composed.report);

    expect(serialised).not.toContain("mot-src-");
    expect(serialised).not.toContain("mot-diag-");
  });
});
