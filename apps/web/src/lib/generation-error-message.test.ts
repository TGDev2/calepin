/**
 * One message per error class, and the fallback chain between them (CAL-063).
 *
 * The property worth pinning is not the wording — that is product surface and it
 * will be edited — but that **every shape of failed row gets a sentence**, and
 * that the sentence never leaks a technical detail. A screen that renders
 * `undefined` for an unfamiliar code, or that quotes a code at the reader, is the
 * failure mode this file exists to catch.
 */

import { ERROR_CODES, USER_MESSAGES } from "@calepin/shared/errors";
import { GENERATION_FAILURE_CLASSES } from "@calepin/shared/generation";
import { describe, expect, it } from "vitest";

import { generationAttemptCountLabel, generationFailureMessage } from "./generation-error-message";

describe("the message a failed generation shows", () => {
  describe("by error class", () => {
    it("says a transient failure is worth trying again", () => {
      const message = generationFailureMessage({
        errorCode: null,
        errorCategory: null,
        failureClass: "transient",
      });

      expect(message).toMatch(/passager/);
      expect(message).toMatch(/intact/);
    });

    it("tells a rate-limited author to wait rather than to hammer the button", () => {
      const message = generationFailureMessage({
        errorCode: null,
        errorCategory: null,
        failureClass: "rate_limited",
      });

      expect(message).toMatch(/[Pp]atientez/);
    });

    // The one class where "try again" is the wrong advice, and the message has to
    // say so — otherwise the author spends their budget discovering it.
    it("says a permanent failure would fail again identically", () => {
      const message = generationFailureMessage({
        errorCode: null,
        errorCategory: null,
        failureClass: "permanent",
      });

      expect(message).toMatch(/de la même façon/);
      expect(message).toMatch(/intact/);
    });

    it.each(GENERATION_FAILURE_CLASSES)("has a sentence for %s", (failureClass) => {
      const message = generationFailureMessage({
        errorCode: null,
        errorCategory: null,
        failureClass,
      });

      expect(message.length).toBeGreaterThan(20);
    });
  });

  describe("the fallback chain", () => {
    it("prefers a code's own sentence over its category's", () => {
      const exhausted = generationFailureMessage({
        errorCode: "GENERATION_ATTEMPTS_EXHAUSTED",
        errorCategory: "internal",
        failureClass: "permanent",
      });

      expect(exhausted).toMatch(/tentatives automatiques/);
      expect(exhausted).not.toBe(USER_MESSAGES.internal);
    });

    it("falls back to the category for a code with no sentence of its own", () => {
      expect(
        generationFailureMessage({
          errorCode: "PROVIDER_UNAVAILABLE",
          errorCategory: "provider",
          failureClass: "transient",
        }),
      ).toBe(USER_MESSAGES.provider);
    });

    // A row written by a later release: `listFailedGenerations` narrows an
    // unfamiliar code to `null` rather than passing it through, so this is the
    // shape that actually arrives — and it must still read as a sentence.
    it("falls back to the class when the code is one this build does not know", () => {
      const message = generationFailureMessage({
        errorCode: null,
        errorCategory: null,
        failureClass: "transient",
      });

      expect(message).not.toContain("null");
      expect(message).not.toContain("undefined");
    });

    it("still answers for a row carrying no classification at all", () => {
      const message = generationFailureMessage({
        errorCode: null,
        errorCategory: null,
        failureClass: null,
      });

      expect(message).toMatch(/intact/);
    });
  });

  /**
   * §7 and §9, on the one surface where they are easiest to break: the reader
   * sees French and nothing else — no code, no category, no field path.
   */
  describe("what it never says", () => {
    it.each(ERROR_CODES)("never quotes %s at the reader", (errorCode) => {
      const message = generationFailureMessage({
        errorCode,
        errorCategory: "internal",
        failureClass: "permanent",
      });

      expect(message).not.toContain(errorCode);
      expect(message).not.toMatch(/[A-Z]{3,}_[A-Z]/);
    });
  });
});

describe("the attempt count beside it", () => {
  it("agrees with itself on the singular", () => {
    expect(generationAttemptCountLabel(1)).toBe("1 tentative");
    expect(generationAttemptCountLabel(5)).toBe("5 tentatives");
  });

  // A generation the sweep closed before anything was ever tried — the mission
  // had no executor. There is no count to show, and "0 tentatives" reads as a bug.
  it("says nothing when nothing was tried", () => {
    expect(generationAttemptCountLabel(0)).toBeNull();
    expect(generationAttemptCountLabel(-1)).toBeNull();
  });
});
