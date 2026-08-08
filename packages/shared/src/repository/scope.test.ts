import { describe, expect, it } from "vitest";

import { PROJECT_OWNED_MODEL_NAMES, PROJECT_OWNED_MODELS } from "./owned-models";
import {
  assertProjectScope,
  isProjectScope,
  openProjectScope,
  projectOwnedFilter,
  type ProjectScope,
  scopedWhere,
} from "./scope";

/**
 * A scope minted the way `openProjectScope` mints one, without a database.
 *
 * The brand is a registry symbol (`Symbol.for`), so a test can reproduce it —
 * deliberately, because the brand exists to make an *accident* impossible, not
 * to resist code that has already decided to lie. What actually protects a row
 * is the `where` clause every function below builds, which names the owner as
 * well as the project.
 */
function scopeOf(ownerId: string, projectId: string): ProjectScope {
  return {
    [Symbol.for("calepin.ProjectScope")]: true,
    projectId,
    ownerId,
  } as unknown as ProjectScope;
}

const scope = scopeOf("user_a", "project_a");

/** Walks a built filter down a path and returns whatever sits at the bottom. */
function bottomOf(filter: object, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, segment) => {
    expect(node).toMatchObject({ [segment]: expect.anything() });

    return (node as Record<string, unknown>)[segment];
  }, filter);
}

describe("the owner filter", () => {
  it("filters Project on both its id and its owner", () => {
    expect(projectOwnedFilter("Project", scope)).toEqual({ id: "project_a", userId: "user_a" });
  });

  it("nests the same filter under a one-step path", () => {
    expect(projectOwnedFilter("SourceText", scope)).toEqual({
      project: { id: "project_a", userId: "user_a" },
    });
  });

  it("nests it under the longest path in the schema", () => {
    expect(projectOwnedFilter("ChapterOutlineCharacter", scope)).toEqual({
      chapterOutline: {
        chapter: { outline: { project: { id: "project_a", userId: "user_a" } } },
      },
    });
  });

  // The property that matters, asserted for all thirty-five rather than for the
  // three above: whatever the path, the bottom of the filter names the owner.
  // A path that stopped short would produce a filter constraining the project
  // and not the account, which is the bug this layer exists to make impossible.
  it.each(PROJECT_OWNED_MODEL_NAMES)("reaches the owner from %s", (model) => {
    const filter = projectOwnedFilter(model, scope);

    expect(bottomOf(filter, PROJECT_OWNED_MODELS[model].path)).toEqual({
      id: "project_a",
      userId: "user_a",
    });
  });
});

describe("scopedWhere", () => {
  it("puts the owner filter first, and the caller's conditions after it", () => {
    expect(scopedWhere("Chapter", scope, { status: "PLANNED" })).toEqual({
      AND: [{ outline: { project: { id: "project_a", userId: "user_a" } } }, { status: "PLANNED" }],
    });
  });

  // Merged into one object, a caller filtering on the same relation the path
  // walks through would overwrite the ownership clause and the query would
  // still look right. AND cannot be overwritten by a sibling key.
  it("cannot have its ownership clause overwritten by a colliding condition", () => {
    const where = scopedWhere("Character", scope, { bible: { validatedAt: null } });

    expect(where.AND[0]).toEqual({ bible: { project: { id: "project_a", userId: "user_a" } } });
    expect(where.AND).toHaveLength(2);
  });

  it("is still a complete filter with no conditions of its own", () => {
    expect(scopedWhere("Bible", scope)).toEqual({
      AND: [{ project: { id: "project_a", userId: "user_a" } }],
    });
  });
});

describe("the scope itself", () => {
  it("recognises one it minted and refuses a plain object", () => {
    expect(isProjectScope(scope)).toBe(true);
    expect(isProjectScope({ projectId: "project_a", ownerId: "user_a" })).toBe(false);
    expect(isProjectScope(null)).toBe(false);
  });

  // A server action's arguments and a queue payload are JSON. A symbol key does
  // not survive either, so a scope that crossed one of those boundaries arrives
  // unbranded and is refused rather than trusted.
  it("refuses one that was round-tripped through JSON", () => {
    const revived: unknown = JSON.parse(JSON.stringify(scope));

    expect(isProjectScope(revived)).toBe(false);
    expect(() => assertProjectScope(revived as ProjectScope)).toThrowError(
      expect.objectContaining({ code: "PROJECT_SCOPE_REQUIRED", category: "internal" }),
    );
  });

  it("refuses a branded scope with nothing in it", () => {
    for (const forged of [scopeOf("", "project_a"), scopeOf("user_a", "")]) {
      expect(() => assertProjectScope(forged)).toThrowError(
        expect.objectContaining({ code: "PROJECT_SCOPE_REQUIRED" }),
      );
    }
  });

  it("refuses to build a filter from an unproven scope", () => {
    expect(() => projectOwnedFilter("Chapter", { projectId: "p", ownerId: "u" } as ProjectScope)) //
      .toThrowError(expect.objectContaining({ code: "PROJECT_SCOPE_REQUIRED" }));
  });

  // Opening a scope for nobody would query the projects of an empty owner,
  // which returns nothing and reads exactly like a project that does not exist
  // — hiding a missing authentication check behind a plausible 404. It throws
  // before it reaches the database, which is why this needs no client.
  it("refuses to open a scope with no owner, before any query", async () => {
    await expect(openProjectScope({ ownerId: "", projectId: "project_a" })).rejects.toMatchObject({
      code: "PROJECT_SCOPE_REQUIRED",
    });
    await expect(openProjectScope({ ownerId: "user_a", projectId: "" })).rejects.toMatchObject({
      code: "PROJECT_SCOPE_REQUIRED",
    });
  });
});
