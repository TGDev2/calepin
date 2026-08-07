import { beforeEach, describe, expect, it } from "vitest";

import { createLogCapture } from "../testing/log-capture";
import { runWithGenerationContext, runWithRequestContext } from "./context";
import { createLogger } from "./logger";

const capture = createLogCapture();

beforeEach(() => {
  capture.clear();
});

function loggerAt(level: "trace" | "info" | "warn" | "silent") {
  return createLogger({ level, destination: capture.stream });
}

describe("createLogger", () => {
  it("emits one JSON line per call, with the event as the message", () => {
    loggerAt("trace").info("app.started", { model: "claude-opus-5" });

    expect(capture.lines()[0]).toMatchObject({
      level: "info",
      msg: "app.started",
      model: "claude-opus-5",
      time: expect.any(String) as unknown as string,
    });
  });

  it("carries no pid or hostname binding", () => {
    loggerAt("info").info("app.started");

    expect(capture.lines()[0]).not.toHaveProperty("pid");
    expect(capture.lines()[0]).not.toHaveProperty("hostname");
  });

  it("honours the configured level", () => {
    const logger = loggerAt("warn");

    logger.debug("noise.emitted");
    logger.info("noise.emitted");
    logger.warn("budget.exceeded", { attempt: 3 });

    expect(capture.lines()).toHaveLength(1);
    expect(capture.lines()[0]).toMatchObject({ level: "warn", msg: "budget.exceeded" });
  });

  it("emits nothing at level silent", () => {
    loggerAt("silent").error("generation.failed", { errorCode: "PROVIDER_TIMEOUT" });

    expect(capture.raw()).toBe("");
  });

  it("can be re-levelled after construction, as the process shell does", () => {
    const logger = loggerAt("warn");

    logger.debug("first.attempt");
    logger.setLevel("debug");
    logger.debug("second.attempt");

    expect(logger.level).toBe("debug");
    expect(capture.lines()).toHaveLength(1);
    expect(capture.lines()[0]).toMatchObject({ msg: "second.attempt" });
  });

  it("binds context fields to every line of a child", () => {
    const child = loggerAt("info").child({ projectId: "project-1" });

    child.info("analysis.started");
    child.info("analysis.completed", { durationMs: 1_240 });

    expect(capture.lines()).toEqual([
      expect.objectContaining({ projectId: "project-1", msg: "analysis.started" }),
      expect.objectContaining({
        projectId: "project-1",
        durationMs: 1_240,
        msg: "analysis.completed",
      }),
    ]);
  });

  it("binds construction-time context to every line", () => {
    createLogger({
      level: "info",
      destination: capture.stream,
      context: { provider: "anthropic" },
    }).info("provider.selected");

    expect(capture.lines()[0]).toMatchObject({ provider: "anthropic" });
  });
});

describe("correlation", () => {
  it("stamps every line inside a request scope", () => {
    const logger = loggerAt("info");

    runWithRequestContext(
      { correlationId: "corr-1", httpMethod: "POST", httpPath: "/api/generations" },
      () => {
        logger.info("request.received");
        logger.info("request.completed", { httpStatus: 202, durationMs: 12 });
      },
    );

    for (const line of capture.lines()) {
      expect(line).toMatchObject({ correlationId: "corr-1", httpMethod: "POST" });
    }
  });

  it("keeps the request identifier across the hop into a generation", () => {
    const logger = loggerAt("info");

    runWithRequestContext({ correlationId: "corr-1" }, () => {
      runWithGenerationContext({ generationId: "gen-1", missionId: "write-scene" }, () => {
        logger.info("generation.started");
      });
    });

    expect(capture.lines()[0]).toMatchObject({
      correlationId: "corr-1",
      generationId: "gen-1",
      missionId: "write-scene",
    });
  });

  it("lets an explicit field override the ambient one", () => {
    const logger = loggerAt("info");

    runWithRequestContext({ correlationId: "corr-1" }, () => {
      logger.info("job.enqueued", { correlationId: "corr-2" });
    });

    expect(capture.lines()[0]).toMatchObject({ correlationId: "corr-2" });
  });
});

describe("secret masking", () => {
  it("masks credentials inside an allowlisted string field", () => {
    loggerAt("info").error("database.unreachable", {
      errorCode: "DATABASE_UNAVAILABLE",
      errorStack: "Error: connect ECONNREFUSED postgresql://calepin:s3cr3t@localhost:5434/calepin",
    });

    expect(capture.raw()).not.toContain("s3cr3t");
    expect(capture.lines()[0]).toMatchObject({ errorCode: "DATABASE_UNAVAILABLE" });
  });

  it("masks credentials bound at construction time", () => {
    createLogger({
      level: "info",
      destination: capture.stream,
      context: { httpPath: "/callback?token=abcdef123456" },
    }).info("webhook.received");

    expect(capture.raw()).not.toContain("abcdef123456");
  });
});
