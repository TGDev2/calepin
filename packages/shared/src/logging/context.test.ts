import { describe, expect, it } from "vitest";

import {
  currentCorrelationId,
  currentLogContext,
  newCorrelationId,
  runWithGenerationContext,
  runWithLogContext,
  runWithRequestContext,
} from "./context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("newCorrelationId", () => {
  it("mints a distinct uuid every time", () => {
    const first = newCorrelationId();
    const second = newCorrelationId();

    expect(first).toMatch(UUID);
    expect(second).toMatch(UUID);
    expect(first).not.toBe(second);
  });
});

describe("the ambient context", () => {
  it("is empty outside any scope", () => {
    expect(currentLogContext()).toEqual({});
    expect(currentCorrelationId()).toBeUndefined();
  });

  it("does not leak out of its scope", () => {
    runWithLogContext({ projectId: "project-1" }, () => {
      expect(currentLogContext()).toEqual({ projectId: "project-1" });
    });

    expect(currentLogContext()).toEqual({});
  });

  it("merges nested scopes", () => {
    runWithLogContext({ correlationId: "corr-1" }, () => {
      runWithLogContext({ projectId: "project-1" }, () => {
        expect(currentLogContext()).toEqual({ correlationId: "corr-1", projectId: "project-1" });
      });

      expect(currentLogContext()).toEqual({ correlationId: "corr-1" });
    });
  });

  it("survives an await", async () => {
    await runWithLogContext({ correlationId: "corr-1" }, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));

      expect(currentCorrelationId()).toBe("corr-1");
    });
  });

  it("keeps concurrent scopes apart", async () => {
    const seen = await Promise.all(
      ["a", "b", "c"].map((id) =>
        runWithRequestContext({ correlationId: id }, async () => {
          await new Promise((resolve) => setTimeout(resolve, id === "a" ? 5 : 1));
          return currentCorrelationId();
        }),
      ),
    );

    expect(seen).toEqual(["a", "b", "c"]);
  });
});

describe("runWithRequestContext", () => {
  it("mints a correlation id when the request carries none", () => {
    runWithRequestContext({ httpMethod: "GET", httpPath: "/projects" }, () => {
      expect(currentCorrelationId()).toMatch(UUID);
      expect(currentLogContext()).toMatchObject({ httpMethod: "GET", httpPath: "/projects" });
    });
  });

  it("reuses the identifier the caller already has", () => {
    runWithRequestContext({ correlationId: "corr-inbound" }, () => {
      expect(currentCorrelationId()).toBe("corr-inbound");
    });
  });
});

describe("runWithGenerationContext", () => {
  it("inherits the correlation id of the request that started it", () => {
    runWithRequestContext({ correlationId: "corr-1" }, () => {
      runWithGenerationContext({ generationId: "gen-1", missionId: "write-scene" }, () => {
        expect(currentLogContext()).toEqual({
          correlationId: "corr-1",
          generationId: "gen-1",
          missionId: "write-scene",
        });
      });
    });
  });

  it("mints its own when it runs off-request, as the worker will", () => {
    runWithGenerationContext({ generationId: "gen-1", jobId: "job-1", attempt: 2 }, () => {
      expect(currentCorrelationId()).toMatch(UUID);
      expect(currentLogContext()).toMatchObject({
        generationId: "gen-1",
        jobId: "job-1",
        attempt: 2,
      });
    });
  });
});
