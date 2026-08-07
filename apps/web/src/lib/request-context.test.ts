import { currentCorrelationId } from "@calepin/shared/logging";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CORRELATION_ID_HEADER } from "./correlation-header";
import { withRequestLogContext } from "./request-context";

const inboundHeaders = new Headers();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(inboundHeaders),
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => {
  inboundHeaders.delete(CORRELATION_ID_HEADER);
});

describe("withRequestLogContext", () => {
  it("adopts the identifier the middleware forwarded", async () => {
    inboundHeaders.set(CORRELATION_ID_HEADER, "0123456789abcdef");

    const seen = await withRequestLogContext(() => currentCorrelationId());

    expect(seen).toBe("0123456789abcdef");
  });

  it("mints one when the header is missing", async () => {
    const seen = await withRequestLogContext(() => currentCorrelationId());

    expect(seen).toMatch(UUID);
  });

  it("mints one rather than trusting a malformed header", async () => {
    inboundHeaders.set(CORRELATION_ID_HEADER, "not a valid id");

    const seen = await withRequestLogContext(() => currentCorrelationId());

    expect(seen).toMatch(UUID);
  });

  it("keeps the scope open across awaits inside the handler", async () => {
    inboundHeaders.set(CORRELATION_ID_HEADER, "0123456789abcdef");

    const seen = await withRequestLogContext(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return currentCorrelationId();
    });

    expect(seen).toBe("0123456789abcdef");
  });

  it("closes the scope when the handler returns", async () => {
    await withRequestLogContext(() => currentCorrelationId());

    expect(currentCorrelationId()).toBeUndefined();
  });
});
