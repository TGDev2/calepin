/**
 * The pipeline every mission call goes through (CAL-048).
 *
 * `createModelProviderPort` turns provider adapters into the one
 * `ModelProviderPort` business code sees. Around any adapter it owns, in this
 * order: caller cancellation, the per-attempt deadline, retry with
 * classification and backoff (rate limits included), the switch to the backup
 * model on the other provider, and — before anything else can happen —
 * validation of the answer (§6), with one bounded repair pass when the answer
 * is repairable (CAL-052). It never persists anything and never knows what a
 * chapter means (§5); the process shell composes it with concrete adapters
 * (CAL-049, CAL-050) and hands it to domain code as a port.
 *
 * Two loops, deliberately separate. `deliver` is *one pass*: candidates,
 * retries, backoff, the switch between models — everything that answers the
 * question "did an endpoint serve?". `run` sits above it and answers "is the
 * answer usable?", and when it is not, it may re-enter `deliver` once with a
 * repair prompt. Keeping them apart is what makes a rate limit hit *during* a
 * repair a rate limit rather than an unusable answer.
 *
 * One thing outlives a call: provider health (`health.ts`). A durable outage
 * is invisible from inside a single request, so the port remembers which
 * endpoints have stopped answering and starts the next call at one that has
 * not. Everything else here is per-call and stateless.
 */

import {
  type AppError,
  fail,
  InternalError,
  type Result,
  succeed,
  TimeoutError,
  toAppError,
  toFieldPath,
} from "@calepin/shared/errors";
import { type Logger, logger as defaultLogger } from "@calepin/shared/logging";
import { z } from "zod";

import type {
  ProviderAdapter,
  ProviderCall,
  ProviderProse,
  ProviderValue,
  StructuredProviderCall,
} from "./adapter";
import {
  MODEL_CAPABILITIES,
  type ModelCapability,
  type ModelId,
  type ProviderId,
} from "./capabilities";
import {
  generationCancelled,
  missionOutputMismatch,
  modelNotConfigured,
  ModelOutputInvalidError,
  ModelOutputOffTopicError,
} from "./failures";
import { createProviderHealth, type ProviderHealth } from "./health";
import {
  MISSION_REGISTRY,
  type MissionDefinition,
  type MissionOutput,
  type MissionRegistry,
} from "./mission-registry";
import type {
  ModelCallMeta,
  ModelProviderPort,
  ModelRequest,
  ProseGenerationResult,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TokenUsage,
} from "./port";
import { assertMissionPrompt, deriveRepairPrompt, type MissionPrompt } from "./prompts";
import { classifyOutputFailure, DEFAULT_REPAIR_POLICY, type RepairPolicy } from "./repair";
import { DEFAULT_RETRY_POLICY, isFallbackEligible, retryDelayMs, type RetryPolicy } from "./retry";
import { REAL_SCHEDULER, type Scheduler, sleep } from "./timing";

export interface CreateModelProviderPortOptions {
  adapters: readonly ProviderAdapter[];
  /** Tables and policy default to the real ones; injectable for tests (§8). */
  registry?: MissionRegistry;
  capabilities?: Readonly<Record<ModelId, ModelCapability>>;
  retryPolicy?: RetryPolicy;
  /** How many targeted repair passes an unusable answer is worth (CAL-052). */
  repairPolicy?: RepairPolicy;
  scheduler?: Scheduler;
  /**
   * Provider availability across calls (CAL-050). Shared by every call this
   * port serves — that is the whole point, since one call cannot tell a
   * durable outage from a transient error on its own.
   */
  health?: ProviderHealth;
  /** Jitter source, injected so tests are deterministic (§8). */
  random?: () => number;
  log?: Logger;
}

/** Why the attempt's own controller aborted — the signal reason tells them apart. */
const DEADLINE_REACHED = Symbol("calepin.ai.deadline");
const CALLER_CANCELLED = Symbol("calepin.ai.cancelled");

/** A model that could serve this mission, with the adapter that would do it. */
interface Candidate {
  readonly capability: ModelCapability;
  readonly adapter: ProviderAdapter;
  /** True for any model other than the mission's own — the switch happened. */
  readonly usedFallback: boolean;
}

