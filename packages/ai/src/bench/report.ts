/**
 * The bench's restitution (CAL-059) — the argued evaluation as a reader
 * reads it.
 *
 * French, because the reader is the product's author and the judgements are
 * French; only identifiers stay English. **Nothing here invents a number**:
 * every figure the renderer prints is a count of argued verdicts (labelled as
 * exactly that), a token count or a cost — never a mark. The framing section
 * says so in as many words, and `report.test.ts` pins that it keeps saying so.
 *
 * The rendered text quotes outputs and evidence excerpts, which are literary
 * content: a report is a **local artefact** — the caller writes it under
 * `bench-reports/`, which is gitignored — and it must never travel through a
 * logger, a commit, CI output or any of §9's forbidden sinks. What may be
 * printed to a console is the report's *counts*; the renderer keeps them
 * separable by putting every quote below the case headings, never in the
 * summary sections.
 */

import { MODEL_CAPABILITIES } from "../capabilities";
import type { TextComparison } from "../prompts";
import type { BenchCriterion } from "./criteria";
import type { ComparisonJudgment, ExpectationStatus, FindingKind, Recommendation } from "./judge";
import {
  type CandidateRun,
  type ComparisonPassReport,
  MERGED_VERDICT_LABELS,
  type PromptComparisonReport,
  type PromptEvaluationReport,
} from "./run";

const RECOMMENDATION_LABELS: Readonly<Record<Recommendation, string>> = {
  "adopt-candidate": "Adopter la version candidate",
  "keep-baseline": "Garder la version en place",
  "no-established-difference": "Aucune différence établie",
};

const EXPECTATION_STATUS_LABELS: Readonly<Record<ExpectationStatus, string>> = {
  met: "satisfaite",
  "partially-met": "partiellement satisfaite",
  "not-met": "non satisfaite",
};

const FINDING_KIND_LABELS: Readonly<Record<FindingKind, string>> = {
  strength: "Force",
  weakness: "Faiblesse",
};

const EVIDENCE_SOURCE_LABELS: Readonly<Record<string, string>> = {
  output: "résultat",
  "reference-text": "texte de référence",
  "first-output": "réponse 1",
  "second-output": "réponse 2",
};

const PASS_LEGENDS = {
  "baseline-first": "réponse 1 = version en place, réponse 2 = version candidate",
  "candidate-first": "réponse 1 = version candidate, réponse 2 = version en place",
} as const;

/**
 * The paragraph every report opens its reading contract with. One string, so
 * the two renderers cannot drift on what the bench promises — and refuses.
 */
const READING_CONTRACT = [
  "Ce rapport ne contient aucun score ni aucune note : le cahier des charges l'interdit.",
  "Chaque critique est un jugement argumenté, relié à des extraits cités des textes évalués — c'est au lecteur de contrôler que la preuve porte le jugement.",
  "Les seuls chiffres ci-dessous sont des décomptes de verdicts argumentés, des comptes de jetons et des coûts : des faits comptables, jamais une mesure de qualité.",
].join("\n");

function evidenceLines(
  evidence: readonly {
    readonly source: string;
    readonly excerpt: string;
    readonly location: string;
    readonly relevance: string;
  }[],
): string[] {
  return evidence.map(
    (item) =>
      `  - preuve (${EVIDENCE_SOURCE_LABELS[item.source] ?? item.source}, ${item.location}) : « ${item.excerpt} » — ${item.relevance}`,
  );
}

function usageLine(run: CandidateRun, label: string): string {
  if (run.status === "failed") {
    return `| ${label} | échec | — | — | — | ${run.errorCode} |`;
  }

  const { meta } = run;
  const fallback = meta.usedFallback ? "oui" : "non";

  return `| ${label} | ${MODEL_CAPABILITIES[meta.model].label} | ${meta.usage.inputTokens} / ${meta.usage.outputTokens} | ${run.costUsd} | ${meta.attemptCount} | bascule : ${fallback} |`;
}

const RUN_TABLE_HEADER = [
  "| Version | Modèle | Jetons (entrée / sortie) | Coût (USD) | Tentatives | Issue |",
  "| --- | --- | --- | --- | --- | --- |",
];

function textDiffSummary(name: string, diff: TextComparison): string {
  return diff.addedCount === 0 && diff.removedCount === 0
    ? `${name} : inchangé`
    : `${name} : +${diff.addedCount} ligne(s), −${diff.removedCount} ligne(s)`;
}

function outputBlock(title: string, text: string): string[] {
  return [`#### ${title}`, "", "````", text, "````", ""];
}

function criterionHeading(criterion: BenchCriterion): string {
  return `**${criterion.label}** (\`${criterion.id}\`)`;
}

/* -------------------------------------------------------------------------- *
 * Evaluation report
 * -------------------------------------------------------------------------- */

