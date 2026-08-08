/**
 * CAL-034's acceptance criteria, against a real PostgreSQL: **no illegal
 * transition is possible, and the status always reflects the step actually
 * reached.**
 *
 * The suite is built around one idea. Nothing here ever asks for a status —
 * there is no API left that would take one. Every assertion writes a *row* and
 * then reads the column back, which is the only way the two claims above can be
 * checked at all: a test that set a status and read it back would be testing an
 * assignment.
 *
 * The pure machine is exhausted next door, in
 * `packages/shared/src/project-status/` — all one hundred ordered pairs of the
 * transition table and every stage of the derivation. What is proved here is
 * that the rows really do produce those inputs, that the write lands in the same
 * transaction as the evidence that moved it, and that the refusal is real.
 *
 * Every string written here is technical (CLAUDE.md §9). The chapter text is
 * three words chosen so that the word count identifies the revision.
 */

import { appendGeneratedChapterRevision, deleteChapter } from "@calepin/manuscript";
import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { succeed } from "@calepin/shared/errors";
import {
  archiveProject,
  openProjectScope,
  type ProjectScope,
  type ProjectStatus,
  readProjectProgress,
  reconcileProjectAggregates,
  reconcileProjectStatus,
  refreshProjectStatus,
  restoreProject,
  withProjectStatus,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const THREE_WORDS = "alpha beta gamma";

describe("project status state machine (CAL-034)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;
  let otherOwnerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({
      data: { email: "project-status-owner@example.test" },
    });
    const other = await prisma.user.create({
      data: { email: "project-status-other@example.test" },
    });

    ownerId = owner.id;
    otherOwnerId = other.id;
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  interface Fixture {
    readonly scope: ProjectScope;
    readonly projectId: string;
  }

  /** A project and nothing else — every fact below is something a step added. */
  async function seedProject(label: string, owner = ownerId): Promise<Fixture> {
    setActor(owner);

    const project = await prisma.project.create({ data: { userId: owner, title: label } });
    const opened = await openProjectScope({ ownerId: owner, projectId: project.id });

    if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

    return { scope: opened.value, projectId: project.id };
  }

  /** The status as the row says it is — never as a function under test says. */
  async function storedStatus(projectId: string): Promise<ProjectStatus> {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { status: true },
    });

    return project.status;
  }

  /**
   * The steps of the product's own sequence, each writing the rows that make one
   * stage true, and each naming the status the machine must then read off them.
   *
   * Written as data so the forward walk below is a loop rather than nine
   * hand-copied blocks: a step whose evidence is wrong then fails on its own
   * line, naming the stage it failed to reach.
   */
  const SEQUENCE: readonly {
    readonly status: ProjectStatus;
    readonly write: (fixture: Fixture) => Promise<void>;
  }[] = [
    {
      status: "ANALYSIS_IN_PROGRESS",
      write: async ({ projectId }) => {
        const sourceText = await prisma.sourceText.create({ data: { projectId } });
        await prisma.sourceTextVersion.create({
          data: {
            sourceTextId: sourceText.id,
            versionNumber: 1,
            content: THREE_WORDS,
            wordCount: 3,
            editedById: ownerId,
          },
        });
      },
    },
    {
      status: "DIRECTION_TO_CHOOSE",
      write: async ({ projectId }) => {
        await prisma.analysis.create({
          data: { projectId, validatedAt: new Date(), validatedById: ownerId },
        });
      },
    },
    {
      status: "BIBLE_TO_VALIDATE",
      write: async ({ projectId }) => {
        await prisma.creativeDirection.create({
          data: {
            projectId,
            workingTitle: "fixture",
            developedPremise: "fixture",
            dominantGenre: "fixture",
            mainConflict: "fixture",
            protagonistArc: "fixture",
            endingNature: "fixture",
            novelPotentialAssessment: "fixture",
            origin: "PROPOSED",
            isCanonical: true,
          },
        });
      },
    },
    {
      status: "OUTLINE_IN_PROGRESS",
      write: async ({ projectId }) => {
        const bible = await prisma.bible.create({
          data: { projectId, validatedAt: new Date(), validatedById: ownerId },
        });
        const outline = await prisma.outline.create({ data: { projectId, bibleId: bible.id } });
        const part = await prisma.part.create({
          data: { outlineId: outline.id, orderKey: "i", title: "fixture-part" },
        });

        for (const orderKey of ["i", "r"]) {
          await prisma.chapter.create({
            data: { outlineId: outline.id, bibleId: bible.id, partId: part.id, orderKey },
          });
        }
      },
    },
    {
      status: "WRITING_IN_PROGRESS",
      write: async (fixture) => {
        await writeChapter(fixture, 0);
      },
    },
    {
      status: "REVISION",
      write: async (fixture) => {
        await writeChapter(fixture, 1);
      },
    },
    {
      status: "COMPLETED",
      write: async ({ projectId }) => {
        setActor(ownerId);
        await prisma.chapter.updateMany({
          where: { outline: { projectId } },
          data: { status: "VALIDATED" },
        });
      },
    },
    {
      status: "PUBLISHED",
      write: async ({ projectId }) => {
        await prisma.publication.create({
          data: {
            projectId,
            slug: `fixture-${projectId.slice(-8).toLowerCase()}`,
            visibility: "PUBLIC",
            title: "fixture",
            authorName: "fixture",
            firstPublishedAt: new Date(),
          },
        });
      },
    },
  ];

  /** Writes the n-th chapter of the fixture, through the manuscript domain. */
  async function writeChapter(fixture: Fixture, index: number): Promise<void> {
    const chapters = await prisma.chapter.findMany({
      where: { outline: { projectId: fixture.projectId } },
      orderBy: { orderKey: "asc" },
      select: { id: true },
    });

    const chapter = chapters[index];
    if (chapter === undefined) throw new Error("the fixture has no chapter at that position");

    const appended = await appendGeneratedChapterRevision(fixture.scope, {
      chapterId: chapter.id,
      content: THREE_WORDS,
      authorId: ownerId,
    });

    if (!appended.ok) throw new Error("the fixture could not append a chapter revision");
  }

  /** Walks the sequence up to and including `status`, and returns the fixture. */
  async function seedUpTo(label: string, status: ProjectStatus): Promise<Fixture> {
    const fixture = await seedProject(label);
    const upTo = SEQUENCE.findIndex((step) => step.status === status);

    for (const step of SEQUENCE.slice(0, upTo + 1)) {
      setActor(ownerId);
      await step.write(fixture);
      const refreshed = await refreshProjectStatus(fixture.scope);

      if (!refreshed.ok) throw new Error("the fixture could not refresh a project status");
    }

    return fixture;
  }

  describe("the status a project starts at", () => {
    it("is DRAFT, and stays DRAFT while the project holds nothing", async () => {
      const fixture = await seedProject("status-new");

      expect(await storedStatus(fixture.projectId)).toBe("DRAFT");

      const refreshed = await refreshProjectStatus(fixture.scope);

      expect(refreshed).toEqual(succeed("DRAFT"));
      expect(await storedStatus(fixture.projectId)).toBe("DRAFT");
    });
  });

  describe("the forward walk, one evidence write at a time", () => {
    it("reaches each of the nine stages in turn, and never skips one", async () => {
      const fixture = await seedProject("status-forward");
      const reached: ProjectStatus[] = [await storedStatus(fixture.projectId)];

      for (const step of SEQUENCE) {
        setActor(ownerId);
        await step.write(fixture);

        const refreshed = await refreshProjectStatus(fixture.scope);

        expect(refreshed).toEqual(succeed(step.status));
        expect(await storedStatus(fixture.projectId)).toBe(step.status);

        reached.push(step.status);
      }

      expect(reached).toEqual([
        "DRAFT",
        "ANALYSIS_IN_PROGRESS",
        "DIRECTION_TO_CHOOSE",
        "BIBLE_TO_VALIDATE",
        "OUTLINE_IN_PROGRESS",
        "WRITING_IN_PROGRESS",
        "REVISION",
        "COMPLETED",
        "PUBLISHED",
      ]);
    });
  });

  describe("a chapter write moves the status without being asked to", () => {
    // The coupling CAL-033's transaction gained: `writtenChapterCount` is not
    // only a dashboard number, it is the evidence behind *rédaction en cours*.
    // Nothing in this test calls a status function.
    it("leaves OUTLINE_IN_PROGRESS the moment a chapter gains its first revision", async () => {
      const fixture = await seedUpTo("status-first-chapter", "OUTLINE_IN_PROGRESS");

      expect(await storedStatus(fixture.projectId)).toBe("OUTLINE_IN_PROGRESS");

      await writeChapter(fixture, 0);

      expect(await storedStatus(fixture.projectId)).toBe("WRITING_IN_PROGRESS");
    });

    it("falls back when the only written chapter is deleted", async () => {
      const fixture = await seedUpTo("status-chapter-deleted", "WRITING_IN_PROGRESS");
      const chapters = await prisma.chapter.findMany({
        where: { outline: { projectId: fixture.projectId } },
        orderBy: { orderKey: "asc" },
        select: { id: true },
      });

      const first = chapters[0];
      if (first === undefined) throw new Error("the fixture has no chapter to delete");

      setActor(ownerId);
      const deleted = await deleteChapter(fixture.scope, { chapterId: first.id });

      expect(deleted.ok).toBe(true);
      expect(await storedStatus(fixture.projectId)).toBe("OUTLINE_IN_PROGRESS");
    });
  });

  describe("regressions, which remove several stages at once", () => {
    // Deleting a bible cascades to the outline, its chapters and their
    // revisions. Four facts disappear in one statement and the column has to
    // follow them down — the reason the table's backward edges reach every
    // earlier stage rather than only the previous one.
    it("falls from PUBLISHED to BIBLE_TO_VALIDATE when the bible is deleted", async () => {
      const fixture = await seedUpTo("status-bible-deleted", "PUBLISHED");

      expect(await storedStatus(fixture.projectId)).toBe("PUBLISHED");

      setActor(ownerId);
      await prisma.publication.delete({ where: { projectId: fixture.projectId } });
      await prisma.bible.delete({ where: { projectId: fixture.projectId } });

      // The cascade took the outline, the chapters and their revisions with it,
      // but it went round CAL-033's write path, so `writtenChapterCount` still
      // claims a manuscript that no longer exists. Reconciling first is what a
      // direct row write always owes the derived state — and it is why the
      // status reads the counter rather than recomputing it: one definition of
      // "written", maintained in one place.
      expect((await reconcileProjectAggregates(fixture.scope)).ok).toBe(true);

      expect(await refreshProjectStatus(fixture.scope)).toEqual(succeed("BIBLE_TO_VALIDATE"));
      expect(await storedStatus(fixture.projectId)).toBe("BIBLE_TO_VALIDATE");
    });
  });

  describe("the furthest stage reached, not the first one missing", () => {
    // The case that decides the shape of the derivation. An author reopens the
    // bible of a finished novel: the manuscript has not gone anywhere, and a
    // column that fell to BIBLE_TO_VALIDATE would be describing the edit rather
    // than the novel — then have to leap five stages back on re-validation,
    // which the transition table refuses outright.
    it("keeps a finished novel finished while its bible is un-validated", async () => {
      const fixture = await seedUpTo("status-bible-reopened", "COMPLETED");

      setActor(ownerId);
      await prisma.bible.update({
        where: { projectId: fixture.projectId },
        data: { validatedAt: null, validatedById: null },
      });

      expect(await refreshProjectStatus(fixture.scope)).toEqual(succeed("COMPLETED"));

      setActor(ownerId);
      await prisma.bible.update({
        where: { projectId: fixture.projectId },
        data: { validatedAt: new Date(), validatedById: ownerId },
      });

      expect(await refreshProjectStatus(fixture.scope)).toEqual(succeed("COMPLETED"));
    });
  });

  describe("archiving", () => {
    it("archives from a mid-chain stage and restores to it", async () => {
      const fixture = await seedUpTo("status-archive", "REVISION");

      const archived = await runWithActor(ownerId, async () => archiveProject(fixture.scope));

      expect(archived).toEqual(succeed("ARCHIVED"));
      expect(await storedStatus(fixture.projectId)).toBe("ARCHIVED");

      const restored = await runWithActor(ownerId, async () => restoreProject(fixture.scope));

      expect(restored).toEqual(succeed("REVISION"));
      expect(await storedStatus(fixture.projectId)).toBe("REVISION");
    });

    // Restoring reads the graph, never a remembered stage — which is the whole
    // reason ARCHIVED has an edge to every stage rather than back to one.
    it("restores to the stage the rows support, not the one it was archived at", async () => {
      const fixture = await seedUpTo("status-archive-moved", "REVISION");

      await runWithActor(ownerId, async () => {
        await archiveProject(fixture.scope);
      });

      setActor(ownerId);
      await prisma.bible.delete({ where: { projectId: fixture.projectId } });
      expect((await reconcileProjectAggregates(fixture.scope)).ok).toBe(true);

      const restored = await runWithActor(ownerId, async () => restoreProject(fixture.scope));

      expect(restored).toEqual(succeed("BIBLE_TO_VALIDATE"));
    });

    it("records the decision with its author, which the derived status never does", async () => {
      const fixture = await seedUpTo("status-archive-audit", "ANALYSIS_IN_PROGRESS");
      const before = await prisma.project.findUniqueOrThrow({
        where: { id: fixture.projectId },
        select: { version: true, updatedById: true, archivedAt: true },
      });

      await runWithActor(ownerId, async () => {
        await archiveProject(fixture.scope);
      });

      const after = await prisma.project.findUniqueOrThrow({
        where: { id: fixture.projectId },
        select: { version: true, updatedById: true, archivedAt: true },
      });

      expect(before.archivedAt).toBeNull();
      expect(after.archivedAt).not.toBeNull();
      expect(after.version).toBe(before.version + 1);
      expect(after.updatedById).toBe(ownerId);
    });
  });

  describe("the refusal", () => {
    /** Puts a project's rows two stages ahead of its column, behind the machine's back. */
    async function seedOutOfOrder(label: string): Promise<Fixture> {
      const fixture = await seedProject(label);

      setActor(ownerId);
      await prisma.bible.create({
        data: { projectId: fixture.projectId, validatedAt: new Date(), validatedById: ownerId },
      });

      return fixture;
    }

    it("refuses a status the stored one cannot legally reach", async () => {
      const fixture = await seedOutOfOrder("status-illegal");
      const refreshed = await refreshProjectStatus(fixture.scope);

      expect(refreshed.ok).toBe(false);
      if (refreshed.ok) return;

      expect(refreshed.error).toMatchObject({
        code: "ILLEGAL_STATUS_TRANSITION",
        category: "conflict",
      });
      expect(await storedStatus(fixture.projectId)).toBe("DRAFT");
    });

    // The refusal is a rollback, not a report: the write that moved the evidence
    // goes with it, so a project is never left half-advanced.
    it("rolls back the write that moved the evidence", async () => {
      const fixture = await seedOutOfOrder("status-illegal-rollback");

      const attempted = await runWithActor(ownerId, async () =>
        withProjectStatus(fixture.scope, async (tx) => {
          await tx.creativeDirection.create({
            data: {
              projectId: fixture.projectId,
              workingTitle: "fixture",
              developedPremise: "fixture",
              dominantGenre: "fixture",
              mainConflict: "fixture",
              protagonistArc: "fixture",
              endingNature: "fixture",
              novelPotentialAssessment: "fixture",
              origin: "PROPOSED",
              isCanonical: true,
            },
          });

          return succeed("written");
        }),
      );

      expect(attempted.ok).toBe(false);
      expect(
        await prisma.creativeDirection.count({ where: { projectId: fixture.projectId } }),
      ).toBe(0);
      expect(await storedStatus(fixture.projectId)).toBe("DRAFT");
    });

    it("is repaired by the reconciliation, which is the only ungated writer", async () => {
      const fixture = await seedOutOfOrder("status-illegal-repaired");

      expect((await refreshProjectStatus(fixture.scope)).ok).toBe(false);
      expect(await reconcileProjectStatus(fixture.scope)).toEqual(succeed("OUTLINE_IN_PROGRESS"));
      expect(await storedStatus(fixture.projectId)).toBe("OUTLINE_IN_PROGRESS");

      // And the project is back on the machine's map: the next refresh agrees.
      expect(await refreshProjectStatus(fixture.scope)).toEqual(succeed("OUTLINE_IN_PROGRESS"));
    });
  });

  describe("the status write is derived state, and is written as such", () => {
    // The CAL-033 lesson, one column over: a Prisma `update` would drag
    // `@updatedAt` and the audit extension with it, crediting a status nobody
    // authored to whoever happened to be in scope and burning the row's
    // optimistic-concurrency token.
    it("leaves the project's audit block alone", async () => {
      const fixture = await seedUpTo("status-audit-untouched", "ANALYSIS_IN_PROGRESS");
      const before = await prisma.project.findUniqueOrThrow({
        where: { id: fixture.projectId },
        select: { version: true, updatedById: true, updatedAt: true },
      });

      setActor(ownerId);
      await prisma.analysis.create({
        data: { projectId: fixture.projectId, validatedAt: new Date(), validatedById: ownerId },
      });

      expect(await refreshProjectStatus(fixture.scope)).toEqual(succeed("DIRECTION_TO_CHOOSE"));

      const after = await prisma.project.findUniqueOrThrow({
        where: { id: fixture.projectId },
        select: { version: true, updatedById: true, updatedAt: true },
      });

      expect(after).toEqual(before);
    });
  });

  describe("the row lock", () => {
    // Asserting the *serialisation*, never a race: the CAL-033 lesson records a
    // concurrency test that passed with `FOR UPDATE` deleted, because nothing
    // makes two clients land inside a sub-millisecond window on demand. The
    // first transaction is held open inside its own mutation callback and the
    // second is asserted not to have started.
    it("serialises two writes against one project", async () => {
      const fixture = await seedUpTo("status-lock", "BIBLE_TO_VALIDATE");

      const events: string[] = [];
      let releaseFirst = (): void => undefined;
      let firstHasLock = (): void => undefined;

      const held = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const locked = new Promise<void>((resolve) => {
        firstHasLock = resolve;
      });

      const first = withProjectStatus(fixture.scope, async () => {
        events.push("first");
        firstHasLock();
        await held;

        return succeed("first");
      });

      // The second writer is only started once the first transaction holds the
      // lock, or the two would race for it and the assertion below would be
      // testing the scheduler.
      await locked;

      const second = withProjectStatus(fixture.scope, async () => {
        events.push("second");

        return succeed("second");
      });

      // Long enough for a second transaction that was *not* blocked to have run
      // its mutation several times over.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(events).toEqual(["first"]);

      releaseFirst();
      expect((await first).ok).toBe(true);
      expect((await second).ok).toBe(true);
      expect(events).toEqual(["first", "second"]);
    });
  });

  describe("the evidence a screen reads", () => {
    it("reports the facts behind the status, and nothing readable as prose", async () => {
      const fixture = await seedUpTo("status-progress", "WRITING_IN_PROGRESS");
      const progress = await readProjectProgress(fixture.scope);

      expect(progress).toEqual(
        succeed({
          isArchived: false,
          hasSourceText: true,
          isAnalysisValidated: true,
          hasCanonicalDirection: true,
          isBibleValidated: true,
          plannedChapterCount: 2,
          writtenChapterCount: 1,
          validatedChapterCount: 0,
          isPublished: false,
        }),
      );
    });
  });

  describe("owner isolation", () => {
    /**
     * A scope shaped like a real one but never minted for this pair. Every entry
     * point below has to refuse it, and the suite in
     * `owner-access.integration.test.ts` is what makes adding one without this
     * test fail.
     */
    function forgedScope(forOwnerId: string, projectId: string): ProjectScope {
      return {
        [Symbol.for("calepin.ProjectScope")]: true,
        projectId,
        ownerId: forOwnerId,
      } as unknown as ProjectScope;
    }

    it("refuses every status entry point on another owner's project", async () => {
      const mine = await seedUpTo("status-isolation-mine", "BIBLE_TO_VALIDATE");
      const theirScope = forgedScope(otherOwnerId, mine.projectId);

      for (const call of [
        readProjectProgress(theirScope),
        refreshProjectStatus(theirScope),
        reconcileProjectStatus(theirScope),
        archiveProject(theirScope),
        restoreProject(theirScope),
        withProjectStatus(theirScope, async () => succeed("never")),
      ]) {
        const outcome = await call;

        expect(outcome.ok).toBe(false);
        if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "NOT_FOUND" });
      }

      expect(await storedStatus(mine.projectId)).toBe("BIBLE_TO_VALIDATE");
    });
  });
});
