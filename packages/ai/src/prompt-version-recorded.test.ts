/**
 * CAL-053's acceptance criterion: **every generation records the exact version
 * of the prompt that produced it.**
 *
 * Nothing here is a stand-in for the parts that exist. The prompt is the real
 * registry's, rendered; the mission registry is the real one; the adapters are
 * the real ones over simulated clients (§8: never a real provider in a test);
 * and the whole thing runs inside `runGenerationAttempt`, which is where the
 * *records* half of the criterion can actually be asked — the port returning a
 * version is not the claim, the attempt carrying it is.
 *
 * Of the cases below, the one that matters most is the attempt that **failed**:
 * it is attributable too. A quality regression is read off the generations a
 * prompt change broke, and those are exactly the ones with no result to read a
 * version off.
 *
 * The variable values are structural — a language tag and marker strings — so
 * nothing here can be read as part of a novel (§9).
 */

import type { Result } from "@calepin/shared/errors";
import {
  type GenerationAttemptOutcome,
  type GenerationClaimContext,
  type GenerationPersistence,
  type GenerationRun,
  runGenerationAttempt,
} from "@calepin/shared/generation";
import { createLogger } from "@calepin/shared/logging";
import { createLogCapture } from "@calepin/shared/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createAnthropicAdapter } from "./adapters/anthropic";
import { createBedrockAdapter } from "./adapters/bedrock";
import { answer, simulatedClient, text } from "./adapters/simulated";
import { createModelProviderPort } from "./create-model-port";
import { createProviderHealth } from "./health";
import type { ModelProviderPort, StructuredGenerationResult } from "./port";
import { currentPrompt, type MissionPrompt, type PromptDefinition, renderPrompt } from "./prompts";
import type { Scheduler } from "./timing";

const OUTPUT_SCHEMA = z.object({ itemCount: z.number() });
type Output = z.infer<typeof OUTPUT_SCHEMA>;

/** The mission's real prompt, filled with values that carry no prose. */
const PROMPT = renderPrompt(currentPrompt("extract-facts"), {
  language: "fr",
  chapterText: "CHAPTER-MARKER",
  knownFacts: ["FACT-MARKER"],
});

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

function recordingPersistence(): {
  persist: GenerationPersistence<StructuredGenerationResult<Output>>;
  starts: GenerationClaimContext[];
  outcomes: GenerationAttemptOutcome[];
} {
  const starts: GenerationClaimContext[] = [];
  const outcomes: GenerationAttemptOutcome[] = [];

  return {
    starts,
    outcomes,
    persist: {
      claim(context) {
        starts.push(context);

        return { kind: "claimed", attempt: 1 };
      },
      succeed(_value, outcome) {
        outcomes.push(outcome);

        return "applied";
      },
      fail(outcome) {
        outcomes.push(outcome);

        return "applied";
      },
    },
  };
}

function portAnswering(
  bodies: readonly string[],
  log = createLogger({ level: "silent" }),
): ModelProviderPort {
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

  return createModelProviderPort({
    adapters: [
      createAnthropicAdapter({ client: primary.client }),
      createBedrockAdapter({ client: backup.client }),
    ],
    scheduler,
    health: createProviderHealth({ scheduler }),
    random: () => 0,
    log,
  });
}

function generate(
  port: ModelProviderPort,
  persist: GenerationPersistence<StructuredGenerationResult<Output>>,
): Promise<Result<GenerationRun<StructuredGenerationResult<Output>>>> {
  return runGenerationAttempt({
    generationId: "gen_test",
    // Known before the call, because the prompt had to be rendered to make one.
    promptVersion: PROMPT.version,
    persist,
    now: () => 0,
    produce: async (): Promise<Result<StructuredGenerationResult<Output>>> =>
      port.generateStructured({ prompt: PROMPT, schema: OUTPUT_SCHEMA }),
  });
}

