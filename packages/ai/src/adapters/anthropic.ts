/**
 * The primary provider adapter (CAL-049).
 *
 * This is the one file in the repository allowed to import a provider SDK
 * (CLAUDE.md §5, ADR-001, enforced by lint and by
 * `provider-sdk-boundary.test.ts`). Everything policy-shaped already lives in
 * `create-model-port.ts`: retries, backoff, the attempt deadline, cancellation,
 * the switch to the backup model and schema validation. What is left here is
 * translation — a `ProviderCall` in, a request out, a response back as text or
 * a raw value with the exact usage the provider reported.
 *
 * **`maxRetries: 0` is deliberate.** The SDK retries 429 and 5xx twice on its
 * own. Left on, every rate limit would be retried *inside* one attempt:
 * invisible to `attemptCount`, unbounded against the attempt's deadline, and
 * out of reach of the policy's own cap and of a caller's cancellation. The
 * exponential backoff belongs to `retry.ts`; this file's job on a 429 is to
 * classify it and to read `retry-after`.
 *
 * **Both methods stream.** The port is request/response — a streaming surface
 * belongs to generation state (CAL-062), not here — but the transport streams,
 * because an output cap of 32 000 tokens against a ten-minute deadline is
 * exactly the shape the SDK asks streaming for rather than a single long HTTP
 * response.
 *
 * **No server-side refusal fallback.** The SDK can re-run a declined request on
 * another model inside the same call. That is refused here: the model that
 * served has to be one of the three in `capabilities.ts`, because
 * `ModelCallMeta.model` is what a `GenerationAttempt` row records and what
 * CAL-056 prices. Switching models is `routing.fallbackModel`'s job (CAL-050),
 * where the switch is a logged event rather than a silent substitution.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, RateLimitError, TimeoutError } from "@calepin/shared/errors";

import type {
  ProviderAdapter,
  ProviderCall,
  ProviderProse,
  ProviderValue,
  StructuredProviderCall,
} from "../adapter";
import type { TokenUsage } from "../port";

/**
 * The slice of the SDK this adapter uses.
 *
 * Declared structurally so a test's simulated client satisfies it without a
 * network call or a key (§8). The parameter and response types are the SDK's
 * own — never restated — and `createAnthropicAdapter` assigns a real
 * `new Anthropic(...)` to this type, which is what proves at compile time that
 * the slice describes the real client rather than a convenient fiction.
 */
export interface AnthropicMessagesClient {
  readonly messages: {
    stream(
      body: Anthropic.MessageStreamParams,
      options?: { signal?: AbortSignal | null },
    ): { finalMessage(): Promise<Anthropic.Message> };
  };
}

export type CreateAnthropicAdapterOptions =
  | {
      /**
       * Passed explicitly: no package outside the validated config module
       * reads the environment (CLAUDE.md §4.2). The process shell supplies it.
       */
      readonly apiKey: string;
      readonly baseUrl?: string;
    }
  | { readonly client: AnthropicMessagesClient };

export function createAnthropicAdapter(options: CreateAnthropicAdapterOptions): ProviderAdapter {
  const client: AnthropicMessagesClient =
    "client" in options
      ? options.client
      : new Anthropic({
          apiKey: options.apiKey,
          ...(options.baseUrl === undefined ? {} : { baseURL: options.baseUrl }),
          // See the header comment: the retry policy is `retry.ts`'s, not the
          // SDK's, and two of them stacked would hide the inner one.
          maxRetries: 0,
        });

  async function complete(
    call: ProviderCall,
    format: Anthropic.JSONOutputFormat | undefined,
  ): Promise<Anthropic.Message> {
    try {
      return await client.messages
        .stream(toStreamParams(call, format), { signal: call.signal })
        .finalMessage();
    } catch (error: unknown) {
      throw classify(error);
    }
  }

  return {
    provider: "anthropic",

    async generateProse(call: ProviderCall): Promise<ProviderProse> {
      const message = await complete(call, undefined);

      return { text: textOf(message), usage: toTokenUsage(message.usage) };
    },

    async generateStructured(call: StructuredProviderCall): Promise<ProviderValue> {
      const message = await complete(call, {
        type: "json_schema",
        schema: call.outputSchema,
      });

      return { value: parseJson(textOf(message)), usage: toTokenUsage(message.usage) };
    },
  };
}

