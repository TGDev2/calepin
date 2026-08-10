/**
 * The bench runs (CAL-059), end to end over the **real** pipeline: the mission
 * calls go through `createModelProviderPort` with the real registry and the
 * real two-version `summarize-chapter` prompt, and the judge runs through the
 * real executor — only the network is faked (§8).
 *
 * What is pinned here is the procedure, never a judgement: the blinding and
 * the swap, the merge of the two passes into stable or unstable verdicts, the
 * per-case capture of failures, the synthesis's legends, and the run's refusal
 * of mis-wired options. Fixture values are markers and minimum-length filler
 * (§9); no assertion reads literary quality (§8).
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ProviderAdapter, StructuredProviderCall } from "../adapter";
import { createModelProviderPort } from "../create-model-port";
import type { Scheduler } from "../timing";
import type { BenchCase, ReferenceCorpus } from "./corpus";
import { type BenchCriterion } from "./criteria";
import {
  type BlindedVerdict,
  type ComparisonJudgement,
  createBenchJudge,
  type ReviewJudgement,
  type SynthesisJudgement,
} from "./judge";
import { runPromptComparison, runPromptEvaluation } from "./run";

const CRITERIA: readonly BenchCriterion[] = [
  { id: "grounding", label: "Ancrage", question: "Question de démonstration sur l'ancrage." },
  { id: "compliance", label: "Consigne", question: "Question de démonstration sur la consigne." },
];

const ARGUMENT =
  "Argument de démonstration, assez long pour satisfaire la longueur minimale exigée par le contrat du banc.";

const SUMMARY_SCHEMA = z.object({ briefSummary: z.string(), detailedSummary: z.string() });

const MISSION_INTENT =
  "Résumer le chapitre fourni en deux résumés servant de mémoire aux chapitres suivants.";

const CASE_ONE: BenchCase = {
  id: "case-one",
  title: "Cas un",
  provenance: "Synthetic fixture, written for this test file.",
  referenceText: "TEXTE-REPERE-UN",
  variables: {
    language: "fr",
    chapterText: "TEXTE-REPERE-UN",
    briefWordTarget: 50,
    detailedWordTarget: 200,
  },
  expectations: ["ATTENTE-REPERE"],
};

const CASE_TWO: BenchCase = {
  id: "case-two",
  title: "Cas deux",
  provenance: "Synthetic fixture, written for this test file.",
  referenceText: "TEXTE-REPERE-DEUX",
  variables: {
    language: "fr",
    chapterText: "TEXTE-REPERE-DEUX",
    briefWordTarget: 50,
    detailedWordTarget: 200,
  },
  expectations: [],
};

const CORPUS: ReferenceCorpus = {
  id: "bench-test-corpus",
  description: "Corpus synthétique de démonstration pour les tests du banc.",
  cases: [CASE_ONE, CASE_TWO],
};

interface FakeStructuredAdapter {
  readonly adapter: ProviderAdapter;
  readonly calls: StructuredProviderCall[];
}

function structuredAdapter(
  outcome: (call: StructuredProviderCall, index: number) => unknown,
): FakeStructuredAdapter {
  const calls: StructuredProviderCall[] = [];
  const adapter: ProviderAdapter = {
    provider: "anthropic",
    generateProse: () => {
      throw new Error("these tests only run structured missions");
    },
    generateStructured: (call) => {
      const index = calls.length;

      calls.push(call);

      return Promise.resolve({
        value: outcome(call, index),
        usage: { inputTokens: 100, outputTokens: 50 },
      });
    },
  };

  return { adapter, calls };
}

/** Backoffs fire at once; the missions' long deadlines never do. */
function virtualScheduler(): Scheduler {
  return {
    now: () => 0,
    setTimeout: (callback, delayMs) =>
      delayMs >= 60_000 ? undefined : globalThis.setTimeout(callback, 0),
    clearTimeout: (handle) => {
      if (handle !== undefined) {
        globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
      }
    },
  };
}

function missionPort(adapter: ProviderAdapter) {
  return createModelProviderPort({
    adapters: [adapter],
    scheduler: virtualScheduler(),
    random: () => 0,
  });
}

const evidence = <Source extends "output" | "first-output" | "second-output">(source: Source) =>
  ({
    source,
    excerpt: "extrait de démonstration cité depuis la sortie évaluée",
    location: "champ de démonstration",
    relevance: "cet extrait illustre le constat porté par l'argument ci-dessus.",
  }) as const;

function reviewAnswer(expectationCount: number): ReviewJudgement {
  return {
    findings: CRITERIA.map((criterion) => ({
      criterionId: criterion.id,
      kind: "strength",
      argument: ARGUMENT,
      evidence: [evidence("output")],
    })),
    expectationChecks: Array.from({ length: expectationCount }, () => ({
      status: "met",
      argument: ARGUMENT,
      evidence: [evidence("output")],
    })),
    summary: ARGUMENT,
  };
}

