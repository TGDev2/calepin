/**
 * CAL-050's first clause: **detect unavailability, telling a transient error, a
 * rate limit and a durable outage apart.**
 *
 * The first two are already told apart inside one call (`retry.test.ts`). This
 * file is about the third, which only exists across calls — and about the two
 * mistakes a tracker like this makes: opening on a rate limit, which turns one
 * quota problem into two, and staying open on a provider that has recovered.
 */

import {
  ConflictError,
  InternalError,
  ProviderError,
  RateLimitError,
  TimeoutError,
} from "@calepin/shared/errors";
import { describe, expect, it } from "vitest";

import {
  createProviderHealth,
  DEFAULT_PROVIDER_HEALTH_POLICY,
  type ProviderHealth,
} from "./health";
import type { Scheduler } from "./timing";

const POLICY = { failureThreshold: 3, cooldownMs: 60_000 };

/** A clock the test moves by hand — nothing here waits (§8). */
class ManualClock implements Scheduler {
  time = 0;

  now(): number {
    return this.time;
  }

  setTimeout(): unknown {
    throw new Error("the health tracker schedules nothing");
  }

  clearTimeout(): void {
    throw new Error("the health tracker schedules nothing");
  }
}

function trip(health: ProviderHealth, error = new ProviderError()): void {
  for (let index = 0; index < POLICY.failureThreshold; index += 1) {
    health.recordFailure("anthropic", error);
  }
}

function build(): { health: ProviderHealth; clock: ManualClock } {
  const clock = new ManualClock();

  return { health: createProviderHealth({ policy: POLICY, scheduler: clock }), clock };
}

describe("provider health — what counts as evidence about an endpoint", () => {
  it("starts every provider available, including one it has never heard of", () => {
    const { health } = build();

    expect(health.isAvailable("anthropic")).toBe(true);
    expect(health.isAvailable("bedrock")).toBe(true);
  });

  it("marks a provider down after the threshold of consecutive outages", () => {
    const { health } = build();

    health.recordFailure("anthropic", new ProviderError());
    health.recordFailure("anthropic", new ProviderError());
    expect(health.isAvailable("anthropic")).toBe(true);

    expect(health.recordFailure("anthropic", new ProviderError())).toBe("unavailable");
    expect(health.isAvailable("anthropic")).toBe(false);
  });

  it("counts a timeout as evidence too — a provider that never answers is down", () => {
    const { health } = build();

    trip(health, new TimeoutError());

    expect(health.isAvailable("anthropic")).toBe(false);
  });

  // The mistake this test exists to prevent: a 429 says the provider is
  // working and that we are over quota. Marking it down would move the same
  // load onto the backup and make one quota problem into two.
  it("never marks a provider down on a rate limit, however many arrive", () => {
    const { health } = build();

    for (let index = 0; index < 20; index += 1) {
      expect(health.recordFailure("anthropic", new RateLimitError())).toBe("unchanged");
    }

    expect(health.isAvailable("anthropic")).toBe(true);
  });

  it("ignores a failure that says nothing about the endpoint", () => {
    const { health } = build();

    trip(health, new InternalError({ message: "a bug in our own code" }));
    trip(health, new ConflictError({ code: "GENERATION_CANCELLED", message: "cancelled" }));

    expect(health.isAvailable("anthropic")).toBe(true);
  });

  it("keeps a rate limit from breaking a run of outages apart", () => {
    const { health } = build();

    health.recordFailure("anthropic", new ProviderError());
    health.recordFailure("anthropic", new RateLimitError());
    health.recordFailure("anthropic", new ProviderError());

    expect(health.isAvailable("anthropic")).toBe(true);
    expect(health.recordFailure("anthropic", new ProviderError())).toBe("unavailable");
  });

  it("tracks each provider on its own", () => {
    const { health } = build();

    trip(health);

    expect(health.isAvailable("anthropic")).toBe(false);
    expect(health.isAvailable("bedrock")).toBe(true);
  });
});

describe("provider health — recovery", () => {
  it("clears a run of failures the moment one call succeeds", () => {
    const { health } = build();

    health.recordFailure("anthropic", new ProviderError());
    health.recordFailure("anthropic", new ProviderError());
    expect(health.recordSuccess("anthropic")).toBe("unchanged");

    // The counter restarted: two more failures are not three.
    health.recordFailure("anthropic", new ProviderError());
    expect(health.recordFailure("anthropic", new ProviderError())).toBe("unchanged");
    expect(health.isAvailable("anthropic")).toBe(true);
  });

  it("stays down for the cooldown, then lets one call probe it again", () => {
    const { health, clock } = build();

    trip(health);

    clock.time = POLICY.cooldownMs - 1;
    expect(health.isAvailable("anthropic")).toBe(false);

    clock.time = POLICY.cooldownMs;
    expect(health.isAvailable("anthropic")).toBe(true);
  });

  it("reports the provider restored when the probe succeeds", () => {
    const { health, clock } = build();

    trip(health);
    clock.time = POLICY.cooldownMs;

    expect(health.recordSuccess("anthropic")).toBe("restored");
    expect(health.isAvailable("anthropic")).toBe(true);
  });

  // Half-open, and the reason the failure counter is not reset when the
  // provider is marked down: a provider still out must not buy itself another
  // full threshold of generations every time the cooldown lapses.
  it("trips straight back on a single failed probe", () => {
    const { health, clock } = build();

    trip(health);
    clock.time = POLICY.cooldownMs;

    expect(health.recordFailure("anthropic", new ProviderError())).toBe("unavailable");
    expect(health.isAvailable("anthropic")).toBe(false);
    expect(health.isAvailable("anthropic")).toBe(false);
  });

  it("reports nothing twice: a provider already down does not re-announce itself", () => {
    const { health } = build();

    trip(health);

    expect(health.recordFailure("anthropic", new ProviderError())).toBe("unchanged");
  });

  it("says nothing when a provider that was never down succeeds", () => {
    const { health } = build();

    expect(health.recordSuccess("bedrock")).toBe("unchanged");
  });
});

describe("the default policy", () => {
  // One generation's retry budget against a single model, so the generation
  // that discovers the outage pays for it and the ones behind it do not.
  it("costs exactly one generation's retry budget to discover an outage", () => {
    expect(DEFAULT_PROVIDER_HEALTH_POLICY.failureThreshold).toBe(3);
    expect(DEFAULT_PROVIDER_HEALTH_POLICY.cooldownMs).toBeGreaterThan(0);
  });
});