export function formatEvaluationReport(report: PromptEvaluationReport): string {
  const lines: string[] = [
    `# Banc d'évaluation — revue du prompt \`${report.promptId}\` v${report.promptVersion}`,
    "",
    `**Mission** : \`${report.missionId}\` — ${report.missionIntent}`,
    `**Juge** : ${MODEL_CAPABILITIES[report.judge.model].label}, prompt \`${report.judge.promptId}\` v${report.judge.promptVersion}`,
    `**Corpus** : \`${report.corpus.id}\` (${report.corpus.caseCount} cas) — ${report.corpus.description}`,
    "",
    "## Ce que ce rapport dit, et ce qu'il ne dit pas",
    "",
    READING_CONTRACT,
    "",
    "## Cas par cas",
    "",
  ];

  for (const entry of report.cases) {
    lines.push(`### ${entry.title} (\`${entry.caseId}\`)`, "");
    lines.push(...RUN_TABLE_HEADER, usageLine(entry.run, `v${report.promptVersion}`), "");

    if (entry.run.status === "failed") {
      lines.push(
        `La mission a échoué (${entry.run.errorCode}, catégorie ${entry.run.errorCategory}) : rien à juger pour ce cas.`,
        "",
      );
      continue;
    }

    if (entry.judgeFailure !== undefined) {
      lines.push(
        `Le juge a échoué sur ce cas (${entry.judgeFailure.errorCode}) : la sortie reste reproduite ci-dessous, sans revue.`,
        "",
        ...outputBlock("Sortie évaluée", entry.run.outputText),
      );
      continue;
    }

    if (entry.review !== undefined) {
      for (const criterion of report.criteria) {
        const findings = entry.review.judgement.findings.filter(
          (finding) => finding.criterionId === criterion.id,
        );

        lines.push(`#### ${criterionHeading(criterion)}`, "");

        for (const finding of findings) {
          lines.push(`- **${FINDING_KIND_LABELS[finding.kind]}** — ${finding.argument}`);
          lines.push(...evidenceLines(finding.evidence));
        }

        lines.push("");
      }

      if (entry.review.judgement.expectationChecks.length > 0) {
        lines.push("#### Attentes annotées", "");
        entry.review.judgement.expectationChecks.forEach((check, index) => {
          lines.push(
            `- Attente ${index + 1} : **${EXPECTATION_STATUS_LABELS[check.status]}** — ${check.argument}`,
          );
          lines.push(...evidenceLines(check.evidence));
        });
        lines.push("");
      }

      lines.push("#### Synthèse du juge", "", entry.review.judgement.summary, "");
      lines.push(...outputBlock("Sortie évaluée", entry.run.outputText));
    }
  }

  lines.push(
    "## Mécanique et coûts",
    "",
    `Jetons mission : ${report.totals.missionUsage.inputTokens} entrée / ${report.totals.missionUsage.outputTokens} sortie. Jetons juge : ${report.totals.judgeUsage.inputTokens} entrée / ${report.totals.judgeUsage.outputTokens} sortie. Coût mesuré : ${report.totals.measuredCostUsd} USD.`,
    "",
    "## Limites",
    "",
    ...report.limitations.map((limitation) => `- ${limitation}`),
    "",
  );

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- *
 * Comparison report
 * -------------------------------------------------------------------------- */

function passSection(
  pass: ComparisonPassReport,
  index: number,
  criterion: BenchCriterion,
): string[] {
  const judgment: ComparisonJudgment | undefined = pass.judgement.judgments.find(
    (candidate) => candidate.criterionId === criterion.id,
  );

  if (judgment === undefined) {
    return [];
  }

  return [
    `- Passe ${index + 1} (${PASS_LEGENDS[pass.order]}) — ${judgment.argument}`,
    ...evidenceLines(judgment.evidence),
  ];
}

export function formatComparisonReport(report: PromptComparisonReport): string {
  const lines: string[] = [
    `# Banc d'évaluation — comparaison du prompt \`${report.promptId}\`, v${report.baselineVersion} (en place) contre v${report.candidateVersion} (candidate)`,
    "",
    `**Mission** : \`${report.missionId}\` — ${report.missionIntent}`,
    `**Juge** : ${MODEL_CAPABILITIES[report.judge.model].label}, prompt \`${report.judge.promptId}\` v${report.judge.promptVersion} — deux passes par cas, positions inversées, versions masquées`,
    `**Corpus** : \`${report.corpus.id}\` (${report.corpus.caseCount} cas) — ${report.corpus.description}`,
    "",
    "## Ce que ce rapport dit, et ce qu'il ne dit pas",
    "",
    READING_CONTRACT,
    "",
    "Un jugement rendu différemment selon l'ordre de présentation des réponses est dit « instable » : il compte comme une absence de signal, jamais comme une préférence.",
    "",
    "## Recommandation du juge",
    "",
  ];

  if (report.synthesis !== undefined) {
    lines.push(
      `**${RECOMMENDATION_LABELS[report.synthesis.judgement.recommendation]}**`,
      "",
      report.synthesis.judgement.argument,
      "",
    );

    if (report.synthesis.judgement.reservations.length > 0) {
      lines.push("Réserves du juge :", "");
      lines.push(
        ...report.synthesis.judgement.reservations.map((reservation) => `- ${reservation}`),
        "",
      );
    }
  }

  if (report.synthesisSkipped !== undefined) {
    lines.push(report.synthesisSkipped, "");
  }

  lines.push("## Le texte du prompt : ce qui change", "");

  if (report.promptDiff.identical) {
    lines.push("Les deux versions ne diffèrent que par leur numéro.", "");
  } else {
    const { added, removed, retyped } = report.promptDiff.variables;

    lines.push(
      `- ${textDiffSummary("Instructions permanentes (system)", report.promptDiff.system)}`,
      `- ${textDiffSummary("Consigne (instruction)", report.promptDiff.instruction)}`,
      `- Variables : ${added.length} ajoutée(s), ${removed.length} retirée(s), ${retyped.length} retypée(s)`,
      "",
      "Le détail ligne à ligne s'obtient avec l'outil de comparaison du registre (`comparePromptVersions`).",
      "",
    );
  }

  lines.push(
    "## Décomptes des verdicts",
    "",
    "Des décomptes de jugements argumentés — combien de cas ont reçu chaque verdict — et rien d'autre. Les arguments et leurs preuves sont sous chaque cas.",
    "",
    "| Critère | En place plus forte | Candidate plus forte | Comparables | Contrasté | Instable |",
    "| --- | --- | --- | --- | --- | --- |",
  );

  for (const tally of report.tallies) {
    const criterion = report.criteria.find((candidate) => candidate.id === tally.criterionId);

    lines.push(
      `| ${criterion?.label ?? tally.criterionId} | ${tally.counts["baseline-stronger"]} | ${tally.counts["candidate-stronger"]} | ${tally.counts["comparable"]} | ${tally.counts["contrasted"]} | ${tally.counts["unstable"]} |`,
    );
  }

  lines.push(
    `| Jugement d'ensemble | ${report.overallTally["baseline-stronger"]} | ${report.overallTally["candidate-stronger"]} | ${report.overallTally["comparable"]} | ${report.overallTally["contrasted"]} | ${report.overallTally["unstable"]} |`,
    "",
    "## Cas par cas",
    "",
  );

  for (const entry of report.cases) {
    lines.push(`### ${entry.title} (\`${entry.caseId}\`)`, "");
    lines.push(
      ...RUN_TABLE_HEADER,
      usageLine(entry.baseline, `v${report.baselineVersion} (en place)`),
      usageLine(entry.candidate, `v${report.candidateVersion} (candidate)`),
      "",
    );

    if (entry.baseline.status === "failed" || entry.candidate.status === "failed") {
      lines.push("Une des deux versions a échoué : aucune comparaison rendue pour ce cas.", "");
      continue;
    }

    if (entry.judgeFailure !== undefined) {
      lines.push(
        `Le juge a échoué sur ce cas (${entry.judgeFailure.errorCode}) : les deux sorties restent reproduites ci-dessous, sans jugement.`,
        "",
      );
    }

    if (entry.judgement !== undefined) {
      for (const criterion of report.criteria) {
        const merged = entry.judgement.criteria.find(
          (candidate) => candidate.criterionId === criterion.id,
        );

        if (merged === undefined) {
          continue;
        }

        const stability = merged.stable ? "verdict stable" : "les deux passes se contredisent";

        lines.push(
          `#### ${criterionHeading(criterion)} — ${MERGED_VERDICT_LABELS[merged.verdict]} (${stability})`,
          "",
        );

        entry.judgement.passes.forEach((pass, index) => {
          lines.push(...passSection(pass, index, criterion));
        });

        lines.push("");
      }

      const overallStability = entry.judgement.overall.stable
        ? "verdict stable"
        : "les deux passes se contredisent";

      lines.push(
        `#### Jugement d'ensemble — ${MERGED_VERDICT_LABELS[entry.judgement.overall.verdict]} (${overallStability})`,
        "",
      );

      entry.judgement.passes.forEach((pass, index) => {
        lines.push(
          `- Passe ${index + 1} (${PASS_LEGENDS[pass.order]}) — ${pass.judgement.overall.argument}`,
        );
      });

      lines.push("");
    }

    lines.push(
      ...outputBlock(
        `Sortie de la v${report.baselineVersion} (en place)`,
        entry.baseline.outputText,
      ),
      ...outputBlock(
        `Sortie de la v${report.candidateVersion} (candidate)`,
        entry.candidate.outputText,
      ),
    );
  }

  lines.push(
    "## Mécanique et coûts",
    "",
    `Jetons mission : ${report.totals.missionUsage.inputTokens} entrée / ${report.totals.missionUsage.outputTokens} sortie. Jetons juge : ${report.totals.judgeUsage.inputTokens} entrée / ${report.totals.judgeUsage.outputTokens} sortie. Coût mesuré : ${report.totals.measuredCostUsd} USD.`,
    "",
    "## Limites",
    "",
    ...report.limitations.map((limitation) => `- ${limitation}`),
    "",
  );

  return lines.join("\n");
}
