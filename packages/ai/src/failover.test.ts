/**
 * CAL-050's acceptance criterion: **a simulated outage of the primary provider
 * does not interrupt a generation in flight.**
 *
 * Nothing here is a stand-in. The routing table is the real one, so the switch
 * really does cross providers; both adapters are the real ones over simulated
 * clients (§8: never a real provider in a test); and the whole thing runs
 * inside `runGenerationAttempt`, which is where CLAUDE.md §7's guarantee lives —
 * *a failed generation leaves the project valid and replayable*. That framing
 * is the point of the file: the question is not whether the port returns a
 * string, it is whether the **generation** survives, and the only way to ask it
 * is to put a generation around the port.
 *
 * What "without losing the generation's partial state" means, concretely, is
 * the four assertions in the first test: the generation is started once and
 * completed once, it is never recorded as failed, its attempt number does not
 * move, and the request that reaches the second provider is byte-for-byte the
 * one that reached the first. The switch happens *inside* one `produce()`, so
 * the generation's own bookkeeping never learns it happened — that is the
 * guarantee, and it is structural rather than defensive.
 *
 * The text the primary had begun to produce is genuinely lost, and that is
 * correct: two half-answers from two endpoints do not splice into one chapter.
 */

import { ProviderError, type Result } from "@calepin/shared/errors";
import {
  type GenerationAttemptOutcome,
  type GenerationPersistence,
  type GenerationRun,
  runGenerationAttempt,
} from "@calepin/shared/generation";
import { createLogger } from "@calepin/shared/logging";
import { createLogCapture } from "@calepin/shared/testing";
import { describe, expect, it } from "vitest";

import { createAnthropicAdapter } from "./adapters/anthropic";
import { createBedrockAdapter } from "./adapters/bedrock";
import {
  answer,
  droppedMidAnswer,
  type RecordedCall,
  simulatedClient,
  text,
} from "./adapters/simulated";
import { createModelProviderPort } from "./create-model-port";
import { createProviderHealth } from "./health";
import type { ModelProviderPort, ProseGenerationResult } from "./port";
import { estimateCostUsd } from "./pricing";
import { fixedPrompt } from "./prompts/testing";
import type { Scheduler } from "./timing";

/**
 * Virtual time: a backoff fires at once, a mission deadline never does. Every
 * routed deadline is far longer than the policy's own 30 s ceiling on a single
 * wait, which is what makes the threshold unambiguous.
 */
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

/** Records the sequence, which is what the §7 guarantee is actually about. */
function recordingPersistence(): {
  persist: GenerationPersistence<ProseGenerationResult>;
  events: string[];
  outcomes: GenerationAttemptOutcome[];
  values: ProseGenerationResult[];
} {
  const events: string[] = [];
  const outcomes: GenerationAttemptOutcome[] = [];
  const values: ProseGenerationResult[] = [];

  return {
    events,
    outcomes,
    values,
    persist: {
      claim() {
        events.push("claim");

        return { kind: "claimed", attempt: 1 };
      },
      succeed(value, outcome) {
        events.push("succeed");
        values.push(value);
        outcomes.push(outcome);

        return "applied";
      },
      fail(outcome) {
        events.push("fail");
        outcomes.push(outcome);

        return "applied";
      },
    },
  };
}

/** The answer, once the run is known to have produced one. */
function produced(result: Result<GenerationRun<ProseGenerationResult>>): ProseGenerationResult {
  if (!result.ok) throw new Error("the generation failed");
  if (result.value.kind !== "produced") {
    throw new Error(`the generation was skipped: ${result.value.reason}`);
  }

  return result.value.value;
}

const REQUEST = { prompt: fixedPrompt("write-scene") } as const;

/**
 * The port under test: the real routing table, both real adapters, one shared
 * health tracker. The primary endpoint is out; the backup one answers.
 */
function outageOnThePrimary(options: { log?: ReturnType<typeof createLogger> } = {}): {
  port: ModelProviderPort;
  primaryCalls: RecordedCall[];
  backupCalls: RecordedCall[];
} {
  const scheduler = virtualScheduler();
  const primary = simulatedClient(droppedMidAnswer);
  const backup = simulatedClient(() =>
    answer({
      model: "anthropic.claude-opus-5",
      content: [text("BACKUP ANSWER")],
      usage: { input_tokens: 31, output_tokens: 12 },
    }),
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
      log: options.log ?? createLogger({ level: "silent" }),
    }),
  };
}