describe("the version a generation records", () => {
  it("reaches the attempt, from the first write, and again in its outcome", async () => {
    const { persist, starts, outcomes } = recordingPersistence();

    const result = await generate(portAnswering(['{"itemCount":3}']), persist);

    expect(result.ok).toBe(true);
    // Recorded *before* the model was called, so the record exists even if
    // nothing comes back. The attempt number is not here: it is the claim's to
    // allocate, not the caller's to state (CAL-058).
    expect(starts).toEqual([{ generationId: "gen_test", promptVersion: PROMPT.version }]);
    expect(outcomes[0]).toMatchObject({ status: "succeeded", promptVersion: PROMPT.version });
  });

  it("is recorded on an attempt that failed, which is the one an investigation reads", async () => {
    const { persist, starts, outcomes } = recordingPersistence();

    // An answer to some other question: no repair, an explicit failure, and
    // nothing written — but the attempt still names the prompt that produced it.
    const result = await generate(portAnswering(['{"status":"declined"}']), persist);

    expect(result.ok).toBe(false);
    expect(starts[0]?.promptVersion).toBe(PROMPT.version);
    expect(outcomes[0]).toMatchObject({
      status: "failed",
      errorCode: "MODEL_OUTPUT_OFF_TOPIC",
      promptVersion: PROMPT.version,
    });
  });

  it("is the mission prompt's, not the repair prompt's, when a repair pass served", async () => {
    // The repair is a resource of its own, with its own version. Recording that
    // one would attribute the answer to the wrong prompt.
    const { persist, outcomes } = recordingPersistence();

    const result = await generate(
      portAnswering(['{"itemCount":"three"}', '{"itemCount":3}']),
      persist,
    );

    expect(result.ok).toBe(true);

    const served = result.ok && result.value.kind === "produced" ? result.value.value : undefined;

    expect(served?.attemptCount).toBe(2);
    expect(served?.promptId).toBe("extract-facts");
    expect(served?.promptVersion).toBe(PROMPT.version);
    expect(outcomes[0]?.promptVersion).toBe(PROMPT.version);
  });
});

describe("the version the port reports", () => {
  it("is the version that ran, not the version the registry currently ships", async () => {
    // The distinction the criterion turns on. A pipeline that looked the
    // version up would record 1 here and be wrong about every generation
    // replayed from, or pinned to, an older resource.
    const older = renderPrompt(
      {
        id: "extract-facts",
        version: 7,
        scope: { kind: "mission", missionId: "extract-facts" },
        variables: [],
        system: "SYSTEM",
        instruction: "PROMPT",
      } as PromptDefinition,
      {},
    ) as MissionPrompt;
    const { persist, outcomes } = recordingPersistence();

    await runGenerationAttempt({
      generationId: "gen_pinned",
      promptVersion: older.version,
      persist,
      now: () => 0,
      produce: async (): Promise<Result<StructuredGenerationResult<Output>>> =>
        portAnswering(['{"itemCount":3}']).generateStructured({
          prompt: older,
          schema: OUTPUT_SCHEMA,
        }),
    });

    expect(currentPrompt("extract-facts").version).toBe(1);
    expect(outcomes[0]?.promptVersion).toBe(7);
  });

  it("names the prompt and its version in the meta, beside the model", async () => {
    const port = portAnswering(['{"itemCount":3}']);

    const result = await port.generateStructured({ prompt: PROMPT, schema: OUTPUT_SCHEMA });

    expect(result.ok && result.value).toMatchObject({
      missionId: "extract-facts",
      promptId: "extract-facts",
      promptVersion: PROMPT.version,
      model: "claude-sonnet-5",
    });
  });

  it("logs the pair, and none of what the prompt was filled with (§9)", async () => {
    const capture = createLogCapture();
    const port = portAnswering(['{"itemCount":3}'], createLogger({ destination: capture.stream }));

    await port.generateStructured({ prompt: PROMPT, schema: OUTPUT_SCHEMA });

    const line = capture.lines().find((entry) => entry["msg"] === "ai.model-served");

    expect(line).toMatchObject({ promptId: "extract-facts", promptVersion: PROMPT.version });

    const everything = JSON.stringify(capture.lines());

    expect(everything).not.toContain("CHAPTER-MARKER");
    expect(everything).not.toContain("FACT-MARKER");
  });
});
