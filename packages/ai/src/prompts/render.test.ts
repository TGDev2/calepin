/**
 * Rendering: the only way a prompt becomes text, and the only way a version
 * number gets attached to a call (CAL-053).
 *
 * Two families of assertion. What must reach the provider — the variables,
 * filled in, in their declared shape — and what must never: a hole, a value of
 * the wrong kind, or text that came from somewhere other than a resource.
 */

import { describe, expect, it } from "vitest";

import { assertMissionPrompt, placeholdersOf, renderPrompt } from "./render";
import { isRenderedPrompt, type MissionPrompt, type PromptDefinition } from "./types";

const DEFINITION: PromptDefinition = {
  id: "extract-facts",
  version: 3,
  scope: { kind: "mission", missionId: "extract-facts" },
  variables: [
    { name: "language", type: "text", description: "The writing language." },
    { name: "chapterCount", type: "number", description: "How many chapters precede this one." },
    { name: "knownFacts", type: "list", description: "Facts already recorded." },
  ],
  system: "SYSTEM {{language}}",
  instruction: "BODY {{chapterCount}}\n{{knownFacts}}",
};

const VALUES = { language: "fr", chapterCount: 4, knownFacts: ["alpha", "beta"] };

describe("renderPrompt — what reaches the provider", () => {
  it("fills the variables into both halves of the resource", () => {
    const rendered = renderPrompt(DEFINITION, VALUES);

    expect(rendered.system).toBe("SYSTEM fr");
    expect(rendered.text).toBe("BODY 4\n- alpha\n- beta");
  });

  it("renders an empty list as a dash rather than as nothing", () => {
    // The one way an optional section is expressed: a hole left blank reads as
    // a mistake to a model, and a French placeholder here would put prompt text
    // outside the resource that owns it.
    const rendered = renderPrompt(DEFINITION, { ...VALUES, knownFacts: [] });

    expect(rendered.text).toBe("BODY 4\n—");
  });

  it("inserts a value verbatim, even one that looks like a placeholder", () => {
    // Composed context routinely carries braces — an author's own text, a JSON
    // excerpt. A second pass over the filled text would read one of them as an
    // instruction, which is the one way a variable could rewrite the prompt.
    const rendered = renderPrompt(DEFINITION, { ...VALUES, language: "{{chapterCount}}" });

    expect(rendered.system).toBe("SYSTEM {{chapterCount}}");
  });
});

describe("renderPrompt — the version it stamps", () => {
  it("carries the resource's id and version, and its mission when it has one", () => {
    const rendered = renderPrompt(DEFINITION, VALUES);

    expect(rendered.promptId).toBe("extract-facts");
    expect(rendered.version).toBe(3);
    expect(rendered.missionId).toBe("extract-facts");
    expect(isRenderedPrompt(rendered)).toBe(true);
  });

  it("names no mission for a pipeline prompt", () => {
    const pipeline: PromptDefinition = {
      ...DEFINITION,
      id: "repair-structured-output",
      scope: { kind: "pipeline" },
    };

    expect(renderPrompt(pipeline, VALUES).missionId).toBeUndefined();
  });
});

describe("renderPrompt — what it refuses", () => {
  it.each([
    ["a missing variable", { language: "fr", chapterCount: 4 }],
    ["an empty text", { ...VALUES, language: "  " }],
    ["a number where a text belongs", { ...VALUES, language: 7 }],
    ["a text where a number belongs", { ...VALUES, chapterCount: "4" }],
    ["a text where a list belongs", { ...VALUES, knownFacts: "alpha" }],
    ["a list of something other than text", { ...VALUES, knownFacts: [1, 2] }],
  ])("refuses %s, naming the variable and never its value", (_label, values) => {
    // A throw, not a `Result`: the values come from our own composer, so this
    // is a call-site bug and it would fail on every call (§7).
    expect(() => renderPrompt(DEFINITION, values as never)).toThrowError(
      expect.objectContaining({ code: "PROMPT_VARIABLE_INVALID", category: "internal" }),
    );
  });

  it("refuses a placeholder the resource does not declare", () => {
    const holed: PromptDefinition = { ...DEFINITION, instruction: "BODY {{chapterOutline}}" };

    expect(() => renderPrompt(holed, VALUES)).toThrowError(
      expect.objectContaining({ code: "PROMPT_VARIABLE_INVALID", fieldPath: "chapterOutline" }),
    );
  });

  it("says which variable failed, and states its declared type rather than its value", () => {
    try {
      renderPrompt(DEFINITION, { ...VALUES, language: "" } as never);
      expect.unreachable("the render was expected to refuse an empty text");
    } catch (error: unknown) {
      expect(error).toMatchObject({ fieldPath: "language:text" });
      // The message is the first line of a stack, so it carries no data (§7).
      expect((error as Error).message).not.toContain("language");
    }
  });
});

describe("assertMissionPrompt", () => {
  it("accepts what the registry rendered", () => {
    expect(() =>
      assertMissionPrompt(renderPrompt(DEFINITION, VALUES) as MissionPrompt),
    ).not.toThrow();
  });

  it.each([
    [
      "a hand-built object wearing the same fields",
      { promptId: "extract-facts", version: 1, missionId: "extract-facts", system: "s", text: "t" },
    ],
    ["a value that crossed a serialisation boundary", { promptId: "extract-facts", version: 1 }],
  ])("refuses %s", (_label, forged) => {
    // The brand is what makes §5.2 structural: text that did not come from a
    // versioned resource cannot reach a provider, whatever it looks like.
    expect(() => assertMissionPrompt(forged as unknown as MissionPrompt)).toThrowError(
      expect.objectContaining({ code: "PROMPT_NOT_RENDERED", category: "internal" }),
    );
  });
});

describe("placeholdersOf", () => {
  it("finds each placeholder once, and reads no stray brace as one", () => {
    expect(placeholdersOf("a {{one}} b {{two}} c {{one}} d { three } e {{ four }}")).toEqual([
      "one",
      "two",
    ]);
  });
});
