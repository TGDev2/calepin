import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fail, ProviderError, type Result, succeed, ValidationError } from "../errors";
import { logger } from "../logging";
import {
  type AttemptCompletion,
  type GenerationClaim,
  type GenerationPersistence,
  type GenerationRun,
  runGenerationAttempt,
} from "./attempt";
import {
  type AttemptUsage,
  type GenerationAttemptOutcome,
  toFailedAttempt,
  toSucceededAttempt,
} from "./outcome";

/**
 * Two guarantees, in one file.
 *
 * CLAUDE.md §7's: *a failed generation leaves the project valid and
 * replayable.* Here that reduces to one observable property — the result is
 * written only by the single atomic operation that completes the generation,
 * and that operation is unreachable unless the model call and its validation
 * both succeeded.
 *
 * CAL-058's: *the same work is never paid for twice.* Here that reduces to two
 * more — nothing is asked of a provider unless the claim opened an attempt, and
 * an answer whose completion is refused is discarded rather than written beside
 * the one that beat it.
 *
 * The recorded value stands in for a `Revision` (CAL-011+ builds the real one).
 * It is a token, not prose: §9 binds a test file as much as it binds a log.
 */
const RESULT_TOKEN = "revision-token-1";

/** A usage report, in the shape a provider's meta arrives in. */
const USAGE: AttemptUsage = {
  model: "fixture-model",
  inputTokens: 1200,
  outputTokens: 300,
  estimatedCostUsd: "0.004500",
};

interface Recorder extends GenerationPersistence<string> {
  readonly claims: { generationId: string; promptVersion?: number }[];
  readonly written: string[];
  readonly outcomes: GenerationAttemptOutcome[];
}

function createRecorder(overrides: Partial<GenerationPersistence<string>> = {}): Recorder {
  const claims: { generationId: string; promptVersion?: number }[] = [];
  const written: string[] = [];
  const outcomes: GenerationAttemptOutcome[] = [];
  let allocated = 0;

  return {
    claims,
    written,
    outcomes,
    claim:
      overrides.claim ??
      ((context): GenerationClaim => {
        claims.push(context);
        allocated += 1;

        return { kind: "claimed", attempt: allocated };
      }),
    succeed:
      overrides.succeed ??
      ((value, outcome): AttemptCompletion => {
        written.push(value);
        outcomes.push(outcome);

        return "applied";
      }),
    fail:
      overrides.fail ??
      ((outcome): AttemptCompletion => {
        outcomes.push(outcome);

        return "applied";
      }),
  };
}

/** A persistence that refuses every claim for one stated reason. */
function refusing(claim: GenerationClaim): Recorder {
  return createRecorder({ claim: () => claim });
}

/** A clock that advances 250 ms per reading, so durations are deterministic. */
function createClock(): () => number {
  let value = 1_000;
  return () => (value += 250) - 250;
}

const previousLevel = logger.level;

beforeEach(() => {
  logger.setLevel(previousLevel);
});

afterAll(() => {
  logger.setLevel(previousLevel);
});

describe("runGenerationAttempt, when the generation succeeds", () => {
  it("claims the attempt, then writes the result exactly once", async () => {
    const persist = createRecorder();

    const result = await runGenerationAttempt({
      generationId: "gen-1",
      produce: () => succeed(RESULT_TOKEN),
      persist,
      now: createClock(),
    });

    expect(result).toEqual({
      ok: true,
      value: { kind: "produced", attempt: 1, value: RESULT_TOKEN },
    });
    expect(persist.claims).toEqual([{ generationId: "gen-1", promptVersion: undefined }]);
    expect(persist.written).toEqual([RESULT_TOKEN]);
    expect(persist.outcomes).toEqual([
      {
        generationId: "gen-1",
        attempt: 1,
        promptVersion: undefined,
        durationMs: 250,
        usage: undefined,
        status: "succeeded",
        retryable: false,
      },
    ]);
  });

  it("claims the attempt before the model is ever called", async () => {
    const order: string[] = [];
    const persist = createRecorder({
      claim: (): GenerationClaim => {
        order.push("claim");

        return { kind: "claimed", attempt: 1 };
      },
    });

    await runGenerationAttempt({
      generationId: "gen-1",
      produce: () => {
        order.push("produce");

        return succeed(RESULT_TOKEN);
      },
      persist,
    });

    expect(order).toEqual(["claim", "produce"]);
  });

  it("takes the attempt number from the claim, never from the caller", async () => {
    // The parameter this replaces is the whole of CAL-058's second failure
    // mode: a redelivered job that picked `attempt: 1` again would write a
    // second cost line for a call the first delivery already paid for.
    const persist = createRecorder({ claim: () => ({ kind: "claimed", attempt: 4 }) });

    const result = await runGenerationAttempt({
      generationId: "gen-1",
      produce: () => succeed(RESULT_TOKEN),
      persist,
    });

    expect(result.ok && result.value).toMatchObject({ kind: "produced", attempt: 4 });
    expect(persist.outcomes[0]?.attempt).toBe(4);
  });

  it("records the usage a provider reported, stated rather than added", async () => {
    const persist = createRecorder();

    await runGenerationAttempt({
      generationId: "gen-1",
      produce: (report) => {
        // Two reports: the second is the total after a repair pass, not an
        // increment on the first. Adding them is the double count.
        report({ ...USAGE, inputTokens: 900, outputTokens: 100 });
        report(USAGE);

        return succeed(RESULT_TOKEN);
      },
      persist,
    });

    expect(persist.outcomes[0]?.usage).toEqual(USAGE);
  });
});

