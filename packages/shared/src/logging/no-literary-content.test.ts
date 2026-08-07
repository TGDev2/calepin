import { beforeEach, describe, expect, it } from "vitest";

import { errorLogFields, ProviderError, ValidationError } from "../errors";
import { createLogCapture } from "../testing/log-capture";
import { type GenerationContext, runWithGenerationContext, runWithRequestContext } from "./context";
import { INVALID_EVENT_NAME } from "./events";
import type { LogFields } from "./fields";
import { createLogger } from "./logger";

/**
 * The test CAL-009 exists for.
 *
 * CLAUDE.md §9 bans literary content from every technical artefact and asks
 * for a test that fails if a prose field crosses the boundary. This is it.
 *
 * The stand-in for prose is a marker string. Nothing here is a fragment of
 * anyone's novel — §9 binds this file as much as it binds the logger, so the
 * fixture is a random token whose only property is being findable.
 */
const PROSE_MARKER = "PROSE-MARKER-9f2c41d7";

/**
 * Field names a caller could plausibly reach for when they have prose in hand.
 * Drawn from the glossary in CLAUDE.md §4.3 — these are the shapes the real
 * entities take, so these are the names a real leak would wear.
 */
const PROSE_FIELD_NAMES = [
  "content",
  "text",
  "prose",
  "body",
  "title",
  "sourceText",
  "excerpt",
  "summary",
  "briefSummary",
  "detailedSummary",
  "synopsis",
  "chapter",
  "chapterContent",
  "analysis",
  "direction",
  "bible",
  "characterSheet",
  "canonFact",
  "worldRule",
  "statement",
  "finding",
  "prompt",
  "promptText",
  "instructions",
  "userInstructions",
  "response",
  "completion",
  "message",
  "errorMessage",
  "payload",
] as const;

const capture = createLogCapture();
const logger = createLogger({ level: "trace", destination: capture.stream });

beforeEach(() => {
  capture.clear();
});

describe("the log field allowlist", () => {
  it.each(PROSE_FIELD_NAMES)("drops the field %s and its value", (fieldName) => {
    logger.info("generation.completed", {
      generationId: "gen-1",
      [fieldName]: PROSE_MARKER,
    } as unknown as LogFields);

    expect(capture.raw()).not.toContain(PROSE_MARKER);
    expect(capture.raw()).not.toContain(fieldName);
    // The line is still emitted, and still useful.
    expect(capture.lines()[0]).toMatchObject({
      msg: "generation.completed",
      generationId: "gen-1",
    });
  });

  it("drops a whole narrative entity passed as fields", () => {
    const chapter = {
      id: "chapter-1",
      title: PROSE_MARKER,
      content: PROSE_MARKER,
      briefSummary: PROSE_MARKER,
    };

    logger.info("chapter.persisted", chapter as unknown as LogFields);

    expect(capture.raw()).not.toContain(PROSE_MARKER);
  });

  it("drops an object hiding under an allowlisted key", () => {
    logger.info("chapter.persisted", {
      chapterId: { id: "chapter-1", content: PROSE_MARKER },
    } as unknown as LogFields);

    expect(capture.raw()).not.toContain(PROSE_MARKER);
    expect(capture.lines()[0]).not.toHaveProperty("chapterId");
  });

  it("drops an array hiding under an allowlisted key", () => {
    logger.warn("coherence.audited", {
      itemCount: [PROSE_MARKER, PROSE_MARKER],
    } as unknown as LogFields);

    expect(capture.raw()).not.toContain(PROSE_MARKER);
  });

  it("drops prose bound to a child logger", () => {
    const child = logger.child({
      projectId: "project-1",
      sourceText: PROSE_MARKER,
    } as unknown as LogFields);

    child.info("analysis.started");

    expect(capture.raw()).not.toContain(PROSE_MARKER);
    expect(capture.lines()[0]).toMatchObject({ projectId: "project-1" });
  });

  it("drops prose smuggled through the ambient context", () => {
    runWithRequestContext({ correlationId: "corr-1" }, () => {
      runWithGenerationContext(
        { generationId: "gen-1", excerpt: PROSE_MARKER } as unknown as GenerationContext,
        () => {
          logger.error("generation.failed", { errorCode: "PROVIDER_TIMEOUT" });
        },
      );
    });

    expect(capture.raw()).not.toContain(PROSE_MARKER);
    expect(capture.lines()[0]).toMatchObject({
      correlationId: "corr-1",
      generationId: "gen-1",
      errorCode: "PROVIDER_TIMEOUT",
    });
  });

  it("rejects a prose field at compile time, not only at runtime", () => {
    logger.info("chapter.persisted", {
      chapterId: "chapter-1",
      // @ts-expect-error — `content` is not on the allowlist, and widening
      // LogFields to accept it would make this directive unused and fail
      // `pnpm typecheck`. The compile-time guarantee is the point of the
      // directive; deleting it deletes the guarantee.
      content: PROSE_MARKER,
    });

    expect(capture.raw()).not.toContain(PROSE_MARKER);
  });
});

