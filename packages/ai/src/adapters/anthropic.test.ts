/**
 * CAL-049's acceptance criterion: **both port methods work, and the tokens
 * consumed are reported exactly.**
 *
 * Everything here runs against a simulated client (CLAUDE.md §8: never a real
 * provider in a test), shared with the Bedrock suite in `simulated.ts` — it is
 * typed as `MessagesClient`, the same type a real `new Anthropic(...)` is
 * assigned to in the adapter, so a slice that drifted away from the SDK would
 * stop compiling on both sides at once.
 *
 * The last block closes the loop the task actually asks for: the adapter under
 * the real pipeline, a rate limit answered with `retry-after`, and the retry
 * that follows it — on virtual time, so the suite waits for nothing. Since
 * CAL-050 the routed backup is on the *other* provider, so a suite about this
 * adapter alone pins a same-provider backup where the assertion is about the
 * pipeline's escalation rather than about which endpoint serves it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { isAppError, RateLimitError } from "@calepin/shared/errors";
import { createLogger } from "@calepin/shared/logging";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ProviderCall, StructuredProviderCall } from "../adapter";
import { MODEL_CAPABILITIES } from "../capabilities";
import { createModelProviderPort } from "../create-model-port";
import { MISSION_REGISTRY, type MissionRegistry } from "../mission-registry";
import type { Scheduler } from "../timing";
import { createAnthropicAdapter } from "./anthropic";
import {
  answer,
  type RecordedCall,
  simulatedClient,
  type SimulatedOutcome,
  text,
} from "./simulated";

/**
 * A registry whose backup stays on this adapter's own provider. The
 * cross-provider table is the real one (`mission-registry.ts`) and
 * `failover.test.ts` exercises it; here the subject is the escalation itself,
 * and a second adapter would only add a moving part to a test that is not
 * about it.
 */
const SAME_PROVIDER_REGISTRY = Object.fromEntries(
  Object.entries(MISSION_REGISTRY).map(([missionId, mission]) => [
    missionId,
    { ...mission, model: "claude-opus-5" as const, fallbackModel: "claude-sonnet-5" as const },
  ]),
) as MissionRegistry;

function headers(entries: Record<string, string> = {}): Headers {
  return new Headers(entries);
}

function rateLimited(entries?: Record<string, string>) {
  return new Anthropic.RateLimitError(429, undefined, "simulated", headers(entries));
}

/** Every 4xx the SDK gives its own class, so the mapping is asked the real question. */
const PERMANENT_FAILURES: readonly [string, Error][] = [
  ["a malformed request", new Anthropic.BadRequestError(400, undefined, "simulated", headers())],
  ["a rejected key", new Anthropic.AuthenticationError(401, undefined, "simulated", headers())],
  ["a forbidden key", new Anthropic.PermissionDeniedError(403, undefined, "simulated", headers())],
  ["an unknown model", new Anthropic.NotFoundError(404, undefined, "simulated", headers())],
  [
    "an unprocessable body",
    new Anthropic.UnprocessableEntityError(422, undefined, "simulated", headers()),
  ],
];

/**
 * Bodies are synthetic and structural — a shape, a count, a token number.
 * Nothing a reader could read as part of a novel enters this file (§9).
 */
function proseCall(overrides: Partial<ProviderCall> = {}): ProviderCall {
  return {
    model: MODEL_CAPABILITIES["claude-opus-5"],
    system: "SYSTEM",
    prompt: "PROMPT",
    maxOutputTokens: 4_096,
    effort: "high",
    signal: new AbortController().signal,
    ...overrides,
  };
}

function structuredCall(overrides: Partial<StructuredProviderCall> = {}): StructuredProviderCall {
  return {
    ...proseCall(),
    outputSchema: { type: "object", properties: { count: { type: "number" } } },
    ...overrides,
  };
}

