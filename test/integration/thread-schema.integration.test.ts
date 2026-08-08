import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openThreadsQuery } from "../../prisma/queries/open-threads";
import { type AuditedClient, createAuditedClient } from "./audited-client";

/**
 * Every fixture string here is technical. §9 forbids literary content in a
 * committed artefact, and this suite needs none: what is under test is which
 * chapter a thread cites and whether it is still open, never what the thread
 * is about.
 */
describe("thread schema", () => {
  let prisma: AuditedClient;
  let setActor: (id: string) => void;
  let sequence = 0;

  async function createPlanFixture() {
    sequence += 1;
    const user = await prisma.user.create({
      data: { email: `thread-schema-${sequence}@example.test`, name: "Test User" },
    });
    setActor(user.id);
    const project = await prisma.project.create({
      data: { title: `thread-schema-${sequence}`, userId: user.id },
    });
    const bible = await prisma.bible.create({ data: { projectId: project.id } });
    const outline = await prisma.outline.create({
      data: { projectId: project.id, bibleId: bible.id },
    });
    const part = await prisma.part.create({
      data: { outlineId: outline.id, orderKey: "i", title: `part-${sequence}` },
    });

    return {
      userId: user.id,
      projectId: project.id,
      bibleId: bible.id,
      outlineId: outline.id,
      partId: part.id,
    };
  }

  async function createChapter(
    plan: { outlineId: string; bibleId: string; partId: string },
    orderKey: string,
  ) {
    return prisma.chapter.create({
      data: {
        outlineId: plan.outlineId,
        bibleId: plan.bibleId,
        partId: plan.partId,
        orderKey,
      },
    });
  }

  beforeAll(() => {
    ({ prisma, setActor } = createAuditedClient());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("the thread", () => {
    it("stores the four attributes the command names, and starts open", async () => {
      const plan = await createPlanFixture();
      const opening = await createChapter(plan, "i");

      const thread = await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-thread",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
        },
      });

      expect(thread.status).toBe("OPEN");
      expect(thread.closingChapterId).toBeNull();
    });

    it("refuses two threads named the same inside one plan", async () => {
      const plan = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const base = {
        outlineId: plan.outlineId,
        bibleId: plan.bibleId,
        label: "fixture-thread",
        narrativePromise: "fixture promise",
        openingChapterId: opening.id,
      };
      await prisma.thread.create({ data: base });

      await expect(prisma.thread.create({ data: base })).rejects.toMatchObject({
        code: "P2002",
        meta: { target: ["outlineId", "label"] },
      });
    });

    it("stores each of the three states", async () => {
      const plan = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const closing = await createChapter(plan, "r");

      for (const status of ["OPEN", "CONTINUED", "CLOSED"] as const) {
        const thread = await prisma.thread.create({
          data: {
            outlineId: plan.outlineId,
            bibleId: plan.bibleId,
            label: `fixture-thread-${status}`,
            narrativePromise: "fixture promise",
            openingChapterId: opening.id,
            closingChapterId: status === "CLOSED" ? closing.id : null,
            status,
          },
        });

        expect(thread.status).toBe(status);
      }
    });

    it("refuses a thread citing another bible's opening chapter", async () => {
      const plan = await createPlanFixture();
      const other = await createPlanFixture();
      const foreign = await createChapter(other, "i");

      await expect(
        prisma.thread.create({
          data: {
            outlineId: plan.outlineId,
            bibleId: plan.bibleId,
            label: "fixture-thread",
            narrativePromise: "fixture promise",
            openingChapterId: foreign.id,
          },
        }),
      ).rejects.toThrow(/threads_bibleId_openingChapterId_fkey/);
    });

    it("refuses a thread citing another bible's closing chapter", async () => {
      const plan = await createPlanFixture();
      const other = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const foreign = await createChapter(other, "i");

      await expect(
        prisma.thread.create({
          data: {
            outlineId: plan.outlineId,
            bibleId: plan.bibleId,
            label: "fixture-thread",
            narrativePromise: "fixture promise",
            openingChapterId: opening.id,
            closingChapterId: foreign.id,
            status: "CLOSED",
          },
        }),
      ).rejects.toThrow(/threads_bibleId_closingChapterId_fkey/);
    });
  });

  describe("continuations", () => {
    it("holds one continuation per chapter per thread", async () => {
      const plan = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const continuing = await createChapter(plan, "r");
      const thread = await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-thread",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
        },
      });
      const continuation = { bibleId: plan.bibleId, threadId: thread.id, chapterId: continuing.id };
      await prisma.threadContinuation.create({ data: continuation });

      await expect(prisma.threadContinuation.create({ data: continuation })).rejects.toMatchObject({
        code: "P2002",
        meta: { target: ["threadId", "chapterId"] },
      });
    });

    it("carries several continuations for one thread", async () => {
      const plan = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const second = await createChapter(plan, "r");
      const third = await createChapter(plan, "z");
      const thread = await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-thread",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
        },
      });
      await prisma.threadContinuation.createMany({
        data: [
          { bibleId: plan.bibleId, threadId: thread.id, chapterId: second.id },
          { bibleId: plan.bibleId, threadId: thread.id, chapterId: third.id },
        ],
      });

      expect(await prisma.threadContinuation.count({ where: { threadId: thread.id } })).toBe(2);
    });

    it("refuses a continuation naming another bible's chapter", async () => {
      const plan = await createPlanFixture();
      const other = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const foreign = await createChapter(other, "i");
      const thread = await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-thread",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
        },
      });

      await expect(
        prisma.threadContinuation.create({
          data: { bibleId: plan.bibleId, threadId: thread.id, chapterId: foreign.id },
        }),
      ).rejects.toThrow(/thread_continuations_bibleId_chapterId_fkey/);
    });
  });

  // Probed, not assumed — the CAL-017 lesson. Thread and Chapter are both
  // direct children of Outline, the same subtree, unlike focalCharacterId's
  // two-subtree case in CAL-019 that broke a bare NO ACTION.
  describe("what a deletion does", () => {
    it("refuses to delete a chapter that a thread still opens at", async () => {
      const plan = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-thread",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
        },
      });

      await expect(prisma.chapter.delete({ where: { id: opening.id } })).rejects.toThrow(
        /threads_bibleId_openingChapterId_fkey/,
      );
    });

    it("un-references the closing chapter when it goes, keeping the thread and its status", async () => {
      const plan = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const closing = await createChapter(plan, "r");
      const thread = await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-thread",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
          closingChapterId: closing.id,
          status: "CLOSED",
        },
      });

      await prisma.chapter.delete({ where: { id: closing.id } });

      const after = await prisma.thread.findUniqueOrThrow({ where: { id: thread.id } });
      expect(after.closingChapterId).toBeNull();
      // Left inconsistent on purpose — a closed thread with no closing
      // chapter is a finding for CAL-109 to surface, not a state the schema
      // refuses to store.
      expect(after.status).toBe("CLOSED");
    });

    it("takes the whole plan's threads and continuations with the project", async () => {
      const plan = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const continuing = await createChapter(plan, "r");
      const thread = await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-thread",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
        },
      });
      await prisma.threadContinuation.create({
        data: { bibleId: plan.bibleId, threadId: thread.id, chapterId: continuing.id },
      });

      await prisma.project.delete({ where: { id: plan.projectId } });

      expect(await prisma.thread.count({ where: { id: thread.id } })).toBe(0);
      expect(await prisma.threadContinuation.count({ where: { threadId: thread.id } })).toBe(0);
    });

    it("takes a thread's continuations with it, keeping its chapters", async () => {
      const plan = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const continuing = await createChapter(plan, "r");
      const thread = await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-thread",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
        },
      });
      await prisma.threadContinuation.create({
        data: { bibleId: plan.bibleId, threadId: thread.id, chapterId: continuing.id },
      });

      await prisma.chapter.delete({ where: { id: continuing.id } });

      expect(await prisma.threadContinuation.count({ where: { threadId: thread.id } })).toBe(0);
      expect(await prisma.chapter.count({ where: { id: opening.id } })).toBe(1);
    });
  });

  // The acceptance criterion, against the real server: the still-open threads
  // of a plan, listed at any instant, each with the chapter it opened at.
  describe("listing the still-open threads", () => {
    it("returns OPEN and CONTINUED threads with their opening chapter, and excludes CLOSED ones", async () => {
      const plan = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const closing = await createChapter(plan, "r");

      const open = await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-open",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
        },
      });
      const continued = await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-continued",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
          status: "CONTINUED",
        },
      });
      await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-closed",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
          closingChapterId: closing.id,
          status: "CLOSED",
        },
      });

      const found = await prisma.thread.findMany(openThreadsQuery(plan.outlineId));

      expect(found.map((thread) => thread.id).sort()).toEqual([open.id, continued.id].sort());
      for (const thread of found) {
        expect(thread.openingChapter?.id).toBe(opening.id);
      }
    });

    it("returns nothing once every thread of the plan is closed", async () => {
      const plan = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const closing = await createChapter(plan, "r");
      await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-closed",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
          closingChapterId: closing.id,
          status: "CLOSED",
        },
      });

      expect(await prisma.thread.findMany(openThreadsQuery(plan.outlineId))).toEqual([]);
    });

    it("scopes to the given plan, leaving another plan's threads out", async () => {
      const plan = await createPlanFixture();
      const other = await createPlanFixture();
      const opening = await createChapter(plan, "i");
      const otherOpening = await createChapter(other, "i");
      await prisma.thread.create({
        data: {
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          label: "fixture-thread",
          narrativePromise: "fixture promise",
          openingChapterId: opening.id,
        },
      });
      await prisma.thread.create({
        data: {
          outlineId: other.outlineId,
          bibleId: other.bibleId,
          label: "fixture-thread",
          narrativePromise: "fixture promise",
          openingChapterId: otherOpening.id,
        },
      });

      const found = await prisma.thread.findMany(openThreadsQuery(plan.outlineId));

      expect(found).toHaveLength(1);
    });
  });
});
