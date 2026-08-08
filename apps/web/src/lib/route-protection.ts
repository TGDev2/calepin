/**
 * The explicit allowlist route protection is built on (CAL-030).
 *
 * Default-deny: everything not named here requires a live session. Auth.js's
 * own endpoints (`/api/auth/*`) stay reachable or sign-in itself would be
 * unreachable; the sign-in screen and its confirmation page stay reachable
 * for the same reason; the favicon is a static asset a browser requests
 * before any page renders. `/` is deliberately *not* here (CAL-032): it is
 * the real dashboard now, and a dashboard is project data.
 *
 * This module imports nothing on purpose, the same constraint as
 * `correlation-header.ts` beside it: `proxy.ts` runs on the Edge runtime,
 * where there is no database to check a session against.
 */

const PUBLIC_ROUTES: readonly string[] = [
  "/sign-in",
  "/sign-in/check-email",
  // The acknowledgement an account deletion lands on (CAL-031). It is public
  // by necessity, not by exception: the account it confirms the deletion of no
  // longer exists, so the visitor arriving here can never have a session. Its
  // content is a fixed sentence — it reads nothing and names nobody.
  "/account/deleted",
  "/favicon.ico",
];
const PUBLIC_PREFIXES: readonly string[] = ["/api/auth/"];

export function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/**
 * The two cookie names Auth.js's database session strategy can set — plain
 * over HTTP in development and in the e2e suite, `__Secure-`-prefixed once
 * the app is served over HTTPS (`@auth/core`'s `defaultCookies`).
 *
 * This is a presence check, not a validity check: the Edge runtime this file
 * runs in cannot reach the database, so it cannot tell a live session from an
 * expired or forged cookie — only `getCurrentUser()`, running server-side
 * with the real adapter, can. This check only decides whether a visitor gets
 * a chance to reach that page at all; `account/page.tsx`'s own check is what
 * catches a cookie that turns out not to name a live session.
 *
 * Exported since CAL-031: account deletion destroys the session *rows*, and
 * the browser is left holding a cookie naming one of them. The action clears
 * exactly the names the proxy looks for, from this one list — two lists would
 * drift into a visitor the proxy keeps turning away from a page that would
 * have let them in.
 */
export const SESSION_COOKIE_NAMES: readonly string[] = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function hasSessionCookie(cookies: { has(name: string): boolean }): boolean {
  return SESSION_COOKIE_NAMES.some((name) => cookies.has(name));
}
