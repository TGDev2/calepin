import { errorLogFields, httpStatusFor } from "@calepin/shared/errors";
import { type Logger, logger as defaultLogger } from "@calepin/shared/logging";

import { CORRELATION_ID_HEADER, isCorrelationId } from "./correlation-header";

/**
 * The body of Next's `onRequestError` hook — the server side of §7's *"the full
 * technical trace stays in the log, correlated by request id"*.
 *
 * It lives here rather than inside `instrumentation.ts` so it can be tested
 * against the bytes it emits. `instrumentation.ts` keeps one line.
 *
 * **It is total.** Next wraps the hook in a `try/catch` that ends in a
 * `console.error`, which §7 forbids us from producing; a reporter that can
 * throw would turn one failure into two, the second one unloggable.
 *
 * The correlation id comes off the request headers, not off the ambient log
 * context: Next calls this hook outside `runWithRequestContext`, so the
 * `AsyncLocalStorage` scope is not live here.
 */

/** Next's `errorRequest`, narrowed to what this function reads. */
export interface RequestErrorRequest {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Next's `errorContext`, narrowed to what this function reads. */
export interface RequestErrorContext {
  routeType: string;
}

export function reportRequestError(
  error: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext,
  logger: Logger = defaultLogger,
): void {
  try {
    const correlationId = firstHeaderValue(request.headers[CORRELATION_ID_HEADER]);

    logger.error(eventFor(context.routeType), {
      ...errorLogFields(error),
      ...(isCorrelationId(correlationId) ? { correlationId } : {}),
      ...(digestOf(error) === undefined ? {} : { errorDigest: digestOf(error) }),
      httpMethod: request.method,
      httpPath: request.path,
      httpStatus: httpStatusFor(error),
    });
  } catch {
    // Nothing left to do: the logger is the only reporting channel this process
    // has, and the failure being reported matters more than this one.
  }
}

/**
 * Next distinguishes a page render from a route handler, a server action and a
 * proxy failure. The distinction is the first thing an operator wants, and the
 * event name is the only place it fits: `routeType` is not on the log field
 * allowlist, and adding it there would widen the allowlist for a value that is
 * really a classification of the event itself.
 */
const ROUTE_TYPE_EVENTS: Record<string, string> = {
  render: "request.render-failed",
  route: "request.route-failed",
  action: "request.action-failed",
  proxy: "request.proxy-failed",
};

function eventFor(routeType: string): string {
  return ROUTE_TYPE_EVENTS[routeType] ?? "request.failed";
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Next stamps a digest — a hash of the message and the stack — onto every error
 * it surfaces, and the error boundary shows it to the reader. Logging it is
 * what makes the two ends of the same failure joinable.
 */
function digestOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return undefined;
  }

  const digest = (error as { digest: unknown }).digest;

  return typeof digest === "string" ? digest : undefined;
}
