/**
 * The reconciliation contract and the constants it is tuned by (CAL-061).
 *
 * The sweep's four decisions are SQL, and a fake would prove nothing about them
 * — `test/integration/generation-lifecycle.integration.test.ts` runs them
 * against a real PostgreSQL. What is worth pinning here is the arithmetic
 * between the constants, because getting it wrong is silent: a staleness
 * threshold under the sweep interval makes the sweep race every ordinary
 * producer, and a lease under its own renewal interval reclaims healthy work.
 */

import { describe, expect, it } from "vitest";

import {
  GENERATION_LEASE_MS,
  GENERATION_LEASE_RENEWAL_MS,
  GENERATION_STALE_AFTER_MS,
  isQueueName,
  MAX_GENERATION_ATTEMPTS,
  RECONCILIATION_BATCH_SIZE,
  RECONCILIATION_INTERVAL_MS,
} from "./queues";
import {
  GENERATION_RECONCILIATION_SCHEDULER,
  RECONCILE_GENERATIONS_JOB,
  reconcileGenerationsPayloadSchema,
  reconcileGenerationsResultSchema,
} from "./reconciliation";

describe("the reconciliation job contract", () => {
  it("runs on a declared queue, beside the health probe and not beside a generation", () => {
    // Not on `generation`: with a concurrency of one, the sweep would queue
    // behind the very generation it exists to recover.
    expect(isQueueName(RECONCILE_GENERATIONS_JOB.queue)).toBe(true);
    expect(RECONCILE_GENERATIONS_JOB.queue).toBe("maintenance");
    expect(RECONCILE_GENERATIONS_JOB.name).not.toBe("ping");
  });

  it("carries no payload — everything it needs is in the database", () => {
    expect(reconcileGenerationsPayloadSchema.safeParse({}).success).toBe(true);
    expect(reconcileGenerationsPayloadSchema.safeParse(undefined).success).toBe(false);
  });

  it("reports what it moved, in counts", () => {
    const result = {
      reclaimedAttempts: 1,
      requeuedGenerations: 1,
      exhaustedGenerations: 0,
      deliveredGenerations: 3,
      undeliveredGenerations: 0,
      batchFull: false,
    };

    expect(reconcileGenerationsResultSchema.safeParse(result).success).toBe(true);
    expect(
      reconcileGenerationsResultSchema.safeParse({ ...result, reclaimedAttempts: -1 }).success,
    ).toBe(false);
  });

  it("keys its schedule on a stable id, because the registration is an upsert", () => {
    // A fleet of workers all registering at startup has to converge on one
    // schedule; a generated id would give it one per replica per deploy.
    expect(GENERATION_RECONCILIATION_SCHEDULER).toBe("generation-reconciliation");
  });
});

describe("the recovery timings", () => {
  it("leaves a queued generation alone for longer than one sweep", () => {
    // Otherwise the sweep re-enqueues rows an ordinary producer is still in the
    // middle of enqueuing, every minute, forever.
    expect(GENERATION_STALE_AFTER_MS).toBeGreaterThan(RECONCILIATION_INTERVAL_MS);
  });

  it("renews a lease several times over before it could expire", () => {
    // Reclaiming a healthy attempt is the expensive mistake: its answer is
    // discarded as `superseded` after the provider has already been paid.
    expect(GENERATION_LEASE_MS / GENERATION_LEASE_RENEWAL_MS).toBeGreaterThanOrEqual(3);
  });

  it("recovers a killed worker in minutes, not the half hour an unrenewed lease takes", () => {
    const worstCase = GENERATION_LEASE_MS + GENERATION_STALE_AFTER_MS + RECONCILIATION_INTERVAL_MS;

    expect(worstCase).toBeLessThanOrEqual(10 * 60_000);
  });

  it("bounds what one generation can be paid for, and what one sweep can do", () => {
    expect(MAX_GENERATION_ATTEMPTS).toBeGreaterThanOrEqual(2);
    expect(Number.isInteger(MAX_GENERATION_ATTEMPTS)).toBe(true);
    expect(RECONCILIATION_BATCH_SIZE).toBeGreaterThan(0);
  });
});
