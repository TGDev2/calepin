/**
 * The restitution (CAL-059): what the renderers must always say, and what
 * they must never invent. The assertions pin the reading contract — no score,
 * counts labelled as counts — the blinding legends, the stability wording,
 * and the mandatory limits section. No assertion reads literary quality (§8);
 * the fixture strings are markers and filler.
 */

import { describe, expect, it } from "vitest";

import { comparePromptVersions } from "../prompts";
import type { BenchCriterion } from "./criteria";
import type { ComparisonJudgement, ReviewJudgement } from "./judge";
import { formatComparisonReport, formatEvaluationReport } from "./report";
import type { ComparisonPassReport, PromptComparisonReport, PromptEvaluationReport } from "./run";

const CRITERIA: readonly BenchCriterion[] = [
  { id: "grounding", label: "Ancrage", question: "Question de démonstration sur l'ancrage." },
];

const ARGUMENT =
  "Argument de démonstration, assez long pour satisfaire la longueur minimale exigée par le contrat du banc.";

const EVIDENCE = {
  source: "first-output",
  excerpt: "extrait de démonstration cité depuis la réponse",
  location: "champ de démonstration",
  relevance: "cet extrait illustre le constat porté par l'argument ci-dessus.",
} as const;

const MECHANICS = {
  usage: { inputTokens: 100, outputTokens: 50 },
  durationMs: 5,
  attemptCount: 1,
  costUsd: "0.005250",
} as const;

const RUN = {
  status: "produced",
  outputText: "SORTIE-REPERE",
  meta: {
    missionId: "summarize-chapter",
    promptId: "summarize-chapter",
    promptVersion: 1,
    provider: "anthropic",
    model: "claude-sonnet-5",
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 5,
    attemptCount: 1,
    usedFallback: false,
  },
  costUsd: "0.001050",
} as const;

function pass(order: ComparisonPassReport["order"]): ComparisonPassReport {
  const judgement: ComparisonJudgement = {
    judgments: [
      {
        criterionId: "grounding",
        verdict: "first-stronger",
        argument: ARGUMENT,
        evidence: [EVIDENCE],
      },
    ],
    overall: { verdict: "first-stronger", argument: ARGUMENT },
  };

  return { order, judgement, ...MECHANICS };
}

const COMPARISON_REPORT: PromptComparisonReport = {
  missionId: "summarize-chapter",
  promptId: "summarize-chapter",
  baselineVersion: 1,
  candidateVersion: 2,
  missionIntent: "Résumer le chapitre fourni pour la mémoire du roman.",
  promptDiff: comparePromptVersions("summarize-chapter", 1, 2),
  judge: { model: "claude-opus-5", promptId: "bench-compare-outputs", promptVersion: 1 },
  corpus: { id: "corpus-test", description: "Corpus de démonstration.", caseCount: 1 },
  criteria: CRITERIA,
  cases: [
    {
      caseId: "case-one",
      title: "Cas un",
      baseline: RUN,
      candidate: { ...RUN, meta: { ...RUN.meta, promptVersion: 2 } },
      judgement: {
        passes: [pass("baseline-first"), pass("candidate-first")],
        criteria: [{ criterionId: "grounding", verdict: "unstable", stable: false }],
        overall: { verdict: "unstable", stable: false },
      },
    },
  ],
  tallies: [
    {
      criterionId: "grounding",
      counts: {
        "baseline-stronger": 0,
        "candidate-stronger": 0,
        comparable: 0,
        contrasted: 0,
        unstable: 1,
      },
    },
  ],
  overallTally: {
    "baseline-stronger": 0,
    "candidate-stronger": 0,
    comparable: 0,
    contrasted: 0,
    unstable: 1,
  },
  synthesis: {
    judgement: {
      recommendation: "keep-baseline",
      argument: ARGUMENT,
      reservations: ["Réserve de démonstration, énoncée pour le test."],
    },
    ...MECHANICS,
  },
  totals: {
    missionUsage: { inputTokens: 200, outputTokens: 100 },
    judgeUsage: { inputTokens: 300, outputTokens: 150 },
    measuredCostUsd: "0.017850",
  },
  limitations: ["Limite de démonstration, énoncée pour le test."],
};

