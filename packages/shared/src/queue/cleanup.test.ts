/**
 * The cleanup job contract and its constants (CAL-069).
 *
 * The sweep itself is BullMQ state, not a rule a fake could stand in for —
 * `test/integration/queue-cleanup.integration.test.ts` runs it against a real
 * Redis. What is worth pinning here is the contract's shape and the retention
 * split, the same division `reconciliation.test.ts` already draws for the
 * reconciliation sweep.
 */

import { describe, expect, it } from "vitest";

import {
  CLEAN_QUEUES_JOB,
  cleanQueuesPayloadSchema,
  cleanQueuesResultSchema,
  QUEUE_CLEANUP_SCHEDULER,
} from "./cleanup";
import {
  DEFAULT_CLEANUP_COMPLETED_JOB_TTL_MS,
  DEFAULT_CLEANUP_FAILED_JOB_TTL_MS,
  isQueueName,
  QUEUE_CLEANUP_BATCH_SIZE,
} from "./queues";

describe("the cleanup job contract", () => {
  it("runs on the maintenance queue, beside the other sweeps", () => {
    expect(isQueueName(CLEAN_QUEUES_JOB.queue)).toBe(true);
    expect(CLEAN_QUEUES_JOB.queue).toBe("maintenance");
    expect(CLEAN_QUEUES_JOB.name).not.toBe("ping");
    expect(CLEAN_QUEUES_JOB.name).not.toBe("reconcile-generations");
  });

  it("carries no payload — the thresholds are the shell's own handler closure", () => {
    expect(cleanQueuesPayloadSchema.safeParse({}).success).toBe(true);
    expect(cleanQueuesPayloadSchema.safeParse(undefined).success).toBe(false);
  });

  it("reports what it removed, in non-negative counts", () => {
    const result = {
      removedCompleted: 3,
      removedFailed: 1,
      queuesSwept: 4,
      batchFull: false,
    };

    expect(cleanQueuesResultSchema.safeParse(result).success).toBe(true);
    expect(cleanQueuesResultSchema.safeParse({ ...result, removedCompleted: -1 }).success).toBe(
      false,
    );
  });

  it("keys its schedule on a stable id, because the registration is an upsert", () => {
    // A fleet of workers all registering at startup has to converge on one
    // schedule; a generated id would give it one per replica per deploy.
    expect(QUEUE_CLEANUP_SCHEDULER).toBe("queue-cleanup");
  });
});

describe("the retention thresholds", () => {
  it("keeps a failed job longer than a completed one — it is the one someone comes looking for", () => {
    expect(DEFAULT_CLEANUP_FAILED_JOB_TTL_MS).toBeGreaterThan(DEFAULT_CLEANUP_COMPLETED_JOB_TTL_MS);
  });

  it("matches DEFAULT_JOB_OPTIONS's own age split — a day, a week", () => {
    expect(DEFAULT_CLEANUP_COMPLETED_JOB_TTL_MS).toBe(24 * 3600 * 1000);
    expect(DEFAULT_CLEANUP_FAILED_JOB_TTL_MS).toBe(7 * 24 * 3600 * 1000);
  });

  it("bounds what one sweep, one queue, one state removes", () => {
    expect(QUEUE_CLEANUP_BATCH_SIZE).toBeGreaterThan(0);
    expect(Number.isInteger(QUEUE_CLEANUP_BATCH_SIZE)).toBe(true);
  });
});