describe("runGenerationAttempt, progress reporting (CAL-062)", () => {
  it("forwards reportProgress to onProgress, with the claimed attempt's context", async () => {
    const persist = createRecorder({ claim: () => ({ kind: "claimed", attempt: 3 }) });
    const seen: unknown[] = [];

    await runGenerationAttempt({
      generationId: "gen-1",
      produce: (_report, reportProgress) => {
        reportProgress({ step: "Composition du contexte", percent: 20 });

        return succeed(RESULT_TOKEN);
      },
      persist,
      onProgress: (progress, context) => seen.push({ progress, context }),
    });

    expect(seen).toEqual([
      {
        progress: { step: "Composition du contexte", percent: 20 },
        context: { generationId: "gen-1", attempt: 3 },
      },
    ]);
  });

  it("forwards every call, stated rather than merged", async () => {
    const persist = createRecorder();
    const steps: string[] = [];

    await runGenerationAttempt({
      generationId: "gen-1",
      produce: (_report, reportProgress) => {
        reportProgress({ step: "Composition du contexte" });
        reportProgress({ step: "Rédaction en cours", percent: 60 });

        return succeed(RESULT_TOKEN);
      },
      persist,
      onProgress: (progress) => steps.push(progress.step),
    });

    expect(steps).toEqual(["Composition du contexte", "Rédaction en cours"]);
  });

  it("is a safe no-op when nothing is listening", async () => {
    const persist = createRecorder();

    const result = await runGenerationAttempt({
      generationId: "gen-1",
      produce: (_report, reportProgress) => {
        reportProgress({ step: "Composition du contexte" });

        return succeed(RESULT_TOKEN);
      },
      persist,
    });

    expect(result.ok).toBe(true);
  });
});

describe("runGenerationAttempt, when the claim refuses", () => {
  it.each([["already-succeeded"], ["already-failed"], ["cancelled"], ["in-flight"]] as const)(
    "asks no provider and writes nothing: %s",
    async (reason) => {
      let produced = false;
      const persist = refusing({ kind: "refused", reason, attempt: 2 });

      const result = await runGenerationAttempt({
        generationId: "gen-1",
        produce: () => {
          produced = true;

          return succeed(RESULT_TOKEN);
        },
        persist,
      });

      // A redelivery is not a failure of this function — it is the resume path,
      // and its whole value is the call that did not happen.
      expect(result).toEqual({ ok: true, value: { kind: "skipped", reason, attempt: 2 } });
      expect(produced).toBe(false);
      expect(persist.written).toEqual([]);
      expect(persist.outcomes).toEqual([]);
    },
  );
});

describe("runGenerationAttempt, when the completion is refused", () => {
  it("discards the answer rather than writing it beside the one that beat it", async () => {
    logger.setLevel("silent");

    const persist = createRecorder({ succeed: () => "already-completed" });

    const result = await runGenerationAttempt({
      generationId: "gen-1",
      produce: (report) => {
        report(USAGE);

        return succeed(RESULT_TOKEN);
      },
      persist,
    });

    // Our lease expired while the call was in flight and someone else finished
    // the generation. Two revisions and two cost lines for one ask is exactly
    // what the mechanism forbids, so this answer is dropped.
    expect(result).toEqual({
      ok: true,
      value: { kind: "skipped", reason: "superseded", attempt: 1 },
    });
  });
});