function comparisonAnswer(
  verdicts: Readonly<Record<string, BlindedVerdict>>,
  overall: BlindedVerdict,
): ComparisonJudgement {
  return {
    judgments: CRITERIA.map((criterion) => ({
      criterionId: criterion.id,
      verdict: verdicts[criterion.id] ?? "comparable",
      argument: ARGUMENT,
      evidence: [evidence("first-output")],
    })),
    overall: { verdict: overall, argument: ARGUMENT },
  };
}

const SYNTHESIS_ANSWER: SynthesisJudgement = {
  recommendation: "keep-baseline",
  argument: ARGUMENT,
  reservations: ["Réserve de démonstration, énoncée pour le test."],
};

describe("runPromptEvaluation", () => {
  it("runs the mission over the corpus and returns argued, checked reviews", async () => {
    const mission = structuredAdapter((_call, index) => ({
      briefSummary: `BRIEF-${index + 1}`,
      detailedSummary: `DETAIL-${index + 1}`,
    }));
    const judgeAdapter = structuredAdapter((call) =>
      reviewAnswer(call.prompt.includes("ATTENTE-REPERE") ? 1 : 0),
    );

    const report = await runPromptEvaluation({
      port: missionPort(mission.adapter),
      judge: createBenchJudge({ adapter: judgeAdapter.adapter }),
      missionId: "summarize-chapter",
      corpus: CORPUS,
      missionIntent: MISSION_INTENT,
      output: { kind: "structured", schema: SUMMARY_SCHEMA },
      criteria: CRITERIA,
    });

    // No version asked for: the version in place is the one evaluated.
    expect(report.promptVersion).toBe(2);
    expect(report.promptId).toBe("summarize-chapter");
    expect(report.judge).toEqual({
      model: "claude-opus-5",
      promptId: "bench-review-output",
      promptVersion: 1,
    });
    expect(report.cases).toHaveLength(2);

    const [first, second] = report.cases;

    expect(first?.run.status).toBe("produced");
    expect(first?.review?.judgement.findings).toHaveLength(CRITERIA.length);
    expect(first?.review?.judgement.expectationChecks).toHaveLength(1);
    expect(second?.review?.judgement.expectationChecks).toHaveLength(0);

    // The judge read the reference text, the produced output and the
    // expectations — the elements every critique must be tied to.
    const firstJudgePrompt = judgeAdapter.calls[0]?.prompt ?? "";

    expect(firstJudgePrompt).toContain("TEXTE-REPERE-UN");
    expect(firstJudgePrompt).toContain("BRIEF-1");
    expect(firstJudgePrompt).toContain("ATTENTE-REPERE");

    // Accounting: 2 mission calls and 2 judge calls, each 100 in / 50 out.
    expect(report.totals.missionUsage).toEqual({ inputTokens: 200, outputTokens: 100 });
    expect(report.totals.judgeUsage).toEqual({ inputTokens: 200, outputTokens: 100 });
    expect(report.totals.measuredCostUsd).toMatch(/^\d+\.\d{6}$/);
    expect(report.limitations.length).toBeGreaterThan(0);
  });

  it("captures a failed mission run as data and judges nothing for it", async () => {
    // An answer sharing no field with the contract: off-topic, not repairable.
    const mission = structuredAdapter(() => ({ unrelated: true }));
    const judgeAdapter = structuredAdapter(() => {
      throw new Error("the judge must not be asked about a failed run");
    });

    const report = await runPromptEvaluation({
      port: missionPort(mission.adapter),
      judge: createBenchJudge({ adapter: judgeAdapter.adapter }),
      missionId: "summarize-chapter",
      corpus: CORPUS,
      missionIntent: MISSION_INTENT,
      output: { kind: "structured", schema: SUMMARY_SCHEMA },
      criteria: CRITERIA,
    });

    expect(report.cases).toHaveLength(2);

    for (const entry of report.cases) {
      expect(entry.run).toEqual({
        status: "failed",
        errorCode: "MODEL_OUTPUT_OFF_TOPIC",
        errorCategory: "provider",
      });
      expect(entry.review).toBeUndefined();
    }

    expect(judgeAdapter.calls).toHaveLength(0);
    expect(report.limitations.some((limitation) => limitation.includes("échec technique"))).toBe(
      true,
    );
  });

  it("refuses an output contract of the kind the mission does not produce", async () => {
    const mission = structuredAdapter(() => ({}));
    const judgeAdapter = structuredAdapter(() => ({}));

    await expect(
      runPromptEvaluation({
        port: missionPort(mission.adapter),
        judge: createBenchJudge({ adapter: judgeAdapter.adapter }),
        missionId: "summarize-chapter",
        corpus: CORPUS,
        missionIntent: MISSION_INTENT,
        output: { kind: "prose" },
        criteria: CRITERIA,
      }),
    ).rejects.toMatchObject({ code: "MISSION_OUTPUT_MISMATCH" });
  });

  it("refuses a corpus that does not cover a declared variable, naming it", async () => {
    const mission = structuredAdapter(() => ({}));
    const judgeAdapter = structuredAdapter(() => ({}));
    const corpus: ReferenceCorpus = {
      ...CORPUS,
      cases: [{ ...CASE_ONE, variables: { language: "fr", chapterText: "TEXTE-REPERE-UN" } }],
    };

    // Version 2 declares the two word targets; the corpus above stops at v1's
    // variables — an authoring gap, thrown rather than reported as a verdict.
    await expect(
      runPromptEvaluation({
        port: missionPort(mission.adapter),
        judge: createBenchJudge({ adapter: judgeAdapter.adapter }),
        missionId: "summarize-chapter",
        corpus,
        missionIntent: MISSION_INTENT,
        output: { kind: "structured", schema: SUMMARY_SCHEMA },
        criteria: CRITERIA,
      }),
    ).rejects.toMatchObject({
      code: "PROMPT_VARIABLE_INVALID",
      fieldPath: "briefWordTarget:number",
    });
  });
});

