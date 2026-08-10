/**
 * The generation job's contract and its lease renewal (CAL-061).
 *
 * The lifecycle itself — claim, run, recover — is asserted against a real
 * PostgreSQL and a real Redis in
 * `test/integration/generation-lifecycle.integration.test.ts`, because every
 * interesting thing about it is a statement. What is unit-testable is the shape
 * of what crosses the wire, and the renewal loop: a timer, an overlap guard and
 * a stop condition, none of which needs a database once the renewal itself is
 * injected.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fail, InternalError, succeed } from "../errors";
import { createLogger } from "../logging";
import { createLogCapture } from "../testing";
import {
  GENERATION_AUDIT_JOB,
  GENERATION_FAST_JOB,
  GENERATION_JOBS,
  GENERATION_SLOW_JOB,
  generationJobPayloadSchema,
  generationJobResultSchema,
  NO_GENERATION_EXECUTORS,
  startAttemptLeaseRenewal,
} from "./generation";
import { GENERATION_QUEUE_NAMES, isQueueName } from "./queues";

describe("the generation job contracts", () => {
  it("each name a declared queue, and route the same job name to it", () => {
    expect(GENERATION_FAST_JOB.queue).toBe("generation-fast");
    expect(GENERATION_SLOW_JOB.queue).toBe("generation-slow");
    expect(GENERATION_AUDIT_JOB.queue).toBe("generation-audit");

    for (const queue of GENERATION_QUEUE_NAMES) {
      const contract = GENERATION_JOBS[queue];

      expect(isQueueName(contract.queue)).toBe(true);
      expect(contract.queue).toBe(queue);
      expect(contract.name).toBe("run-generation");
    }
  });

  it("carries one identifier and nothing else", () => {
    // §9: mission, target and the replay payload are read from the row. The
    // payload may hold the author's own instruction, and Redis is the last place
    // it should be — a queue inspector shows every byte of a job's data.
    const parsed = generationJobPayloadSchema.parse({
      generationId: "gen-1",
      input: { instruction: "SENTINEL" },
    });

    expect(parsed).toEqual({ generationId: "gen-1" });
  });

  it.each([
    ["an empty id", { generationId: "" }],
    ["a missing id", {}],
    ["an id sent as a number", { generationId: 1 }],
  ])("rejects %s", (_label, payload) => {
    expect(generationJobPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("describes what one delivery came to", () => {
    expect(
      generationJobResultSchema.safeParse({
        generationId: "gen-1",
        outcome: "produced",
        attempt: 2,
      }).success,
    ).toBe(true);
    expect(
      generationJobResultSchema.safeParse({ generationId: "gen-1", outcome: "skipped" }).success,
    ).toBe(true);
    expect(
      generationJobResultSchema.safeParse({ generationId: "gen-1", outcome: "retried" }).success,
    ).toBe(false);
    // Attempts start at 1, as `AttemptContext.attempt` does.
    expect(
      generationJobResultSchema.safeParse({
        generationId: "gen-1",
        outcome: "produced",
        attempt: 0,
      }).success,
    ).toBe(false);
  });

  it("composes no executor by default, which is what every worker does today", () => {
    expect(Object.keys(NO_GENERATION_EXECUTORS)).toEqual([]);
  });
});

describe("the attempt lease renewal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pushes the lease back on every tick until it is stopped", async () => {
    let renewals = 0;
    const renewal = startAttemptLeaseRenewal({
      generationId: "gen-1",
      attempt: 1,
      intervalMs: 1_000,
      renew: () => {
        renewals += 1;

        return Promise.resolve(succeed("renewed" as const));
      },
    });

    await vi.advanceTimersByTimeAsync(3_000);
    expect(renewals).toBe(3);

    renewal.stop();
    await vi.advanceTimersByTimeAsync(3_000);

    // Terminal: a stopped renewal stays stopped, so the `finally` that stops it
    // cannot be undone by a tick already in flight.
    expect(renewals).toBe(3);
  });

  it("never stacks a second renewal on top of a slow one", async () => {
    let started = 0;
    let release: () => void = () => {};

    startAttemptLeaseRenewal({
      generationId: "gen-1",
      attempt: 1,
      intervalMs: 1_000,
      renew: () => {
        started += 1;

        return new Promise((resolve) => {
          release = () => resolve(succeed("renewed" as const));
        });
      },
    });

    await vi.advanceTimersByTimeAsync(5_000);

    // A database slow enough to outlast the interval must not queue five
    // renewals behind itself — it would still be catching up long after the
    // attempt was over.
    expect(started).toBe(1);

    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(started).toBe(2);
  });

  it("stops, and says so, once the attempt has been reclaimed under it", async () => {
    const capture = createLogCapture();
    const logger = createLogger({ level: "debug", destination: capture.stream });
    let renewals = 0;

    startAttemptLeaseRenewal({
      generationId: "gen-1",
      attempt: 2,
      intervalMs: 1_000,
      logger,
      renew: () => {
        renewals += 1;

        return Promise.resolve(succeed(renewals === 1 ? "renewed" : "lost"));
      },
    });

    await vi.advanceTimersByTimeAsync(4_000);

    // Insisting on a claim somebody else has taken over is how two workers end
    // up believing they hold one attempt.
    expect(renewals).toBe(2);
    expect(capture.lines().map((line) => line.msg)).toContain("generation.lease-lost");
    expect(capture.lines().at(-1)).toMatchObject({ generationId: "gen-1", attempt: 2 });
  });

  it("keeps renewing through a failure, because the lease outlasts several ticks", async () => {
    const capture = createLogCapture();
    const logger = createLogger({ level: "debug", destination: capture.stream });
    let renewals = 0;

    startAttemptLeaseRenewal({
      generationId: "gen-1",
      attempt: 1,
      intervalMs: 1_000,
      logger,
      renew: () => {
        renewals += 1;

        return renewals === 1
          ? Promise.reject(new InternalError({ message: "the database blinked" }))
          : Promise.resolve(succeed("renewed" as const));
      },
    });

    await vi.advanceTimersByTimeAsync(3_000);

    expect(renewals).toBe(3);
    const failure = capture.lines().find((line) => line.msg === "generation.lease-renewal-failed");
    expect(failure).toMatchObject({ generationId: "gen-1", attempt: 1 });
    // The developer-facing message never reaches the log (§7, §9).
    expect(capture.raw()).not.toContain("the database blinked");
  });

  it("treats a returned failure the same way as a thrown one", async () => {
    let renewals = 0;

    startAttemptLeaseRenewal({
      generationId: "gen-1",
      attempt: 1,
      intervalMs: 1_000,
      logger: createLogger({ level: "silent" }),
      renew: () => {
        renewals += 1;

        return Promise.resolve(fail(new InternalError({ message: "refused" })));
      },
    });

    await vi.advanceTimersByTimeAsync(2_000);

    // A `Result` failure is not `lost`: nothing said the attempt was taken, so
    // giving up the lease on it would reclaim a healthy call under itself.
    expect(renewals).toBe(2);
  });

  /**
   * CAL-064. The renewal is also the watch, and this is the whole of the
   * propagation: the tick that cannot renew is the tick that stops the work.
   */
  it("surrenders the run when the generation has been cancelled", async () => {
    const capture = createLogCapture();
    const logger = createLogger({ level: "debug", destination: capture.stream });
    const surrendered: string[] = [];
    let renewals = 0;

    startAttemptLeaseRenewal({
      generationId: "gen-1",
      attempt: 1,
      intervalMs: 1_000,
      logger,
      onSurrendered: (reason) => surrendered.push(reason),
      renew: () => {
        renewals += 1;

        return Promise.resolve(succeed(renewals === 1 ? "renewed" : "cancelled"));
      },
    });

    await vi.advanceTimersByTimeAsync(4_000);

    expect(renewals).toBe(2);
    expect(surrendered).toEqual(["cancelled"]);
    // An author stopping their own work is the feature working, not an incident.
    const observed = capture.lines().find((line) => line.msg === "generation.cancel-observed");
    expect(observed).toMatchObject({ generationId: "gen-1", attempt: 1 });
    expect(capture.lines().map((line) => line.msg)).not.toContain("generation.lease-lost");
  });

  it("surrenders the run on a lost lease too, and only once", async () => {
    const surrendered: string[] = [];

    startAttemptLeaseRenewal({
      generationId: "gen-1",
      attempt: 1,
      intervalMs: 1_000,
      logger: createLogger({ level: "silent" }),
      onSurrendered: (reason) => surrendered.push(reason),
      renew: () => Promise.resolve(succeed("lost" as const)),
    });

    await vi.advanceTimersByTimeAsync(4_000);

    // An attempt somebody else already owns is one whose answer is destined for
    // `superseded`; paying a provider to finish it is the waste CAL-064 closes.
    expect(surrendered).toEqual(["lost"]);
  });

  it("never surrenders on a renewal that merely failed", async () => {
    const surrendered: string[] = [];

    startAttemptLeaseRenewal({
      generationId: "gen-1",
      attempt: 1,
      intervalMs: 1_000,
      logger: createLogger({ level: "silent" }),
      onSurrendered: (reason) => surrendered.push(reason),
      renew: () => Promise.reject(new InternalError({ message: "the database blinked" })),
    });

    await vi.advanceTimersByTimeAsync(4_000);

    // A blip must not abort a live provider call: noticing a cancellation one
    // tick late costs seconds, aborting a healthy generation costs the whole of
    // it. The lease outlasts many ticks precisely so this can be the safe way.
    expect(surrendered).toEqual([]);
  });
});
