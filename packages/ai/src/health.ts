/**
 * Provider availability across calls (CAL-050).
 *
 * `retry.ts` already tells the three failure kinds apart *inside* one call: a
 * rate limit waits out `retry-after`, a transient error is retried with
 * backoff, a permanent rejection goes straight to the other provider. What it
 * cannot see is the fourth situation — a provider that has been down for ten
 * minutes. Nothing is remembered between calls, so every new generation pays
 * the primary's full retry budget before the backup is even asked: for
 * `write-scene` that is three attempts against a 600 s deadline, half an hour
 * of dead time per chapter, repeated for as long as the outage lasts.
 *
 * This is the memory. Consecutive provider-side failures mark a provider down
 * for a cooldown; the pipeline then starts at the other one instead. A success
 * clears it, and after the cooldown the next call probes the provider again —
 * one attempt, which either clears it or trips it straight back.
 *
 * **A rate limit never marks a provider down.** A 429 is the provider telling
 * us it is working and that we are over quota. Treating that as an outage would
 * park the primary and move the whole load — the same load — onto the backup,
 * which is how one quota problem becomes two. It is neutral here: neither a
 * failure nor a success. `retryDelayMs` already honours the delay the limiter
 * asked for, and within-call fallback already covers the call that cannot wait.
 *
 * **Nothing else counts either.** A bug in our own code, a cancelled
 * generation and an unusable answer are not evidence about an endpoint. Only
 * the transport's own verdict is: `provider` and `timeout`.
 */

import type { AppError, ErrorCategory } from "@calepin/shared/errors";

import type { ProviderId } from "./capabilities";
import { REAL_SCHEDULER, type Scheduler } from "./timing";

export interface ProviderHealthPolicy {
  /** Consecutive provider-side failures before a provider is marked down. */
  readonly failureThreshold: number;
  /** How long a provider is skipped before one call probes it again. */
  readonly cooldownMs: number;
}

/**
 * Three failures is exactly one generation's retry budget against a single
 * model (`DEFAULT_RETRY_POLICY`), so one generation pays for the discovery and
 * the ones behind it do not. A minute is long enough to skip a burst and short
 * enough that a recovered provider is back in service almost at once.
 */
export const DEFAULT_PROVIDER_HEALTH_POLICY: ProviderHealthPolicy = {
  failureThreshold: 3,
  cooldownMs: 60_000,
};

/** What a record call did to the provider's state — the pipeline logs on it. */
export type ProviderHealthChange = "unchanged" | "unavailable" | "restored";

export interface ProviderHealth {
  isAvailable(provider: ProviderId): boolean;
  /**
   * The transport answered. Note this is about the endpoint, not the answer:
   * a response that later fails the mission's schema still proves the provider
   * served, and CAL-052's repair is what treats a bad answer.
   */
  recordSuccess(provider: ProviderId): ProviderHealthChange;
  recordFailure(provider: ProviderId, error: AppError): ProviderHealthChange;
}

/** The only evidence about an endpoint that an endpoint produced. */
const OUTAGE_CATEGORIES: readonly ErrorCategory[] = ["provider", "timeout"];

interface ProviderState {
  consecutiveFailures: number;
  /** Clock reading before which the provider is skipped. 0 = never marked. */
  downUntil: number;
}

export function createProviderHealth(
  options: { policy?: ProviderHealthPolicy; scheduler?: Scheduler } = {},
): ProviderHealth {
  const { policy = DEFAULT_PROVIDER_HEALTH_POLICY, scheduler = REAL_SCHEDULER } = options;
  const states = new Map<ProviderId, ProviderState>();

  const stateOf = (provider: ProviderId): ProviderState => {
    const existing = states.get(provider);

    if (existing !== undefined) {
      return existing;
    }

    const created: ProviderState = { consecutiveFailures: 0, downUntil: 0 };
    states.set(provider, created);

    return created;
  };

  return {
    isAvailable(provider: ProviderId): boolean {
      return scheduler.now() >= stateOf(provider).downUntil;
    },

    recordSuccess(provider: ProviderId): ProviderHealthChange {
      const state = stateOf(provider);
      const wasDown = state.downUntil !== 0;

      state.consecutiveFailures = 0;
      state.downUntil = 0;

      return wasDown ? "restored" : "unchanged";
    },

    recordFailure(provider: ProviderId, error: AppError): ProviderHealthChange {
      if (!OUTAGE_CATEGORIES.includes(error.category)) {
        return "unchanged";
      }

      const state = stateOf(provider);
      const now = scheduler.now();
      const wasAvailable = now >= state.downUntil;

      state.consecutiveFailures += 1;

      if (state.consecutiveFailures < policy.failureThreshold) {
        return "unchanged";
      }

      // The counter is deliberately not reset. After the cooldown the provider
      // is probed by one call, and a single further failure trips it straight
      // back rather than buying it another full threshold of generations.
      state.downUntil = now + policy.cooldownMs;

      return wasAvailable ? "unavailable" : "unchanged";
    },
  };
}
