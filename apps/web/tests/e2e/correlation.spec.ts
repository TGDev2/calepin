import { expect, test } from "@playwright/test";

const CORRELATION_ID_HEADER = "x-correlation-id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("every response carries a correlation id", async ({ request }) => {
  const response = await request.get("/");

  expect(response.status()).toBe(200);
  expect(response.headers()[CORRELATION_ID_HEADER]).toMatch(UUID);
});

test("each request gets its own identifier", async ({ request }) => {
  const first = await request.get("/");
  const second = await request.get("/");

  expect(first.headers()[CORRELATION_ID_HEADER]).not.toBe(second.headers()[CORRELATION_ID_HEADER]);
});

test("a well-formed inbound identifier is preserved", async ({ request }) => {
  const response = await request.get("/", {
    headers: { [CORRELATION_ID_HEADER]: "trace-0123456789" },
  });

  expect(response.headers()[CORRELATION_ID_HEADER]).toBe("trace-0123456789");
});

test("a malformed inbound identifier is replaced, not echoed", async ({ request }) => {
  const response = await request.get("/", {
    headers: { [CORRELATION_ID_HEADER]: "an inbound value with spaces" },
  });

  expect(response.headers()[CORRELATION_ID_HEADER]).toMatch(UUID);
});