function adapterOver(outcomes: readonly SimulatedOutcome[]): {
  adapter: ReturnType<typeof createAnthropicAdapter>;
  calls: RecordedCall[];
} {
  const { client, calls } = simulatedClient(outcomes);

  return { adapter: createAnthropicAdapter({ client }), calls };
}

/** The thrown value, whatever it is — classification is what is under test. */
function thrownBy(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => undefined,
    (error: unknown) => error,
  );
}

/** Virtual time, so the suite never waits through a real backoff (§8). */
function virtualScheduler(): Scheduler & { waits: number[] } {
  const waits: number[] = [];

  return {
    waits,
    now: () => 0,
    setTimeout(callback: () => void, delayMs: number): unknown {
      waits.push(delayMs);

      // A deadline must not fire; a backoff must fire at once. Those are the
      // only two the pipeline schedules, and every routed deadline is far
      // longer than the policy's own 30 s ceiling on a single wait.
      return delayMs >= 60_000 ? undefined : globalThis.setTimeout(callback, 0);
    },
    clearTimeout(handle: unknown): void {
      if (handle !== undefined) {
        globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
      }
    },
  };
}

describe("the primary provider adapter", () => {
  it("declares the provider the capability sheet routes to it by", () => {
    const { adapter } = adapterOver([]);

    expect(adapter.provider).toBe("anthropic");
  });

  describe("the request it composes", () => {
    it("carries the resolved model, the output cap, the system and the prompt", async () => {
      const { adapter, calls } = adapterOver([answer({})]);

      await adapter.generateProse(proseCall());

      expect(calls[0]?.params).toMatchObject({
        model: "claude-opus-5",
        max_tokens: 4_096,
        system: "SYSTEM",
        messages: [{ role: "user", content: "PROMPT" }],
      });
    });

    it("hands the attempt's signal to the SDK, so an abort stops the network call", async () => {
      const call = proseCall();
      const { adapter, calls } = adapterOver([answer({})]);

      await adapter.generateProse(call);

      expect(calls[0]?.signal).toBe(call.signal);
    });

    it("asks for adaptive thinking on a model whose sheet says adaptive", async () => {
      const { adapter, calls } = adapterOver([answer({})]);

      await adapter.generateProse(proseCall());

      expect(calls[0]?.params.thinking).toEqual({ type: "adaptive" });
    });

    it("sends no thinking configuration to a budget-thinking model", async () => {
      const { adapter, calls } = adapterOver([answer({})]);

      await adapter.generateProse(proseCall({ model: MODEL_CAPABILITIES["claude-haiku-4-5"] }));

      expect(calls[0]?.params.thinking).toBeUndefined();
    });

    it("passes the routed effort to a model that accepts one", async () => {
      const { adapter, calls } = adapterOver([answer({})]);

      await adapter.generateProse(proseCall({ effort: "xhigh" }));

      expect(calls[0]?.params.output_config).toEqual({ effort: "xhigh" });
    });

    it("withholds effort from a model whose sheet says it rejects the parameter", async () => {
      const { adapter, calls } = adapterOver([answer({})]);

      await adapter.generateProse(
        proseCall({ model: MODEL_CAPABILITIES["claude-haiku-4-5"], effort: "high" }),
      );

      expect(calls[0]?.params.output_config).toBeUndefined();
    });

    it("sends no output config at all when the route declares no effort", async () => {
      const { adapter, calls } = adapterOver([answer({})]);

      await adapter.generateProse(proseCall({ effort: undefined }));

      expect(calls[0]?.params.output_config).toBeUndefined();
    });

    // The current model family answers 400 for all three (`capabilities.ts`),
    // which is why a mission declares an effort and never a temperature.
    it("never sends a sampling parameter", async () => {
      const { adapter, calls } = adapterOver([answer({})]);

      await adapter.generateProse(proseCall());

      expect(calls[0]?.params).not.toHaveProperty("temperature");
      expect(calls[0]?.params).not.toHaveProperty("top_p");
      expect(calls[0]?.params).not.toHaveProperty("top_k");
    });

    it("constrains a structured call with the JSON Schema the pipeline derived", async () => {
      const call = structuredCall();
      const { adapter, calls } = adapterOver([answer({ content: [text("{}")] })]);

      await adapter.generateStructured(call);

      expect(calls[0]?.params.output_config).toEqual({
        effort: "high",
        format: { type: "json_schema", schema: call.outputSchema },
      });
    });
  });

  describe("generateProse", () => {
    it("returns the answer's text", async () => {
      const { adapter } = adapterOver([answer({ content: [text("ONE")] })]);

      await expect(adapter.generateProse(proseCall())).resolves.toMatchObject({ text: "ONE" });
    });

    it("concatenates every text block rather than reading the first", async () => {
      const { adapter } = adapterOver([answer({ content: [text("ONE"), text("TWO")] })]);

      const result = await adapter.generateProse(proseCall());

      expect(result.text).toBe("ONETWO");
    });

    it("leaves thinking blocks out of the answer", async () => {
      const thinking: Anthropic.ThinkingBlock = {
        type: "thinking",
        thinking: "INTERNAL",
        signature: "sig",
      };
      const { adapter } = adapterOver([answer({ content: [thinking, text("ONE")] })]);

      const result = await adapter.generateProse(proseCall());

      expect(result.text).toBe("ONE");
    });
  });

  describe("token usage", () => {
    it("reports exactly what the provider reported", async () => {
      const { adapter } = adapterOver([
        answer({ usage: { input_tokens: 137, output_tokens: 42 } }),
      ]);

      const result = await adapter.generateProse(proseCall());

      expect(result.usage).toEqual({ inputTokens: 137, outputTokens: 42 });
    });

    // All three counters are input tokens the model read. Dropping the cache
    // ones would under-count the input side the day CAL-054 turns caching on.
    it("counts cached input tokens on the input side", async () => {
      const { adapter } = adapterOver([
        answer({
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 5,
            output_tokens: 7,
          },
        }),
      ]);

      const result = await adapter.generateProse(proseCall());

      expect(result.usage).toEqual({ inputTokens: 125, outputTokens: 7 });
    });

    it("reports usage on the structured path too", async () => {
      const { adapter } = adapterOver([
        answer({ content: [text('{"count":1}')], usage: { input_tokens: 9, output_tokens: 3 } }),
      ]);

      const result = await adapter.generateStructured(structuredCall());

      expect(result.usage).toEqual({ inputTokens: 9, outputTokens: 3 });
    });
  });

  describe("generateStructured", () => {
    it("hands over the parsed JSON, untrusted, for the pipeline to validate", async () => {
      const { adapter } = adapterOver([answer({ content: [text('{"count":3}')] })]);

      const result = await adapter.generateStructured(structuredCall());

      expect(result.value).toEqual({ count: 3 });
    });

    it("yields no value when the body will not parse", async () => {
      const { adapter } = adapterOver([answer({ content: [text("{ truncated")] })]);

      const result = await adapter.generateStructured(structuredCall());

      expect(result.value).toBeUndefined();
    });

    // The whole point of yielding no value rather than throwing: the answer is
    // judged once, by the pipeline (§6), so it fails without a blind replay and
    // without reaching the backup model. A body carrying no JSON at all is not
    // an attempt at the contract, so it is not repaired either (CAL-052) — one
    // call, and an explicit off-topic failure.
    it("lets an unparsable body fail the mission's schema, once, without a retry", async () => {
      const { client, calls } = simulatedClient([
        answer({ content: [text("not json")], usage: { input_tokens: 4, output_tokens: 2 } }),
      ]);
      const port = createModelProviderPort({
        adapters: [createAnthropicAdapter({ client })],
        registry: SAME_PROVIDER_REGISTRY,
        log: createLogger({ level: "silent" }),
        scheduler: virtualScheduler(),
      });

      const result = await port.generateStructured({
        missionId: "extract-facts",
        system: "SYSTEM",
        prompt: "PROMPT",
        schema: z.object({ count: z.number() }),
      });

      expect(result.ok).toBe(false);
      expect(result.ok ? undefined : result.error.code).toBe("MODEL_OUTPUT_OFF_TOPIC");
      expect(calls).toHaveLength(1);
    });
  });

  describe("error classification", () => {
    it("turns a rate limit into a retryable failure carrying the provider's own delay", async () => {
      const { adapter } = adapterOver([rateLimited({ "retry-after": "7" })]);

      const error = await thrownBy(adapter.generateProse(proseCall()));

      expect(error).toBeInstanceOf(RateLimitError);
      expect(isAppError(error) && error.code).toBe("RATE_LIMITED");
      expect(isAppError(error) && error.retryable).toBe(true);
      expect(error instanceof RateLimitError && error.retryAfterMs).toBe(7_000);
    });

    it("leaves the delay unset when the limiter named none", async () => {
      const { adapter } = adapterOver([rateLimited()]);

      const error = await thrownBy(adapter.generateProse(proseCall()));

      expect(error instanceof RateLimitError && error.retryAfterMs).toBeUndefined();
    });

    it("ignores a retry-after header it cannot read as seconds", async () => {
      const { adapter } = adapterOver([
        rateLimited({ "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }),
      ]);

      const error = await thrownBy(adapter.generateProse(proseCall()));

      expect(error).toBeInstanceOf(RateLimitError);
      expect(error instanceof RateLimitError && error.retryAfterMs).toBeUndefined();
    });

    it("reads a provider outage as retryable", async () => {
      const overloaded = new Anthropic.InternalServerError(529, undefined, "simulated", headers());
      const { adapter } = adapterOver([overloaded]);

      const error = await thrownBy(adapter.generateProse(proseCall()));

      expect(isAppError(error) && error.code).toBe("PROVIDER_UNAVAILABLE");
      expect(isAppError(error) && error.retryable).toBe(true);
    });

    it("reads an unreachable provider as retryable", async () => {
      const { adapter } = adapterOver([new Anthropic.APIConnectionError({ message: "simulated" })]);

      const error = await thrownBy(adapter.generateProse(proseCall()));

      expect(isAppError(error) && error.code).toBe("PROVIDER_UNAVAILABLE");
    });

    it("tells a connection timeout apart from a connection failure", async () => {
      const { adapter } = adapterOver([new Anthropic.APIConnectionTimeoutError()]);

      const error = await thrownBy(adapter.generateProse(proseCall()));

      expect(isAppError(error) && error.code).toBe("TIMEOUT");
    });

    it.each(PERMANENT_FAILURES)(
      "reads %s as permanent, so it is never replayed",
      async (_, api) => {
        const { adapter } = adapterOver([api]);

        const error = await thrownBy(adapter.generateProse(proseCall()));

        expect(isAppError(error) && error.code).toBe("PROVIDER_REJECTED");
        expect(isAppError(error) && error.retryable).toBe(false);
      },
    );

    it("refuses a declined request without replaying it", async () => {
      const { adapter } = adapterOver([answer({ stopReason: "refusal" })]);

      const error = await thrownBy(adapter.generateProse(proseCall()));

      expect(isAppError(error) && error.code).toBe("PROVIDER_REJECTED");
      expect(isAppError(error) && error.retryable).toBe(false);
    });

    // The pipeline tells a deadline from a cancellation by reading the signal,
    // not the exception — so the abort has to reach it unclassified.
    it("lets an abort through untouched", async () => {
      const aborted = new Anthropic.APIUserAbortError();
      const { adapter } = adapterOver([aborted]);

      const error = await thrownBy(adapter.generateProse(proseCall()));

      expect(error).toBe(aborted);
    });

    it("lets an unrecognised failure through as the bug it is", async () => {
      const bug = new TypeError("simulated");
      const { adapter } = adapterOver([bug]);

      const error = await thrownBy(adapter.generateProse(proseCall()));

      expect(error).toBe(bug);
      expect(isAppError(error)).toBe(false);
    });
  });

  describe("under the pipeline", () => {
    it("retries a rate limit after the delay the provider asked for, then succeeds", async () => {
      const scheduler = virtualScheduler();
      const { client, calls } = simulatedClient([
        rateLimited({ "retry-after": "4" }),
        answer({ content: [text("ONE")], usage: { input_tokens: 11, output_tokens: 5 } }),
      ]);
      const port = createModelProviderPort({
        adapters: [createAnthropicAdapter({ client })],
        registry: SAME_PROVIDER_REGISTRY,
        log: createLogger({ level: "silent" }),
        scheduler,
        // Full jitter would pick a delay under the floor; pinning the source
        // makes the assertion about the floor, not about the jitter.
        random: () => 1,
      });

      const result = await port.generateProse({
        missionId: "write-scene",
        system: "SYSTEM",
        prompt: "PROMPT",
      });

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toMatchObject({
        text: "ONE",
        model: "claude-opus-5",
        provider: "anthropic",
        attemptCount: 2,
        usedFallback: false,
        usage: { inputTokens: 11, outputTokens: 5 },
      });
      expect(calls).toHaveLength(2);
      // `retry-after: 4` is a floor over the first backoff of 500 ms.
      expect(scheduler.waits).toContain(4_000);
    });

    it("backs off exponentially when the limiter names no delay", async () => {
      const scheduler = virtualScheduler();
      const { client } = simulatedClient([
        rateLimited(),
        rateLimited(),
        answer({ content: [text("ONE")] }),
      ]);
      const port = createModelProviderPort({
        adapters: [createAnthropicAdapter({ client })],
        registry: SAME_PROVIDER_REGISTRY,
        log: createLogger({ level: "silent" }),
        scheduler,
        random: () => 1,
      });

      await port.generateProse({ missionId: "write-scene", system: "SYSTEM", prompt: "PROMPT" });

      // Full jitter at its ceiling: 500 ms, then 1 000 ms.
      expect(scheduler.waits.filter((wait) => wait < 60_000)).toEqual([500, 1_000]);
    });

    it("escalates to the backup model when the primary keeps failing", async () => {
      const outage = () =>
        new Anthropic.InternalServerError(500, undefined, "simulated", headers());
      const { client, calls } = simulatedClient([
        outage(),
        outage(),
        outage(),
        answer({ content: [text("ONE")] }),
      ]);
      const port = createModelProviderPort({
        adapters: [createAnthropicAdapter({ client })],
        registry: SAME_PROVIDER_REGISTRY,
        log: createLogger({ level: "silent" }),
        scheduler: virtualScheduler(),
        random: () => 0,
      });

      const result = await port.generateProse({
        missionId: "write-scene",
        system: "SYSTEM",
        prompt: "PROMPT",
      });

      expect(result.ok && result.value.model).toBe("claude-sonnet-5");
      expect(result.ok && result.value.usedFallback).toBe(true);
      expect(calls.map((call) => call.params.model)).toEqual([
        "claude-opus-5",
        "claude-opus-5",
        "claude-opus-5",
        "claude-sonnet-5",
      ]);
    });

    it("does not replay a request the provider will never accept", async () => {
      const { client, calls } = simulatedClient([
        new Anthropic.BadRequestError(400, undefined, "simulated", headers()),
        answer({ content: [text("ONE")] }),
      ]);
      const port = createModelProviderPort({
        adapters: [createAnthropicAdapter({ client })],
        registry: SAME_PROVIDER_REGISTRY,
        log: createLogger({ level: "silent" }),
        scheduler: virtualScheduler(),
      });

      await port.generateProse({ missionId: "write-scene", system: "SYSTEM", prompt: "PROMPT" });

      // One try on the primary — permanent, so no replay — then straight to
      // the backup model, which is the one treatment that can still work.
      expect(calls.map((call) => call.params.model)).toEqual(["claude-opus-5", "claude-sonnet-5"]);
    });
  });
});
