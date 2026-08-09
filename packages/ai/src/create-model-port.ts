/**
 * The pipeline every mission call goes through (CAL-048).
 *
 * `createModelProviderPort` turns provider adapters into the one
 * `ModelProviderPort` business code sees. Around any adapter it owns, in this
 * order: caller cancellation, the per-attempt deadline, retry with
 * classification and backoff (rate limits included), the switch to the backup
 * model on the other provider, and — before anything else can happen —
 * validation of the answer (§6). It never persists anything and never knows
 * what a chapter means (§5); the process shell composes it with concrete
 * adapters (CAL-049, CAL-050) and hands it to domain code as a port.
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
import { DEFAULT_RETRY_POLICY, isFallbackEligible, retryDelayMs, type RetryPolicy } from "./retry";
import { REAL_SCHEDULER, type Scheduler, sleep } from "./timing";

export interface CreateModelProviderPortOptions {
  adapters: readonly ProviderAdapter[];
  /** Tables and policy default to the real ones; injectable for tests (§8). */
  registry?: MissionRegistry;
  capabilities?: Readonly<Record<ModelId, ModelCapability>>;
  retryPolicy?: RetryPolicy;
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
        system: request.system,
        prompt: request.prompt,
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
   * The full policy: primary model with bounded retries, then — for a
   * provider-side failure only — the backup model with its own budget. An
   * unusable *answer* returns immediately: neither a blind retry nor another
   * model is the treatment for that (CAL-052 owns repair).
   */
  async function run<TResponse extends { readonly usage: TokenUsage }, TValue>(
    request: ModelRequest,
    expects: MissionOutput["kind"],
    invoke: (adapter: ProviderAdapter, call: ProviderCall) => Promise<TResponse>,
    interpret: (response: TResponse) => Result<TValue>,
  ): Promise<Result<RunOutcome<TValue>>> {
    const startedAt = scheduler.now();
    const mission = registry[request.missionId];

    // One mission, one treatment (§5.4). Asking a mission for the kind of
    // answer it does not produce is a call-site bug, not a runtime condition:
    // it would fail on every call, so it fails before one is made.
    if (mission.output.kind !== expects) {
      throw missionOutputMismatch();
    }

    const candidates = candidatesFor(mission);

    let attemptCount = 0;
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
          missionId: request.missionId,
          provider: capability.provider,
          model: capability.id,
          errorCode: lastError?.code,
          errorCategory: lastError?.category,
          attempt: attemptCount,
        });
      }

      for (let attempt = 1; attempt <= retryPolicy.maxAttemptsPerModel; attempt += 1) {
        if (request.signal?.aborted === true) {
          return fail(generationCancelled());
        }

        attemptCount += 1;

        const outcome = await attemptOnce(adapter, capability, request, mission, invoke);

        if (outcome.kind === "cancelled") {
          return fail(generationCancelled());
        }

        if (outcome.kind === "success") {
          // The endpoint served. Whether the *answer* holds is the next
          // question and a different one — a response that fails the mission's
          // schema still proves the provider is up.
          reportHealth(health.recordSuccess(capability.provider), capability.provider);

          const interpreted = interpret(outcome.response);

          if (!interpreted.ok) {
            return fail(interpreted.error);
          }

          const meta: ModelCallMeta = {
            missionId: request.missionId,
            provider: capability.provider,
            model: capability.id,
            usage: outcome.response.usage,
            durationMs: scheduler.now() - startedAt,
            attemptCount,
            usedFallback: candidate.usedFallback,
          };

          // The model that finally served (CAL-050). `ai.model-fallback` says
          // a switch happened; this says how the call ended, which is what a
          // cost or incident view reads without joining two lines.
          log.info("ai.model-served", {
            missionId: meta.missionId,
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

    return fail(lastError ?? new InternalError({ message: "the pipeline produced no outcome" }));
  }

  return {
    async generateProse(request: ModelRequest): Promise<Result<ProseGenerationResult>> {
      const result = await run(
        request,
        "prose",
        (adapter, call) => adapter.generateProse(call),
        (response: ProviderProse): Result<string> =>
          response.text.trim().length === 0
            ? fail(new ModelOutputInvalidError({ usage: response.usage }))
            : succeed(response.text),
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
        (response: ProviderValue): Result<Output> => {
          // A model response is untrusted input (§6): parse first, and a
          // response that fails writes nothing and reports the field path —
          // never the field value.
          const parsed = request.schema.safeParse(response.value);

          if (!parsed.success) {
            const firstIssue = parsed.error.issues[0];

            return fail(
              new ModelOutputInvalidError({
                fieldPath: firstIssue === undefined ? undefined : toFieldPath(firstIssue.path),
                usage: response.usage,
              }),
            );
          }

          return succeed(parsed.data);
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
