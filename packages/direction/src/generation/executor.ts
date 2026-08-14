/**
 * The `GenerationExecutor` of `propose-directions` (CAL-210) — the second
 * mission the product can actually run, and the first that calls a model more
 * than once.
 *
 * It replicates CAL-208/CAL-209's pattern exactly: the executor lives in the
 * domain that owns the answer's schema, takes the port as an argument (§5.3),
 * sits behind a second entry point because it reaches
 * `@calepin/shared/repository` (whose graph ends in `node:async_hooks`), and
 * hands back the **write** as a closure so the directions and the generation's
 * own completion commit together or not at all (§7).
 *
 * Two things are its own.
 *
 * **The bounded relaunch.** CAL-079 and CAL-080 shipped the gates and stopped at
 * a report; this is the loop that reads them. It asks, keeps what diverges, and
 * re-asks *only the slots that collided* — `directionCount` and `excludedEngines`
 * are prompt variables precisely so it can. `MAX_DIRECTION_PROPOSAL_ASKS` bounds
 * it, and past that bound it refuses out loud
 * (`DIRECTION_DIVERGENCE_NOT_REACHED`) rather than asking a fourth time. The
 * decisions themselves are in `./relaunch`, pure and tested without a provider;
 * what is here is the loop and the call.
 *
 * **Usage is accumulated and reported as a running total.** `AttemptUsage` is
 * *stated, never accumulated*: `report` replaces the value rather than adding to
 * it, because `@calepin/ai` already sums the retries and the failover inside one
 * call. That rule was written for an executor that calls a model once. This one
 * calls it up to three times, so it sums the port's own per-call totals itself
 * and states the running total each time — reporting each call alone would
 * record only the last and under-count what the author paid, and reporting after
 * the loop would lose everything an ask that failed halfway had already spent.
 */

import {
  composeDirectionProposalsContext,
  currentPrompt,
  estimateCostUsd,
  MISSION_REGISTRY,
  type ModelId,
  ModelOutputInvalidError,
  ModelOutputOffTopicError,
  type ModelProviderPort,
  sumCostUsd,
  type TokenUsage,
} from "@calepin/ai";
import { describeAnalysis } from "@calepin/shared/analysis";
import { type AppError, ConflictError, fail, type Result, succeed } from "@calepin/shared/errors";
import type { GenerationProgress } from "@calepin/shared/generation";
import { logger } from "@calepin/shared/logging";
import type {
  GenerationExecutor,
  GenerationExecutorRequest,
  GenerationProduct,
} from "@calepin/shared/queue";
import {
  directionsAlreadyProposed,
  getAnalysis,
  getDirectionsForComparison,
  getGenerationContextForProject,
  getProjectTargetLength,
  getSourceText,
  writeGeneratedDirectionsWithin,
} from "@calepin/shared/repository";
import { novelLengthChoiceOf, resolveNovelTargetWordCount } from "@calepin/shared/target-length";

import { NARRATIVE_ENGINE_DIVERGENCE_MINIMUM } from "../divergence";
import { describeNarrativeEngine, describeNarrativeEngineAxes } from "../narrative-engine";
import { resolveDirectionProposals } from "../persistence";
import {
  DIRECTION_LIST_COUNTS,
  DIRECTION_WORD_TARGETS,
  type DirectionProposal,
  directionProposalsSchemaFor,
} from "../proposals";
import { proposeDirectionsInputSchema } from "./input";
import {
  acceptDirectionCandidates,
  MAX_DIRECTION_PROPOSAL_ASKS,
  nextDirectionAsk,
} from "./relaunch";

const MISSION_ID = "propose-directions" as const;

/**
 * The steps a screen watching this generation is shown (CAL-062).
 *
 * French, and the domain's, for `NARRATIVE_ENGINE_COPY`'s reason: the author
 * reads them, and the layer that knows what the mission is doing is the one that
 * can name it. The relaunch has a step of its own — an author waiting through a
 * second model call deserves to be told why, not left watching a bar that
 * stopped. Display-only: nothing that decides this generation's fate reads a
 * percentage.
 */
const PROGRESS = {
  reading: { step: "Lecture de l'analyse validée", percent: 5 },
  proposing: { step: "Proposition de directions", percent: 20 },
  relaunching: { step: "Relance des directions trop proches", percent: 60 },
} as const satisfies Record<string, GenerationProgress>;