/**
 * `errorLogFields` (CAL-010) is the one producer that hands the logger a field
 * it did not build by hand. An error's message is developer-authored, but its
 * *cause* is whatever a provider, a driver or a validator threw — and the first
 * line of any stack is `Name: message`. These cases are what keep that from
 * being the way prose gets in.
 */
describe("the error field producer", () => {
  it("emits no message, however the error was built", () => {
    logger.error("generation.failed", errorLogFields(new ProviderError({ message: PROSE_MARKER })));

    expect(capture.raw()).not.toContain(PROSE_MARKER);
    expect(capture.lines()[0]).toMatchObject({
      errorCode: "PROVIDER_UNAVAILABLE",
      errorCategory: "provider",
    });
  });

  it("emits no message from a cause thrown by something else", () => {
    const thrown = new Error(`provider refused: ${PROSE_MARKER}`);

    logger.error("generation.failed", errorLogFields(thrown));

    expect(capture.raw()).not.toContain(PROSE_MARKER);
  });

  it("emits no message from deep in a cause chain", () => {
    const deep = new Error("outer", { cause: new Error(`inner ${PROSE_MARKER}`) });

    logger.error("generation.failed", errorLogFields(deep));

    expect(capture.raw()).not.toContain(PROSE_MARKER);
  });

  it("emits no multi-line message whose lines are shaped like stack frames", () => {
    // The exact shape that defeats a naive `startsWith("at ")` filter.
    const error = new Error("failed");
    error.stack = [
      `Error: failed`,
      `    at ${PROSE_MARKER}`,
      `    at the opening of the third chapter, ${PROSE_MARKER}`,
      `    at buildContext (C:\\src\\context.ts:12:34)`,
    ].join("\n");

    logger.error("generation.failed", errorLogFields(error));

    expect(capture.raw()).not.toContain(PROSE_MARKER);
    expect(capture.raw()).toContain("buildContext");
  });

  it("emits the path of a field that failed validation, never its value", () => {
    logger.error(
      "validation.failed",
      errorLogFields(
        new ValidationError({ fieldPath: "characters.0.name", cause: new Error(PROSE_MARKER) }),
      ),
    );

    expect(capture.raw()).not.toContain(PROSE_MARKER);
    expect(capture.lines()[0]).toMatchObject({ fieldPath: "characters.0.name" });
  });
});

describe("the event name", () => {
  const PROSE_EVENTS = [
    `Le chapitre ${PROSE_MARKER} a été écrit`,
    PROSE_MARKER,
    `generation.completed — ${PROSE_MARKER}`,
    `wrote: "${PROSE_MARKER}"`,
  ];

  it.each(PROSE_EVENTS)("replaces a message that is not an event name", (event) => {
    logger.info(event, { generationId: "gen-1" });

    expect(capture.raw()).not.toContain(PROSE_MARKER);
    expect(capture.lines()[0]).toMatchObject({ msg: INVALID_EVENT_NAME, generationId: "gen-1" });
  });

  it("keeps a well-formed event name", () => {
    logger.info("generation.completed", { generationId: "gen-1" });

    expect(capture.lines()[0]).toMatchObject({ msg: "generation.completed" });
  });
});
