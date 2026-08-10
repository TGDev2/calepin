/**
 * CAL-052's acceptance criterion: **an invalid output never writes to the
 * database; it triggers a repair and then an explicit failure.**
 *
 * Nothing here is a stand-in for the parts that exist. The mission registry is
 * the real one, the adapters are the real ones over simulated clients (§8:
 * never a real provider in a test), and the whole thing runs inside
 * `runGenerationAttempt` — which is where the *never writes* half of the
 * criterion can actually be asked. The port returning a `Result` is not the
 * claim; the claim is that the generation around it completes as failed with
 * no result written, and `events` is what proves it.
 *
 * The one stand-in is the output schema. A mission's schema belongs to its
 * domain (§5.5) and every domain package is still an empty public surface, so
 * this file declares a structural one — counts and codes, nothing a reader
 * could read as part of a novel (§9). What is under test is the pipeline's
 * treatment of an answer, and that treatment is the same whatever the fields
 * are called.
 */

import type { Result } from "@calepin/shared/errors";
import {
  type GenerationAttemptOutcome,
  type GenerationPersistence,
  runGenerationAttempt,
} from "@calepin/shared/generation";
import { createLogger } from "@calepin/shared/logging";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createAnthropicAdapter } from "./adapters/anthropic";
import { createBedrockAdapter } from "./adapters/bedrock";
import { answer, type RecordedCall, simulatedClient, text } from "./adapters/simulated";
import { createModelProviderPort } from "./create-model-port";
import { createProviderHealth } from "./health";
import type { ModelProviderPort, StructuredGenerationResult } from "./port";
import { fixedPrompt } from "./prompts/testing";
import type { Scheduler } from "./timing";

const OUTPUT_SCHEMA = z.object({ itemCount: z.number(), code: z.string() });
type Output = z.infer<typeof OUTPUT_SCHEMA>;

const REQUEST = { prompt: fixedPrompt("extract-facts"), schema: OUTPUT_SCHEMA } as const;

/** Virtual time: a backoff fires at once, a mission deadline never does. */
function virtualScheduler(): Scheduler {
  return {
    now: () => 0,
    setTimeout: (callback, delayMs) =>
      delayMs >= 60_000 ? undefined : globalThis.setTimeout(callback, 0),
    clearTimeout: (handle) => {
      if (handle !== undefined) {
        globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
      }
    },
  };
}

/** Records the sequence — which is what "never writes" is actually about. */
function recordingPersistence(): {
  persist: GenerationPersistence<StructuredGenerationResult<Output>>;
  events: string[];
  outcomes: GenerationAttemptOutcome[];
  values: StructuredGenerationResult<Output>[];
} {
  const events: string[] = [];
  const outcomes: GenerationAttemptOutcome[] = [];
  const values: StructuredGenerationResult<Output>[] = [];

  return {
    events,
    outcomes,
    values,
    persist: {
      start() {
        events.push("start");
      },
      succeed(value, outcome) {
        events.push("succeed");
        values.push(value);
        outcomes.push(outcome);
      },
      fail(outcome) {
        events.push("fail");
        outcomes.push(outcome);
      },
    },
  };
}

/** The real registry, both real adapters, the primary answering `bodies` in order. */
function portAnswering(bodies: readonly string[]): {
  port: ModelProviderPort;
  primaryCalls: RecordedCall[];
  backupCalls: RecordedCall[];
} {
  const scheduler = virtualScheduler();
  const primary = simulatedClient((_call, index) =>
    answer({
      model: "claude-sonnet-5",
      content: [text(bodies[Math.min(index, bodies.length - 1)] ?? "")],
      usage: { input_tokens: 20, output_tokens: 5 },
    }),
  );
  const backup = simulatedClient(() =>
    answer({ model: "anthropic.claude-sonnet-5", content: [text("{}")] }),
  );

  return {
    primaryCalls: primary.calls,
    backupCalls: backup.calls,
    port: createModelProviderPort({
      adapters: [
        createAnthropicAdapter({ client: primary.client }),
        createBedrockAdapter({ client: backup.client }),
      ],
      scheduler,
      health: createProviderHealth({ scheduler }),
      random: () => 0,
      log: createLogger({ level: "silent" }),
    }),
  };
}