type AttemptOutcome<TResponse> =
  | { readonly kind: "success"; readonly response: TResponse }
  | { readonly kind: "failure"; readonly error: AppError }
  | { readonly kind: "cancelled" };

/** What one pass through the candidates ended in. */
type PassResult<TResponse> =
  | {
      readonly kind: "served";
      readonly response: TResponse;
      readonly capability: ModelCapability;
      readonly usedFallback: boolean;
    }
  | { readonly kind: "failure"; readonly error: AppError }
  | { readonly kind: "cancelled" };

interface Pass<TResponse> {
  readonly result: PassResult<TResponse>;
  /** Tries this pass consumed, across every model it asked. */
  readonly attempts: number;
}

/**
 * The verdict on an answer an endpoint did serve — the one place §6's *parse
 * first* lives for each kind of mission.
 *
 * `repairable` is the form failure: the answer attempted the contract, so the
 * pipeline is handed the prompt that would ask for it again, corrected.
 * `unusable` is everything the pipeline must not re-ask. Neither variant
 * carries a message or a value — a count and a field path are what a log is
 * allowed (§9).
 */
type Interpretation<TValue> =
  | { readonly kind: "value"; readonly value: TValue }
  | { readonly kind: "unusable"; readonly error: AppError; readonly issueCount?: number }
  | {
      readonly kind: "repairable";
      readonly error: AppError;
      readonly issueCount: number;
      /** The mission's own prompt, its identity kept, with the correction appended. */
      readonly repairPrompt: MissionPrompt;
    };

interface RunOutcome<TValue> {
  readonly value: TValue;
  readonly meta: ModelCallMeta;
}

