/**
 * The judge executor's mechanics (CAL-059): validation before anything else,
 * one targeted repair for a form failure, a clean refusal for an off-topic
 * answer, classified retries, the deadline — and usage summed across every
 * pass, the rejected ones included.
 *
 * Every fixture value is structural — markers, counts, minimum-length filler —
 * so nothing here can be read as part of a novel (§9), and no assertion is
 * about literary quality (§8): what is under test is the machine around the
 * judgement, never the judgement.
 */

import { RateLimitError } from "@calepin/shared/errors";
import { describe, expect, it } from "vitest";

import type { ProviderAdapter, StructuredProviderCall } from "../adapter";
import { currentPrompt, type RenderedPrompt, renderPrompt } from "../prompts";
import type { Scheduler } from "../timing";
import { type BenchCriterion, criteriaLines } from "./criteria";
import { createBenchJudge, reviewContract, type ReviewJudgement } from "./judge";

const CRITERIA: readonly BenchCriterion[] = [
  { id: "grounding", label: "Ancrage", question: "Question de démonstration sur l'ancrage." },
  { id: "compliance", label: "Consigne", question: "Question de démonstration sur la consigne." },
];

const ARGUMENT =
  "Argument de démonstration, assez long pour satisfaire la longueur minimale exigée par le contrat du banc.";

const EVIDENCE = {
  source: "output",
  excerpt: "extrait de démonstration cité depuis la sortie évaluée",
  location: "champ de démonstration",
  relevance: "cet extrait illustre le constat porté par l'argument ci-dessus.",
} as const;

function validReview(): ReviewJudgement {
  return {
    findings: CRITERIA.map((criterion) => ({
      criterionId: criterion.id,
      kind: "strength",
      argument: ARGUMENT,
      evidence: [EVIDENCE],
    })),
    expectationChecks: [],
    summary: ARGUMENT,
  };
}

/** A form failure the repair pass can name: the summary field is absent. */
function reviewMissingSummary(): unknown {
  const { findings, expectationChecks } = validReview();

  return { findings, expectationChecks };
}

function judgePrompt(): RenderedPrompt {
  return renderPrompt(currentPrompt("bench-review-output"), {
    missionIntent: "INTENT-MARKER",
    referenceText: "TEXTE-REPERE",
    evaluatedOutput: "SORTIE-REPERE",
    criteria: criteriaLines(CRITERIA),
    expectations: [],
  });
}

interface FakeStructuredAdapter {
  readonly adapter: ProviderAdapter;
  readonly calls: StructuredProviderCall[];
}

/** Answers the outcomes in order; an `Error` is thrown the way an adapter throws. */
function structuredAdapter(outcomes: readonly (unknown | Error)[]): FakeStructuredAdapter {
  const calls: StructuredProviderCall[] = [];
  const adapter: ProviderAdapter = {
    provider: "anthropic",
    generateProse: () => {
      throw new Error("the bench judge never asks for prose");
    },
    generateStructured: (call) => {
      calls.push(call);

      const outcome = outcomes[calls.length - 1];

      if (outcome === undefined) {
        throw new Error("the fake adapter was asked for more answers than it holds");
      }

      if (outcome instanceof Error) {
        return Promise.reject(outcome);
      }

      return Promise.resolve({ value: outcome, usage: { inputTokens: 100, outputTokens: 50 } });
    },
  };

  return { adapter, calls };
}

