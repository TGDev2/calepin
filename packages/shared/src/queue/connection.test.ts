import { afterEach, describe, expect, it } from "vitest";

import { isAppError } from "../errors";
import {
  configureQueueConnection,
  getQueueConnection,
  PRODUCER_MAX_RETRIES_PER_REQUEST,
  QUEUE_CONNECTION_ROLES,
  queueConnectionOptions,
  resetQueueConnection,
} from "./connection";

afterEach(() => {
  resetQueueConnection();
});

describe("queueConnectionOptions", () => {
  it("gives a consumer the unlimited retries a blocking read needs", () => {
    // Not a preference: a BullMQ worker whose client gives up on a command
    // throws instead of waiting for work, so this value is the difference
    // between a worker and a crash loop.
    expect(queueConnectionOptions("consumer").maxRetriesPerRequest).toBeNull();
  });

  it("makes a producer fail fast, so an enqueue can be answered for", () => {
    expect(queueConnectionOptions("producer").maxRetriesPerRequest).toBe(
      PRODUCER_MAX_RETRIES_PER_REQUEST,
    );
    expect(PRODUCER_MAX_RETRIES_PER_REQUEST).toBeGreaterThan(0);
  });

  it("answers for every declared role", () => {
    for (const role of QUEUE_CONNECTION_ROLES) {
      expect(queueConnectionOptions(role)).toBeTypeOf("object");
    }
  });
});

describe("the registration seam", () => {
  it("refuses to invent a connection when no shell registered one", () => {
    let thrown: unknown;

    try {
      getQueueConnection();
    } catch (error: unknown) {
      thrown = error;
    }

    expect(isAppError(thrown)).toBe(true);
    expect(thrown).toMatchObject({ code: "QUEUE_NOT_CONFIGURED", category: "internal" });
  });

  it("hands back exactly what the shell registered", () => {
    // A stand-in: registering is a `globalThis` assignment and opens no socket.
    const connection = { quit: async () => "OK" } as never;

    expect(configureQueueConnection(connection)).toBe(connection);
    expect(getQueueConnection()).toBe(connection);
  });

  it("is keyed on a registry symbol, so two copies of the module agree", async () => {
    const connection = { quit: async () => "OK" } as never;
    configureQueueConnection(connection);

    // `Symbol.for` is the whole mechanism (§12): a second evaluation of this
    // module in another chunk must read the same slot, not its own.
    const registry = globalThis as unknown as Record<symbol, unknown>;

    expect(registry[Symbol.for("calepin.registeredQueueConnection")]).toBe(connection);
  });
});