function sourceTextSuperseded(): AppError {
  return new ConflictError({
    code: "SOURCE_TEXT_VERSION_SUPERSEDED",
    message: "the ask names a source text version that is no longer the current one",
    userMessage:
      "Le texte source a été modifié depuis le lancement de cette proposition. " +
      "Relancez-la pour qu'elle porte sur la version actuelle.",
  });
}

function analysisNotValidated(): AppError {
  return new ConflictError({
    code: "ANALYSIS_NOT_VALIDATED",
    message: "the project's analysis is not validated",
    userMessage:
      "Validez d'abord l'analyse du texte source : les directions sont construites sur elle.",
  });
}

function divergenceNotReached(): AppError {
  return new ConflictError({
    code: "DIRECTION_DIVERGENCE_NOT_REACHED",
    message: "the model did not produce enough directions with distinct narrative engines",
    userMessage:
      "Les directions proposées reposaient toutes sur le même moteur narratif, " +
      "malgré plusieurs relances. Relancez la proposition, ou élargissez le degré " +
      "de liberté du projet pour laisser plus de jeu au conflit et à la fin.",
  });
}

/**
 * What a call spent, when the failure it ended in knows.
 *
 * Only the two output failures carry usage, and they carry it because the tokens
 * were genuinely consumed: an answer that failed the mission's schema was still
 * paid for. Every other failure — a timeout, a provider that never answered —
 * has nothing to report, and a zero there would be an invented measurement
 * rather than a missing one.
 */
function usageOfFailure(error: AppError): TokenUsage | undefined {
  return error instanceof ModelOutputInvalidError || error instanceof ModelOutputOffTopicError
    ? error.usage
    : undefined;
}

/** The running total of everything this attempt has spent so far. */
interface SpentSoFar {
  /** The model that served last — a failover changes it mid-loop. */
  model: ModelId;
  inputTokens: number;
  outputTokens: number;
  /**
   * One six-decimal string per call, added by `sumCostUsd` rather than by
   * arithmetic on numbers: two calls that ran on different models are priced at
   * their own tariffs, and `Number("0.000001") * 3` is not `0.000003`.
   */
  costs: string[];
}

/**
 * Builds the executor for `propose-directions` over an injected port.
 *
 * `model` and `promptVersion` are read off the registries rather than written
 * here, so retuning the mission or shipping a prompt version moves what the
 * attempt records without this file changing.
 */
