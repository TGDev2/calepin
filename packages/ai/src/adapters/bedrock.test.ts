/**
 * The fallback provider adapter (CAL-050).
 *
 * Two things are worth testing here and the rest would be a copy of
 * `anthropic.test.ts`: that this adapter really does declare and serve the
 * *other* provider, and that the translation it shares with the primary is
 * genuinely shared rather than merely similar.
 *
 * The second point is the one with teeth. `messages.ts` classifies provider
 * failures with `instanceof` against the core SDK's exception classes, and the
 * Bedrock client raises those same classes only because both packages resolve
 * to **one** copy of `@anthropic-ai/sdk`. If a future install ever split them —
 * a version range that stops overlapping, a hoisting change — every
 * `instanceof` here would quietly return false, every provider outage would be
 * classified as a bug (non-retryable, not fallback-eligible), and the failover
 * this task exists to build would stop working without a single test failing.
 * The first block below is that test.
 */

import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { BaseAnthropic } from "@anthropic-ai/sdk/client";
import { isAppError } from "@calepin/shared/errors";
import { describe, expect, it } from "vitest";

import type { ProviderCall, StructuredProviderCall } from "../adapter";
import { MODEL_CAPABILITIES } from "../capabilities";
import { bedrockAdapterOptions, createBedrockAdapter } from "./bedrock";
import { answer, simulatedClient, text } from "./simulated";

