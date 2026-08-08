import { type NextRequest, NextResponse } from "next/server";

import { CORRELATION_ID_HEADER, isCorrelationId } from "./lib/correlation-header";
import { hasSessionCookie, isPublicRoute } from "./lib/route-protection";
import { signInDestination } from "./lib/sign-in-redirect";

/**
 * Gives every request a correlation identifier before anything else runs, so
 * there is no window in which a request is being served untraceably — and
 * sends an anonymous visitor of a non-public route to sign in, preserving
 * where they were headed (CAL-030).
 *
 * The identifier goes three ways: forwarded on the request so server code can
 * pick it up (`lib/request-context.ts`), echoed on the response so a client or
 * a proxy can quote it when reporting a problem, and preserved when the caller
 * already supplied a well-formed one — which is what lets a trace survive a
 * hop between services.
 *
 * This file is the `proxy` convention, not the `middleware` one: Next 16.3
 * deprecates `middleware.ts` and warns on every build.
 *
 * It deliberately does not log, and the route check reads a cookie's presence
 * only, never the database. It runs on the Edge runtime, where
 * `node:async_hooks`, pino and Prisma are all unavailable; importing any of
 * them here would fail the build for the sake of one check. A cookie that
 * turns out not to name a live session is `getCurrentUser()`'s problem, not
 * this file's — see `route-protection.ts`.
 */
export default function proxy(request: NextRequest): NextResponse {
  const inbound = request.headers.get(CORRELATION_ID_HEADER);
  const correlationId = isCorrelationId(inbound) ? inbound : crypto.randomUUID();

  const { pathname, search } = request.nextUrl;

  if (!isPublicRoute(pathname) && !hasSessionCookie(request.cookies)) {
    const response = NextResponse.redirect(
      new URL(signInDestination(pathname, search), request.url),
    );
    response.headers.set(CORRELATION_ID_HEADER, correlationId);

    return response;
  }

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(CORRELATION_ID_HEADER, correlationId);

  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set(CORRELATION_ID_HEADER, correlationId);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
