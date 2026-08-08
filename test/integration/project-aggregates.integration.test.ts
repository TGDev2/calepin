/**
 * CAL-033's acceptance criterion, against a real PostgreSQL: **the stored
 * counters stay exact after a generation, a manual edit, a chapter deletion and
 * a restoration of an earlier revision.**
 *
 * Every assertion is made twice. The stored value is compared to the number this
 * suite expects, *and* to `computeProjectAggregates` — the same two numbers read
 * straight from `chapters` and `chapter_revisions`. A denormalised counter can
 * only be wrong by disagreeing with the rows it summarises, so the rows are the
 * oracle at every step rather than at the end.
 *
 * The seeding is the shape every suite here uses: a `createAuditedClient` for
 * the fixture writes the schema's `updatedById` columns require, and a separate
 * bare `PrismaClient` registered on the seam — the one the code under test
 * reaches through.
 *
 * Every string written here is technical (CLAUDE.md §9). What is under test is
 * arithmetic over rows; it needs no prose, and the word counts below are chosen
 * so that each one identifies the revision it came from.
 */

import {
  appendEditedChapterRevision,
  appendGeneratedChapterRevision,
  deleteChapter,
  restoreChapterRevision,
} from "@calepin/manuscript";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { fail, NotFoundError, succeed } from "@calepin/shared/errors";
import {
  computeProjectAggregates,
  listProjectDashboardRows,
  openProjectScope,
  type ProjectAggregates,
  type ProjectScope,
  reconcileProjectAggregates,
  withProjectAggregates,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

/** Four words, five words, six words — the count *is* the identity of the text. */
const FOUR_WORDS = "alpha beta gamma delta";
const FIVE_WORDS = "alpha beta gamma delta epsilon";
const SIX_WORDS = "alpha beta gamma delta epsilon zeta";

describe("project aggregates (CAL-033)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;
  let otherOwnerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({
      data: { email: "project-aggregates-owner@example.test" },
    });
    const other = await prisma.user.create({
      data: { email: "project-aggregates-other@example.test" },
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
    readonly chapterIds: readonly string[];
  }

  /**
   * A project with `chapterCount` chapters and no text at all — every counter
   * starts at zero, and every number below is something a write path put there.
   */
  async function seedProject(label: string, chapterCount = 2): Promise<Fixture> {
    setActor(ownerId);

    const project = await prisma.project.create({ data: { userId: ownerId, title: label } });
    const bible = await prisma.bible.create({ data: { projectId: project.id } });
    const outline = await prisma.outline.create({
      data: { projectId: project.id, bibleId: bible.id },
    });
    const part = await prisma.part.create({
      data: { outlineId: outline.id, orderKey: "i", title: `${label}-part` },
    });

    const chapterIds: string[] = [];

    for (const orderKey of ["i", "r", "x"].slice(0, chapterCount)) {
      const chapter = await prisma.chapter.create({
        data: { outlineId: outline.id, bibleId: bible.id, partId: part.id, orderKey },
      });
      chapterIds.push(chapter.id);
    }

    const opened = await openProjectScope({ ownerId, projectId: project.id });
    if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

    return { scope: opened.value, projectId: project.id, chapterIds };
  }

  /** The counters as the row says they are. */
  async function storedAggregates(projectId: string): Promise<ProjectAggregates> {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { writtenChapterCount: true, totalWordCount: true },
    });

    return project;
  }

  /**
   * The assertion this whole suite is made of: the stored counters say what they
   * are expected to say, *and* they agree with the rows they summarise.
   */
  async function expectAggregates(fixture: Fixture, expected: ProjectAggregates): Promise<void> {
    expect(await storedAggregates(fixture.projectId)).toEqual(expected);

    const computed = await computeProjectAggregates(fixture.scope);
    expect(computed.ok).toBe(true);
    if (computed.ok) expect(computed.value).toEqual(expected);
  }

  function chapterAt(fixture: Fixture, index: number): string {
    const chapterId = fixture.chapterIds[index];
    if (chapterId === undefined) throw new Error("the fixture seeded fewer chapters than that");

    return chapterId;
  }

  it("starts a project at zero", async () => {
    const fixture = await seedProject("aggregates-empty");

    await expectAggregates(fixture, { writtenChapterCount: 0, totalWordCount: 0 });
  });

  it("counts a generated chapter, and counts each chapter once however often it is generated", async () => {
    const fixture = await seedProject("aggregates-generation");
    const chapterId = chapterAt(fixture, 0);

    const first = await appendGeneratedChapterRevision(fixture.scope, {
      chapterId,
      content: FOUR_WORDS,
      authorId: ownerId,
    });

    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value).toMatchObject({ revisionNumber: 1, wordCount: 4 });
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 4 });

    // A regeneration appends: the chapter is still one written chapter, and it
    // is now worth the new text — never the sum of the two.
    const second = await appendGeneratedChapterRevision(fixture.scope, {
      chapterId,
      content: SIX_WORDS,
      authorId: ownerId,
    });

    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value).toMatchObject({ revisionNumber: 2, wordCount: 6 });
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 6 });

    // A second chapter adds itself to both counters.
    await appendGeneratedChapterRevision(fixture.scope, {
      chapterId: chapterAt(fixture, 1),
      content: FIVE_WORDS,
      authorId: ownerId,
    });

    await expectAggregates(fixture, { writtenChapterCount: 2, totalWordCount: 11 });
  });

  it("follows a manual edit", async () => {
    const fixture = await seedProject("aggregates-edit");
    const chapterId = chapterAt(fixture, 0);

    await appendGeneratedChapterRevision(fixture.scope, {
      chapterId,
      content: SIX_WORDS,
      authorId: ownerId,
    });
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 6 });

    const edited = await appendEditedChapterRevision(fixture.scope, {
      chapterId,
      content: FOUR_WORDS,
      authorId: ownerId,
    });

    expect(edited.ok).toBe(true);
    if (edited.ok) expect(edited.value).toMatchObject({ revisionNumber: 2, origin: "EDITED" });
    // The edit shortened the chapter, and the counter went down with it.
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 4 });
  });

  // The case the task exists for: a counter that is right after every forward
  // write and wrong after a rewind is the bug nobody notices.
  it("follows a restoration back to what the restored revision is worth", async () => {
    const fixture = await seedProject("aggregates-restore");
    const chapterId = chapterAt(fixture, 0);

    await appendGeneratedChapterRevision(fixture.scope, {
      chapterId,
      content: FOUR_WORDS,
      authorId: ownerId,
    });
    await appendEditedChapterRevision(fixture.scope, {
      chapterId,
      content: SIX_WORDS,
      authorId: ownerId,
    });
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 6 });

    const restored = await restoreChapterRevision(fixture.scope, {
      chapterId,
      revisionNumber: 1,
      authorId: ownerId,
    });

    expect(restored.ok).toBe(true);
    // Append-only: the restoration is revision 3, not a return to revision 1.
    if (restored.ok) {
      expect(restored.value).toMatchObject({ revisionNumber: 3, origin: "EDITED", wordCount: 4 });
    }
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 4 });

    // And the history is intact — nothing was overwritten to get there.
    const revisions = await prisma.chapterRevision.findMany({
      where: { chapterId },
      orderBy: { revisionNumber: "asc" },
      select: { revisionNumber: true, wordCount: true },
    });
    expect(revisions).toEqual([
      { revisionNumber: 1, wordCount: 4 },
      { revisionNumber: 2, wordCount: 6 },
      { revisionNumber: 3, wordCount: 4 },
    ]);

    // Restoring forward again is the same operation, and lands on the same
    // number the counter held when that revision was current.
    const forward = await restoreChapterRevision(fixture.scope, {
      chapterId,
      revisionNumber: 2,
      authorId: ownerId,
    });

    expect(forward.ok).toBe(true);
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 6 });
  });

  it("refuses to restore a revision the chapter never had", async () => {
    const fixture = await seedProject("aggregates-restore-missing");
    const chapterId = chapterAt(fixture, 0);

    await appendGeneratedChapterRevision(fixture.scope, {
      chapterId,
      content: FIVE_WORDS,
      authorId: ownerId,
    });

    const restored = await restoreChapterRevision(fixture.scope, {
      chapterId,
      revisionNumber: 7,
      authorId: ownerId,
    });

    expect(restored.ok).toBe(false);
    if (!restored.ok) expect(restored.error.code).toBe("NOT_FOUND");
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 5 });
  });

  it("drops a deleted chapter from both counters, revisions and all", async () => {
    const fixture = await seedProject("aggregates-delete");
    const first = chapterAt(fixture, 0);
    const second = chapterAt(fixture, 1);

    await appendGeneratedChapterRevision(fixture.scope, {
      chapterId: first,
      content: FOUR_WORDS,
      authorId: ownerId,
    });
    await appendGeneratedChapterRevision(fixture.scope, {
      chapterId: second,
      content: SIX_WORDS,
      authorId: ownerId,
    });
    // The first chapter has two revisions, so the delete has to drop what the
    // *latest* one was worth and nothing else.
    await appendEditedChapterRevision(fixture.scope, {
      chapterId: first,
      content: FIVE_WORDS,
      authorId: ownerId,
    });
    await expectAggregates(fixture, { writtenChapterCount: 2, totalWordCount: 11 });

    const deleted = await deleteChapter(fixture.scope, { chapterId: first });

    expect(deleted.ok).toBe(true);
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 6 });
    expect(await prisma.chapterRevision.count({ where: { chapterId: first } })).toBe(0);

    // Deleting the last written chapter returns the project to zero, not to a
    // negative number and not to a stale one.
    expect((await deleteChapter(fixture.scope, { chapterId: second })).ok).toBe(true);
    await expectAggregates(fixture, { writtenChapterCount: 0, totalWordCount: 0 });
  });

  it("counts an unwritten chapter as unwritten, and an empty revision as written", async () => {
    const fixture = await seedProject("aggregates-empty-revision");

    const written = await appendGeneratedChapterRevision(fixture.scope, {
      chapterId: chapterAt(fixture, 0),
      content: "",
      authorId: ownerId,
    });

    expect(written.ok).toBe(true);
    // A chapter with text is written even when the text holds no word: it has a
    // revision, and "has no text yet" and "has empty text" are different facts.
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 0 });
  });

  it("leaves the counters untouched when the write fails", async () => {
    const fixture = await seedProject("aggregates-rollback");
    const chapterId = chapterAt(fixture, 0);

    await appendGeneratedChapterRevision(fixture.scope, {
      chapterId,
      content: SIX_WORDS,
      authorId: ownerId,
    });
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 6 });

    // A write that lands and is then reported as a failure: the revision must go
    // with the failure, and the counter must not have followed it.
    const rolledBack = await withProjectAggregates(fixture.scope, async (tx) => {
      await tx.chapterRevision.create({
        data: {
          chapterId,
          revisionNumber: 2,
          origin: "EDITED",
          content: FOUR_WORDS,
          wordCount: 4,
          createdById: ownerId,
        },
      });

      return fail(new NotFoundError({ message: "the mutation decided the write must not stand" }));
    });

    expect(rolledBack.ok).toBe(false);
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 6 });
    expect(await prisma.chapterRevision.count({ where: { chapterId } })).toBe(1);

    // The same, for a mutation that throws rather than reporting a failure.
    await expect(
      withProjectAggregates(fixture.scope, async (tx) => {
        await tx.chapterRevision.create({
          data: {
            chapterId,
            revisionNumber: 2,
            origin: "EDITED",
            content: FOUR_WORDS,
            wordCount: 4,
            createdById: ownerId,
          },
        });

        throw new Error("the mutation failed after writing");
      }),
    ).rejects.toThrow("the mutation failed after writing");

    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 6 });
    expect(await prisma.chapterRevision.count({ where: { chapterId } })).toBe(1);
  });

  /**
   * The row lock, asserted as the property it exists for: **a second write to
   * the same project does not start until the first has committed.**
   *
   * Asserting the race itself instead — two `Promise.all` writes and a total at
   * the end — proves nothing. It passes with the lock removed, because the
   * window between recomputing and storing is a fraction of a millisecond and
   * nothing makes two clients land inside it on demand. What *is* observable on
   * demand is the serialisation: the first transaction holds its lock while its
   * mutation runs, so the second one's mutation cannot have started. Take
   * `FOR UPDATE` out of `lockProject` and this fails on the very next line.
   */
  it("serialises two writers on the same project, so neither recomputes over the other", async () => {
    const fixture = await seedProject("aggregates-lock");

    const events: string[] = [];
    let releaseFirst = (): void => undefined;
    let firstHasLock = (): void => undefined;

    const held = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      firstHasLock = resolve;
    });

    const first = withProjectAggregates(fixture.scope, async () => {
      events.push("first:mutation");
      firstHasLock();
      await held;

      return succeed();
    });

    // The first mutation only runs once its transaction holds the lock.
    await locked;

    const second = withProjectAggregates(fixture.scope, async () => {
      events.push("second:mutation");

      return succeed();
    });

    // Long enough for a second transaction that was *not* blocked to have run
    // its mutation several times over.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(events).toEqual(["first:mutation"]);

    releaseFirst();
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    expect(events).toEqual(["first:mutation", "second:mutation"]);
  });

  it("stays exact under two concurrent writes to different chapters", async () => {
    const fixture = await seedProject("aggregates-concurrent");

    const [first, second] = await Promise.all([
      appendGeneratedChapterRevision(fixture.scope, {
        chapterId: chapterAt(fixture, 0),
        content: FOUR_WORDS,
        authorId: ownerId,
      }),
      appendGeneratedChapterRevision(fixture.scope, {
        chapterId: chapterAt(fixture, 1),
        content: SIX_WORDS,
        authorId: ownerId,
      }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    await expectAggregates(fixture, { writtenChapterCount: 2, totalWordCount: 10 });
  });

  it("rewrites a drifted counter from the rows themselves", async () => {
    const fixture = await seedProject("aggregates-reconcile");

    await appendGeneratedChapterRevision(fixture.scope, {
      chapterId: chapterAt(fixture, 0),
      content: FIVE_WORDS,
      authorId: ownerId,
    });

    // Drift, forced: a row written before CAL-033 existed, or by something that
    // reached the table another way.
    await prisma.$executeRaw`
      UPDATE "projects" SET "writtenChapterCount" = 99, "totalWordCount" = 9999
      WHERE "id" = ${fixture.projectId}
    `;

    const reconciled = await reconcileProjectAggregates(fixture.scope);

    expect(reconciled.ok).toBe(true);
    if (reconciled.ok) {
      expect(reconciled.value).toEqual({ writtenChapterCount: 1, totalWordCount: 5 });
    }
    await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 5 });
  });

  // The counters are derived state, so the write that maintains them credits
  // nobody and dates nothing: `Project.version` is the optimistic-concurrency
  // token for the project's own attributes, and a chapter generation bumping it
  // would collide with an unrelated rename.
  it("leaves the project's audit block alone", async () => {
    const fixture = await seedProject("aggregates-audit");

    const before = await prisma.project.findUniqueOrThrow({
      where: { id: fixture.projectId },
      select: { version: true, updatedById: true, updatedAt: true },
    });

    await appendGeneratedChapterRevision(fixture.scope, {
      chapterId: chapterAt(fixture, 0),
      content: SIX_WORDS,
      authorId: ownerId,
    });

    const after = await prisma.project.findUniqueOrThrow({
      where: { id: fixture.projectId },
      select: { version: true, updatedById: true, updatedAt: true, totalWordCount: true },
    });

    expect(after.totalWordCount).toBe(6);
    expect(after.version).toBe(before.version);
    expect(after.updatedById).toBe(before.updatedById);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("feeds the dashboard the stored counters, beside a planned count it still computes", async () => {
    const fixture = await seedProject("aggregates-dashboard", 3);

    await appendGeneratedChapterRevision(fixture.scope, {
      chapterId: chapterAt(fixture, 0),
      content: SIX_WORDS,
      authorId: ownerId,
    });
    await appendGeneratedChapterRevision(fixture.scope, {
      chapterId: chapterAt(fixture, 1),
      content: FOUR_WORDS,
      authorId: ownerId,
    });

    const rows = await listProjectDashboardRows(ownerId);
    const row = rows.find((candidate) => candidate.id === fixture.projectId);

    expect(row).toMatchObject({
      plannedChapterCount: 3,
      writtenChapterCount: 2,
      totalWordCount: 10,
    });
  });

  describe("another owner", () => {
    it("cannot move a project's counters, or read them", async () => {
      const fixture = await seedProject("aggregates-isolation");

      await appendGeneratedChapterRevision(fixture.scope, {
        chapterId: chapterAt(fixture, 0),
        content: SIX_WORDS,
        authorId: ownerId,
      });
      await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 6 });

      // The shape an attack takes once the type system is out of the picture:
      // a scope naming this project with another user's id. The brand is a
      // registry symbol, so it can be forged; what refuses it is the `userId`
      // in every statement, including the `FOR UPDATE` that opens the
      // transaction.
      const forged = {
        [Symbol.for("calepin.ProjectScope")]: true,
        projectId: fixture.projectId,
        ownerId: otherOwnerId,
      } as unknown as ProjectScope;

      const appended = await appendGeneratedChapterRevision(forged, {
        chapterId: chapterAt(fixture, 1),
        content: FOUR_WORDS,
        authorId: otherOwnerId,
      });
      expect(appended.ok).toBe(false);
      if (!appended.ok) expect(appended.error.code).toBe("NOT_FOUND");

      const restored = await restoreChapterRevision(forged, {
        chapterId: chapterAt(fixture, 0),
        revisionNumber: 1,
        authorId: otherOwnerId,
      });
      expect(restored.ok).toBe(false);

      const removed = await deleteChapter(forged, { chapterId: chapterAt(fixture, 0) });
      expect(removed.ok).toBe(false);

      const reconciled = await reconcileProjectAggregates(forged);
      expect(reconciled.ok).toBe(false);

      const computed = await computeProjectAggregates(forged);
      expect(computed.ok).toBe(false);
      if (!computed.ok) expect(computed.error.code).toBe("NOT_FOUND");

      // Nothing moved, and nothing was written.
      await expectAggregates(fixture, { writtenChapterCount: 1, totalWordCount: 6 });
      expect(await prisma.chapterRevision.count({ where: { chapterId: chapterAt(fixture, 1) } })) //
        .toBe(0);
    });

    it("cannot reach a chapter of another project through a scope of its own", async () => {
      const mine = await seedProject("aggregates-cross-a");
      const theirs = await seedProject("aggregates-cross-b");

      await appendGeneratedChapterRevision(theirs.scope, {
        chapterId: chapterAt(theirs, 0),
        content: SIX_WORDS,
        authorId: ownerId,
      });

      // A real scope, a chapter belonging to a different project of the same
      // owner: the relation path is what refuses it, not the owner column.
      const appended = await appendGeneratedChapterRevision(mine.scope, {
        chapterId: chapterAt(theirs, 0),
        content: FOUR_WORDS,
        authorId: ownerId,
      });

      expect(appended.ok).toBe(false);
      if (!appended.ok) expect(appended.error.code).toBe("NOT_FOUND");
      await expectAggregates(mine, { writtenChapterCount: 0, totalWordCount: 0 });
      await expectAggregates(theirs, { writtenChapterCount: 1, totalWordCount: 6 });
    });
  });

  it("refuses a scope that never crossed openProjectScope", async () => {
    const fixture = await seedProject("aggregates-unscoped");

    await expect(
      withProjectAggregates({ projectId: fixture.projectId, ownerId } as ProjectScope, async () =>
        succeed(),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_SCOPE_REQUIRED" });
  });
});