function toStreamParams(
  call: ProviderCall,
  format: Anthropic.JSONOutputFormat | undefined,
): Anthropic.MessageStreamParams {
  const outputConfig: Anthropic.OutputConfig = {};

  // A model that rejects the parameter is told nothing about effort; the
  // capability sheet is what says which does (`supportsEffort`).
  if (call.model.supportsEffort && call.effort !== undefined) {
    outputConfig.effort = call.effort;
  }

  if (format !== undefined) {
    outputConfig.format = format;
  }

  return {
    model: call.model.id,
    max_tokens: call.maxOutputTokens,
    system: call.system,
    messages: [{ role: "user", content: call.prompt }],
    // Adaptive thinking is the only on-mode the 5-family accepts, and a
    // `budget_tokens` config is answered with a 400 there. A budget-thinking
    // model is sent no thinking configuration at all: a budget is a policy
    // number, and inventing one here would put it outside `routing.ts`.
    ...(call.model.thinking === "adaptive" ? { thinking: { type: "adaptive" as const } } : {}),
    // No `temperature`, `top_p` or `top_k`, and there never will be: the
    // current model family answers 400 for all three (`capabilities.ts`).
    ...(Object.keys(outputConfig).length === 0 ? {} : { output_config: outputConfig }),
  };
}

/**
 * The visible answer, thinking blocks excluded.
 *
 * Blocks are concatenated rather than the first one taken: a response may be
 * split into several text blocks, and reading only one would silently truncate
 * a chapter.
 */
function textOf(message: Anthropic.Message): string {
  if (message.stop_reason === "refusal") {
    // A request this model will never accept, so it is not retried — but it
    // stays fallback-eligible by category, which is the one treatment that can
    // still work. No detail is carried across: `stop_details` is about the
    // prompt, and the prompt is literary content (§9).
    throw new ProviderError({
      code: "PROVIDER_REJECTED",
      message: "the provider declined the request",
      retryable: false,
    });
  }

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * A body that will not parse yields no value, and the pipeline's own
 * `safeParse` fails it from there.
 *
 * Deliberately not a throw: `MODEL_OUTPUT_INVALID` raised *here* would travel
 * the pipeline's error path, which is fallback-eligible by category. Returned
 * as an unusable value instead, it takes the path CAL-048 documented — the
 * answer is judged once, in the one place §6 puts that decision, and neither
 * replayed nor sent to another model.
 */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Exactly what the provider reported (CAL-049's acceptance criterion).
 *
 * The two cache counters are summed into the input side because all three are
 * input tokens the model read; `output_tokens` is the SDK's own inclusive
 * billing total and is carried verbatim. This is a count, never a price — a
 * cache read costs a tenth of a fresh token, and the day CAL-054 turns caching
 * on it is `TokenUsage` that gains the split rather than this function that
 * guesses at one (CAL-056 owns the tariff table).
 */
function toTokenUsage(usage: Anthropic.Usage): TokenUsage {
  return {
    inputTokens:
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
  };
}

/**
 * The SDK's typed exceptions, mapped to the adapter contract's classified
 * `AppError`s — most specific first, and never by matching a message string.
 *
 * Anything unrecognised is returned unchanged: the pipeline treats a
 * non-`AppError` as a bug (§7), which is the right answer for a failure this
 * mapping does not know how to classify.
 */
function classify(error: unknown): unknown {
  // An abort is the pipeline's own doing — its deadline or the caller's
  // cancellation — and it tells the two apart by reading the signal, not the
  // exception. Wrapping it here would answer the question twice, differently.
  if (error instanceof Anthropic.APIUserAbortError) {
    return error;
  }

  if (error instanceof Anthropic.RateLimitError) {
    return new RateLimitError({
      message: "the provider rate-limited the request",
      retryAfterMs: retryAfterMsOf(error.headers),
      cause: error,
    });
  }

  // Subclass of APIConnectionError, so it has to be asked first.
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new TimeoutError({ message: "the provider did not answer in time", cause: error });
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError({ message: "the provider could not be reached", cause: error });
  }

  if (error instanceof Anthropic.InternalServerError) {
    return new ProviderError({ message: "the provider failed to serve the request", cause: error });
  }

  if (error instanceof Anthropic.APIError && isClientStatus(error.status)) {
    // A malformed request, a rejected key, an unknown model: replaying it
    // changes nothing, so it is permanent — and permanent is precisely the
    // case where the backup model is still worth asking (`retry.ts`).
    return new ProviderError({
      code: "PROVIDER_REJECTED",
      message: "the provider refused the request",
      retryable: false,
      cause: error,
    });
  }

  return error;
}

function isClientStatus(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500;
}

/**
 * `retry-after` in milliseconds, when the limiter said so.
 *
 * Seconds only — that is what this provider sends. A missing or unparsable
 * value is not an error: `retryDelayMs` treats the floor as absent and falls
 * back to its own exponential backoff.
 */
function retryAfterMsOf(headers: Headers | undefined): number | undefined {
  const value = headers?.get("retry-after");

  if (value === null || value === undefined) {
    return undefined;
  }

  const seconds = Number(value);

  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : undefined;
}
