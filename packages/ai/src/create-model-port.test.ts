import { type AppError, ProviderError, RateLimitError, type Result } from "@calepin/shared/errors";
import { createLogger } from "@calepin/shared/logging";
import { createLogCapture } from "@calepin/shared/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type {
  ProviderAdapter,
  ProviderCall,
  ProviderProse,
  ProviderValue,
  StructuredProviderCall,
} from "./adapter";
import { createModelProviderPort, type CreateModelProviderPortOptions } from "./create-model-port";
import { ModelOutputInvalidError } from "./failures";
import { MISSION_REGISTRY, type MissionDefinition, type MissionRegistry } from "./mission-registry";
import type { MissionId } from "./missions";
import type { Scheduler } from "./timing";

/**
 * Virtual time (§8: a unit test touches no clock). `settle` fires due timers,
 * jumping the clock forward, until the promise under test resolves — so a
 * 2000ms backoff costs the suite nothing and asserts exactly 2000ms.
 */
class VirtualScheduler implements Scheduler {
  private time = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { at: number; run: () => void }>();

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, { at: this.time + delayMs, run: callback });

    return id;
  }

  clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  async settle<T>(promise: Promise<T>): Promise<T> {
    let settled = false;
    promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    for (let round = 0; round < 1000; round += 1) {
      await drainMicrotasks();

      if (settled) {
        return promise;
      }

      const next = [...this.tasks.entries()].sort((a, b) => a[1].at - b[1].at)[0];

      if (next === undefined) {
        throw new Error("virtual scheduler deadlock: pending promise, no timer");
      }

      this.tasks.delete(next[0]);
      this.time = Math.max(this.time, next[1].at);
      next[1].run();
    }

    throw new Error("virtual scheduler runaway");
  }
}

const drainMicrotasks = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const USAGE = { inputTokens: 12, outputTokens: 7 };

/**
 * Two missions, because since CAL-051 the registry declares what kind of
 * answer each one produces and the pipeline holds the caller to it: the prose
 * one carries every assertion about the pipeline itself, the structured one
 * the assertions about the schema. Both keep their backup model on this
 * suite's single fake provider, so one adapter still exercises the escalation.
 */
const MISSION: MissionId = "write-scene";
const STRUCTURED_MISSION: MissionId = "extract-facts";
const ROUTE: MissionDefinition = {
  id: MISSION,
  model: "claude-opus-5",
  fallbackModel: "claude-sonnet-5",
  effort: "high",
  maxOutputTokens: 8_000,
  timeoutMs: 60_000,
  output: { kind: "prose" },
  contextBudgetTokens: 40_000,
  expectedUsage: { inputTokens: 10_000, outputTokens: 4_000 },
};
const STRUCTURED_ROUTE: MissionDefinition = {
  ...ROUTE,
  id: STRUCTURED_MISSION,
  output: { kind: "structured", schemaOwner: "bible" },
};
const REGISTRY: MissionRegistry = {
  ...MISSION_REGISTRY,
  [MISSION]: ROUTE,
  [STRUCTURED_MISSION]: STRUCTURED_ROUTE,
};

interface FakeAdapter {
  readonly adapter: ProviderAdapter;
  readonly calls: { kind: "prose" | "structured"; call: ProviderCall }[];
}

function fakeAdapter(
  handlers: {
    prose?: (call: ProviderCall, index: number) => ProviderProse | Promise<ProviderProse>;
    structured?: (
      call: StructuredProviderCall,
      index: number,
    ) => ProviderValue | Promise<ProviderValue>;
  } = {},
): FakeAdapter {
  const calls: { kind: "prose" | "structured"; call: ProviderCall }[] = [];

  return {
    calls,
    adapter: {
      provider: "anthropic",
      async generateProse(call) {
        calls.push({ kind: "prose", call });
        const handler = handlers.prose ?? (() => ({ text: "alpha beta gamma", usage: USAGE }));

        return handler(call, calls.length);
      },
      async generateStructured(call) {
        calls.push({ kind: "structured", call });
        const handler = handlers.structured ?? (() => ({ value: { itemCount: 3 }, usage: USAGE }));

        return handler(call, calls.length);
      },
    },
  };
}

function buildPort(
  adapter: ProviderAdapter,
  scheduler: Scheduler,
  overrides: Partial<CreateModelProviderPortOptions> = {},
) {
  return createModelProviderPort({
    adapters: [adapter],
    registry: REGISTRY,
    scheduler,
    random: () => 0,
    retryPolicy: { maxAttemptsPerModel: 3, baseDelayMs: 100, maxDelayMs: 5000 },
    log: createLogger({ level: "silent" }),
    ...overrides,
  });
}