export function createModelProviderPort(
  options: CreateModelProviderPortOptions,
): ModelProviderPort {
  const {
    adapters,
    registry = MISSION_REGISTRY,
    capabilities = MODEL_CAPABILITIES,
    retryPolicy = DEFAULT_RETRY_POLICY,
    repairPolicy = DEFAULT_REPAIR_POLICY,
    scheduler = REAL_SCHEDULER,
    health = createProviderHealth({ scheduler }),
    random = Math.random,
    log = defaultLogger,
  } = options;

  const adapterByProvider = new Map<ProviderId, ProviderAdapter>();

  for (const adapter of adapters) {
    if (adapterByProvider.has(adapter.provider)) {
      throw new InternalError({ message: "two adapters claim the same provider" });
    }
    adapterByProvider.set(adapter.provider, adapter);
  }

  /**
   * Who may serve this mission, in the order they will be asked.
   *
   * Two filters, and the difference between them is the whole design. A model
   * whose provider has **no adapter** is not a candidate at all: the process
   * shell never wired that endpoint, and a shell that wired only one endpoint
   * must still work rather than turn a recoverable provider outage into a
   * thrown mis-wiring. A model whose provider is **marked down** is merely
   * skipped — and only while another candidate remains, because a false
   * positive in the health tracker must cost latency, never refuse a
   * generation outright.
   *
   * Resolved per pass rather than per call: a repair pass starts from what the
   * first pass just learned about the endpoints.
   */
  function candidatesFor(mission: MissionDefinition): readonly Candidate[] {
    const models =
      mission.fallbackModel === mission.model
        ? [mission.model]
        : [mission.model, mission.fallbackModel];
    const configured: Candidate[] = [];

    for (const model of models) {
      const capability = capabilities[model];
      const adapter = adapterByProvider.get(capability.provider);

      if (adapter !== undefined) {
        configured.push({ capability, adapter, usedFallback: capability.id !== mission.model });
      }
    }

    if (configured.length === 0) {
      throw modelNotConfigured();
    }

    const available = configured.filter((candidate) =>
      health.isAvailable(candidate.capability.provider),
    );

    return available.length === 0 ? configured : available;
  }

  /** Identifiers only (§9) — a health transition names an endpoint, never a payload. */
  function reportHealth(change: string, provider: ProviderId, error?: AppError): void {
    if (change === "unavailable") {
      log.warn("ai.provider-unavailable", {
        provider,
        errorCode: error?.code,
        errorCategory: error?.category,
      });
    } else if (change === "restored") {
      log.info("ai.provider-restored", { provider });
    }
  }

  /**
   * One try against one model, under its own deadline. The adapter's thrown
   * error is read *through* the abort state: an abort we caused is a timeout
   * or a cancellation regardless of how the SDK dressed it.
   */
  async function attemptOnce<TResponse>(
    adapter: ProviderAdapter,
    capability: ModelCapability,
    request: ModelRequest,
    mission: MissionDefinition,
    invoke: (adapter: ProviderAdapter, call: ProviderCall) => Promise<TResponse>,
  ): Promise<AttemptOutcome<TResponse>> {
    const controller = new AbortController();
    const onCallerAbort = (): void => controller.abort(CALLER_CANCELLED);
    const deadline = scheduler.setTimeout(
      () => controller.abort(DEADLINE_REACHED),
      mission.timeoutMs,
    );

    request.signal?.addEventListener("abort", onCallerAbort, { once: true });

    try {
      const response = await invoke(adapter, {
        model: capability,
        system: request.prompt.system,
        prompt: request.prompt.text,
        maxOutputTokens: mission.maxOutputTokens,
        effort: mission.effort,
        signal: controller.signal,
      });

      return { kind: "success", response };
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return controller.signal.reason === DEADLINE_REACHED
          ? {
              kind: "failure",
              error: new TimeoutError({ message: "the attempt hit its deadline", cause: error }),
            }
          : { kind: "cancelled" };
      }

      // An adapter throws classified AppErrors; anything else is a bug (§7),
      // which `toAppError` wraps as internal — non-retryable, not eligible
      // for fallback.
      return { kind: "failure", error: toAppError(error) };
    } finally {
      scheduler.clearTimeout(deadline);
      request.signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  /**
   * One pass: the primary model with bounded retries, then — for a
   * provider-side failure only — the backup model with its own budget.
   *
   * `attemptsBefore` is the count the passes before this one consumed, so the
   * attempt numbers in the log keep climbing across a repair instead of
   * restarting at one.
   */
  async function deliver<TResponse>(
    request: ModelRequest,
    mission: MissionDefinition,
    invoke: (adapter: ProviderAdapter, call: ProviderCall) => Promise<TResponse>,
    attemptsBefore: number,
  ): Promise<Pass<TResponse>> {
    const candidates = candidatesFor(mission);

    let attempts = 0;
    let lastError: AppError | undefined;

    for (const candidate of candidates) {
      const capability = candidate.capability;
      const adapter = candidate.adapter;

      if (candidate.usedFallback) {
        // Identifiers only (§9): which mission fell back, onto which provider
        // and model, away from which failure. Never a payload. There is no
        // error to name when the primary was skipped as already down — the
        // line that reported *that* is `ai.provider-unavailable`.
        log.warn("ai.model-fallback", {
          missionId: request.prompt.missionId,
          provider: capability.provider,
          model: capability.id,
          errorCode: lastError?.code,
          errorCategory: lastError?.category,
          attempt: attemptsBefore + attempts,
        });
      }

      for (let attempt = 1; attempt <= retryPolicy.maxAttemptsPerModel; attempt += 1) {
        if (request.signal?.aborted === true) {
          return { attempts, result: { kind: "cancelled" } };
        }

        attempts += 1;

        const outcome = await attemptOnce(adapter, capability, request, mission, invoke);

        if (outcome.kind === "cancelled") {
          return { attempts, result: { kind: "cancelled" } };
        }

        if (outcome.kind === "success") {
          // The endpoint served. Whether the *answer* holds is the next
          // question and a different one — a response that fails the mission's
          // schema still proves the provider is up.
          reportHealth(health.recordSuccess(capability.provider), capability.provider);

          return {
            attempts,
            result: {
              kind: "served",
              response: outcome.response,
              capability,
              usedFallback: candidate.usedFallback,
            },
          };
        }

        lastError = outcome.error;
        reportHealth(
          health.recordFailure(capability.provider, outcome.error),
          capability.provider,
          outcome.error,
        );

        if (outcome.error.retryable && attempt < retryPolicy.maxAttemptsPerModel) {
          await sleep(
            scheduler,
            retryDelayMs(outcome.error, attempt, retryPolicy, random),
            request.signal,
          );
          continue;
        }

        break;
      }

      if (lastError === undefined || !isFallbackEligible(lastError)) {
        break;
      }
    }

    return {
      attempts,
      result: {
        kind: "failure",
        error: lastError ?? new InternalError({ message: "the pipeline produced no outcome" }),
      },
    };
  }

  /**
   * The full policy: a pass, its answer judged, and — for a *form* failure
   * only — one bounded repair pass carrying the correction (CAL-052).
   *
   * A substantively wrong answer never gets a second pass: re-asking the same
   * question the same way returns the same answer, so the pass would only
   * spend budget. Neither kind is ever handed to the backup model: switching
   * endpoints is the treatment for a provider that will not answer, not for a
   * model that answered the wrong thing.
   */
  async function run<TResponse extends { readonly usage: TokenUsage }, TValue>(
    request: ModelRequest,
    expects: MissionOutput["kind"],
    invoke: (adapter: ProviderAdapter, call: ProviderCall) => Promise<TResponse>,
    interpret: (response: TResponse, spent: TokenUsage) => Interpretation<TValue>,
  ): Promise<Result<RunOutcome<TValue>>> {
    const startedAt = scheduler.now();

    // The prompt is the request (CAL-053): it names the mission, so the
    // registry entry that follows is the one belonging to the text about to be
    // sent, and it carries the version this call will be recorded under. A
    // value that is not a rendered prompt is refused before a provider is
    // reached, the way a repository refuses an unproven scope.
    assertMissionPrompt(request.prompt);

    const missionId = request.prompt.missionId;
    const mission = registry[missionId];

    // One mission, one treatment (§5.4). Asking a mission for the kind of
    // answer it does not produce is a call-site bug, not a runtime condition:
    // it would fail on every call, so it fails before one is made.
    if (mission.output.kind !== expects) {
      throw missionOutputMismatch();
    }

    let attemptCount = 0;
    let prompt = request.prompt;
    // Every answer served was paid for, the rejected ones included: a repair
    // that reported only its own tokens would under-count the project's real
    // cost (CAL-056).
    let spent: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    for (let repairs = 0; ; repairs += 1) {
      const pass = await deliver({ ...request, prompt }, mission, invoke, attemptCount);

      attemptCount += pass.attempts;

      if (pass.result.kind === "cancelled") {
        return fail(generationCancelled());
      }

      if (pass.result.kind === "failure") {
        return fail(pass.result.error);
      }

      const { response, capability, usedFallback } = pass.result;

      spent = {
        inputTokens: spent.inputTokens + response.usage.inputTokens,
        outputTokens: spent.outputTokens + response.usage.outputTokens,
      };

      const interpreted = interpret(response, spent);

      if (interpreted.kind === "value") {
        const meta: ModelCallMeta = {
          missionId,
          // The prompt that *ran*, repair included: a repair pass appends to
          // the mission prompt and keeps its identity, so what is reported is
          // the resource the answer is attributable to (CAL-053).
          promptId: request.prompt.promptId,
          promptVersion: request.prompt.version,
          provider: capability.provider,
          model: capability.id,
          usage: spent,
          durationMs: scheduler.now() - startedAt,
          attemptCount,
          usedFallback,
        };

        // The model that finally served (CAL-050). `ai.model-fallback` says
        // a switch happened; this says how the call ended, which is what a
        // cost or incident view reads without joining two lines.
        log.info("ai.model-served", {
          missionId: meta.missionId,
          promptId: meta.promptId,
          promptVersion: meta.promptVersion,
          provider: meta.provider,
          model: meta.model,
          attempt: meta.attemptCount,
          durationMs: meta.durationMs,
          inputTokens: meta.usage.inputTokens,
          outputTokens: meta.usage.outputTokens,
        });

        // The context budget, made observable (CAL-051). The comparison is
        // against the provider's own count, after the fact: an estimate
        // before the call would refuse generations on a guess, and by the
        // time the count is exact the tokens are already spent. So it warns
        // rather than fails — and it is the line that catches a composer
        // sending a chapter everything written before it (§5.8, CAL-054).
        // The budget itself is not logged: it is a constant this file holds,
        // and the mission id is how a reader looks it up.
        if (meta.usage.inputTokens > mission.contextBudgetTokens) {
          log.warn("ai.context-budget-exceeded", {
            missionId: meta.missionId,
            provider: meta.provider,
            model: meta.model,
            inputTokens: meta.usage.inputTokens,
          });
        }

        return succeed({ value: interpreted.value, meta });
      }

      // What is allowed to be said about a rejected answer: which mission,
      // which endpoint, how many violations and where the first one was. Never
      // the answer, never the value at that path (§6, §9).
      const rejection = {
        missionId,
        // Which prompt was rejected, and which version of it — the pair a
        // quality investigation reads when a wording change starts producing
        // unusable answers (§9 allows both: they are identifiers).
        promptId: request.prompt.promptId,
        promptVersion: request.prompt.version,
        provider: capability.provider,
        model: capability.id,
        attempt: attemptCount,
        fieldPath: interpreted.error.fieldPath,
        itemCount: interpreted.issueCount,
      };

      if (interpreted.kind === "repairable" && repairs < repairPolicy.maxRepairAttempts) {
        log.warn("ai.output-repair-attempted", rejection);
        prompt = interpreted.repairPrompt;
        continue;
      }

      // The clean, explicit failure §6 asks for, after a bounded number of
      // attempts. The code says which of the two it was.
      log.warn("ai.output-rejected", {
        ...rejection,
        errorCode: interpreted.error.code,
        errorCategory: interpreted.error.category,
      });

      return fail(interpreted.error);
    }
  }

  return {
    async generateProse(request: ModelRequest): Promise<Result<ProseGenerationResult>> {
      const result = await run(
        request,
        "prose",
        (adapter, call) => adapter.generateProse(call),
        (response: ProviderProse, spent): Interpretation<string> =>
          response.text.trim().length === 0
            ? // Nothing to repair: an empty answer has no form to correct, and
              // prose has no schema to correct it against.
              { kind: "unusable", error: new ModelOutputInvalidError({ usage: spent }) }
            : { kind: "value", value: response.text },
      );

      if (!result.ok) {
        return result;
      }

      return succeed({ text: result.value.value, ...result.value.meta });
    },

    async generateStructured<Output>(
      request: StructuredGenerationRequest<Output>,
    ): Promise<Result<StructuredGenerationResult<Output>>> {
      const outputSchema = toJsonSchema(request.schema);

      const result = await run(
        request,
        "structured",
        (adapter, call) => {
          const structuredCall: StructuredProviderCall = { ...call, outputSchema };

          return adapter.generateStructured(structuredCall);
        },
        (response: ProviderValue, spent): Interpretation<Output> => {
          // A model response is untrusted input (§6): parse first, and a
          // response that fails writes nothing and reports the field path —
          // never the field value.
          const parsed = request.schema.safeParse(response.value);

          if (parsed.success) {
            return { kind: "value", value: parsed.data };
          }

          const issues = parsed.error.issues;

          // Form or substance (CAL-052) — the whole difference between one
          // targeted re-ask and a blind retry that cannot work.
          if (classifyOutputFailure(issues, response.value, outputSchema) === "off-topic") {
            return {
              kind: "unusable",
              error: new ModelOutputOffTopicError({ usage: spent }),
              issueCount: issues.length,
            };
          }

          const firstIssue = issues[0];

          return {
            kind: "repairable",
            error: new ModelOutputInvalidError({
              fieldPath: firstIssue === undefined ? undefined : toFieldPath(firstIssue.path),
              usage: spent,
            }),
            issueCount: issues.length,
            // Built from the *original* prompt, so a second repair asks the
            // mission once and names the latest answer's violations — rather
            // than stacking one correction on top of another. The mission
            // prompt's id and version travel through unchanged (CAL-053).
            repairPrompt: deriveRepairPrompt({
              original: request.prompt,
              value: response.value,
              issues,
            }),
          };
        },
      );

      if (!result.ok) {
        return result;
      }

      return succeed({ output: result.value.value, ...result.value.meta });
    },
  };
}

function toJsonSchema(schema: z.ZodType<unknown>): Readonly<Record<string, unknown>> {
  try {
    return z.toJSONSchema(schema) as Record<string, unknown>;
  } catch (error: unknown) {
    // Declaring a mission schema JSON Schema cannot express is a programming
    // error at declaration time, not a runtime condition to handle.
    throw new InternalError({
      message: "the mission schema cannot be expressed as JSON Schema",
      cause: error,
    });
  }
}
