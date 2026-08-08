/**
 * `callbackUrl` round-trips through `/sign-in` as a query parameter — once
 * written by `sign-in-redirect.ts` (an in-app path built server-side, always
 * safe) and once read back from the URL a browser actually requested, which
 * is attacker-controlled input (CAL-030).
 *
 * Auth.js's own default `redirect` callback already clamps an external
 * `callbackUrl` passed to `signIn()` to the app's origin, but the sign-in
 * page's "already signed in, skip the form" redirect calls
 * `next/navigation`'s `redirect()` directly and never passes through that
 * callback. Without a check here, a crafted
 * `/sign-in?callbackUrl=https://evil.example` link would send an already
 * signed-in visitor off-site — a real open-redirect vector, not a defensive
 * nicety for a scenario that can't happen.
 *
 * Only a same-app relative path survives: `//evil.example` and
 * `/\evil.example` are both browser-recognized ways to spell a
 * protocol-relative URL, so both are rejected alongside a plain absolute one.
 */
export function sanitizeCallbackUrl(value: string | readonly string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;

  if (typeof raw !== "string" || raw === "") return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";

  return raw;
}
