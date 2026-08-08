import { describe, expect, it } from "vitest";

import {
  delegateName,
  isProjectOwnedModel,
  PROJECT_OWNED_MODEL_NAMES,
  PROJECT_OWNED_MODELS,
  PROJECT_OWNER_FIELD,
  UNOWNED_MODELS,
} from "./owned-models";

/**
 * The registry's own shape. Whether it matches `schema.prisma` is
 * `prisma/schema.test.ts`'s question, and whether the filters it produces
 * actually isolate one owner from another is the integration suite's; this file
 * asserts the invariants that make both of those meaningful.
 */
describe("the project-owned model registry", () => {
  it("names one owner column, and it is Project's", () => {
    expect(PROJECT_OWNER_FIELD).toBe("userId");
    expect(PROJECT_OWNED_MODELS.Project.path).toEqual([]);
  });

  it("gives every other model a path that ends at the project", () => {
    for (const model of PROJECT_OWNED_MODEL_NAMES) {
      if (model === "Project") continue;

      const { path } = PROJECT_OWNED_MODELS[model];

      expect(path.length).toBeGreaterThan(0);
      expect(path.at(-1)).toBe("project");
    }
  });

  it("names each relation segment the way a Prisma field is named", () => {
    for (const model of PROJECT_OWNED_MODEL_NAMES) {
      for (const segment of PROJECT_OWNED_MODELS[model].path) {
        expect(segment).toMatch(/^[a-z][A-Za-z0-9]*$/);
      }
    }
  });

  it("maps each model to its own table", () => {
    const tables = PROJECT_OWNED_MODEL_NAMES.map((model) => PROJECT_OWNED_MODELS[model].table);

    expect(new Set(tables).size).toBe(tables.length);
    for (const table of tables) expect(table).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  // An account is not project data — it is the owner. Reading one belongs to
  // CAL-024 and to its own rule, so it must not silently acquire a project
  // filter that would make no sense on it.
  it("leaves User out, and says so out loud", () => {
    expect(UNOWNED_MODELS).toEqual(["User"]);
    expect(isProjectOwnedModel("User")).toBe(false);
    expect(isProjectOwnedModel(undefined)).toBe(false);
    expect(isProjectOwnedModel("Chapter")).toBe(true);
  });

  it("derives the client delegate from the model name", () => {
    expect(delegateName("Project")).toBe("project");
    expect(delegateName("CanonFactBelief")).toBe("canonFactBelief");
  });
});