function generate(
  port: ModelProviderPort,
  persist: GenerationPersistence<ProseGenerationResult>,
): Promise<Result<GenerationRun<ProseGenerationResult>>> {
  return runGenerationAttempt({
    generationId: "gen_test",
    persist,
    now: () => 0,
    produce: async (report): Promise<Result<ProseGenerationResult>> => {
      const result = await port.generateProse(REQUEST);

      // What the caller records is what the port reports — one total, priced
      // once. The port has already summed every answer it was served across
      // the switch, so reporting per endpoint here is what would double it.
      if (result.ok) {
        report({
          model: result.value.model,
          inputTokens: result.value.usage.inputTokens,
          outputTokens: result.value.usage.outputTokens,
          estimatedCostUsd: estimateCostUsd(result.value.model, result.value.usage),
        });
      }

      return result;
    },
  });
}

describe("a primary-provider outage in the middle of a generation", () => {
  it("does not interrupt the generation: it completes, on the other provider", async () => {
    const { port, primaryCalls, backupCalls } = outageOnThePrimary();
    const { persist, events, outcomes, values } = recordingPersistence();

    const result = await generate(port, persist);

    // It finished. That is the acceptance criterion, and everything else in
    // this test is about the state it finished in.
    expect(result.ok).toBe(true);
    expect(produced(result).text).toBe("BACKUP ANSWER");

    // The primary was genuinely asked, and genuinely failed, before the switch.
    expect(primaryCalls).toHaveLength(3);
    expect(primaryCalls.map((call) => call.params.model)).toEqual([
      "claude-opus-5",
      "claude-opus-5",
      "claude-opus-5",
    ]);
    expect(backupCalls).toHaveLength(1);
    expect(backupCalls[0]?.params.model).toBe("anthropic.claude-opus-5");

    // The generation's own state never learned about the switch: started once,
    // completed once, never recorded as failed, and still attempt 1 — the
    // model-level retries did not eat the generation's replay budget.
    expect(events).toEqual(["claim", "succeed"]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      generationId: "gen_test",
      attempt: 1,
      status: "succeeded",
    });

    // And what was persisted is the answer, carrying the endpoint that served.
    expect(values[0]).toMatchObject({
      text: "BACKUP ANSWER",
      provider: "bedrock",
      model: "anthropic.claude-opus-5",
      usedFallback: true,
      attemptCount: 4,
      usage: { inputTokens: 31, outputTokens: 12 },
    });
  });

  // CAL-058, on the axis CAL-050 did not have to ask about: four calls to two
  // providers, and the generation is charged for one of them.
  it("is charged once, for the endpoint that actually answered", async () => {
    const { port } = outageOnThePrimary();
    const { persist, outcomes } = recordingPersistence();

    await generate(port, persist);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.usage).toEqual({
      // The backup's own model, not the mission's declared one: the attempt row
      // records what served, so a cost is attributed to the tariff that applies.
      model: "anthropic.claude-opus-5",
      inputTokens: 31,
      outputTokens: 12,
      estimatedCostUsd: "0.001365",
    });
  });

  it("counts nothing for the three tries that never came back", async () => {
    // The primary was dropped mid-answer three times. Nobody can say what those
    // calls consumed, so nothing is written where a number would be invented —
    // which is what keeps a system failure from being billed on a guess.
    const { port, primaryCalls, backupCalls } = outageOnThePrimary();
    const { persist, outcomes, values } = recordingPersistence();

    await generate(port, persist);

    // Four calls were made and one answered. What is recorded is that one, at
    // its face value — not four times it, and not an estimate of the other
    // three.
    expect(primaryCalls.length + backupCalls.length).toBe(4);
    expect(values[0]?.attemptCount).toBe(4);
    expect(outcomes[0]?.usage).toMatchObject({ inputTokens: 31, outputTokens: 12 });
  });

  it("sends the second provider exactly what it sent the first", async () => {
    const { port, primaryCalls, backupCalls } = outageOnThePrimary();
    const { persist } = recordingPersistence();

    await generate(port, persist);

    // The request is the generation's partial state that *can* be preserved,
    // and it is: a truncated or re-composed prompt on the backup endpoint
    // would be a different generation wearing the same id.
    expect(backupCalls[0]?.params.system).toBe(primaryCalls[0]?.params.system);
    expect(backupCalls[0]?.params.messages).toEqual(primaryCalls[0]?.params.messages);
    expect(backupCalls[0]?.params.max_tokens).toBe(primaryCalls[0]?.params.max_tokens);
  });

  it("names the model that finally served, in the log", async () => {
    const capture = createLogCapture();
    const { port } = outageOnThePrimary({ log: createLogger({ destination: capture.stream }) });
    const { persist } = recordingPersistence();

    await generate(port, persist);

    const lines = capture.lines();

    // The switch, and then the outcome. Identifiers only (§9).
    expect(lines.find((line) => line["msg"] === "ai.model-fallback")).toMatchObject({
      missionId: "write-scene",
      provider: "bedrock",
      model: "anthropic.claude-opus-5",
      errorCode: "PROVIDER_UNAVAILABLE",
    });
    expect(lines.find((line) => line["msg"] === "ai.model-served")).toMatchObject({
      missionId: "write-scene",
      provider: "bedrock",
      model: "anthropic.claude-opus-5",
      attempt: 4,
      inputTokens: 31,
      outputTokens: 12,
    });
    expect(lines.find((line) => line["msg"] === "ai.provider-unavailable")).toMatchObject({
      provider: "anthropic",
      errorCode: "PROVIDER_UNAVAILABLE",
      errorCategory: "provider",
    });
  });
});

