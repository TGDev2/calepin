import { describe, expect, it } from "vitest";

import {
  GENERATION_KEY_PATTERN,
  generationIdempotencyKey,
  type GenerationKeyInput,
  isGenerationIdempotencyKey,
} from "./key";

/**
 * The key is the identity of an *ask*. Every test here asks one of two
 * questions about it: does it stay the same when the ask does, and does it move
 * when the ask does. Both halves matter — a key that never moved would
 * deduplicate two different requests into one, and a key that moved on nothing
 * would enqueue one request twice, which is the cost this task exists to stop
 * being charged.
 *
 * Every payload below is technical (§9): identifiers, counts and options, never
 * an instruction and never prose.
 */
const ASK: GenerationKeyInput = {
  mission: "WRITE_SCENE",
  projectId: "prj_1",
  targetId: "chp_1",
  input: { chapterOrderKey: "i", targetWordCount: 1200, baseRevisionId: "rev_3" },
};

describe("the shape of a key", () => {
  it("is sixty-four lowercase hex characters", () => {
    const key = generationIdempotencyKey(ASK);

    expect(key).toMatch(GENERATION_KEY_PATTERN);
    expect(isGenerationIdempotencyKey(key)).toBe(true);
  });

  it("carries nothing a reader could read", () => {
    // §9: the payload may hold the author's own instruction, and the key ends
    // up in an index, in a unique-violation payload and in any log line that
    // names it. A digest carries none of it — including the identifiers, which
    // is what makes the assertion total rather than a list of exceptions.
    const key = generationIdempotencyKey({
      ...ASK,
      input: { instruction: "PLOT-DIRECTIVE-TOKEN", baseRevisionId: "rev_3" },
    });

    expect(key).not.toContain("PLOT-DIRECTIVE-TOKEN");
    expect(key).not.toContain("WRITE_SCENE");
    expect(key).not.toContain("prj_1");
  });

  it("refuses what a key is not", () => {
    expect(isGenerationIdempotencyKey("")).toBe(false);
    expect(isGenerationIdempotencyKey("Z".repeat(64))).toBe(false);
    expect(isGenerationIdempotencyKey("a".repeat(63))).toBe(false);
    // Uppercase hex is a different spelling of the same digest, and a column
    // holding both spellings would hold one ask twice.
    expect(isGenerationIdempotencyKey("A".repeat(64))).toBe(false);
    expect(isGenerationIdempotencyKey(null)).toBe(false);
  });
});

describe("the same ask", () => {
  it("hashes to the same key twice", () => {
    expect(generationIdempotencyKey(ASK)).toBe(generationIdempotencyKey(ASK));
  });

  it("hashes to the same key whatever order the payload was built in", () => {
    // The failure this closes is invisible: two call sites building the same
    // object in two orders would enqueue the ask twice and pay twice, and
    // nothing about either call site would look wrong.
    const reordered = generationIdempotencyKey({
      ...ASK,
      input: { baseRevisionId: "rev_3", targetWordCount: 1200, chapterOrderKey: "i" },
    });

    expect(reordered).toBe(generationIdempotencyKey(ASK));
  });

  it("treats an absent field and an explicitly undefined one as the same ask", () => {
    // Which is what Prisma stores, so two payloads the database cannot tell
    // apart must not produce two keys.
    expect(
      generationIdempotencyKey({ ...ASK, input: { chapterOrderKey: "i", note: undefined } }),
    ).toBe(generationIdempotencyKey({ ...ASK, input: { chapterOrderKey: "i" } }));
  });

  it("treats an absent target and a null one as the same ask", () => {
    expect(generationIdempotencyKey({ ...ASK, targetId: null })).toBe(
      generationIdempotencyKey({
        mission: ASK.mission,
        projectId: ASK.projectId,
        input: ASK.input,
      }),
    );
  });
});

describe("a different ask", () => {
  it("moves with the mission", () => {
    expect(generationIdempotencyKey({ ...ASK, mission: "EXTRACT_FACTS" })).not.toBe(
      generationIdempotencyKey(ASK),
    );
  });

  it("moves with the project", () => {
    expect(generationIdempotencyKey({ ...ASK, projectId: "prj_2" })).not.toBe(
      generationIdempotencyKey(ASK),
    );
  });

  it("moves with the target", () => {
    expect(generationIdempotencyKey({ ...ASK, targetId: "chp_2" })).not.toBe(
      generationIdempotencyKey(ASK),
    );
  });

  it("moves with the version the inputs name", () => {
    // *La version des entrées*, and the whole reason a regeneration is a
    // different ask from the one before it: the payload names the revision it
    // starts from, and that revision moved.
    expect(
      generationIdempotencyKey({
        ...ASK,
        input: { ...(ASK.input as object), baseRevisionId: "rev_4" },
      }),
    ).not.toBe(generationIdempotencyKey(ASK));
  });

  it("moves with the order of a list, which is information", () => {
    expect(generationIdempotencyKey({ ...ASK, input: { ids: ["a", "b"] } })).not.toBe(
      generationIdempotencyKey({ ...ASK, input: { ids: ["b", "a"] } }),
    );
  });

  it("does not confuse a nested shape with a flattened one", () => {
    expect(generationIdempotencyKey({ ...ASK, input: { a: { b: 1 } } })).not.toBe(
      generationIdempotencyKey({ ...ASK, input: { "a.b": 1 } }),
    );
  });

  it("does not confuse a number with the string of it", () => {
    expect(generationIdempotencyKey({ ...ASK, input: { n: 1 } })).not.toBe(
      generationIdempotencyKey({ ...ASK, input: { n: "1" } }),
    );
  });
});

describe("a payload the column could not hold", () => {
  it.each([
    ["a date", { at: new Date(0) }],
    ["a map", { m: new Map() }],
    ["a function", { f: () => undefined }],
    ["a bigint", { n: 1n }],
    ["an infinity", { n: Number.POSITIVE_INFINITY }],
    ["a NaN", { n: Number.NaN }],
  ])("throws rather than hashing it: %s", (_label, input) => {
    // `Generation.input` is JSON. A payload carrying one of these could not be
    // stored either, so failing here is failing at the call site rather than at
    // the write — and the field path says where, never what (§6, §9).
    expect(() => generationIdempotencyKey({ ...ASK, input })).toThrow(/JSON cannot represent/);
  });

  it("names the path it failed at and never the value", () => {
    try {
      generationIdempotencyKey({ ...ASK, input: { options: { at: new Date(0) } } });
      expect.unreachable("a date should not be hashable");
    } catch (error: unknown) {
      expect(error).toMatchObject({ fieldPath: "input.options.at" });
    }
  });
});
