import { runWithRequestContext } from "@calepin/shared/logging";
import { headers } from "next/headers";

import { CORRELATION_ID_HEADER, isCorrelationId } from "./correlation-header";

/**
 * Picks the correlation id set by `proxy.ts` off the request and opens
 * the ambient log scope for it. Everything `handler` calls — including domain
 * code several frames down that knows nothing about HTTP — emits the same
 * identifier.
 *
 * Server-side only: it reads `next/headers`, and the log context is built on
 * `node:async_hooks`.
 */
export async function withRequestLogContext<T>(handler: () => T | Promise<T>): Promise<T> {
  const headerList = await headers();
  const inbound = headerList.get(CORRELATION_ID_HEADER);

  return runWithRequestContext(
    // `correlationId` left undefined when the header is absent or malformed;
    // `runWithRequestContext` mints one rather than leaving the scope untraced.
    { correlationId: isCorrelationId(inbound) ? inbound : undefined },
    async () => handler(),
  );
}