describe("the generations behind the first one", () => {
  // The whole reason a durable outage is worth telling apart from a transient
  // error. Without this, every chapter written during the outage would spend
  // three attempts against a ten-minute deadline before reaching the endpoint
  // that was going to answer anyway.
  it("stop paying for the outage once the primary is known to be down", async () => {
    const { port, primaryCalls, backupCalls } = outageOnThePrimary();

    const first = await generate(port, recordingPersistence().persist);
    const second = await generate(port, recordingPersistence().persist);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    // Three wasted attempts, once. The second generation went straight there.
    expect(primaryCalls).toHaveLength(3);
    expect(backupCalls).toHaveLength(2);
    expect(produced(second).attemptCount).toBe(1);
    expect(produced(second).usedFallback).toBe(true);
  });
});

describe("when both providers are out", () => {
  it("fails the generation cleanly, leaving it replayable", async () => {
    const scheduler = virtualScheduler();
    const primary = simulatedClient(droppedMidAnswer);
    const backup = simulatedClient(droppedMidAnswer);
    const port = createModelProviderPort({
      adapters: [
        createAnthropicAdapter({ client: primary.client }),
        createBedrockAdapter({ client: backup.client }),
      ],
      scheduler,
      health: createProviderHealth({ scheduler }),
      random: () => 0,
      log: createLogger({ level: "silent" }),
    });
    const { persist, events, outcomes } = recordingPersistence();

    const result = await generate(port, persist);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe("PROVIDER_UNAVAILABLE");

    // No result was written — §7's guarantee — and the failure is recorded
    // with its category, retryable, so a replay is the obvious next move.
    expect(events).toEqual(["claim", "fail"]);
    expect(outcomes[0]).toMatchObject({
      status: "failed",
      retryable: true,
      errorCode: "PROVIDER_UNAVAILABLE",
      errorCategory: "provider",
    });
  });

  it("still asks both, rather than refusing on the health tracker's word", async () => {
    const scheduler = virtualScheduler();
    const health = createProviderHealth({ scheduler });
    const primary = simulatedClient(droppedMidAnswer);
    // The backup recovers; the tracker has already written both off.
    const backup = simulatedClient(() => answer({ content: [text("LATE ANSWER")] }));
    const port = createModelProviderPort({
      adapters: [
        createAnthropicAdapter({ client: primary.client }),
        createBedrockAdapter({ client: backup.client }),
      ],
      scheduler,
      health,
      random: () => 0,
      log: createLogger({ level: "silent" }),
    });

    // Mark both down by hand: a false positive must cost latency, never a
    // refused generation.
    for (let index = 0; index < 3; index += 1) {
      health.recordFailure("anthropic", new ProviderError());
      health.recordFailure("bedrock", new ProviderError());
    }
    expect(health.isAvailable("anthropic")).toBe(false);
    expect(health.isAvailable("bedrock")).toBe(false);

    const result = await generate(port, recordingPersistence().persist);

    expect(result.ok).toBe(true);
    expect(produced(result).provider).toBe("bedrock");
  });
});
