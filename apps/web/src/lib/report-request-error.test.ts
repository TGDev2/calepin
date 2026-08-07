import { createLogger } from "@calepin/shared/logging";
import { createLogCapture } from "@calepin/shared/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { CORRELATION_ID_HEADER } from "./correlation-header";
import { reportRequestError } from "./report-request-error";

const capture = createLogCapture();
const logger = createLogger({ level: "trace", destination: capture.stream });

const REQUEST = {
  path: "/projects/project-1",
  method: "GET",
  headers: { [CORRELATION_ID_HEADER]: "corr-0123456789" },
};

const CONTEXT = { routeType: "render" };

/** Stands in for anything a novel could be read out of. See CLAUDE.md §9. */
const PROSE_MARKER = "PROSE-MARKER-1a55e0c4";

beforeEach(() => {
  capture.clear();
});

describe("reportRequestError", () => {
  it("logs one line, classified by the kind of route that failed", () => {
    reportRequestError(new Error("boom"), REQUEST, CONTEXT, logger);

    expect(capture.lines()).toHaveLength(1);
    expect(capture.lines()[0]).toMatchObject({
      level: "error",
      msg: "request.render-failed",
      errorCategory: "internal",
      errorCode: "INTERNAL_ERROR",
      errorName: "Error",
      httpMethod: "GET",
      httpPath: "/projects/project-1",
      httpStatus: 500,
    });
  });

  it.each([
    ["render", "request.render-failed"],
    ["route", "request.route-failed"],
    ["action", "request.action-failed"],
    ["proxy", "request.proxy-failed"],
    ["something-new", "request.failed"],
  ])("names the event for a %s failure", (routeType, event) => {
    reportRequestError(new Error("boom"), REQUEST, { routeType }, logger);

    expect(capture.lines()[0]).toMatchObject({ msg: event });
  });

  it("carries the correlation id from the request", () => {
    reportRequestError(new Error("boom"), REQUEST, CONTEXT, logger);

    expect(capture.lines()[0]).toMatchObject({ correlationId: "corr-0123456789" });
  });

  it("takes the first value when a header arrives repeated", () => {
    reportRequestError(
      new Error("boom"),
      { ...REQUEST, headers: { [CORRELATION_ID_HEADER]: ["corr-0123456789", "corr-second"] } },
      CONTEXT,
      logger,
    );

    expect(capture.lines()[0]).toMatchObject({ correlationId: "corr-0123456789" });
  });

  it("refuses a malformed correlation id rather than echoing it", () => {
    reportRequestError(
      new Error("boom"),
      { ...REQUEST, headers: { [CORRELATION_ID_HEADER]: `bad id\n${PROSE_MARKER}` } },
      CONTEXT,
      logger,
    );

    expect(capture.raw()).not.toContain(PROSE_MARKER);
    expect(capture.lines()[0]).not.toHaveProperty("correlationId");
  });

  it("logs the digest, so the reference on screen is findable in the trace", () => {
    const error = Object.assign(new Error("boom"), { digest: "3520148804" });

    reportRequestError(error, REQUEST, CONTEXT, logger);

    expect(capture.lines()[0]).toMatchObject({ errorDigest: "3520148804" });
  });

  it("maps a typed error to its own status and code", async () => {
    const { NotFoundError } = await import("@calepin/shared/errors");

    reportRequestError(new NotFoundError(), REQUEST, CONTEXT, logger);

    expect(capture.lines()[0]).toMatchObject({
      errorCode: "NOT_FOUND",
      errorCategory: "not_found",
      httpStatus: 404,
    });
  });

  it("never emits a message, a French one included", async () => {
    const { ProviderError } = await import("@calepin/shared/errors");

    reportRequestError(
      new ProviderError({ message: PROSE_MARKER, cause: new Error(PROSE_MARKER) }),
      REQUEST,
      CONTEXT,
      logger,
    );

    expect(capture.raw()).not.toContain(PROSE_MARKER);
    expect(capture.lines()[0]).not.toHaveProperty("errorMessage");
  });

  it("survives a value that is not an error at all", () => {
    reportRequestError(PROSE_MARKER, REQUEST, CONTEXT, logger);

    expect(capture.raw()).not.toContain(PROSE_MARKER);
    expect(capture.lines()[0]).toMatchObject({ errorCode: "INTERNAL_ERROR" });
  });

  it("never throws, whatever it is handed", () => {
    // Next catches a throwing hook and reports it with console.error, which §7
    // forbids us from producing. One failure must not become two.
    const hostile = {
      get digest(): never {
        throw new Error("nice try");
      },
    };

    expect(() =>
      reportRequestError(
        hostile,
        { path: "/", method: "GET", headers: {} },
        { routeType: "render" },
        logger,
      ),
    ).not.toThrow();
  });
});
