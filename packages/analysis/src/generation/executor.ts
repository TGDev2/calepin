/**
 * The first `GenerationExecutor` (CAL-208) — `analyze-source-text`, run by a
 * worker, against a real provider.
 *
 * Until this file existed, every process composed `NO_GENERATION_EXECUTORS` and
 * no generation had ever called a model. The seam it fills is the one
 * `@calepin/shared/queue` describes and cannot cross: *an executor reaches both
 * a domain package and `@calepin/ai`, and this module may reach neither*
 * (§3.2). So the executor lives in the domain that owns the answer's schema,
 * takes the port as an argument (§5.3), and the process shells hand it one.
 *
 * **Behind a second entry point, never the root barrel.** This module reaches
 * `@calepin/shared/repository` and `@calepin/shared/queue`, whose graphs end in
 * `node:async_hooks`; a `"use client"` component already imports
 * `@calepin/analysis` for a type, and the day it imports a value the build
 * would fail inside Turbopack naming a page rather than this file. `@calepin/bible`
 * and `@calepin/outline` each learned that the expensive way.
 *
 * **It writes through the transaction that completes the attempt** (CAL-209).
 * `GenerationProduct.append` is a closure, so the value never leaves this
 * module: what is handed back is the *write*, and
 * `writeGeneratedAnalysisWithin` runs it against the client
 * `completeGenerationAttempt` is already holding. The seventeen revisions and
 * the generation's completion therefore commit together or not at all, and a
 * refusal leaves no half-written diagnostic behind (§7).
 *
 * **Nothing unverified can reach a row.** `resolveSourceTextAnalysis` takes the
 * brand `verifyAnalysisEvidence` mints and nothing else, so CAL-071's check
 * stopped being a step this file remembers to perform and became a shape the
 * write path requires.
 */

import {
  composeSourceTextAnalysisContext,
  currentPrompt,
  estimateCostUsd,
  MISSION_REGISTRY,
  ModelOutputInvalidError,
  ModelOutputOffTopicError,
  type ModelProviderPort,
  type TokenUsage,
} from "@calepin/ai";
import { type AppError, ConflictError, fail, type Result, succeed } from "@calepin/shared/errors";
import type { GenerationProgress } from "@calepin/shared/generation";
import { logger } from "@calepin/shared/logging";
import type {
  GenerationExecutor,
  GenerationExecutorRequest,
  GenerationProduct,
} from "@calepin/shared/queue";
import {
  getAnalysis,
  getGenerationContextForProject,
  getSourceText,
  writeGeneratedAnalysisWithin,
} from "@calepin/shared/repository";

import { verifyAnalysisEvidence } from "../evidence";
import { resolveSourceTextAnalysis } from "../persistence";
import {
  ANALYSIS_TOTAL_WORD_BUDGET,
  ANALYSIS_WORD_TARGETS,
  sourceTextAnalysisSchema,
} from "../schema";
import { analyzeSourceTextInputSchema } from "./input";

const MISSION_ID = "analyze-source-text" as const;

/**
 * The three steps a screen watching this generation is shown (CAL-062).
 *
 * French, and the domain's, for `NARRATIVE_ENGINE_COPY`'s reason: the author
 * reads them, and the layer that knows what the mission is doing is the one
 * that can name it. Display-only — nothing that decides this generation's fate
 * reads a percentage.
 */
const PROGRESS = {
  reading: { step: "Lecture du texte source", percent: 5 },
  analysing: { step: "Analyse du texte source", percent: 15 },
  verifying: { step: "Vérification des citations", percent: 90 },
} as const satisfies Record<string, GenerationProgress>;

function sourceTextSuperseded(): AppError {
  return new ConflictError({
    code: "SOURCE_TEXT_VERSION_SUPERSEDED",
    message: "the ask names a source text version that is no longer the current one",
    userMessage:
      "Le texte source a été modifié depuis le lancement de cette analyse. " +
      "Relancez l'analyse pour qu'elle porte sur la version actuelle.",
  });
}

function analysisAlreadyValidated(): AppError {
  return new ConflictError({
    code: "ANALYSIS_ALREADY_VALIDATED",
    message: "the project's analysis is validated and cannot be replaced",
    userMessage:
      "Cette analyse est validée : elle ne peut plus être remplacée. " +
      "Dupliquez le projet pour repartir d'un nouveau diagnostic.",
  });
}

/**
 * What a call spent, when the failure it ended in knows.
 *
 * Only the two output failures carry usage, and they carry it because the
 * tokens were genuinely consumed: an answer that failed the mission's schema
 * was still paid for, and a `GenerationAttempt` that hid it would under-count
 * the project's real cost. Every other failure — a timeout, a provider that
 * never answered — has nothing to report, and reporting a zero there would be
 * an invented measurement rather than a missing one.
 */
function usageOfFailure(error: AppError): TokenUsage | undefined {
  return error instanceof ModelOutputInvalidError || error instanceof ModelOutputOffTopicError
    ? error.usage
    : undefined;
}

/**
 * Builds the executor for `analyze-source-text` over an injected port.
 *
 * `model` and `promptVersion` are read off the registry and the prompt registry
 * rather than written here, so retuning the mission or shipping a prompt
 * version moves what the attempt records without this file changing. Both are
 * known before the call because the attempt row is written before it (CAL-058);
 * `completeGenerationAttempt` overwrites the model with whatever actually
 * served, which a provider failover changes.
 */