describe("formatComparisonReport", () => {
  const rendered = formatComparisonReport(COMPARISON_REPORT);

  it("opens with the reading contract: no score, counts are counts", () => {
    expect(rendered).toContain("aucun score ni aucune note");
    expect(rendered).toContain("jamais une mesure de qualité");
  });

  it("labels the tallies as counts of argued verdicts", () => {
    expect(rendered).toContain("## Décomptes des verdicts");
    expect(rendered).toContain("Des décomptes de jugements argumentés");
  });

  it("carries the recommendation, its argument and its reservations", () => {
    expect(rendered).toContain("Garder la version en place");
    expect(rendered).toContain("Réserve de démonstration");
  });

  it("prints both blinded passes with their legends and the instability", () => {
    expect(rendered).toContain("réponse 1 = version en place, réponse 2 = version candidate");
    expect(rendered).toContain("réponse 1 = version candidate, réponse 2 = version en place");
    expect(rendered).toContain("instable selon l'ordre de présentation");
    expect(rendered).toContain("les deux passes se contredisent");
  });

  it("ties evidence to its source and location, quoted", () => {
    expect(rendered).toContain("preuve (réponse 1, champ de démonstration)");
    expect(rendered).toContain("« extrait de démonstration cité depuis la réponse »");
  });

  it("shows the static diff beside the dynamic comparison", () => {
    expect(rendered).toContain("## Le texte du prompt : ce qui change");
  });

  it("reproduces both evaluated outputs for the reader to check the critique", () => {
    expect(rendered).toContain("Sortie de la v1 (en place)");
    expect(rendered).toContain("Sortie de la v2 (candidate)");
    expect(rendered).toContain("SORTIE-REPERE");
  });

  it("ends on the limits, and no figure is dressed as a mark", () => {
    expect(rendered).toContain("## Limites");
    expect(rendered).toContain("Limite de démonstration");
    expect(rendered).not.toMatch(/\d+\s*\/\s*10/);
    expect(rendered).not.toMatch(/\d+\s*sur\s*10/);
  });
});

const REVIEW: ReviewJudgement = {
  findings: [
    {
      criterionId: "grounding",
      kind: "weakness",
      argument: ARGUMENT,
      evidence: [{ ...EVIDENCE, source: "reference-text" }],
    },
  ],
  expectationChecks: [
    {
      status: "partially-met",
      argument: ARGUMENT,
      evidence: [{ ...EVIDENCE, source: "output" }],
    },
  ],
  summary: ARGUMENT,
};

const EVALUATION_REPORT: PromptEvaluationReport = {
  missionId: "summarize-chapter",
  promptId: "summarize-chapter",
  promptVersion: 2,
  missionIntent: "Résumer le chapitre fourni pour la mémoire du roman.",
  judge: { model: "claude-opus-5", promptId: "bench-review-output", promptVersion: 1 },
  corpus: { id: "corpus-test", description: "Corpus de démonstration.", caseCount: 1 },
  criteria: CRITERIA,
  cases: [
    {
      caseId: "case-one",
      title: "Cas un",
      run: { ...RUN, meta: { ...RUN.meta, promptVersion: 2 } },
      review: { judgement: REVIEW, ...MECHANICS },
    },
  ],
  totals: {
    missionUsage: { inputTokens: 100, outputTokens: 50 },
    judgeUsage: { inputTokens: 100, outputTokens: 50 },
    measuredCostUsd: "0.006300",
  },
  limitations: ["Limite de démonstration, énoncée pour le test."],
};

describe("formatEvaluationReport", () => {
  const rendered = formatEvaluationReport(EVALUATION_REPORT);

  it("opens with the same reading contract as the comparison", () => {
    expect(rendered).toContain("aucun score ni aucune note");
  });

  it("renders findings under their criterion, kind named, evidence quoted", () => {
    expect(rendered).toContain("**Ancrage** (`grounding`)");
    expect(rendered).toContain("**Faiblesse**");
    expect(rendered).toContain("preuve (texte de référence, champ de démonstration)");
  });

  it("renders each annotated expectation's argued check", () => {
    expect(rendered).toContain("#### Attentes annotées");
    expect(rendered).toContain("**partiellement satisfaite**");
  });

  it("reproduces the evaluated output and ends on the limits", () => {
    expect(rendered).toContain("SORTIE-REPERE");
    expect(rendered).toContain("## Limites");
  });
});