/** Retry backoffs fire at once; the judge's long deadline never does. */
function immediateScheduler(): Scheduler {
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

/** Every timer fires at once — the deadline included. */
function expiringScheduler(): Scheduler {
  return {
    now: () => 0,
    setTimeout: (callback) => globalThis.setTimeout(callback, 0),
    clearTimeout: (handle) =>
      globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  };
}

describe("the bench judge executor", () => {
  it("returns a validated judgement with the prompt identity and the exact usage", async () => {
    const fake = structuredAdapter([validReview()]);
    const judge = createBenchJudge({ adapter: fake.adapter });

    const result = await judge.call(judgePrompt(), reviewContract(CRITERIA, 0));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.output.findings).toHaveLength(CRITERIA.length);
      expect(result.value.promptId).toBe("bench-review-output");
      expect(result.value.promptVersion).toBe(1);
      expect(result.value.model).toBe("claude-opus-5");
      expect(result.value.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
      expect(result.value.attemptCount).toBe(1);
    }

    // The contract travels to the provider as JSON Schema, like any mission's.
    expect(fake.calls[0]?.outputSchema).toMatchObject({ type: "object" });
  });

  it("repairs a form failure once, appending to the original prompt, and sums the usage", async () => {
    const fake = structuredAdapter([reviewMissingSummary(), validReview()]);
    const judge = createBenchJudge({ adapter: fake.adapter });

    const result = await judge.call(judgePrompt(), reviewContract(CRITERIA, 0));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.attemptCount).toBe(2);
      // Both passes were paid for (CAL-056): 2 × (100 in, 50 out).
      expect(result.value.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
    }

    const [first, second] = fake.calls;

    // The repair keeps the original ask and appends the correction — a re-ask
    // carrying nothing back would be the blind retry §6 rules out.
    expect(second?.prompt.startsWith(first?.prompt ?? "")).toBe(true);
    expect(second?.prompt.length).toBeGreaterThan(first?.prompt.length ?? 0);
  });

  it("fails cleanly on an off-topic answer, without a repair pass", async () => {
    const fake = structuredAdapter([{ unrelated: true }]);
    const judge = createBenchJudge({ adapter: fake.adapter });

    const result = await judge.call(judgePrompt(), reviewContract(CRITERIA, 0));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("MODEL_OUTPUT_OFF_TOPIC");
    }

    expect(fake.calls).toHaveLength(1);
  });

  it("fails with the field path once the repair budget is spent, usage carried", async () => {
    const fake = structuredAdapter([reviewMissingSummary(), reviewMissingSummary()]);
    const judge = createBenchJudge({ adapter: fake.adapter });

    const result = await judge.call(judgePrompt(), reviewContract(CRITERIA, 0));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("MODEL_OUTPUT_INVALID");
      expect(result.error.fieldPath).toBe("summary");
      expect((result.error as { usage?: unknown }).usage).toEqual({
        inputTokens: 200,
        outputTokens: 100,
      });
    }
  });

  it("retries a classified transient failure and then serves", async () => {
    const fake = structuredAdapter([new RateLimitError({ retryAfterMs: 1 }), validReview()]);
    const judge = createBenchJudge({
      adapter: fake.adapter,
      scheduler: immediateScheduler(),
      random: () => 0,
    });

    const result = await judge.call(judgePrompt(), reviewContract(CRITERIA, 0));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.attemptCount).toBe(2);
      // The failed try served no answer, so only the second one was paid for.
      expect(result.value.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    }
  });

  it("abandons an attempt at its deadline and reports the timeout", async () => {
    const hanging: ProviderAdapter = {
      provider: "anthropic",
      generateProse: () => {
        throw new Error("the bench judge never asks for prose");
      },
      generateStructured: (call) =>
        new Promise((_resolve, reject) => {
          call.signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    };
    const judge = createBenchJudge({
      adapter: hanging,
      scheduler: expiringScheduler(),
      retryPolicy: { maxAttemptsPerModel: 2, baseDelayMs: 1, maxDelayMs: 1 },
      random: () => 0,
    });

    const result = await judge.call(judgePrompt(), reviewContract(CRITERIA, 0));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.category).toBe("timeout");
    }
  });

  it("refuses an adapter that cannot serve the judge's model", () => {
    const fake = structuredAdapter([]);

    expect(() =>
      createBenchJudge({
        adapter: { ...fake.adapter, provider: "bedrock" },
      }),
    ).toThrowError(expect.objectContaining({ code: "MODEL_NOT_CONFIGURED" }));
  });

  it("refuses text the registry never rendered", async () => {
    const fake = structuredAdapter([validReview()]);
    const judge = createBenchJudge({ adapter: fake.adapter });
    const forged = {
      promptId: "bench-review-output",
      version: 1,
      system: "SYSTEM",
      text: "PROMPT",
    } as unknown as RenderedPrompt;

    await expect(judge.call(forged, reviewContract(CRITERIA, 0))).rejects.toMatchObject({
      code: "PROMPT_NOT_RENDERED",
    });

    expect(fake.calls).toHaveLength(0);
  });
});
