import { describe, expect, it } from "vitest";

import { hasSessionCookie, isPublicRoute } from "./route-protection";

describe("isPublicRoute", () => {
  it.each(["/", "/sign-in", "/sign-in/check-email", "/favicon.ico"])("allows %s", (pathname) => {
    expect(isPublicRoute(pathname)).toBe(true);
  });

  it.each([
    "/api/auth/session",
    "/api/auth/csrf",
    "/api/auth/signin/email",
    "/api/auth/callback/google",
  ])("allows every Auth.js endpoint under the /api/auth/ prefix (%s)", (pathname) => {
    expect(isPublicRoute(pathname)).toBe(true);
  });

  it.each(["/account", "/account/delete", "/projects", "/sign-in-not-really", "/api/auth"])(
    "denies %s",
    (pathname) => {
      expect(isPublicRoute(pathname)).toBe(false);
    },
  );
});

function cookieJar(names: readonly string[]): { has(name: string): boolean } {
  return { has: (name) => names.includes(name) };
}

describe("hasSessionCookie", () => {
  it("is true for the plain-HTTP cookie name", () => {
    expect(hasSessionCookie(cookieJar(["authjs.session-token"]))).toBe(true);
  });

  it("is true for the HTTPS-secure-prefixed cookie name", () => {
    expect(hasSessionCookie(cookieJar(["__Secure-authjs.session-token"]))).toBe(true);
  });

  it("is false when neither cookie is present", () => {
    expect(hasSessionCookie(cookieJar(["authjs.csrf-token"]))).toBe(false);
    expect(hasSessionCookie(cookieJar([]))).toBe(false);
  });
});
