import { describe, expect, it } from "vitest";

import { signInErrorMessage } from "./sign-in-error-message";

describe("signInErrorMessage", () => {
  it("returns null when there is no code", () => {
    expect(signInErrorMessage(null)).toBeNull();
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
  });

  const mappedCases: Array<[code: string, fragment: string]> = [
    ["Verification", "n'est plus valide"],
    ["OAuthAccountNotLinked", "existe déjà"],
    ["AccountNotLinked", "existe déjà"],
    ["OAuthCallbackError", "a échoué"],
    ["AccessDenied", "annulée"],
    ["MissingCSRF", "a expiré"],
  ];

  it.each(mappedCases)("maps %s to a French message", (code, fragment) => {
    const message = signInErrorMessage(code);

    expect(message).not.toBeNull();
    expect(message).toContain(fragment);
  });

  it("falls back to a generic French message for an unmapped or Configuration code", () => {
    const configuration = signInErrorMessage("Configuration");
    const unknown = signInErrorMessage("SomeFutureAuthErrorType");

    expect(configuration).toBe(unknown);
    expect(configuration).toMatch(/^[A-ZÀ-Ü]/);
  });

  it("never returns a technical detail — no code name leaks into a message", () => {
    for (const [code] of mappedCases) {
      expect(signInErrorMessage(code)).not.toContain(code);
    }
  });
});
