import { describe, expect, it } from "vitest";

import { CORRELATION_ID_HEADER, isCorrelationId } from "./correlation-header";

describe("CORRELATION_ID_HEADER", () => {
  it("is lowercase, as header lookups are", () => {
    expect(CORRELATION_ID_HEADER).toBe(CORRELATION_ID_HEADER.toLowerCase());
  });
});

describe("isCorrelationId", () => {
  it("accepts a uuid", () => {
    expect(isCorrelationId(crypto.randomUUID())).toBe(true);
  });

  it.each(["0123456789abcdef", "trace-1234.5678", "A_B-c.9012"])("accepts %s", (value) => {
    expect(isCorrelationId(value)).toBe(true);
  });

  // In order: absent, undefined, empty, under the minimum length, over the
  // length cap, whitespace, a newline that would forge a second log line, a
  // punctuated payload, and path characters.
  it.each([
    null,
    undefined,
    "",
    "short",
    "a".repeat(129),
    "has spaces here",
    "line\nbreak-injection",
    '{"content":"prose"}',
    "../../etc/passwd",
  ])("rejects %j", (value) => {
    expect(isCorrelationId(value)).toBe(false);
  });
});
