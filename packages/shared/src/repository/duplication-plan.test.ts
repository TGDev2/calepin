/**
 * The duplication plan's internal consistency (CAL-035).
 *
 * What this suite can prove without a schema: that the plan is a partition of
 * the registry, that its order is topological, and that no reference names
 * something the copier cannot resolve. What it cannot prove — that the columns
 * are the schema's columns, and that they point where the plan says — is
 * `prisma/schema.test.ts`'s half of the job.
 */

import { describe, expect, it } from "vitest";

import {
  DUPLICATED_MODEL_NAMES,
  DUPLICATION_PLAN,
  type DuplicationTarget,
  isUnduplicatedModel,
  NEVER_COPIED_COLUMNS,
  UNDUPLICATED_MODELS,
} from "./duplication-plan";
import { PROJECT_OWNED_MODEL_NAMES } from "./owned-models";

const unduplicated = Object.keys(UNDUPLICATED_MODELS);

describe("the duplication plan", () => {
  it("covers every project-owned model exactly once, as copied or as left behind", () => {
    // `Project` is neither: it is the row the copy is *of*, created by the
    // copier itself and seeded into the identity map.
    const accounted = [...DUPLICATED_MODEL_NAMES, ...unduplicated, "Project"].sort();

    expect(accounted).toEqual([...PROJECT_OWNED_MODEL_NAMES].sort());
    expect(new Set(accounted).size).toBe(accounted.length);
  });

  it("gives every model it leaves behind a reason", () => {
    for (const [model, reason] of Object.entries(UNDUPLICATED_MODELS)) {
      expect(reason, model).not.toBe("");
    }
  });

  it("names a known model in every reference", () => {
    const known = new Set<string>([...PROJECT_OWNED_MODEL_NAMES, "User"]);

    for (const step of DUPLICATION_PLAN) {
      for (const [column, target] of Object.entries(step.references)) {
        expect(known.has(target), `${step.model}.${column}`).toBe(true);
      }
    }
  });

  it("orders the models so a copied reference is always already allocated", () => {
    const allocated = new Set<string>(["Project"]);

    for (const step of DUPLICATION_PLAN) {
      // The model's own identifiers are allocated before its rows are written,
      // so a reference to itself is resolvable inside its own step.
      allocated.add(step.model);

      for (const [column, target] of Object.entries(step.references)) {
        if (target === "User" || isUnduplicatedModel(target)) continue;

        expect(allocated.has(target), `${step.model}.${column} → ${target}`).toBe(true);
      }
    }
  });

  it("never declares a reference on a column the copy does not carry", () => {
    for (const step of DUPLICATION_PLAN) {
      for (const column of NEVER_COPIED_COLUMNS) {
        expect(Object.hasOwn(step.references, column), `${step.model}.${column}`).toBe(false);
      }
    }
  });

  it("recognises exactly the models left behind", () => {
    const isLeftBehind = (model: DuplicationTarget): boolean => isUnduplicatedModel(model);

    for (const model of PROJECT_OWNED_MODEL_NAMES) {
      expect(isLeftBehind(model), model).toBe(unduplicated.includes(model));
    }

    expect(isLeftBehind("User")).toBe(false);
  });

  it("gives every reference one of the four treatments the copier knows", () => {
    const copied = new Set<string>(DUPLICATED_MODEL_NAMES);

    for (const step of DUPLICATION_PLAN) {
      for (const [column, target] of Object.entries(step.references)) {
        const treatment =
          target === "User"
            ? "kept"
            : target === "Project"
              ? "the copy's own project"
              : isUnduplicatedModel(target)
                ? "nulled"
                : copied.has(target)
                  ? "remapped"
                  : "none";

        expect(treatment, `${step.model}.${column} → ${target}`).not.toBe("none");
      }
    }
  });
});