function generate(
  port: ModelProviderPort,
  persist: GenerationPersistence<StructuredGenerationResult<Output>>,
): Promise<Result<StructuredGenerationResult<Output>>> {
  return runGenerationAttempt({
    generationId: "gen_test",
    persist,
    now: () => 0,
    produce: async (): Promise<Result<StructuredGenerationResult<Output>>> =>
      port.generateStructured(REQUEST),
  });
}

describe("an answer that does not satisfy the mission's schema", () => {
  it("is repaired once, and when the repair does not hold, writes nothing at all", async () => {
    const { port, primaryCalls, backupCalls } = portAnswering(['{"itemCount":"three"}']);
    const { persist, events, outcomes, values } = recordingPersistence();

    const result = await generate(port, persist);

    // The repair happened, against the same endpoint, and stopped at its bound.
    expect(primaryCalls).toHaveLength(2);
    expect(backupCalls).toHaveLength(0);
    expect(primaryCalls[1]?.params.messages[0]?.content).toContain('{"itemCount":"three"}');

    // Then the failure was explicit rather than silent, and it names which of
    // the two rejections it was.
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe("MODEL_OUTPUT_INVALID");
    expect(result.ok ? undefined : result.error.retryable).toBe(false);

    // And nothing was written. `succeed` is the only call that appends a
    // revision, and it never happened — the criterion, in one assertion.
    expect(events).toEqual(["start", "fail"]);
    expect(values).toHaveLength(0);
    expect(outcomes[0]).toMatchObject({
      generationId: "gen_test",
      attempt: 1,
      status: "failed",
      retryable: false,
      errorCode: "MODEL_OUTPUT_INVALID",
      errorCategory: "provider",
    });
  });

  it("writes once, and only the corrected answer, when the repair holds", async () => {
    const { port, primaryCalls } = portAnswering([
      '{"itemCount":"three"}',
      '{"itemCount":3,"code":"a"}',
    ]);
    const { persist, events, values } = recordingPersistence();

    const result = await generate(port, persist);

    expect(result.ok).toBe(true);
    expect(primaryCalls).toHaveLength(2);

    // One generation, one write, and the rejected answer nowhere in it.
    expect(events).toEqual(["start", "succeed"]);
    expect(values).toHaveLength(1);
    expect(values[0]?.output).toEqual({ itemCount: 3, code: "a" });
    // Both answers were paid for: 2 × 20 in, 2 × 5 out.
    expect(values[0]?.usage).toEqual({ inputTokens: 40, outputTokens: 10 });
    expect(values[0]?.attemptCount).toBe(2);
  });
});

describe("an answer that does not address the mission at all", () => {
  it.each([
    ["prose where an object was asked for", "plain prose, no json in sight"],
    ["an object of entirely different fields", '{"status":"declined","reason":3}'],
    ["an empty object", "{}"],
  ])("fails cleanly on %s, without spending a repair", async (_label, body) => {
    const { port, primaryCalls, backupCalls } = portAnswering([body]);
    const { persist, events, outcomes } = recordingPersistence();

    const result = await generate(port, persist);

    // No repair: the same question asked the same way returns the same answer.
    // No fallback either — the endpoint answered, it is the answer that is
    // wrong, and another provider is not the treatment for that.
    expect(primaryCalls).toHaveLength(1);
    expect(backupCalls).toHaveLength(0);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe("MODEL_OUTPUT_OFF_TOPIC");

    expect(events).toEqual(["start", "fail"]);
    expect(outcomes[0]).toMatchObject({
      status: "failed",
      retryable: false,
      errorCode: "MODEL_OUTPUT_OFF_TOPIC",
      errorCategory: "provider",
    });
  });
});

describe("an answer that satisfies the mission's schema", () => {
  it("is written once, on the first pass", async () => {
    const { port, primaryCalls } = portAnswering(['{"itemCount":2,"code":"b"}']);
    const { persist, events, values } = recordingPersistence();

    const result = await generate(port, persist);

    expect(result.ok).toBe(true);
    expect(primaryCalls).toHaveLength(1);
    expect(events).toEqual(["start", "succeed"]);
    expect(values[0]?.output).toEqual({ itemCount: 2, code: "b" });
    expect(values[0]?.attemptCount).toBe(1);
  });
});
