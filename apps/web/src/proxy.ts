import { type NextRequest, NextResponse } from "next/server";

import { CORRELATION_ID_HEADER, isCorrelationId } from "./lib/correlation-header";

/**
 * Gives every request a correlation identifier before anything else runs, so
 * there is no window in which a request is being served untraceably.
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
 * It deliberately does not log. It runs on the Edge runtime, where
 * `node:async_hooks` and pino are unavailable; importing the logger here would
 * fail the build for the sake of one line.
 */
export default function proxy(request: NextRequest): NextResponse {
  const inbound = request.headers.get(CORRELATION_ID_HEADER);
  const correlationId = isCorrelationId(inbound) ? inbound : crypto.randomUUID();

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(CORRELATION_ID_HEADER, correlationId);

  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set(CORRELATION_ID_HEADER, correlationId);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
