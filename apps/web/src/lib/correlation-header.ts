/**
 * The correlation header, and nothing else.
 *
 * This module imports nothing on purpose. `proxy.ts` runs on the Edge runtime,
 * where `node:async_hooks` and pino do not exist, so it cannot reach for
 * `@calepin/shared/logging` — but it and the server-side pickup must agree on
 * the header name and on what counts as an acceptable identifier.
 */
export const CORRELATION_ID_HEADER = "x-correlation-id";

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * An inbound correlation id is attacker-controlled input that ends up in every
 * log line of the request. Accepting it verbatim would hand anyone a way to
 * write arbitrary text into the logs — the same class of problem the field
 * allowlist exists to prevent. Anything outside this shape is replaced by a
 * freshly minted identifier rather than sanitised.
 */
export function isCorrelationId(value: string | null | undefined): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}
