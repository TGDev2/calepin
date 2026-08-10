/**
 * CAL-063's classification and its three curves, one class at a time.
 *
 * The backlog asks for *les tests par classe d'erreur*, and the reason it is
 * worth asking for is that the three branches fail in opposite directions and
 * neither failure is visible from the outside: classifying a permanent error as
 * transient pays a provider five times for the same rejection, and classifying a
 * transient one as permanent hands the author a dead generation over a blip.
 * Nothing here touches a clock, a database or a random number it did not receive.
 */

import { describe, expect, it } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ProviderError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "../errors";
import {
  classifyGenerationFailure,
  DEFAULT_GENERATION_RETRY_POLICY as POLICY,
  GENERATION_FAILURE_CLASSES,
  type GenerationFailureClass,
  generationRetryDelayMs,
  isRetriableFailureClass,
  MAX_GENERATION_ATTEMPTS,
  nextGenerationAttemptAt,
} from "./retry";

/** No jitter: the delay is then the fixed half of the interval, exactly. */
const noJitter = (): number => 0;
/** All of it: the delay is the whole interval, which is the upper bound. */
const fullJitter = (): number => 1;

describe("classifying a generation failure", () => {
  describe("as transient", () => {
    // The three retryable categories of RETRYABLE_BY_CATEGORY, minus rate_limit
    // which has its own class below. These are the failures a second try fixes.
    it.each([
      ["a provider outage", new ProviderError()],
      ["a provider rejection", new ProviderError({ code: "PROVIDER_REJECTED" })],
      ["a timeout", new TimeoutError()],
      ["a queue that refused the enqueue", new ProviderError({ code: "QUEUE_UNAVAILABLE" })],
    ])("classifies %s as transient", (_label, error) => {
      expect(classifyGenerationFailure(error)).toBe("transient");
    });
  });

  describe("as rate-limited", () => {
    it("gives the rate limiter its own class, not the transient one", () => {
      expect(classifyGenerationFailure(new RateLimitError())).toBe("rate_limited");
    });

    // The distinction is not cosmetic: it is the only reason the two classes
    // exist, since a rate limit is the one retryable failure that asking again
    // too soon makes *worse*.
    it("waits longer for a rate limit than for an outage, at the same attempt", () => {
      const limited = generationRetryDelayMs({ failureClass: "rate_limited", attempt: 1 }, POLICY, noJitter); // prettier-ignore
      const outage = generationRetryDelayMs({ failureClass: "transient", attempt: 1 }, POLICY, noJitter); // prettier-ignore

      expect(limited).toBeGreaterThan(outage);
    });
  });

  describe("as permanent", () => {
    it.each([
      ["a malformed input", new ValidationError()],
      ["a missing row", new NotFoundError()],
      ["a refused right", new ForbiddenError()],
      ["a state conflict", new ConflictError()],
      ["a cancellation", new ConflictError({ code: "GENERATION_CANCELLED" })],
      ["a bug", new InternalError()],
    ])("classifies %s as permanent", (_label, error) => {
      expect(classifyGenerationFailure(error)).toBe("permanent");
    });

    /**
     * The load-bearing case, and the reason the classification reads `retryable`
     * rather than the category. `MODEL_OUTPUT_INVALID` is a `provider` failure —
     * a retryable category — constructed non-retryable, because the treatment for
     * a malformed answer is CAL-052's targeted repair and not a blind replay.
     * Classifying by category alone would pay for the same rejected answer
     * `MAX_GENERATION_ATTEMPTS` times.
     */
    it("respects a per-error override of a retryable category", () => {
      const invalid = new ProviderError({ code: "MODEL_OUTPUT_INVALID", retryable: false });

      expect(invalid.category).toBe("provider");
      expect(classifyGenerationFailure(invalid)).toBe("permanent");
    });

    it("never schedules another attempt", () => {
      expect(generationRetryDelayMs({ failureClass: "permanent", attempt: 1 })).toBe(0);
      expect(
        nextGenerationAttemptAt({ failureClass: "permanent", attempt: 1, now: 0 }),
      ).toBeUndefined();
    });
  });

  it("has an answer for every class, and only these three", () => {
    expect(GENERATION_FAILURE_CLASSES).toEqual(["transient", "rate_limited", "permanent"]);
    expect(GENERATION_FAILURE_CLASSES.filter(isRetriableFailureClass)).toEqual([
      "transient",
      "rate_limited",
    ]);
  });
});

