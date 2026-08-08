/**
 * `listProjectDashboardRows` (CAL-032), against a real PostgreSQL: **the
 * dashboard's aggregates are correct, and the whole read is one SQL
 * statement — never one query per project or per chapter.**
 *
 * Same shape as `owner-access.integration.test.ts`: a `createAuditedClient`
 * for seeding (the audited writes the schema's `updatedById` columns
 * require), and a separate bare `PrismaClient` registered on the seam — the
 * one the repository function itself reads through, and the one this suite
 * listens to for query events.
 *
 * Since CAL-033 two of the three aggregates are stored on the row, so the seed
 * writes its revisions directly and then reconciles — which is also what makes
 * the "latest revision only" claim below still a claim about the aggregate
 * itself rather than about numbers this file typed in.
 * `project-aggregates.integration.test.ts` owns the other half: that the write
 * paths keep those columns exact in the first place.
 */

import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  listProjectDashboardRows,
  openProjectScope,
  reconcileProjectAggregates,
} from "@calepin/shared/repository";
import { type Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

describe("listProjectDashboardRows (CAL-032)", () => {
  const { prisma, setActor } = createAuditedClient();
  const queryLog: string[] = [];
  const seam = new PrismaClient({ log: [{ emit: "event", level: "query" }] });

  beforeAll(() => {
    seam.$on("query", (event: Prisma.QueryEvent) => {
      queryLog.push(event.query);
    });
    configureDatabaseClient(seam);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  it("aggregates chapters and words from the latest revision only, across every project, in one query", async () => {
    const user = await prisma.user.create({
      data: { email: "project-dashboard-owner@example.test" },
    });
    setActor(user.id);

    // First project: three chapters — one revised twice (proves "latest
    // revision only", not a sum of every draft), one written once, one still
    // unwritten.
    const firstProject = await prisma.project.create({
      data: { userId: user.id, title: "First project" },
    });
    const firstBible = await prisma.bible.create({ data: { projectId: firstProject.id } });
    const firstOutline = await prisma.outline.create({
      data: { projectId: firstProject.id, bibleId: firstBible.id },
    });
    const firstPart = await prisma.part.create({
      data: { outlineId: firstOutline.id, orderKey: "i", title: "Part one" },
    });

    const revisedChapter = await prisma.chapter.create({
      data: {
        outlineId: firstOutline.id,
        bibleId: firstBible.id,
        partId: firstPart.id,
        orderKey: "i",
      },
    });
    await prisma.chapterRevision.create({
      data: {
        chapterId: revisedChapter.id,
        revisionNumber: 1,
        origin: "GENERATED",
        content: "fixture",
        wordCount: 500,
        createdById: user.id,
      },
    });
    await prisma.chapterRevision.create({
      data: {
        chapterId: revisedChapter.id,
        revisionNumber: 2,
        origin: "EDITED",
        content: "fixture",
        wordCount: 800,
        createdById: user.id,
      },
    });

    const writtenOnceChapter = await prisma.chapter.create({
      data: {
        outlineId: firstOutline.id,
        bibleId: firstBible.id,
        partId: firstPart.id,
        orderKey: "r",
      },
    });
    await prisma.chapterRevision.create({
      data: {
        chapterId: writtenOnceChapter.id,
        revisionNumber: 1,
        origin: "GENERATED",
        content: "fixture",
        wordCount: 300,
        createdById: user.id,
      },
    });

    await prisma.chapter.create({
      data: {
        outlineId: firstOutline.id,
        bibleId: firstBible.id,
        partId: firstPart.id,
        orderKey: "x",
      },
    });

    // Second project: one chapter, one revision.
    const secondProject = await prisma.project.create({
      data: { userId: user.id, title: "Second project" },
    });
    const secondBible = await prisma.bible.create({ data: { projectId: secondProject.id } });
    const secondOutline = await prisma.outline.create({
      data: { projectId: secondProject.id, bibleId: secondBible.id },
    });
    const secondPart = await prisma.part.create({
      data: { outlineId: secondOutline.id, orderKey: "i", title: "Part one" },
    });
    const secondChapter = await prisma.chapter.create({
      data: {
        outlineId: secondOutline.id,
        bibleId: secondBible.id,
        partId: secondPart.id,
        orderKey: "i",
      },
    });
    await prisma.chapterRevision.create({
      data: {
        chapterId: secondChapter.id,
        revisionNumber: 1,
        origin: "GENERATED",
        content: "fixture",
        wordCount: 42,
        createdById: user.id,
      },
    });

    // Third project: no outline at all yet — the null-safe path.
    const thirdProject = await prisma.project.create({
      data: { userId: user.id, title: "Third project" },
    });

    // The rows above were written directly, so the stored counters are still at
    // their default. Reconciling recomputes them from those rows — the same
    // statement a real write path runs, applied here to a seed that bypassed
    // one.
    for (const projectId of [firstProject.id, secondProject.id, thirdProject.id]) {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) throw new Error("the fixture could not open a scope on its own project");

      const reconciled = await reconcileProjectAggregates(scope.value);
      expect(reconciled.ok).toBe(true);
    }

    queryLog.length = 0;
    const rows = await listProjectDashboardRows(user.id);

    expect(queryLog).toHaveLength(1);

    expect(rows).toHaveLength(3);

    const first = rows.find((row) => row.id === firstProject.id);
    expect(first).toMatchObject({
      title: "First project",
      plannedChapterCount: 3,
      writtenChapterCount: 2,
      totalWordCount: 1100, // 800 (latest of the revised chapter) + 300, never 500 + 800 + 300
    });

    const second = rows.find((row) => row.id === secondProject.id);
    expect(second).toMatchObject({
      title: "Second project",
      plannedChapterCount: 1,
      writtenChapterCount: 1,
      totalWordCount: 42,
    });

    const third = rows.find((row) => row.id === thirdProject.id);
    expect(third).toMatchObject({
      title: "Third project",
      plannedChapterCount: 0,
      writtenChapterCount: 0,
      totalWordCount: 0,
    });
  });

  it("searches by title, filters by status and sorts by progress (CAL-036), still in one query", async () => {
    const user = await prisma.user.create({
      data: { email: "project-dashboard-filters@example.test" },
    });
    setActor(user.id);

    const draftProject = await prisma.project.create({
      data: { userId: user.id, title: "Draft Alpha" },
    });
    const writingProject = await prisma.project.create({
      data: { userId: user.id, title: "Writing Beta" },
    });
    const archivedProject = await prisma.project.create({
      data: { userId: user.id, title: "Archived Gamma" },
    });

    await prisma.project.update({
      where: { id: writingProject.id },
      data: { status: "WRITING_IN_PROGRESS" },
    });
    await prisma.project.update({
      where: { id: archivedProject.id },
      data: { status: "ARCHIVED" },
    });

    queryLog.length = 0;
    const bySearch = await listProjectDashboardRows(user.id, { search: "beta" });
    expect(queryLog).toHaveLength(1);
    expect(bySearch.map((row) => row.id)).toEqual([writingProject.id]);

    const byStatus = await listProjectDashboardRows(user.id, { status: "DRAFT" });
    expect(byStatus.map((row) => row.id)).toEqual([draftProject.id]);

    // Furthest stage first: ARCHIVED, then WRITING_IN_PROGRESS, then DRAFT —
    // `PROJECT_STATUSES`' own order, not an in-memory sort.
    const byProgress = await listProjectDashboardRows(user.id, { sort: "progress" });
    expect(byProgress.map((row) => row.id)).toEqual([
      archivedProject.id,
      writingProject.id,
      draftProject.id,
    ]);
  });
});
