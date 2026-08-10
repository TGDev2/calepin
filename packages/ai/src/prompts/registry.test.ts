/**
 * The registry's own invariants (CAL-053).
 *
 * Three of them cannot be expressed in a type, and all three are how a prompt
 * quietly stops being what it says:
 *
 *  1. **Versions are append-only and ordered.** The current prompt is the last
 *     element, and `promptVersion` on an attempt points at a fixed text — both
 *     claims are false the moment a version is renumbered or inserted.
 *  2. **The declaration and the text agree, in both directions.** A placeholder
 *     nobody declared ships `{{chapterOutline}}` to a provider; a variable
 *     nobody uses is a value the composer computes for nothing, and the day it
 *     is misspelt in the text nothing complains.
 *  3. **Every mission has exactly one prompt.** The pipeline finds a prompt by
 *     mission; a mission with none cannot run, and a mission with two is a
 *     silent choice between them.
 *
 * No literary content lives here (§9): a prompt is an instruction to a model,
 * and what the model is *given* — the variables — never enters this file.
 */

import { describe, expect, it } from "vitest";

import { MISSION_IDS } from "../missions";
import {
  currentPrompt,
  missionPrompt,
  PROMPT_REGISTRY,
  promptAtVersion,
  promptVersions,
} from "./registry";
import { placeholdersOf, renderPrompt } from "./render";
import { PROMPT_IDS, type PromptDefinition, type PromptId, type PromptVariableType } from "./types";

const ENTRIES = Object.entries(PROMPT_REGISTRY) as [PromptId, readonly PromptDefinition[]][];

/** A value of the declared kind — the shape, not the content (§9). */
function sampleValue(type: PromptVariableType): string | number | readonly string[] {
  switch (type) {
    case "text":
      return "x";
    case "number":
      return 1;
    case "list":
      return ["x"];
  }
}

describe("the registry covers exactly the declared prompt ids", () => {
  it("holds one entry per id, keyed by it", () => {
    expect(Object.keys(PROMPT_REGISTRY).sort()).toEqual([...PROMPT_IDS].sort());
  });

  it.each(ENTRIES)("%s declares its own id on every version", (id, versions) => {
    for (const definition of versions) {
      expect(definition.id).toBe(id);
    }
  });
});

describe("versions are append-only", () => {
  it.each(ENTRIES)(
    "%s numbers from 1, strictly increasing, ending on the current one",
    (id, versions) => {
      expect(versions.length).toBeGreaterThan(0);
      expect(versions[0]?.version).toBe(1);

      for (let index = 1; index < versions.length; index += 1) {
        expect(versions[index]?.version).toBeGreaterThan(versions[index - 1]?.version ?? 0);
      }

      const highest = Math.max(...versions.map((definition) => definition.version));

      expect(currentPrompt(id).version).toBe(highest);
      expect(promptVersions(id)).toBe(versions);
    },
  );

  it("reaches an older version by number, and refuses one nobody shipped", () => {
    expect(promptAtVersion("write-scene", 1).version).toBe(1);
    expect(() => promptAtVersion("write-scene", 99)).toThrowError(
      expect.objectContaining({ code: "PROMPT_NOT_REGISTERED", fieldPath: "write-scene@99" }),
    );
  });
});

describe("the declaration and the text agree", () => {
  it.each(ENTRIES)("%s declares every placeholder its text uses", (_id, versions) => {
    for (const definition of versions) {
      const used = new Set([
        ...placeholdersOf(definition.system),
        ...placeholdersOf(definition.instruction),
      ]);
      const declared = new Set(definition.variables.map((variable) => variable.name));

      expect([...used].filter((name) => !declared.has(name))).toEqual([]);
    }
  });

  it.each(ENTRIES)("%s uses every variable it declares", (_id, versions) => {
    for (const definition of versions) {
      const used = new Set([
        ...placeholdersOf(definition.system),
        ...placeholdersOf(definition.instruction),
      ]);

      expect(definition.variables.filter((variable) => !used.has(variable.name))).toEqual([]);
    }
  });

  it.each(ENTRIES)("%s declares each variable once, named and described", (_id, versions) => {
    for (const definition of versions) {
      const names = definition.variables.map((variable) => variable.name);

      expect(new Set(names).size).toBe(names.length);

      for (const variable of definition.variables) {
        // `camelCase`, per §4.2 — the placeholder pattern only matches that.
        expect(variable.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        expect(variable.description.trim()).not.toBe("");
      }
    }
  });

  it.each(ENTRIES)("%s renders with no hole left in it", (_id, versions) => {
    // The end-to-end version of the two checks above: a resource that renders
    // clean from its own declaration cannot ship `{{...}}` to a provider.
    for (const definition of versions) {
      const values = Object.fromEntries(
        definition.variables.map((variable) => [variable.name, sampleValue(variable.type)]),
      );
      const rendered = renderPrompt(definition, values as never);

      expect(rendered.system).not.toContain("{{");
      expect(rendered.text).not.toContain("{{");
    }
  });
});

describe("every mission has exactly one prompt", () => {
  it.each(MISSION_IDS)("%s has a current prompt, scoped to it", (missionId) => {
    const definition = missionPrompt(missionId);

    expect(definition.scope).toEqual({ kind: "mission", missionId });
    expect(definition.instruction.trim()).not.toBe("");
    expect(definition.system.trim()).not.toBe("");
  });

  it("has no mission served by two prompts", () => {
    const missions = ENTRIES.flatMap(([id]) => {
      const { scope } = currentPrompt(id);

      return scope.kind === "mission" ? [scope.missionId] : [];
    });

    expect(new Set(missions).size).toBe(missions.length);
    expect(missions.length).toBe(MISSION_IDS.length);
  });

  it("keeps the pipeline's own prompt out of that mapping", () => {
    // It serves every mission and names none; a fake mission for it would make
    // one mission's prompt ambiguous.
    expect(currentPrompt("repair-structured-output").scope).toEqual({ kind: "pipeline" });
  });
});
