/**
 * Routing and parsing, without a Redis (CAL-061).
 *
 * `startQueueWorker` builds its routing table *before* it constructs the BullMQ
 * `Worker`, which is what lets the three configuration faults be asserted here
 * rather than discovered by a job going to the wrong handler in production. The
 * running worker itself is proved against a real Redis, in
 * `test/integration/queue-worker.integration.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineJob, startQueueWorker } from "./consumer";
import { handlePing, type JobContract, PING_JOB } from "./jobs";

const OTHER_MAINTENANCE_JOB: JobContract<{ value: number }, { doubled: number }> = {
  queue: "maintenance",
  name: "double",
  payload: z.object({ value: z.number().int() }),
  result: z.object({ doubled: z.number().int() }),
};

describe("defineJob", () => {
  it("parses the payload before the handler sees it", async () => {
    let seen: unknown;
    const job = defineJob(PING_JOB, (payload) => {
      seen = payload;

      return handlePing(payload, () => 1_500);
    });

    const outcome = await job.run({ token: "tok", issuedAt: 1_000 }, "job-1");

    expect(outcome).toEqual({
      kind: "completed",
      result: { token: "tok", receivedAt: 1_500, latencyMs: 500 },
    });
    expect(seen).toEqual({ token: "tok", issuedAt: 1_000 });
  });

  it("rejects a payload the contract does not describe, naming the field and not its value", async () => {
    let ran = false;
    const job = defineJob(PING_JOB, (payload) => {
      ran = true;

      return handlePing(payload);
    });

    const outcome = await job.run({ token: "tok", issuedAt: "SENTINEL" }, "job-2");

    // The path, never the value (§6, §9) — and the handler never ran, because a
    // payload that failed to parse was never a payload of this kind.
    expect(outcome).toEqual({ kind: "rejected", fieldPath: "issuedAt" });
    expect(ran).toBe(false);
  });

  it("carries the queue and the name off the contract", () => {
    const job = defineJob(PING_JOB, (payload) => handlePing(payload));

    expect(job).toMatchObject({ queue: "maintenance", name: "ping" });
  });

  it("lets a handler's own failure through, which is how a job fails", async () => {
    const job = defineJob(PING_JOB, () => {
      throw new Error("the work broke");
    });

    await expect(job.run({ token: "tok", issuedAt: 1 }, "job-3")).rejects.toThrow("the work broke");
  });
});

describe("startQueueWorker's routing table", () => {
  const ping = defineJob(PING_JOB, (payload) => handlePing(payload));
  const other = defineJob(OTHER_MAINTENANCE_JOB, (payload) => ({ doubled: payload.value * 2 }));
  const connection = { host: "127.0.0.1", port: 1 };

  it("refuses a worker with nothing to run", () => {
    expect(() => startQueueWorker({ queue: "maintenance", jobs: [], connection })).toThrow(
      /no job to handle/,
    );
  });

  it("refuses a job registered on another queue's worker", () => {
    // The fault this whole shape exists to prevent: a BullMQ worker consumes a
    // queue, not a job name, so a handler on the wrong worker is a job that is
    // taken and then rejected.
    expect(() =>
      startQueueWorker({ queue: "generation-fast", jobs: [ping, other], connection }),
    ).toThrow(/another queue/);
  });

  it("refuses two handlers for one name", () => {
    expect(() =>
      startQueueWorker({ queue: "maintenance", jobs: [ping, ping], connection }),
    ).toThrow(/two handlers/);
  });
});
