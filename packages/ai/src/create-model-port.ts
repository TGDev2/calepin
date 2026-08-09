/**
 * The pipeline every mission call goes through (CAL-048).
 *
 * `createModelProviderPort` turns provider adapters into the one
 * `ModelProviderPort` business code sees. Around any adapter it owns, in this
 * order: caller cancellation, the per-attempt deadline, retry with
 * classification and backoff (rate limits included), the switch to the backup
 * model, and — before anything else can happen — validation of the answer
 * (§6). It never persists anything and never knows what a chapter means (§5);
 * the process shell composes it with concrete adapters (CAL-049, CAL-050) and
 * hands it to domain code as a port.
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
import { generationCancelled, modelNotConfigured, ModelOutputInvalidError } from "./failures";
import type { MissionId } from "./missions";
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
import { MISSION_MODEL_ROUTING, type MissionRouting } from "./routing";
import { REAL_SCHEDULER, type Scheduler, sleep } from "./timing";

export interface CreateModelProviderPortOptions {
  adapters: readonly ProviderAdapter[];
  /** Tables and policy default to the real ones; injectable for tests (§8). */
  routing?: Readonly<Record<MissionId, MissionRouting>>;
  capabilities?: Readonly<Record<ModelId, ModelCapability>>;
  retryPolicy?: RetryPolicy;
  scheduler?: Scheduler;
  /** Jitter source, injected so tests are deterministic (§8). */
  random?: () => number;
  log?: Logger;
}

/** Why the attempt's own controller aborted — the signal reason tells them apart. */
const DEADLINE_REACHED = Symbol("calepin.ai.deadline");
const CALLER_CANCELLED = Symbol("calepin.ai.cancelled");

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
    routing = MISSION_MODEL_ROUTING,
    capabilities = MODEL_CAPABILITIES,
    retryPolicy = DEFAULT_RETRY_POLICY,
    scheduler = REAL_SCHEDULER,
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

  function resolveAdapter(capability: ModelCapability): ProviderAdapter {
    const adapter = adapterByProvider.get(capability.provider);

    if (adapter === undefined) {
      throw modelNotConfigured();
    }

    return adapter;
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
    route: MissionRouting,
    invoke: (adapter: ProviderAdapter, call: ProviderCall) => Promise<TResponse>,
  ): Promise<AttemptOutcome<TResponse>> {
    const controller = new AbortController();
    const onCallerAbort = (): void => controller.abort(CALLER_CANCELLED);
    const deadline = scheduler.setTimeout(
      () => controller.abort(DEADLINE_REACHED),
      route.timeoutMs,
    );

    request.signal?.addEventListener("abort", onCallerAbort, { once: true });

    try {
      const response = await invoke(adapter, {
        model: capability,
        system: request.system,
        prompt: request.prompt,
        maxOutputTokens: route.maxOutputTokens,
        effort: route.effort,
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
    invoke: (adapter: ProviderAdapter, call: ProviderCall) => Promise<TResponse>,
    interpret: (response: TResponse) => Result<TValue>,
  ): Promise<Result<RunOutcome<TValue>>> {
    const startedAt = scheduler.now();
    const route = routing[request.missionId];
    const candidates =
      route.fallbackModel === route.model
        ? ([{ model: route.model, usedFallback: false }] as const)
        : ([
            { model: route.model, usedFallback: false },
            { model: route.fallbackModel, usedFallback: true },
          ] as const);

    let attemptCount = 0;
    let lastError: AppError | undefined;

    for (const candidate of candidates) {
      const capability = capabilities[candidate.model];
      const adapter = resolveAdapter(capability);

      if (candidate.usedFallback && lastError !== undefined) {
        // Identifiers only (§9): which mission fell back, onto which model,
        // away from which failure. Never a payload.
        log.warn("ai.model-fallback", {
          missionId: request.missionId,
          provider: capability.provider,
          model: capability.id,
          errorCode: lastError.code,
          errorCategory: lastError.category,
          attempt: attemptCount,
        });
      }

      for (let attempt = 1; attempt <= retryPolicy.maxAttemptsPerModel; attempt += 1) {
        if (request.signal?.aborted === true) {
          return fail(generationCancelled());
        }

        attemptCount += 1;

        const outcome = await attemptOnce(adapter, capability, request, route, invoke);

        if (outcome.kind === "cancelled") {
          return fail(generationCancelled());
        }

        if (outcome.kind === "success") {
          const interpreted = interpret(outcome.response);

          if (!interpreted.ok) {
            return fail(interpreted.error);
          }

          return succeed({
            value: interpreted.value,
            meta: {
              missionId: request.missionId,
              provider: capability.provider,
              model: capability.id,
              usage: outcome.response.usage,
              durationMs: scheduler.now() - startedAt,
              attemptCount,
              usedFallback: candidate.usedFallback,
            },
          });
        }

        lastError = outcome.error;

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
