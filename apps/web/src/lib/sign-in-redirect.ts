/**
 * The one place the sign-in URL with a `callbackUrl` is built (CAL-030),
 * shared by `proxy.ts` (Edge, no session cookie present) and
 * `account/page.tsx` (server component, cookie present but not a live
 * session) so both redirect paths preserve the visitor's destination the same
 * way.
 */
export function signInDestination(pathname: string, search = ""): string {
  return `/sign-in?callbackUrl=${encodeURIComponent(`${pathname}${search}`)}`;
}