function proseCall(overrides: Partial<ProviderCall> = {}): ProviderCall {
  return {
    model: MODEL_CAPABILITIES["anthropic.claude-opus-5"],
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

function thrownBy(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("the two SDKs share one core", () => {
  it("builds the Bedrock client on the very core the classification tests against", () => {
    // No credential and no network: constructing the client resolves nothing.
    const client = new AnthropicBedrockMantle({ awsRegion: "eu-west-3", skipAuth: true });

    expect(client).toBeInstanceOf(BaseAnthropic);
  });

  it("exposes the same messages resource, which is why one adapter serves both", () => {
    const client = new AnthropicBedrockMantle({ awsRegion: "eu-west-3", skipAuth: true });

    expect(typeof client.messages.stream).toBe("function");
    expect(client.messages.constructor).toBe(
      new Anthropic({ apiKey: "unused" }).messages.constructor,
    );
  });
});

describe("the fallback provider adapter", () => {
  it("declares the provider the capability sheet routes to it by", () => {
    const { client } = simulatedClient([]);

    expect(createBedrockAdapter({ client }).provider).toBe("bedrock");
  });

  it("sends Bedrock's own spelling of the model id, with no translation", async () => {
    const { client, calls } = simulatedClient([answer({})]);

    await createBedrockAdapter({ client }).generateProse(proseCall());

    expect(calls[0]?.params.model).toBe("anthropic.claude-opus-5");
  });

  it("composes the same request the primary adapter composes", async () => {
    const { client, calls } = simulatedClient([answer({})]);

    await createBedrockAdapter({ client }).generateProse(proseCall());

    expect(calls[0]?.params).toMatchObject({
      max_tokens: 4_096,
      system: "SYSTEM",
      messages: [{ role: "user", content: "PROMPT" }],
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
    });
  });

  it("constrains a structured call with the JSON Schema the pipeline derived", async () => {
    const call = structuredCall();
    const { client, calls } = simulatedClient([answer({ content: [text('{"count":1}')] })]);

    const result = await createBedrockAdapter({ client }).generateStructured(call);

    expect(calls[0]?.params.output_config).toEqual({
      effort: "high",
      format: { type: "json_schema", schema: call.outputSchema },
    });
    expect(result.value).toEqual({ count: 1 });
  });

  it("reports the tokens exactly as this provider reported them", async () => {
    const { client } = simulatedClient([
      answer({ usage: { input_tokens: 61, cache_read_input_tokens: 9, output_tokens: 17 } }),
    ]);

    const result = await createBedrockAdapter({ client }).generateProse(proseCall());

    expect(result.usage).toEqual({ inputTokens: 70, outputTokens: 17 });
  });

  it("classifies this endpoint's failures the way the primary's are classified", async () => {
    const outage = new Anthropic.InternalServerError(503, undefined, "simulated", new Headers());
    const { client } = simulatedClient([outage]);

    const error = await thrownBy(createBedrockAdapter({ client }).generateProse(proseCall()));

    expect(isAppError(error) && error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(isAppError(error) && error.retryable).toBe(true);
  });

  it("hands the attempt's signal on, so a cancellation stops this endpoint too", async () => {
    const call = proseCall();
    const { client, calls } = simulatedClient([answer({})]);

    await createBedrockAdapter({ client }).generateProse(call);

    expect(calls[0]?.signal).toBe(call.signal);
  });
});

describe("the fallback adapter's configuration", () => {
  // The SDK would otherwise fall through to the host's default AWS credential
  // chain. A worker that authenticates from whatever the machine happens to
  // carry is a worker nobody can reason about.
  it("builds a real client from explicit credentials, without touching the network", () => {
    const adapter = createBedrockAdapter({
      region: "eu-west-3",
      credentials: { accessKeyId: "AKIA_TEST", secretAccessKey: "SECRET_TEST" },
    });

    expect(adapter.provider).toBe("bedrock");
  });

  it("accepts a bearer token instead, for a gateway that issues one", () => {
    const adapter = createBedrockAdapter({ region: "eu-west-3", apiKey: "TOKEN_TEST" });

    expect(adapter.provider).toBe("bedrock");
  });
});

/**
 * *All three or none* (CAL-208) — one answer, because two process shells
 * compose this endpoint and a rule duplicated between them drifts silently on
 * whichever side loses it.
 */
describe("bedrockAdapterOptions", () => {
  const COMPLETE = {
    region: "eu-west-3",
    accessKeyId: "AKIA_TEST",
    secretAccessKey: "SECRET_TEST",
  };

  it("builds the SigV4 options when all three are supplied", () => {
    expect(bedrockAdapterOptions(COMPLETE)).toEqual({
      region: "eu-west-3",
      credentials: { accessKeyId: "AKIA_TEST", secretAccessKey: "SECRET_TEST" },
    });
  });

  it("feeds an adapter that really builds", () => {
    const options = bedrockAdapterOptions(COMPLETE);

    expect(options).toBeDefined();
    expect(options && createBedrockAdapter(options).provider).toBe("bedrock");
  });

  // Wiring one endpoint is a supported configuration, not a mis-wiring: the
  // pipeline drops a model whose provider has no adapter rather than throwing,
  // so an absent fallback costs resilience and never a generation.
  it("answers nothing when none is supplied", () => {
    expect(
      bedrockAdapterOptions({
        ...COMPLETE,
        region: undefined,
        accessKeyId: undefined,
        secretAccessKey: undefined,
      }),
    ).toBeUndefined();
  });

  it("treats a blank setting as an unset one", () => {
    expect(
      bedrockAdapterOptions({ region: "  ", accessKeyId: "", secretAccessKey: undefined }),
    ).toBeUndefined();
  });

  // The behaviour that must not exist is a silent `undefined` here: it would
  // start the process, run every generation on one endpoint, and answer *why
  // did failover never happen* nowhere at all.
  it.each([
    ["region", { ...COMPLETE, region: undefined }, "BEDROCK_REGION"],
    ["access key", { ...COMPLETE, accessKeyId: undefined }, "BEDROCK_ACCESS_KEY_ID"],
    ["secret", { ...COMPLETE, secretAccessKey: undefined }, "BEDROCK_SECRET_ACCESS_KEY"],
  ])("refuses a fallback missing its %s", (_label, values, expected) => {
    expect(() => bedrockAdapterOptions(values)).toThrow();

    try {
      bedrockAdapterOptions(values);
    } catch (error: unknown) {
      expect(isAppError(error) && error.code).toBe("MODEL_NOT_CONFIGURED");
      expect(isAppError(error) && error.fieldPath).toBe(expected);
    }
  });

  it("names every missing setting, and no value (§9)", () => {
    try {
      bedrockAdapterOptions({
        region: "eu-west-3",
        accessKeyId: undefined,
        secretAccessKey: undefined,
      });
    } catch (error: unknown) {
      expect(isAppError(error) && error.fieldPath).toBe(
        "BEDROCK_ACCESS_KEY_ID,BEDROCK_SECRET_ACCESS_KEY",
      );
      expect(error instanceof Error && error.message).not.toContain("eu-west-3");
    }
  });
});
