import { describe, expect, it } from "vitest";

import { isThreadOpen, listOpenThreads } from "./open";

describe("isThreadOpen", () => {
  it("reads OPEN as open", () => {
    expect(isThreadOpen({ status: "OPEN" })).toBe(true);
  });

  it("reads CONTINUED as open, not only OPEN", () => {
    expect(isThreadOpen({ status: "CONTINUED" })).toBe(true);
  });

  it("reads CLOSED as the only non-open state", () => {
    expect(isThreadOpen({ status: "CLOSED" })).toBe(false);
  });
});

describe("listOpenThreads", () => {
  it("keeps OPEN and CONTINUED, drops CLOSED, and keeps the given order", () => {
    const threads = [
      { id: "a", status: "OPEN" as const },
      { id: "b", status: "CLOSED" as const },
      { id: "c", status: "CONTINUED" as const },
    ];

    expect(listOpenThreads(threads).map((thread) => thread.id)).toEqual(["a", "c"]);
  });

  it("returns an empty list when every thread is closed", () => {
    expect(listOpenThreads([{ status: "CLOSED" as const }])).toEqual([]);
  });

  it("returns every thread when none is closed", () => {
    const threads = [{ status: "OPEN" as const }, { status: "CONTINUED" as const }];

    expect(listOpenThreads(threads)).toEqual(threads);
  });
});
