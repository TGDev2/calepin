/**
 * The explicit allowlist route protection is built on (CAL-030).
 *
 * Default-deny: everything not named here requires a live session. Auth.js's
 * own endpoints (`/api/auth/*`) stay reachable or sign-in itself would be
 * unreachable; the sign-in screen and its confirmation page stay reachable
 * for the same reason; the favicon is a static asset a browser requests
 * before any page renders. `/` is deliberately here too — it is today's
 * static skeleton page, not project data; CAL-032 turns it into the real
 * dashboard, and it joins this list's opposite, the protected set, then.
 *
 * This module imports nothing on purpose, the same constraint as
 * `correlation-header.ts` beside it: `proxy.ts` runs on the Edge runtime,
 * where there is no database to check a session against.
 */

const PUBLIC_ROUTES: readonly string[] = ["/", "/sign-in", "/sign-in/check-email", "/favicon.ico"];
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
 */
const SESSION_COOKIE_NAMES: readonly string[] = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function hasSessionCookie(cookies: { has(name: string): boolean }): boolean {
  return SESSION_COOKIE_NAMES.some((name) => cookies.has(name));
}
