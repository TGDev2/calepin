/**
 * The remapping rule (CAL-035), exercised without a database — the criterion
 * "no reference points at the original" is decided here, row by row, and only
 * confirmed against a real graph by the integration suite.
 */

import { describe, expect, it } from "vitest";

import { isAppError } from "../errors/app-error";
import { remapCopiedRow } from "./duplication-row";

const idsBySourceId = new Map<string, string>([
  ["prj_source", "prj_copy"],
  ["chp_source", "chp_copy"],
  ["chr_source", "chr_copy"],
]);

function remap(
  row: Record<string, unknown>,
  references: Record<string, "Project" | "Chapter" | "Character" | "User" | "Generation">,
): Record<string, unknown> {
  return remapCopiedRow({
    model: "Chapter",
    row,
    references,
    newId: "new_id",
    newIdsBySourceId: idsBySourceId,
  });
}

describe("remapCopiedRow", () => {
  it("replaces the identifier with the one allocated for the copy", () => {
    expect(remap({ id: "chp_source" }, {})["id"]).toBe("new_id");
  });

  it("drops the five columns that describe the row's own life, not the narrative", () => {
    const copy = remap(
      {
        id: "chp_source",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-02-02"),
        updatedById: "usr_other",
        version: 7,
        orderKey: "i",
      },
      {},
    );

    expect(Object.keys(copy).sort()).toEqual(["id", "orderKey"]);
  });

  it("carries every other column verbatim, arrays and nulls included", () => {
    const copy = remap(
      { id: "chp_source", status: "VALIDATED", themes: ["a", "b"], lockedAt: null, wordCount: 12 },
      {},
    );

    expect(copy).toMatchObject({
      status: "VALIDATED",
      themes: ["a", "b"],
      lockedAt: null,
      wordCount: 12,
    });
  });

  it("rewrites a reference to a copied row through the identity map", () => {
    const copy = remap({ id: "chp_source", partId: "chp_source" }, { partId: "Chapter" });

    expect(copy["partId"]).toBe("chp_copy");
  });

  it("rewrites the project reference to the copy's own project", () => {
    const copy = remap({ id: "chp_source", projectId: "prj_source" }, { projectId: "Project" });

    expect(copy["projectId"]).toBe("prj_copy");
  });

  it("keeps a reference to a user — a duplication never changes hands", () => {
    const copy = remap({ id: "chp_source", createdById: "usr_1" }, { createdById: "User" });

    expect(copy["createdById"]).toBe("usr_1");
  });

  it("nulls a reference to a model the copy leaves behind", () => {
    const copy = remap({ id: "chp_source", generationId: "gen_1" }, { generationId: "Generation" });

    expect(copy["generationId"]).toBeNull();
  });

  it("leaves a null reference null rather than resolving it", () => {
    const copy = remap({ id: "chp_source", partId: null }, { partId: "Chapter" });

    expect(copy["partId"]).toBeNull();
  });

  it("refuses a reference the map does not hold rather than copying it through", () => {
    // The whole criterion of the task, as a single assertion: an unresolvable
    // reference is a row of the original, and carrying it would be the cross
    // reference the copy exists to avoid.
    expect(() =>
      remap({ id: "chp_source", partId: "chp_elsewhere" }, { partId: "Chapter" }),
    ).toThrowError(expect.objectContaining({ code: "PROJECT_DUPLICATION_INCOMPLETE" }));
  });

  it("says where an unresolvable reference was, never what it held", () => {
    try {
      remap({ id: "chp_source", partId: "chp_elsewhere" }, { partId: "Chapter" });
      expect.unreachable("the reference should not have resolved");
    } catch (error: unknown) {
      if (!isAppError(error)) throw error;

      expect(error.fieldPath).toBe("Chapter.partId");
      expect(error.message).not.toContain("chp_elsewhere");
    }
  });

  it("refuses a reference column holding something that is not an identifier", () => {
    expect(() => remap({ id: "chp_source", partId: 42 }, { partId: "Chapter" })).toThrowError(
      expect.objectContaining({ fieldPath: "Chapter.partId" }),
    );
  });

  it("ignores a declared reference the row does not carry", () => {
    const copy = remap({ id: "chp_source" }, { partId: "Chapter" });

    expect(Object.hasOwn(copy, "partId")).toBe(false);
  });

  it("does not mutate the row it was given", () => {
    const row = { id: "chp_source", projectId: "prj_source", version: 3 };
    remap(row, { projectId: "Project" });

    expect(row).toEqual({ id: "chp_source", projectId: "prj_source", version: 3 });
  });
});