const REQUEST = { missionId: MISSION, system: "system words", prompt: "alpha" };
const STRUCTURED_REQUEST = {
  missionId: STRUCTURED_MISSION,
  system: "system words",
  prompt: "alpha",
  schema: z.object({ itemCount: z.number() }),
};

function expectOk<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected success, got ${result.error.code}`);
  }

  return result.value;
}

function expectFailure<T>(result: Result<T>): AppError {
  if (result.ok) {
    throw new Error("expected failure, got success");
  }

  return result.error;
}

/** Resolves only when its signal aborts — a provider call that never answers. */
const hangs = (call: ProviderCall): Promise<never> =>
  new Promise((_resolve, reject) => {
    call.signal.addEventListener("abort", () => reject(new Error("socket closed")), {
      once: true,
    });
  });

describe("createModelProviderPort — the happy path", () => {
  it("serves prose with the routed model and reports the exact meta", async () => {
    const { adapter, calls } = fakeAdapter();
    const port = buildPort(adapter, new VirtualScheduler());

    const value = expectOk(await port.generateProse(REQUEST));

    expect(value.text).toBe("alpha beta gamma");
    expect(value.model).toBe("claude-opus-5");
    expect(value.provider).toBe("anthropic");
    expect(value.usage).toEqual(USAGE);
    expect(value.attemptCount).toBe(1);
    expect(value.usedFallback).toBe(false);
    expect(value.durationMs).toBe(0);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.call.model.id).toBe("claude-opus-5");
    expect(calls[0]?.call.system).toBe("system words");
    expect(calls[0]?.call.prompt).toBe("alpha");
    expect(calls[0]?.call.maxOutputTokens).toBe(8_000);
  });

  it("hands the adapter JSON Schema and validates the answer against Zod", async () => {
    const { adapter, calls } = fakeAdapter();
    const port = buildPort(adapter, new VirtualScheduler());

    const value = expectOk(await port.generateStructured(STRUCTURED_REQUEST));

    expect(value.output).toEqual({ itemCount: 3 });

    const call = calls[0]?.call as StructuredProviderCall;
    expect(call.outputSchema).toMatchObject({ type: "object" });
  });
});

describe("createModelProviderPort — unusable answers (§6)", () => {
  it("refuses an answer that fails the schema: no retry, no fallback, field path only", async () => {
    const { adapter, calls } = fakeAdapter({
      structured: () => ({ value: { itemCount: "three" }, usage: USAGE }),
    });
    const port = buildPort(adapter, new VirtualScheduler());

    const error = expectFailure(await port.generateStructured(STRUCTURED_REQUEST));

    expect(error.code).toBe("MODEL_OUTPUT_INVALID");
    expect(error.retryable).toBe(false);
    expect(error.fieldPath).toBe("itemCount");
    // The tokens were genuinely consumed — the failure must not hide them.
    expect((error as ModelOutputInvalidError).usage).toEqual(USAGE);
    expect(calls).toHaveLength(1);
  });

  it("refuses empty prose the same way", async () => {
    const { adapter, calls } = fakeAdapter({ prose: () => ({ text: "   ", usage: USAGE }) });
    const port = buildPort(adapter, new VirtualScheduler());

    const error = expectFailure(await port.generateProse(REQUEST));

    expect(error.code).toBe("MODEL_OUTPUT_INVALID");
    expect(calls).toHaveLength(1);
  });
});

describe("createModelProviderPort — one mission, one treatment (CAL-051)", () => {
  it("refuses a structured call to a mission the registry declares as prose", async () => {
    const { adapter, calls } = fakeAdapter();
    const port = buildPort(adapter, new VirtualScheduler());

    await expect(
      port.generateStructured({ ...REQUEST, schema: z.object({ itemCount: z.number() }) }),
    ).rejects.toMatchObject({ code: "MISSION_OUTPUT_MISMATCH", category: "internal" });

    // The provider is never asked: the mismatch is a call-site bug, and it
    // would fail on every call rather than on an unlucky one.
    expect(calls).toHaveLength(0);
  });

  it("refuses a prose call to a mission the registry declares as structured", async () => {
    const { adapter, calls } = fakeAdapter();
    const port = buildPort(adapter, new VirtualScheduler());

    await expect(
      port.generateProse({ ...REQUEST, missionId: STRUCTURED_MISSION }),
    ).rejects.toMatchObject({ code: "MISSION_OUTPUT_MISMATCH" });

    expect(calls).toHaveLength(0);
  });

  it("calls each mission with the parameters its own entry declares", async () => {
    const { adapter, calls } = fakeAdapter();
    const port = buildPort(adapter, new VirtualScheduler());

    await port.generateProse(REQUEST);
    await port.generateStructured(STRUCTURED_REQUEST);

    // Nothing about the call comes from the caller: the model, the cap and the
    // effort are the registry's, which is what makes retuning a mission an
    // edit to one file.
    expect(calls[0]?.call).toMatchObject({ maxOutputTokens: 8_000, effort: "high" });
    expect(calls[0]?.call.model.id).toBe("claude-opus-5");
    expect(calls[1]?.call).toMatchObject({ maxOutputTokens: 8_000, effort: "high" });
  });
});

describe("createModelProviderPort — the context budget (CAL-051)", () => {
  it("says so when a call came back over its mission's budget", async () => {
    const { adapter } = fakeAdapter({
      prose: () => ({ text: "alpha", usage: { inputTokens: 41_000, outputTokens: 7 } }),
    });
    const capture = createLogCapture();
    const port = buildPort(adapter, new VirtualScheduler(), {
      log: createLogger({ destination: capture.stream }),
    });

    expectOk(await port.generateProse(REQUEST));

    // Identifiers and counts only (§9), and the budget itself is not repeated:
    // it is a constant of the registry, which the mission id points at.
    expect(capture.lines().find((line) => line["msg"] === "ai.context-budget-exceeded")).toEqual(
      expect.objectContaining({
        missionId: MISSION,
        provider: "anthropic",
        model: "claude-opus-5",
        inputTokens: 41_000,
      }),
    );
  });

  it("stays quiet when the composed context fitted", async () => {
    const { adapter } = fakeAdapter({
      prose: () => ({ text: "alpha", usage: { inputTokens: 40_000, outputTokens: 7 } }),
    });
    const capture = createLogCapture();
    const port = buildPort(adapter, new VirtualScheduler(), {
      log: createLogger({ destination: capture.stream }),
    });

    expectOk(await port.generateProse(REQUEST));

    expect(capture.lines().some((line) => line["msg"] === "ai.context-budget-exceeded")).toBe(
      false,
    );
  });
});

describe("createModelProviderPort — rate limits and retries", () => {
  it("waits out a rate limit, honouring the provider's retryAfterMs", async () => {
    const { adapter, calls } = fakeAdapter({
      prose: (_call, index) => {
        if (index === 1) {
          throw new RateLimitError({ retryAfterMs: 2000 });
        }

        return { text: "beta", usage: USAGE };
      },
    });
    const scheduler = new VirtualScheduler();
    const port = buildPort(adapter, scheduler);

    const value = expectOk(await scheduler.settle(port.generateProse(REQUEST)));

    expect(value.text).toBe("beta");
    expect(value.attemptCount).toBe(2);
    expect(value.usedFallback).toBe(false);
    // The clock moved by exactly the wait the limiter asked for.
    expect(value.durationMs).toBe(2000);
    expect(calls).toHaveLength(2);
  });
});

describe("createModelProviderPort — the backup model", () => {
  it("switches after the primary's retry budget is exhausted, and says so in the log", async () => {
    const { adapter, calls } = fakeAdapter({
      prose: (call) => {
        if (call.model.id === "claude-opus-5") {
          throw new ProviderError();
        }

        return { text: "beta", usage: USAGE };
      },
    });
    const scheduler = new VirtualScheduler();
    const capture = createLogCapture();
    const port = buildPort(adapter, scheduler, {
      log: createLogger({ destination: capture.stream }),
    });

    const value = expectOk(await scheduler.settle(port.generateProse(REQUEST)));

    expect(value.model).toBe("claude-sonnet-5");
    expect(value.usedFallback).toBe(true);
    expect(value.attemptCount).toBe(4);
    expect(calls).toHaveLength(4);

    // Identifiers only (§9): the event names the switch, never a payload.
    const line = capture.lines().find((entry) => entry["msg"] === "ai.model-fallback");
    expect(line).toMatchObject({
      missionId: "write-scene",
      provider: "anthropic",
      model: "claude-sonnet-5",
      errorCode: "PROVIDER_UNAVAILABLE",
      errorCategory: "provider",
      attempt: 3,
    });
  });

  it("switches immediately on a permanent provider rejection", async () => {
    const { adapter, calls } = fakeAdapter({
      prose: (call) => {
        if (call.model.id === "claude-opus-5") {
          throw new ProviderError({ code: "PROVIDER_REJECTED", retryable: false });
        }

        return { text: "beta", usage: USAGE };
      },
    });
    const scheduler = new VirtualScheduler();
    const port = buildPort(adapter, scheduler);

    const value = expectOk(await scheduler.settle(port.generateProse(REQUEST)));

    expect(value.usedFallback).toBe(true);
    expect(value.attemptCount).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it("surfaces the backup model's own failure when both fail", async () => {
    const primaryError = new ProviderError({ code: "PROVIDER_REJECTED", retryable: false });
    const backupError = new ProviderError({ code: "PROVIDER_UNAVAILABLE", retryable: false });
    const { adapter, calls } = fakeAdapter({
      prose: (call) => {
        throw call.model.id === "claude-opus-5" ? primaryError : backupError;
      },
    });
    const scheduler = new VirtualScheduler();
    const port = buildPort(adapter, scheduler);

    const error = expectFailure(await scheduler.settle(port.generateProse(REQUEST)));

    expect(error).toBe(backupError);
    expect(calls).toHaveLength(2);
  });

  it("never falls back on a bug: a plain throw is wrapped internal and final", async () => {
    const { adapter, calls } = fakeAdapter({
      prose: () => {
        throw new Error("boom");
      },
    });
    const port = buildPort(adapter, new VirtualScheduler());

    const error = expectFailure(await port.generateProse(REQUEST));

    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe("createModelProviderPort — cancellation (CAL-064)", () => {
  it("answers GENERATION_CANCELLED without calling the provider when already aborted", async () => {
    const { adapter, calls } = fakeAdapter();
    const port = buildPort(adapter, new VirtualScheduler());
    const controller = new AbortController();
    controller.abort();

    const error = expectFailure(
      await port.generateProse({ ...REQUEST, signal: controller.signal }),
    );

    expect(error.code).toBe("GENERATION_CANCELLED");
    expect(error.retryable).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("aborts the in-flight provider call, cleanly", async () => {
    const { adapter, calls } = fakeAdapter({ prose: hangs });
    const port = buildPort(adapter, new VirtualScheduler());
    const controller = new AbortController();

    const pending = port.generateProse({ ...REQUEST, signal: controller.signal });
    await drainMicrotasks();
    controller.abort();

    const error = expectFailure(await pending);

    expect(error.code).toBe("GENERATION_CANCELLED");
    expect(calls).toHaveLength(1);
  });

  it("interrupts a backoff wait instead of finishing it", async () => {
    const { adapter, calls } = fakeAdapter({
      prose: () => {
        throw new RateLimitError({ retryAfterMs: 2000 });
      },
    });
    const port = buildPort(adapter, new VirtualScheduler());
    const controller = new AbortController();

    const pending = port.generateProse({ ...REQUEST, signal: controller.signal });
    await drainMicrotasks();
    controller.abort();

    const error = expectFailure(await pending);

    expect(error.code).toBe("GENERATION_CANCELLED");
    expect(calls).toHaveLength(1);
  });
});

describe("createModelProviderPort — deadlines", () => {
  it("times a silent provider out after the mission's own deadline", async () => {
    const { adapter, calls } = fakeAdapter({ prose: hangs });
    const scheduler = new VirtualScheduler();
    const port = buildPort(adapter, scheduler, {
      registry: {
        ...REGISTRY,
        // The same model twice disables fallback: this test is about the clock.
        [MISSION]: { ...ROUTE, fallbackModel: ROUTE.model },
      },
      retryPolicy: { maxAttemptsPerModel: 1, baseDelayMs: 100, maxDelayMs: 5000 },
    });

    const error = expectFailure(await scheduler.settle(port.generateProse(REQUEST)));

    expect(error.code).toBe("TIMEOUT");
    expect(error.category).toBe("timeout");
    expect(scheduler.now()).toBe(ROUTE.timeoutMs);
    expect(calls).toHaveLength(1);
  });
});

describe("createModelProviderPort — wiring errors", () => {
  it("throws MODEL_NOT_CONFIGURED when no adapter serves the routed provider", async () => {
    const port = createModelProviderPort({
      adapters: [],
      registry: REGISTRY,
      log: createLogger({ level: "silent" }),
    });

    await expect(port.generateProse(REQUEST)).rejects.toMatchObject({
      code: "MODEL_NOT_CONFIGURED",
    });
  });

  // Since CAL-050 the backup lives on another provider, so a shell that wired
  // one endpoint has an unreachable candidate. Dropping it — rather than
  // discovering it mid-run — is what keeps a recoverable provider outage from
  // surfacing as a thrown mis-wiring error that hides the real cause.
  it("serves with the one provider a partially-wired shell configured", async () => {
    const { adapter, calls } = fakeAdapter({
      prose: () => {
        throw new ProviderError();
      },
    });
    const scheduler = new VirtualScheduler();
    const port = buildPort(adapter, scheduler, {
      registry: { ...REGISTRY, [MISSION]: { ...ROUTE, fallbackModel: "anthropic.claude-opus-5" } },
    });

    const error = expectFailure(await scheduler.settle(port.generateProse(REQUEST)));

    // The primary's own failure, not MODEL_NOT_CONFIGURED, and no attempt
    // against an endpoint nothing can reach.
    expect(error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(calls).toHaveLength(3);
  });

  it("refuses two adapters claiming one provider", () => {
    const first = fakeAdapter().adapter;
    const second = fakeAdapter().adapter;

    expect(() => createModelProviderPort({ adapters: [first, second] })).toThrow(
      "two adapters claim the same provider",
    );
  });
});
