import { describe, expect, it } from "vitest";

import { hasSessionCookie, isPublicRoute, SESSION_COOKIE_NAMES } from "./route-protection";

describe("isPublicRoute", () => {
  it.each(["/", "/sign-in", "/sign-in/check-email", "/account/deleted", "/favicon.ico"])(
    "allows %s",
    (pathname) => {
      expect(isPublicRoute(pathname)).toBe(true);
    },
  );

  // `/account/deleted` is public and `/account/delete` is not, and the two
  // differ by two characters. A prefix rule would have opened the second one
  // with the first; the allowlist matches whole paths, and this is what says so.
  it("opens the deletion acknowledgement without opening the deletion screen", () => {
    expect(isPublicRoute("/account/deleted")).toBe(true);
    expect(isPublicRoute("/account/delete")).toBe(false);
    expect(isPublicRoute("/account/deleted/anything")).toBe(false);
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

  // Account deletion clears the cookies from this same list (CAL-031). A
  // cookie the proxy looks for but the deletion does not clear would leave the
  // visitor bouncing through the sign-in screen forever, so the two must be
  // one list — which only holds while `hasSessionCookie` reads it too.
  it("recognises every name the exported list carries, and nothing else", () => {
    for (const name of SESSION_COOKIE_NAMES) {
      expect(hasSessionCookie(cookieJar([name]))).toBe(true);
    }

    expect(SESSION_COOKIE_NAMES).toHaveLength(2);
  });
});
