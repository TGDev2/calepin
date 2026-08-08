import { describe, expect, it } from "vitest";

import { isAppError } from "../errors/app-error";
import { applyAuditFields, AUDITED_WRITE_OPERATIONS, isAuditedWriteOperation } from "./fields";

const ACTOR = "usr_actor";

function stamp(operation: "create" | "update", args: unknown, actorId: string | undefined = ACTOR) {
  return applyAuditFields("Project", operation, args, actorId) as Record<string, unknown>;
}

describe("applyAuditFields", () => {
  describe("the actor is mandatory", () => {
    // The acceptance criterion of CAL-022, at the level the extension can
    // enforce it. The database enforces the same thing unconditionally.
    it.each(AUDITED_WRITE_OPERATIONS)("refuses %s with no actor in scope", (operation) => {
      expect(() => applyAuditFields("Project", operation, { data: {} }, undefined)).toThrow(
        /no actor in scope/,
      );
    });

    it("refuses an empty actor id, which is a resolver that failed quietly", () => {
      expect(() => stamp("create", { data: {} }, "")).toThrow(/no actor in scope/);
    });

    it("fails as an AppError carrying the code and the location, never the payload", () => {
      try {
        applyAuditFields("Chapter", "update", { data: { title: "x" } }, undefined);
        expect.unreachable("the write should have been refused");
      } catch (error: unknown) {
        expect(isAppError(error)).toBe(true);
        if (!isAppError(error)) return;

        expect(error.code).toBe("AUDIT_ACTOR_REQUIRED");
        expect(error.category).toBe("internal");
        expect(error.fieldPath).toBe("Chapter.update");
        // The message is the first line of the stack (CLAUDE.md §7): constant,
        // English, and never built from what was being written.
        expect(error.message).toBe("an audited write ran with no actor in scope");
        expect(error.message).not.toContain("x");
      }
    });
  });

  describe("create", () => {
    it("credits the actor", () => {
      expect(stamp("create", { data: { title: "T" } })).toEqual({
        data: { title: "T", updatedById: ACTOR },
      });
    });

    it("leaves the version to the column default — a first state is version 1", () => {
      expect(stamp("create", { data: {} }).data).not.toHaveProperty("version");
    });

    it("keeps an explicit author, which is how a worker credits the requester", () => {
      expect(stamp("create", { data: { updatedById: "usr_other" } })).toEqual({
        data: { updatedById: "usr_other" },
      });
    });

    it("stamps every row of a createMany", () => {
      const stamped = applyAuditFields(
        "Character",
        "createMany",
        { data: [{ name: "A" }, { name: "B", updatedById: "usr_other" }] },
        ACTOR,
      );

      expect(stamped).toEqual({
        data: [
          { name: "A", updatedById: ACTOR },
          { name: "B", updatedById: "usr_other" },
        ],
      });
    });
  });

  describe("update", () => {
    it("credits the actor and moves the counter in the same write", () => {
      expect(stamp("update", { where: { id: "p1" }, data: { title: "T" } })).toEqual({
        where: { id: "p1" },
        data: { title: "T", updatedById: ACTOR, version: { increment: 1 } },
      });
    });

    it("leaves an explicit version alone — that is the restore path", () => {
      expect(stamp("update", { where: { id: "p1" }, data: { version: 7 } }).data).toEqual({
        version: 7,
        updatedById: ACTOR,
      });
    });

    it("stamps an updateMany the same way", () => {
      expect(
        applyAuditFields("Chapter", "updateMany", { where: { outlineId: "o1" }, data: {} }, ACTOR),
      ).toEqual({
        where: { outlineId: "o1" },
        data: { updatedById: ACTOR, version: { increment: 1 } },
      });
    });
  });

  describe("upsert", () => {
    // The only operation carrying two payloads, and the only one where the two
    // must be stamped differently: the created row starts at version 1, the
    // updated one moves on from wherever it was.
    it("stamps both branches, and only counts on the update branch", () => {
      expect(
        applyAuditFields(
          "Publication",
          "upsert",
          { where: { projectId: "p1" }, create: { projectId: "p1" }, update: {} },
          ACTOR,
        ),
      ).toEqual({
        where: { projectId: "p1" },
        create: { projectId: "p1", updatedById: ACTOR },
        update: { updatedById: ACTOR, version: { increment: 1 } },
      });
    });
  });

  describe("what it does not touch", () => {
    it("never mutates the caller's arguments — Prisma hands the same object to a retry", () => {
      const args = { data: { title: "T" } };
      const stamped = stamp("update", args);

      expect(args).toEqual({ data: { title: "T" } });
      expect(stamped).not.toBe(args);
      expect(stamped["data"]).not.toBe(args.data);
    });

    it("leaves a nested write alone — PostgreSQL is what refuses that one", () => {
      const stamped = stamp("create", { data: { title: "T", bible: { create: {} } } });

      expect(stamped["data"]).toEqual({
        title: "T",
        updatedById: ACTOR,
        bible: { create: {} },
      });
    });
  });
});

describe("isAuditedWriteOperation", () => {
  it.each(AUDITED_WRITE_OPERATIONS)("recognises %s", (operation) => {
    expect(isAuditedWriteOperation(operation)).toBe(true);
  });

  // Reads and deletes write no new state, so there is nothing to credit. A
  // delete leaves no row to carry an author; CAL-149's activity timeline is
  // where a removal becomes visible.
  it.each(["findMany", "findUnique", "delete", "deleteMany", "count", "aggregate", "$queryRaw"])(
    "leaves %s alone",
    (operation) => {
      expect(isAuditedWriteOperation(operation)).toBe(false);
    },
  );
});