describe("runGenerationAttempt, when the generation fails", () => {
  it("writes no result and records the failure, for a returned error", async () => {
    const persist = createRecorder();
    const error = new ProviderError();

    const result = await runGenerationAttempt<string>({
      generationId: "gen-1",
      produce: () => fail(error),
      persist,
      now: createClock(),
    });

    expect(result).toEqual({ ok: false, error });
    expect(persist.written).toEqual([]);
    expect(persist.outcomes).toEqual([
      {
        generationId: "gen-1",
        attempt: 1,
        promptVersion: undefined,
        durationMs: 250,
        usage: undefined,
        status: "failed",
        retryable: true,
        errorCode: "PROVIDER_UNAVAILABLE",
        errorCategory: "provider",
      },
    ]);
  });

  it("records what a call was billed for before it failed", async () => {
    // A provider that answered and was then rejected still charged for the
    // answer. `./generation-cost` counts it, and must.
    const persist = createRecorder();

    await runGenerationAttempt<string>({
      generationId: "gen-1",
      produce: (report) => {
        report(USAGE);

        return fail(new ProviderError());
      },
      persist,
    });

    expect(persist.outcomes[0]).toMatchObject({ status: "failed", usage: USAGE });
  });

  it("writes no result and records the failure, for a thrown value", async () => {
    const persist = createRecorder();

    const result = await runGenerationAttempt<string>({
      generationId: "gen-1",
      produce: () => {
        throw new TypeError("boom");
      },
      persist,
    });

    expect(result.ok).toBe(false);
    expect(persist.written).toEqual([]);
  });

  it("does not launder a thrown bug into a retryable failure", async () => {
    // §7: a throw is a bug. Recorded as retryable, the queue would repeat it
    // patiently until the budget ran out.
    const persist = createRecorder();

    await runGenerationAttempt<string>({
      generationId: "gen-1",
      produce: () => {
        throw new TypeError("boom");
      },
      persist,
    });

    expect(persist.outcomes[0]).toMatchObject({
      status: "failed",
      retryable: false,
      errorCategory: "internal",
    });
  });

  it("keeps a returned failure distinguishable from a thrown one", async () => {
    const persist = createRecorder();

    await runGenerationAttempt<string>({
      generationId: "gen-1",
      produce: () => fail(new ValidationError({ fieldPath: "characters.0.name" })),
      persist,
    });

    expect(persist.outcomes[0]).toMatchObject({
      errorCategory: "validation",
      errorCode: "VALIDATION_FAILED",
    });
  });

  it("does not run the model at all when the attempt cannot be claimed", async () => {
    let produced = false;
    const persist = createRecorder({
      claim: () => {
        throw new Error("database unreachable");
      },
    });

    const result = await runGenerationAttempt<string>({
      generationId: "gen-1",
      produce: () => {
        produced = true;

        return succeed(RESULT_TOKEN);
      },
      persist,
    });

    expect(produced).toBe(false);
    expect(result.ok).toBe(false);
    expect(persist.written).toEqual([]);
    expect(persist.outcomes).toEqual([]);
  });

  it("records the failure when the single atomic write itself fails", async () => {
    const persist = createRecorder({
      succeed: () => {
        throw new Error("transaction rolled back");
      },
    });

    const result = await runGenerationAttempt({
      generationId: "gen-1",
      produce: () => succeed(RESULT_TOKEN),
      persist,
    });

    expect(result.ok).toBe(false);
    expect(persist.written).toEqual([]);
    expect(persist.outcomes).toMatchObject([{ status: "failed", errorCategory: "internal" }]);
  });

  it("still reports the original cause when recording the failure also fails", async () => {
    logger.setLevel("silent");

    const error = new ProviderError();
    const persist = createRecorder({
      fail: () => {
        throw new Error("database unreachable");
      },
    });

    const result = await runGenerationAttempt<string>({
      generationId: "gen-1",
      produce: () => fail(error),
      persist,
    });

    // The generation stays `running`, which is exactly the state the next claim
    // reclaims — and the caller learns the useful cause rather than the second.
    expect(result).toEqual({ ok: false, error });
  });
});

describe("the outcome a Generation row records", () => {
  it("carries a classification and nothing else", () => {
    const outcome = toFailedAttempt(new ProviderError(), {
      generationId: "gen-1",
      attempt: 2,
      durationMs: 1200,
    });

    expect(Object.keys(outcome).sort()).toEqual([
      "attempt",
      "durationMs",
      "errorCategory",
      "errorCode",
      "generationId",
      "retryable",
      "status",
    ]);
  });

  it("never carries a message, a stack or a payload", () => {
    const outcome = toFailedAttempt(new ProviderError({ message: "MODEL_REFUSED" }), {
      generationId: "gen-1",
      attempt: 1,
      durationMs: 10,
      usage: USAGE,
    });

    expect(JSON.stringify(outcome)).not.toContain("MODEL_REFUSED");
  });

  it("marks a success as not retryable — there is nothing to retry", () => {
    expect(toSucceededAttempt({ generationId: "gen-1", attempt: 1, durationMs: 10 })).toEqual({
      generationId: "gen-1",
      attempt: 1,
      durationMs: 10,
      status: "succeeded",
      retryable: false,
    });
  });
});

describe("the result of an attempt", () => {
  it("is a value the caller must handle, never a throw", async () => {
    const persist = createRecorder({
      claim: () => {
        throw new Error("database unreachable");
      },
    });

    const attempt: Promise<Result<GenerationRun<string>>> = runGenerationAttempt<string>({
      generationId: "gen-1",
      produce: () => succeed(RESULT_TOKEN),
      persist,
    });

    await expect(attempt).resolves.toMatchObject({ ok: false });
  });
});