export function createProposeDirectionsExecutor(port: ModelProviderPort): GenerationExecutor {
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
      const parsed = proposeDirectionsInputSchema.safeParse(request.input);

      if (!parsed.success) {
        return fail(
          new ConflictError({
            code: "CONFLICT",
            message: "the replay payload is not a propose-directions ask",
            userMessage:
              "Cette demande de directions est illisible. Relancez-la depuis l'écran des directions.",
            fieldPath: parsed.error.issues[0]?.path.join("."),
          }),
        );
      }

      reportProgress(PROGRESS.reading);

      const snapshot = await getSourceText(request.scope);
      if (!snapshot.ok) return snapshot;

      // The ask names a version, and the directions are argued out of the one it
      // names. An edit that landed while this generation waited in the queue
      // refuses here rather than being papered over — CAL-208's rule, and the
      // same reason: running against a newer text under an older ask is how a
      // stage comes to quote a passage nobody wrote.
      if (snapshot.value.versionId !== parsed.data.sourceTextVersionId) {
        return fail(sourceTextSuperseded());
      }

      // §6.5, *signaler avant la génération*. Both refusals below cost nothing
      // and are decided with no model call: an unvalidated analysis is not
      // something a direction can be built on, and a project that already holds
      // proposals has nowhere to put three more. The write refuses the second
      // one again — the author may write their own direction while this runs,
      // and a lock is true for every writer or it is true for none.
      const analysis = await getAnalysis(request.scope);

      if (analysis === null || analysis.validatedAt === null) {
        return fail(analysisNotValidated());
      }

      const standing = await getDirectionsForComparison(request.scope);

      if (standing.some((direction) => direction.discardedAt === null)) {
        return fail(directionsAlreadyProposed());
      }

      const [context, length] = await Promise.all([
        getGenerationContextForProject(request.scope),
        getProjectTargetLength(request.scope),
      ]);

      if (!context.ok) return context;
      if (!length.ok) return length;

      const targetWordCount = resolveNovelTargetWordCount(novelLengthChoiceOf(length.value));
      const validatedAnalysis = describeAnalysis(analysis.sections);

      const spent: SpentSoFar = {
        model: mission.model,
        inputTokens: 0,
        outputTokens: 0,
        costs: [],
      };

      /**
       * States the running total, and states it after every call — a failure
       * halfway through the loop then leaves an attempt that says exactly what
       * it had already bought.
       */
      const reportSpent = (model: ModelId, usage: TokenUsage): void => {
        spent.model = model;
        spent.inputTokens += usage.inputTokens;
        spent.outputTokens += usage.outputTokens;
        spent.costs.push(estimateCostUsd(model, usage));

        report({
          model: spent.model,
          inputTokens: spent.inputTokens,
          outputTokens: spent.outputTokens,
          estimatedCostUsd: sumCostUsd(spent.costs),
        });
      };

      let kept: readonly DirectionProposal[] = [];

      for (let ask = 1; ask <= MAX_DIRECTION_PROPOSAL_ASKS; ask += 1) {
        const plan = nextDirectionAsk(kept);
        if (plan === null) break;

        reportProgress(ask === 1 ? PROGRESS.proposing : PROGRESS.relaunching);

        const composed = composeDirectionProposalsContext({
          language: context.value.language,
          targetAudience: context.value.targetAudience,
          targetWordCount,
          freedomLevel: context.value.freedomLevel,
          validatedAnalysis,
          sourceText: snapshot.value.content,
          engineAxes: describeNarrativeEngineAxes(),
          minEngineDifferences: NARRATIVE_ENGINE_DIVERGENCE_MINIMUM,
          excludedEngines: plan.excludedEngines.map(describeNarrativeEngine),
          directionCount: plan.directionCount,
          premiseWordTarget: DIRECTION_WORD_TARGETS.developedPremise,
          conflictWordTarget: DIRECTION_WORD_TARGETS.mainConflict,
          arcWordTarget: DIRECTION_WORD_TARGETS.protagonistArc,
          endingWordTarget: DIRECTION_WORD_TARGETS.endingNature,
          assessmentWordTarget: DIRECTION_WORD_TARGETS.novelPotentialAssessment,
          itemWordTarget: DIRECTION_WORD_TARGETS.item,
          minNewStakes: DIRECTION_LIST_COUNTS.newStakes.min,
          minMainRisks: DIRECTION_LIST_COUNTS.mainRisks.min,
          minElementsKept: DIRECTION_LIST_COUNTS.elementsKeptFromSource.min,
          minElementsTransformed: DIRECTION_LIST_COUNTS.elementsTransformed.min,
          maxPerList: DIRECTION_LIST_COUNTS.newStakes.max,
        });

        if (!composed.ok) return composed;

        const generated = await port.generateStructured({
          // The schema is the ask's own count: the prompt states `n` and the
          // contract validates `n`, so an answer that did what it was told
          // cannot be rejected for doing it (CAL-055's discipline).
          schema: directionProposalsSchemaFor(plan.directionCount),
          prompt: composed.value.prompt,
          // Forwarded and nothing else: `@calepin/ai` stops the attempt, the
          // backoff wait and the network call.
          signal: request.signal,
        });

        if (!generated.ok) {
          const failed = usageOfFailure(generated.error);

          // The routed model, not the one that served: a failure does not say
          // which endpoint answered.
          if (failed !== undefined) reportSpent(mission.model, failed);

          return generated;
        }

        reportSpent(generated.value.model, generated.value.usage);

        const accepted = acceptDirectionCandidates(
          context.value.freedomLevel,
          kept,
          generated.value.output.directions,
        );

        kept = accepted.kept;

        // Counts only (§9) — never a word of a direction. This is the line that
        // says a relaunch happened: the ask number and how many directions
        // stand after it, from which what each ask asked for and what it lost
        // both follow, since an ask always asks for the slots still missing.
        logger.info("directions.ask-assessed", {
          generationId: request.generationId,
          missionId: MISSION_ID,
          attempt: ask,
          itemCount: accepted.report.keptCount,
        });

        if (accepted.report.complete) break;
      }

      if (nextDirectionAsk(kept) !== null) return fail(divergenceNotReached());

      const directions = resolveDirectionProposals(kept);

      // The write, handed back as a closure rather than performed here: it runs
      // inside the transaction that completes the attempt, so the directions and
      // the generation's own completion commit together or not at all (§7).
      return succeed({
        append: async (client): Promise<Result<void>> => {
          const written = await writeGeneratedDirectionsWithin(client, request.scope, {
            directions,
          });

          if (!written.ok) return written;

          logger.info("directions.persisted", {
            generationId: request.generationId,
            missionId: MISSION_ID,
            itemCount: written.value.directionCount,
          });

          return succeed(undefined);
        },
      });
    },
  };
}
