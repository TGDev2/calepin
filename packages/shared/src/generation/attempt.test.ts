import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fail, ProviderError, type Result, succeed, ValidationError } from "../errors";
import { logger } from "../logging";
import { type GenerationPersistence, runGenerationAttempt } from "./attempt";
import { type GenerationAttemptOutcome, toFailedAttempt, toSucceededAttempt } from "./outcome";

/**
 * The guarantee CLAUDE.md §7 states: *a failed generation leaves the project
 * valid and replayable.* Here that reduces to one observable property — the
 * result is written only by the single atomic operation that completes the
 * generation, and that operation is unreachable unless the model call and its
 * validation both succeeded.
 *
 * The recorded value stands in for a `Revision` (CAL-011+ builds the real one).
 * It is a token, not prose: §9 binds a test file as much as it binds a log.
 */
const RESULT_TOKEN = "revision-token-1";

interface Recorder extends GenerationPersistence<string> {
  readonly started: { generationId: string; attempt: number }[];
  readonly written: string[];
  readonly outcomes: GenerationAttemptOutcome[];
}

function createRecorder(overrides: Partial<GenerationPersistence<string>> = {}): Recorder {
  const started: { generationId: string; attempt: number }[] = [];
  const written: string[] = [];
  const outcomes: GenerationAttemptOutcome[] = [];

  return {
    started,
    written,
    outcomes,
    start: overrides.start ?? ((context) => void started.push(context)),
    succeed:
      overrides.succeed ??
      ((value, outcome) => {
        written.push(value);
        outcomes.push(outcome);
      }),
    fail: overrides.fail ?? ((outcome) => void outcomes.push(outcome)),
  };
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
  it("records the attempt, then writes the result exactly once", async () => {
    const persist = createRecorder();

    const result = await runGenerationAttempt({
      generationId: "gen-1",
      produce: () => succeed(RESULT_TOKEN),
      persist,
      now: createClock(),
    });

    expect(result).toEqual({ ok: true, value: RESULT_TOKEN });
    expect(persist.started).toEqual([{ generationId: "gen-1", attempt: 1 }]);
    expect(persist.written).toEqual([RESULT_TOKEN]);
    expect(persist.outcomes).toEqual([
      { generationId: "gen-1", attempt: 1, durationMs: 250, status: "succeeded", retryable: false },
    ]);
  });

  it("marks the attempt as running before the model is ever called", async () => {
    const order: string[] = [];
    const persist = createRecorder({ start: () => void order.push("start") });

    await runGenerationAttempt({
      generationId: "gen-1",
      produce: () => {
        order.push("produce");
        return succeed(RESULT_TOKEN);
      },
      persist,
    });

    expect(order).toEqual(["start", "produce"]);
  });

  it("counts the attempt it was given", async () => {
    const persist = createRecorder();

    await runGenerationAttempt({
      generationId: "gen-1",
      attempt: 3,
      produce: () => succeed(RESULT_TOKEN),
      persist,
    });

    expect(persist.started[0]?.attempt).toBe(3);
    expect(persist.outcomes[0]?.attempt).toBe(3);
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
        durationMs: 250,
        status: "failed",
        retryable: true,
        errorCode: "PROVIDER_UNAVAILABLE",
        errorCategory: "provider",
      },
    ]);
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

  it("does not run the model at all when the attempt cannot be recorded as running", async () => {
    let produced = false;
    const persist = createRecorder({
      start: () => {
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

    // The generation stays `running`, which is exactly the state a replay looks
    // for — and the caller learns the useful cause rather than the second one.
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
      start: () => {
        throw new Error("database unreachable");
      },
    });

    const attempt: Promise<Result<string>> = runGenerationAttempt<string>({
      generationId: "gen-1",
      produce: () => succeed(RESULT_TOKEN),
      persist,
    });

    await expect(attempt).resolves.toMatchObject({ ok: false });
  });
});
