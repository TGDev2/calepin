/**
 * `pnpm eval:analysis` — CAL-078's answer to CAL-059's own bench, wired to
 * the mission it exists to guard: runs `analyze-source-text` over the five-
 * register reference corpus (`../src/bench/corpus.ts`) and writes an argued
 * French report, so a prompt change that degrades the diagnostic is visible
 * before it merges.
 *
 * A command, not a library — the same carve-out `packages/ai/scripts/
 * prompt-diff.ts` documents: it lives outside `src/`, so neither the
 * `console.log` ban (§7) nor the `process.env` ban (§4.2) reaches it. Reading
 * `ANTHROPIC_API_KEY` here is exactly the "process shell" role
 * `createAnthropicAdapter`'s own doc comment describes — no package under
 * `src/` reads the environment; this script is the one that supplies it.
 *
 * `ANTHROPIC_API_KEY` deliberately stays out of `envSchema` (CLAUDE.md §13):
 * that wiring is reserved for the first task to register a
 * `GenerationExecutor`, the production queue-driven write path. This script
 * bypasses `Generation`/the queue entirely and calls the port directly, the
 * same way CAL-059's bench itself does.
 *
 * The rendered report quotes the corpus and the model's answers, which is
 * literary content (§9): it is written under `bench-reports/` (gitignored)
 * and never printed. What reaches the console is counts and cost only.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  createAnthropicAdapter,
  createBenchJudge,
  createModelProviderPort,
  formatEvaluationReport,
  runPromptEvaluation,
} from "@calepin/ai";

import { ANALYSIS_REFERENCE_CORPUS, sourceTextAnalysisSchema } from "../src/index";

const MISSION_INTENT =
  "Produire, à partir du texte source et du lectorat visé, le diagnostic narratif en dix-sept sections que le schéma demande : ce que le texte établit, ce qui reste ouvert, ce qui devra être préservé ou traité pour en tirer un roman.";

function reportPath(promptVersion: number): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "bench-reports");

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return join(dir, `analyze-source-text-v${promptVersion}-${timestamp}.md`);
}

async function main(): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey === undefined || apiKey.trim() === "") {
    console.error(
      [
        "pnpm eval:analysis needs an Anthropic API key to call the real model — none was found.",
        "Set ANTHROPIC_API_KEY in the shell environment before running this command:",
        "",
        "  ANTHROPIC_API_KEY=sk-... pnpm eval:analysis",
        "",
        "This runs a real, billed model call for every case in the reference corpus.",
      ].join("\n"),
    );

    return 1;
  }

  const adapter = createAnthropicAdapter({ apiKey });
  const port = createModelProviderPort({ adapters: [adapter] });
  const judge = createBenchJudge({ adapter });

  console.log(
    `Running analyze-source-text over ${ANALYSIS_REFERENCE_CORPUS.cases.length} corpus cases…`,
  );

  const report = await runPromptEvaluation({
    port,
    judge,
    missionId: "analyze-source-text",
    corpus: ANALYSIS_REFERENCE_CORPUS,
    missionIntent: MISSION_INTENT,
    output: { kind: "structured", schema: sourceTextAnalysisSchema },
  });

  const outPath = reportPath(report.promptVersion);

  writeFileSync(outPath, formatEvaluationReport(report), "utf-8");

  const failedCases = report.cases.filter((entry) => entry.run.status === "failed").length;
  const judgedCases = report.cases.filter((entry) => entry.review !== undefined).length;

  console.log(`Prompt ${report.promptId} v${report.promptVersion}`);
  console.log(`Cases: ${report.cases.length} — judged ${judgedCases}, failed ${failedCases}`);
  console.log(
    `Mission tokens: ${report.totals.missionUsage.inputTokens} in / ${report.totals.missionUsage.outputTokens} out. ` +
      `Judge tokens: ${report.totals.judgeUsage.inputTokens} in / ${report.totals.judgeUsage.outputTokens} out. ` +
      `Measured cost: ${report.totals.measuredCostUsd} USD.`,
  );
  console.log(`Report written to ${outPath}`);

  return 0;
}

try {
  process.exitCode = await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
