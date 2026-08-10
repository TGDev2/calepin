import { describe, expect, it } from "vitest";

import { handlePing, PING_JOB, pingPayloadSchema, pingResultSchema } from "./jobs";
import { isQueueName, QUEUE_NAMES } from "./queues";

describe("the job registry", () => {
  it("names a queue that is actually declared", () => {
    expect(isQueueName(PING_JOB.queue)).toBe(true);
  });

  it("keeps the queue list closed", () => {
    expect(isQueueName("generation")).toBe(false);
    expect(QUEUE_NAMES).toEqual(["maintenance"]);
  });
});

describe("the ping payload", () => {
  it("accepts what the producer sends", () => {
    expect(pingPayloadSchema.safeParse({ token: "abc", issuedAt: 1 }).success).toBe(true);
  });

  it.each([
    ["an empty token", { token: "", issuedAt: 1 }],
    ["a missing token", { issuedAt: 1 }],
    ["a fractional timestamp", { token: "abc", issuedAt: 1.5 }],
    ["a negative timestamp", { token: "abc", issuedAt: -1 }],
    ["a timestamp sent as a string", { token: "abc", issuedAt: "1" }],
  ])("rejects %s", (_label, payload) => {
    // A job written by a previous release arrives exactly like this, which is
    // why the consumer parses rather than trusts (§6).
    expect(pingPayloadSchema.safeParse(payload).success).toBe(false);
  });
});

describe("handlePing", () => {
  it("echoes the token, which is what makes consumption provable", () => {
    const result = handlePing({ token: "tok-1", issuedAt: 1_000 }, () => 1_250);

    expect(result).toEqual({ token: "tok-1", receivedAt: 1_250, latencyMs: 250 });
    expect(pingResultSchema.safeParse(result).success).toBe(true);
  });

  it("never reports a negative latency when the two clocks disagree", () => {
    const result = handlePing({ token: "tok-2", issuedAt: 2_000 }, () => 1_000);

    expect(result.latencyMs).toBe(0);
    expect(pingResultSchema.safeParse(result).success).toBe(true);
  });
});