describe("runPromptComparison", () => {
  it("judges each case twice, blinded and swapped, and merges honestly", async () => {
    const mission = structuredAdapter((_call, index) => ({
      briefSummary: `BRIEF-${index + 1}`,
      detailedSummary: `DETAIL-${index + 1}`,
    }));

    // Case one: `grounding` prefers the baseline under both orders — stable.
    // `compliance` prefers réponse 1 under both orders — order-dependent.
    // Case two: comparable and contrasted under both orders — both stable.
    const judgeOutcomes: readonly unknown[] = [
      comparisonAnswer(
        { grounding: "first-stronger", compliance: "first-stronger" },
        "first-stronger",
      ),
      comparisonAnswer(
        { grounding: "second-stronger", compliance: "first-stronger" },
        "second-stronger",
      ),
      comparisonAnswer({ grounding: "comparable", compliance: "contrasted" }, "comparable"),
      comparisonAnswer({ grounding: "comparable", compliance: "contrasted" }, "comparable"),
      SYNTHESIS_ANSWER,
    ];
    const judgeAdapter = structuredAdapter((_call, index) => {
      const outcome = judgeOutcomes[index];

      if (outcome === undefined) {
        throw new Error("the fake judge was asked for more answers than it holds");
      }

      return outcome;
    });

    const report = await runPromptComparison({
      port: missionPort(mission.adapter),
      judge: createBenchJudge({ adapter: judgeAdapter.adapter }),
      missionId: "summarize-chapter",
      corpus: CORPUS,
      missionIntent: MISSION_INTENT,
      output: { kind: "structured", schema: SUMMARY_SCHEMA },
      criteria: CRITERIA,
      baselineVersion: 1,
      candidateVersion: 2,
    });

    // The static diff travels with the dynamic comparison.
    expect(report.promptDiff.from).toBe(1);
    expect(report.promptDiff.to).toBe(2);
    expect(report.promptDiff.identical).toBe(false);

    // Mission calls per case: baseline then candidate, in corpus order.
    const [caseOne, caseTwo] = report.cases;

    expect(caseOne?.baseline.status).toBe("produced");
    expect(caseOne?.candidate.status).toBe("produced");

    // The blinding: pass 1 shows baseline first, pass 2 shows candidate
    // first, and neither pass names a version.
    const passOnePrompt = judgeAdapter.calls[0]?.prompt ?? "";
    const passTwoPrompt = judgeAdapter.calls[1]?.prompt ?? "";

    expect(passOnePrompt.indexOf("BRIEF-1")).toBeGreaterThanOrEqual(0);
    expect(passOnePrompt.indexOf("BRIEF-1")).toBeLessThan(passOnePrompt.indexOf("BRIEF-2"));
    expect(passTwoPrompt.indexOf("BRIEF-2")).toBeLessThan(passTwoPrompt.indexOf("BRIEF-1"));

    for (const prompt of [passOnePrompt, passTwoPrompt]) {
      expect(prompt).not.toContain("version en place");
      expect(prompt).not.toContain("version candidate");
    }

    // The merge: agreement keeps the verdict, disagreement is `unstable`.
    expect(caseOne?.judgement?.criteria).toEqual([
      { criterionId: "grounding", verdict: "baseline-stronger", stable: true },
      { criterionId: "compliance", verdict: "unstable", stable: false },
    ]);
    expect(caseOne?.judgement?.overall).toEqual({ verdict: "baseline-stronger", stable: true });
    expect(caseTwo?.judgement?.criteria).toEqual([
      { criterionId: "grounding", verdict: "comparable", stable: true },
      { criterionId: "compliance", verdict: "contrasted", stable: true },
    ]);

    // The tallies are counts of the merged verdicts — nothing more.
    expect(report.tallies).toEqual([
      {
        criterionId: "grounding",
        counts: {
          "baseline-stronger": 1,
          "candidate-stronger": 0,
          comparable: 1,
          contrasted: 0,
          unstable: 0,
        },
      },
      {
        criterionId: "compliance",
        counts: {
          "baseline-stronger": 0,
          "candidate-stronger": 0,
          comparable: 0,
          contrasted: 1,
          unstable: 1,
        },
      },
    ]);
    expect(report.overallTally).toEqual({
      "baseline-stronger": 1,
      "candidate-stronger": 0,
      comparable: 1,
      contrasted: 0,
      unstable: 0,
    });

    // The synthesis judge reads verdicts already mapped out of the blinding,
    // with the legend of each pass — and its recommendation reaches the report.
    const synthesisPrompt = judgeAdapter.calls[4]?.prompt ?? "";

    expect(synthesisPrompt).toContain("cas case-one");
    expect(synthesisPrompt).toContain("version en place plus forte");
    expect(synthesisPrompt).toContain("instable selon l'ordre de présentation");
    expect(synthesisPrompt).toContain("réponse 1 = version en place");
    expect(report.synthesis?.judgement.recommendation).toBe("keep-baseline");

    // The instability is stated in the report's own limits.
    expect(report.limitations.some((limitation) => limitation.includes("instables"))).toBe(true);
  });

  it("captures a version that fails across the corpus instead of aborting", async () => {
    // The baseline (version 1) produces; the candidate answers off-topic on
    // every call. Version is read off the rendered prompt: v2 asks for word
    // targets, so its prompt carries the marker below.
    const mission = structuredAdapter((call) =>
      call.prompt.includes("50")
        ? { unrelated: true }
        : { briefSummary: "BRIEF-BASE", detailedSummary: "DETAIL-BASE" },
    );
    const judgeAdapter = structuredAdapter(() => {
      throw new Error("nothing can be judged when one side is missing");
    });

    const report = await runPromptComparison({
      port: missionPort(mission.adapter),
      judge: createBenchJudge({ adapter: judgeAdapter.adapter }),
      missionId: "summarize-chapter",
      corpus: CORPUS,
      missionIntent: MISSION_INTENT,
      output: { kind: "structured", schema: SUMMARY_SCHEMA },
      criteria: CRITERIA,
      baselineVersion: 1,
      candidateVersion: 2,
    });

    for (const entry of report.cases) {
      expect(entry.baseline.status).toBe("produced");
      expect(entry.candidate).toEqual({
        status: "failed",
        errorCode: "MODEL_OUTPUT_OFF_TOPIC",
        errorCategory: "provider",
      });
      expect(entry.judgement).toBeUndefined();
    }

    expect(judgeAdapter.calls).toHaveLength(0);
    expect(report.synthesis).toBeUndefined();
    expect(report.synthesisSkipped).toContain("Aucun cas");
  });

  it("refuses to compare a version to itself", async () => {
    const mission = structuredAdapter(() => ({}));
    const judgeAdapter = structuredAdapter(() => ({}));

    await expect(
      runPromptComparison({
        port: missionPort(mission.adapter),
        judge: createBenchJudge({ adapter: judgeAdapter.adapter }),
        missionId: "summarize-chapter",
        corpus: CORPUS,
        missionIntent: MISSION_INTENT,
        output: { kind: "structured", schema: SUMMARY_SCHEMA },
        criteria: CRITERIA,
        baselineVersion: 2,
        candidateVersion: 2,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("refuses a version the registry never shipped", async () => {
    const mission = structuredAdapter(() => ({}));
    const judgeAdapter = structuredAdapter(() => ({}));

    await expect(
      runPromptComparison({
        port: missionPort(mission.adapter),
        judge: createBenchJudge({ adapter: judgeAdapter.adapter }),
        missionId: "summarize-chapter",
        corpus: CORPUS,
        missionIntent: MISSION_INTENT,
        output: { kind: "structured", schema: SUMMARY_SCHEMA },
        criteria: CRITERIA,
        baselineVersion: 1,
        candidateVersion: 99,
      }),
    ).rejects.toMatchObject({ code: "PROMPT_NOT_REGISTERED" });
  });
});
