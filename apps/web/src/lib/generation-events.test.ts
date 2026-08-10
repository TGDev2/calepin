import { describe, expect, it, vi } from "vitest";

import { type GenerationEventSource, subscribeToGenerationEvents } from "./generation-events";

class FakeEventSource implements GenerationEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  close = vi.fn();
}

const ROW = { id: "gen-1", mission: "WRITE_SCENE", progressStep: "Rédaction en cours", progressPercent: 40 } as const;

describe("subscribeToGenerationEvents", () => {
  it("parses and forwards a snapshot frame", () => {
    const fake = new FakeEventSource();
    const updates: unknown[] = [];

    subscribeToGenerationEvents(
      "/api/projects/p1/generations/events",
      (rows) => updates.push(rows),
      () => fake,
    );

    fake.onmessage?.({ data: JSON.stringify([ROW]) } as MessageEvent);

    expect(updates).toEqual([[ROW]]);
  });

  it("forwards every frame it receives, not just the first", () => {
    const fake = new FakeEventSource();
    const updates: unknown[] = [];

    subscribeToGenerationEvents("/x", (rows) => updates.push(rows), () => fake);

    fake.onmessage?.({ data: "[]" } as MessageEvent);
    fake.onmessage?.({ data: JSON.stringify([ROW]) } as MessageEvent);

    expect(updates).toEqual([[], [ROW]]);
  });

  it("drops a malformed frame instead of throwing", () => {
    const fake = new FakeEventSource();

    subscribeToGenerationEvents("/x", () => undefined, () => fake);

    expect(() => fake.onmessage?.({ data: "not json" } as MessageEvent)).not.toThrow();
  });

  it("closes the connection when the caller unsubscribes", () => {
    const fake = new FakeEventSource();

    const stop = subscribeToGenerationEvents("/x", () => undefined, () => fake);
    expect(fake.close).not.toHaveBeenCalled();

    stop();

    expect(fake.close).toHaveBeenCalledOnce();
  });

  it("passes the given url to the factory", () => {
    const fake = new FakeEventSource();
    const createEventSource = vi.fn().mockReturnValue(fake);

    subscribeToGenerationEvents("/api/projects/p1/generations/events", () => undefined, createEventSource);

    expect(createEventSource).toHaveBeenCalledWith("/api/projects/p1/generations/events");
  });
});