describe("the backoff", () => {
  const RETRIABLE: GenerationFailureClass[] = ["transient", "rate_limited"];

  it.each(RETRIABLE)("doubles per attempt, for %s", (failureClass) => {
    const delays = [1, 2, 3, 4].map((attempt) =>
      generationRetryDelayMs({ failureClass, attempt }, POLICY, noJitter),
    );

    expect(delays[1]).toBe((delays[0] ?? 0) * 2);
    expect(delays[2]).toBe((delays[1] ?? 0) * 2);
    expect(delays[3]).toBe((delays[2] ?? 0) * 2);
  });

  /**
   * Equal jitter, not full jitter — the difference from `@calepin/ai`'s own
   * `retryDelayMs`, and deliberate. The sweep's granularity is a minute, so a
   * wait that can collapse to nearly zero is not a backoff at all; half the
   * interval is fixed and half is random, which keeps the growth while still
   * spreading a fleet of workers.
   */
  it.each(RETRIABLE)(
    "never collapses to nothing, however the jitter falls (%s)",
    (failureClass) => {
      const floor = generationRetryDelayMs({ failureClass, attempt: 1 }, POLICY, noJitter);
      const ceiling = generationRetryDelayMs({ failureClass, attempt: 1 }, POLICY, fullJitter);

      expect(floor).toBeGreaterThan(0);
      expect(ceiling).toBe(floor * 2);
    },
  );

  it("grows past the sweep interval within the attempts a generation gets", () => {
    // The point of doubling: by the last automatic try the wait has to be several
    // sweeps long, not one — otherwise the ceiling is reached while the provider
    // incident is still going and the feature reads as "it just fails". Asserted
    // against the *guaranteed* delay (no jitter), so the claim holds however the
    // random half falls.
    const last = generationRetryDelayMs(
      { failureClass: "transient", attempt: MAX_GENERATION_ATTEMPTS - 1 },
      POLICY,
      noJitter,
    );

    expect(last).toBeGreaterThanOrEqual(2 * 60_000);
  });

  it("caps one wait, so no attempt parks a generation for an hour", () => {
    const far = generationRetryDelayMs(
      { failureClass: "rate_limited", attempt: 20 },
      POLICY,
      fullJitter,
    );

    expect(far).toBe(POLICY.maxDelayMs);
  });

  describe("a limiter that said how long to wait", () => {
    // The limiter knows its own window; the policy is guessing at it. So the
    // stated value is a floor — the same rule `@calepin/ai`'s retry already
    // applies one level down.
    it("treats retryAfterMs as a floor, above the computed delay", () => {
      const delay = generationRetryDelayMs(
        { failureClass: "rate_limited", attempt: 1, retryAfterMs: 5 * 60_000 },
        POLICY,
        noJitter,
      );

      expect(delay).toBe(5 * 60_000);
    });

    it("keeps the computed delay when it is already longer", () => {
      const computed = generationRetryDelayMs(
        { failureClass: "rate_limited", attempt: 4 },
        POLICY,
        noJitter,
      );
      const floored = generationRetryDelayMs(
        { failureClass: "rate_limited", attempt: 4, retryAfterMs: 1_000 },
        POLICY,
        noJitter,
      );

      expect(floored).toBe(computed);
    });

    // A cap above a floor: the ceiling wins, because a provider asking for an
    // hour is a provider we come back to on the author's schedule, not its own.
    it("caps a retryAfterMs beyond the policy's ceiling", () => {
      const delay = generationRetryDelayMs(
        { failureClass: "rate_limited", attempt: 1, retryAfterMs: 60 * 60_000 },
        POLICY,
        noJitter,
      );

      expect(delay).toBe(POLICY.maxDelayMs);
    });

    it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
      "ignores a retryAfterMs of %s rather than trusting it",
      (retryAfterMs) => {
        const delay = generationRetryDelayMs(
          { failureClass: "transient", attempt: 1, retryAfterMs },
          POLICY,
          noJitter,
        );

        expect(delay).toBe(POLICY.transientBaseDelayMs / 2);
      },
    );
  });
});

describe("the deadline the row carries", () => {
  it("is the failure's instant plus its wait, from the injected clock", () => {
    const now = 1_700_000_000_000;
    const at = nextGenerationAttemptAt({ failureClass: "transient", attempt: 2, now }, POLICY, noJitter); // prettier-ignore

    expect(at).toEqual(new Date(now + POLICY.transientBaseDelayMs));
  });

  /**
   * The ceiling is deliberately not consulted: a replay raises the row's own
   * `attemptCeiling`, and this function is handed an outcome rather than a row.
   * A deadline the sweep never reaches costs nothing — it closes an exhausted
   * generation before it delivers anything — while refusing one would leave a
   * replayed generation's later attempts running back to back with no backoff.
   */
  it("still schedules one past the default ceiling, for a replayed generation", () => {
    const at = nextGenerationAttemptAt(
      { failureClass: "transient", attempt: MAX_GENERATION_ATTEMPTS + 2, now: 0 },
      POLICY,
      noJitter,
    );

    expect(at).toBeInstanceOf(Date);
  });

  it("treats a nonsensical attempt number as the first one", () => {
    const first = generationRetryDelayMs({ failureClass: "transient", attempt: 1 }, POLICY, noJitter); // prettier-ignore

    expect(generationRetryDelayMs({ failureClass: "transient", attempt: 0 }, POLICY, noJitter)).toBe(first); // prettier-ignore
    expect(generationRetryDelayMs({ failureClass: "transient", attempt: -3 }, POLICY, noJitter)).toBe(first); // prettier-ignore
  });
});

describe("the ceiling", () => {
  /**
   * The arithmetic that makes a broken provider bounded rather than expensive.
   * `MAX_GENERATION_ATTEMPTS` is the loop breaker and the delays are what make
   * the loop slow; together they have to add up to a wait an author can sit
   * through, or the ceiling is reached before the incident is over and the
   * feature reads as "it just fails".
   */
  it("spends its attempts over minutes, not seconds and not hours", () => {
    const total = Array.from({ length: MAX_GENERATION_ATTEMPTS - 1 }, (_, index) =>
      generationRetryDelayMs({ failureClass: "transient", attempt: index + 1 }, POLICY, fullJitter),
    ).reduce((sum, delay) => sum + delay, 0);

    expect(total).toBeGreaterThanOrEqual(2 * 60_000);
    expect(total).toBeLessThanOrEqual(30 * 60_000);
  });

  it("is a whole number of tries, above one", () => {
    expect(Number.isInteger(MAX_GENERATION_ATTEMPTS)).toBe(true);
    expect(MAX_GENERATION_ATTEMPTS).toBeGreaterThanOrEqual(2);
  });
});