export function createAnalyzeSourceTextExecutor(port: ModelProviderPort): GenerationExecutor {
  const mission = MISSION_REGISTRY[MISSION_ID];

  return {
    model: mission.model,
    promptVersion: currentPrompt(MISSION_ID).version,

    async produce(
      request: GenerationExecutorRequest,
      report: (usage: {
        model: string;
        inputTokens: number;
        outputTokens: number;
        estimatedCostUsd?: string;
      }) => void,
      reportProgress: (progress: GenerationProgress) => void,
    ): Promise<Result<GenerationProduct>> {
      // A payload that crossed a serialisation boundary and may have been
      // written by a previous release (§6) — parsed, never trusted.
      const parsed = analyzeSourceTextInputSchema.safeParse(request.input);

      if (!parsed.success) {
        return fail(
          new ConflictError({
            code: "CONFLICT",
            message: "the replay payload is not an analyze-source-text ask",
            userMessage:
              "Cette demande d'analyse est illisible. Relancez l'analyse depuis l'écran du texte source.",
            fieldPath: parsed.error.issues[0]?.path.join("."),
          }),
        );
      }

      reportProgress(PROGRESS.reading);

      const snapshot = await getSourceText(request.scope);
      if (!snapshot.ok) return snapshot;

      // The ask names a version, and the diagnostic will be attributed to the
      // one it names. Running against a newer text and recording the older id
      // is how an analysis comes to cite a passage nobody wrote — so an edit
      // that landed while this generation waited in the queue refuses here
      // rather than being papered over.
      if (snapshot.value.versionId !== parsed.data.sourceTextVersionId) {
        return fail(sourceTextSuperseded());
      }

      // §6.5, *signaler avant la génération*: the write below refuses a
      // validated analysis, and reaching that refusal would mean the author had
      // already paid for an answer nothing could store. Decided here with no
      // model call, exactly as the superseded version above is. The write keeps
      // its own refusal all the same — the author may validate while this runs,
      // and a lock is true for every writer or it is true for none.
      const existing = await getAnalysis(request.scope);

      if (existing !== null && existing.validatedAt !== null) {
        return fail(analysisAlreadyValidated());
      }

      const context = await getGenerationContextForProject(request.scope);
      if (!context.ok) return context;

      const composed = composeSourceTextAnalysisContext({
        language: context.value.language,
        targetAudience: context.value.targetAudience,
        sourceText: snapshot.value.content,
        summaryWordTarget: ANALYSIS_WORD_TARGETS.factualSummary,
        potentialWordTarget: ANALYSIS_WORD_TARGETS.developmentPotential,
        totalWordBudget: ANALYSIS_TOTAL_WORD_BUDGET,
        evidenceWordTarget: ANALYSIS_WORD_TARGETS.evidence,
      });

      if (!composed.ok) return composed;

      reportProgress(PROGRESS.analysing);

      const generated = await port.generateStructured({
        prompt: composed.value.prompt,
        schema: sourceTextAnalysisSchema,
        // Forwarded and nothing else: `@calepin/ai` stops the attempt, the
        // backoff wait and the network call. Forwarding it is the difference
        // between a cancellation the author sees and one they keep paying for.
        signal: request.signal,
      });

      if (!generated.ok) {
        const spent = usageOfFailure(generated.error);

        if (spent !== undefined) {
          // The routed model, not the one that served: a failure does not say
          // which endpoint answered. It is the value the claim already wrote
          // for this attempt, so the row states no more than it did before.
          report({
            model: mission.model,
            inputTokens: spent.inputTokens,
            outputTokens: spent.outputTokens,
            estimatedCostUsd: estimateCostUsd(mission.model, spent),
          });
        }

        return generated;
      }

      report({
        model: generated.value.model,
        inputTokens: generated.value.usage.inputTokens,
        outputTokens: generated.value.usage.outputTokens,
        estimatedCostUsd: estimateCostUsd(generated.value.model, generated.value.usage),
      });

      reportProgress(PROGRESS.verifying);

      // Provenance, never sufficiency (CAL-071): every quotation read back
      // against the text it claims to come from, an unsupported FACTUAL element
      // demoted and an invented quotation dropped. The branded result is what
      // the write path takes, so an analysis that skipped this check has no way
      // of being persisted.
      const verified = verifyAnalysisEvidence(generated.value.output, snapshot.value.content);

      logger.info("analysis.evidence-verified", {
        generationId: request.generationId,
        missionId: MISSION_ID,
        itemCount: verified.report.corrections.length,
      });

      const sections = resolveSourceTextAnalysis(verified.analysis);

      // The write, handed back as a closure rather than performed here: it runs
      // inside the transaction that completes the attempt, so the seventeen
      // revisions and the generation's own completion commit together or not at
      // all (§7). A refusal rolls every one of them back, which is what makes
      // *never a partial analysis* structural rather than careful.
      return succeed({
        append: async (client): Promise<Result<void>> => {
          const written = await writeGeneratedAnalysisWithin(client, request.scope, {
            sections,
            // The version the ask named, not today's — the column means *the
            // version this revision was produced against*, and an edit that
            // landed while this ran belongs in `SourceTextObsolescence`'s doubt.
            sourceTextVersionId: parsed.data.sourceTextVersionId,
            generationId: request.generationId,
          });

          if (!written.ok) return written;

          // Logged from inside the transaction that made it true, and counts
          // only (§9): what was written, never a word of it.
          logger.info("analysis.persisted", {
            generationId: request.generationId,
            missionId: MISSION_ID,
            itemCount: written.value.elementCount,
          });

          return succeed(undefined);
        },
      });
    },
  };
}
