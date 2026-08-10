/**
 * CAL-055's acceptance criteria, against a real PostgreSQL: **the long context
 * leans on summaries, and those summaries are versioned entities.**
 *
 * Four claims are proved here, and none of them can be proved without rows:
 *
 *   1. Validating a chapter produces both summaries and refreshes its part's,
 *      and running it twice leaves two revisions with the first one untouched.
 *   2. A chapter that has not been validated is refused, and a model answer the
 *      schema rejects writes nothing at all (§6).
 *   3. A summary cannot be attached to another chapter's revision, and cannot
 *      be read or written across owners (§3.5).
 *   4. What `composeSceneContext` is handed for a later chapter is the stored
 *      summaries, at both resolutions, with the right distances — which is the
 *      whole point of storing them.
 *
 * **No real provider** (§8): the port is a stub, and it validates its own answer
 * against the caller's schema exactly as the pipeline does, so a stub returning
 * something the schema would reject cannot silently pass.
 *
 * Every string written here is technical (§9). The "summaries" are markers that
 * identify which row they came from; nothing a reader could read as a novel is
 * committed to this repository.
 */

import {
  appendChapterSummaryRevision,
  appendPartSummaryRevision,
  readCurrentChapterSummary,
  readPrecedingSummaries,
  refreshSummariesForValidatedChapter,
  summarizeChapter,
} from "@calepin/manuscript";
import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { fail, ProviderError, succeed } from "@calepin/shared/errors";
import { openProjectScope, type ProjectScope } from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const CHAPTER_TEXT = "alpha beta gamma delta epsilon";

/**
 * The port's types, derived from the function that takes one rather than
 * imported from `@calepin/ai`.
 *
 * This directory is not part of any package that declares `@calepin/ai`, and
 * pnpm's strict layout refuses the resolution here specifically — the trap
 * `tasks/lessons.md` records twice, for `@auth/core`'s `Adapter` and for its
 * `Account`. Reading the type off `summarizeChapter`'s own signature resolves
 * it from inside the package that owns it, and cannot fall out of step with
 * what the function actually accepts.
 */
type ModelProviderPort = Parameters<typeof summarizeChapter>[1]["port"];
type StructuredGenerationRequest<Output> = Parameters<
  ModelProviderPort["generateStructured"]
>[0] & { readonly schema: { safeParse(value: unknown): SafeParse<Output> } };

type SafeParse<Output> = { success: true; data: Output } | { success: false };

/**
 * A port answering with whatever it is given, parsed through the caller's own
 * schema first — the real pipeline's contract, reproduced.
 */
function stubPort(answers: { chapter?: unknown; part?: unknown }): ModelProviderPort {
  return {
    generateProse: () => Promise.reject(new Error("no prose mission runs in this suite")),
    generateStructured: async <Output>(request: StructuredGenerationRequest<Output>) => {
      const answer =
        request.prompt.missionId === "summarize-chapter" ? answers.chapter : answers.part;
      const parsed = request.schema.safeParse(answer);

      if (!parsed.success) {
        return fail(
          new ProviderError({ message: "the stub answered outside the mission's schema" }),
        );
      }

      return succeed({
        output: parsed.data,
        missionId: request.prompt.missionId,
        promptId: request.prompt.promptId,
        promptVersion: request.prompt.version,
        provider: "anthropic",
        model: "claude-sonnet-5",
        usage: { inputTokens: 1, outputTokens: 1 },
        durationMs: 1,
        attemptCount: 1,
        usedFallback: false,
      });
    },
  } as unknown as ModelProviderPort;
}

function chapterAnswer(marker: string) {
  return { briefSummary: `bref-${marker}`, detailedSummary: `detaille-${marker}` };
}

describe("hierarchical summaries (CAL-055)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;
  let intruderId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({ data: { email: "summaries-owner@example.test" } });
    const intruder = await prisma.user.create({
      data: { email: "summaries-intruder@example.test" },
    });

    ownerId = owner.id;
    intruderId = intruder.id;
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  interface Fixture {
    readonly scope: ProjectScope;
    readonly projectId: string;
    /** Two parts of two chapters each, in reading order. */
    readonly partIds: readonly string[];
    readonly chapterIds: readonly string[];
    readonly revisionIds: readonly string[];
  }

  /**
   * A plan of two parts and four chapters, every chapter with one revision and
   * every chapter VALIDATED.
   *
   * Built with scalars then children, never a scalar mixed with a nested
   * create — Prisma switches to its checked input type and rejects the scalar
   * with an error that reads as a schema bug.
   */
  async function seedPlan(label: string, owner = ownerId): Promise<Fixture> {
    setActor(owner);

    const project = await prisma.project.create({ data: { userId: owner, title: label } });
    const bible = await prisma.bible.create({ data: { projectId: project.id } });
    const outline = await prisma.outline.create({
      data: { projectId: project.id, bibleId: bible.id },
    });

    const partIds: string[] = [];
    const chapterIds: string[] = [];
    const revisionIds: string[] = [];

    for (const [partIndex, partKey] of ["i", "r"].entries()) {
      const part = await prisma.part.create({
        data: { outlineId: outline.id, orderKey: partKey, title: `${label}-part-${partIndex + 1}` },
      });
      partIds.push(part.id);

      for (const chapterKey of ["i", "r"]) {
        const chapter = await prisma.chapter.create({
          data: {
            outlineId: outline.id,
            bibleId: bible.id,
            partId: part.id,
            orderKey: chapterKey,
            status: "VALIDATED",
          },
        });
        const revision = await prisma.chapterRevision.create({
          data: {
            chapterId: chapter.id,
            revisionNumber: 1,
            origin: "GENERATED",
            content: CHAPTER_TEXT,
            wordCount: 5,
            createdById: owner,
          },
        });

        chapterIds.push(chapter.id);
        revisionIds.push(revision.id);
      }
    }

    const opened = await openProjectScope({ ownerId: owner, projectId: project.id });
    if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

    return { scope: opened.value, projectId: project.id, partIds, chapterIds, revisionIds };
  }

  describe("validating a chapter", () => {
    it("writes both summaries, refreshes the part, and versions each rerun", async () => {
      const plan = await seedPlan("versioned");
      const chapterId = plan.chapterIds[0] as string;

      const first = await runWithActor(ownerId, () =>
        refreshSummariesForValidatedChapter(plan.scope, {
          port: stubPort({ chapter: chapterAnswer("un"), part: { summary: "partie-un" } }),
          chapterId,
          authorId: ownerId,
        }),
      );

      expect(first.ok).toBe(true);
      if (!first.ok) return;

      expect(first.value.chapter.revisionNumber).toBe(1);
      expect(first.value.chapter.briefSummary).toBe("bref-un");
      expect(first.value.chapter.detailedSummary).toBe("detaille-un");
      // Counted at write time, never supplied by the caller.
      expect(first.value.chapter.briefWordCount).toBe(1);
      expect(first.value.part.revisionNumber).toBe(1);
      expect(first.value.part.summary).toBe("partie-un");

      const second = await runWithActor(ownerId, () =>
        refreshSummariesForValidatedChapter(plan.scope, {
          port: stubPort({ chapter: chapterAnswer("deux"), part: { summary: "partie-deux" } }),
          chapterId,
          authorId: ownerId,
        }),
      );

      expect(second.ok).toBe(true);
      if (!second.ok) return;

      expect(second.value.chapter.revisionNumber).toBe(2);
      expect(second.value.part.revisionNumber).toBe(2);

      // The versioning claim: nothing was overwritten.
      const revisions = await prisma.chapterSummaryRevision.findMany({
        where: { chapterId },
        orderBy: { revisionNumber: "asc" },
        select: { revisionNumber: true, briefSummary: true },
      });

      expect(revisions).toEqual([
        { revisionNumber: 1, briefSummary: "bref-un" },
        { revisionNumber: 2, briefSummary: "bref-deux" },
      ]);

      // And the current one is the highest, read back through the repository.
      const current = await readCurrentChapterSummary(plan.scope, chapterId);
      expect(current.ok).toBe(true);
      if (!current.ok) return;
      expect(current.value?.revisionNumber).toBe(2);
    });

    it("records the revision the summaries were made from", async () => {
      const plan = await seedPlan("provenance");

      const result = await runWithActor(ownerId, () =>
        summarizeChapter(plan.scope, {
          port: stubPort({ chapter: chapterAnswer("prov") }),
          chapterId: plan.chapterIds[0] as string,
          authorId: ownerId,
        }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.chapterRevisionId).toBe(plan.revisionIds[0]);
    });
  });

  describe("what it refuses", () => {
    it("refuses a chapter that has not been validated, and writes nothing", async () => {
      const plan = await seedPlan("not-validated");
      const chapterId = plan.chapterIds[0] as string;

      setActor(ownerId);
      await prisma.chapter.update({ where: { id: chapterId }, data: { status: "FIRST_DRAFT" } });

      const result = await runWithActor(ownerId, () =>
        summarizeChapter(plan.scope, {
          port: stubPort({ chapter: chapterAnswer("draft") }),
          chapterId,
          authorId: ownerId,
        }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("CHAPTER_NOT_VALIDATED");
      expect(result.error.category).toBe("conflict");

      expect(await prisma.chapterSummaryRevision.count({ where: { chapterId } })).toBe(0);
    });

    // §6: a response that fails validation writes nothing at all. A
    // half-persisted memory is worse than a failed generation, because the
    // failure is visible and the memory is not.
    it("writes nothing when the model answers outside the schema", async () => {
      const plan = await seedPlan("invalid-output");
      const chapterId = plan.chapterIds[0] as string;

      const result = await runWithActor(ownerId, () =>
        summarizeChapter(plan.scope, {
          port: stubPort({ chapter: { briefSummary: "bref" } }),
          chapterId,
          authorId: ownerId,
        }),
      );

      expect(result.ok).toBe(false);
      expect(await prisma.chapterSummaryRevision.count({ where: { chapterId } })).toBe(0);
    });

    it("refuses to summarise a chapter that has no revision yet", async () => {
      const plan = await seedPlan("no-revision");

      setActor(ownerId);
      const bare = await prisma.chapter.create({
        data: {
          outlineId: (
            await prisma.chapter.findUniqueOrThrow({
              where: { id: plan.chapterIds[0] as string },
              select: { outlineId: true },
            })
          ).outlineId,
          bibleId: (
            await prisma.chapter.findUniqueOrThrow({
              where: { id: plan.chapterIds[0] as string },
              select: { bibleId: true },
            })
          ).bibleId,
          partId: plan.partIds[0] as string,
          orderKey: "z",
          status: "VALIDATED",
        },
      });

      const result = await runWithActor(ownerId, () =>
        summarizeChapter(plan.scope, {
          port: stubPort({ chapter: chapterAnswer("none") }),
          chapterId: bare.id,
          authorId: ownerId,
        }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("NOT_FOUND");
    });

    // The provenance foreign key, from the caller's side: pairing a chapter
    // with another chapter's revision is refused by a scoped read, so the
    // caller gets a NOT_FOUND it can act on rather than a constraint violation.
    it("refuses to summarise one chapter against another's revision", async () => {
      const plan = await seedPlan("wrong-revision");

      const result = await runWithActor(ownerId, () =>
        appendChapterSummaryRevision(plan.scope, {
          chapterId: plan.chapterIds[0] as string,
          chapterRevisionId: plan.revisionIds[1] as string,
          briefSummary: "bref",
          detailedSummary: "detaille",
          authorId: ownerId,
        }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("NOT_FOUND");
    });
  });

  // §3.5, the rule every repository function ships with a test for: not yours
  // and not there are the same answer.
  describe("across owners", () => {
    it("refuses every entry point to a scope forged on another owner's project", async () => {
      const plan = await seedPlan("owned");

      const opened = await openProjectScope({
        ownerId: intruderId,
        projectId: plan.projectId,
      });

      // The scope cannot even be opened — the check happens before anything
      // downstream is reachable.
      expect(opened.ok).toBe(false);

      // And with the *intruder's own* scope, every read and write finds
      // nothing: the filter names the owner, not just the project.
      const theirs = await seedPlan("intruder-owned", intruderId);

      const read = await readPrecedingSummaries(theirs.scope, plan.chapterIds[1] as string);
      expect(read.ok).toBe(false);

      const written = await runWithActor(intruderId, () =>
        appendChapterSummaryRevision(theirs.scope, {
          chapterId: plan.chapterIds[0] as string,
          chapterRevisionId: plan.revisionIds[0] as string,
          briefSummary: "bref",
          detailedSummary: "detaille",
          authorId: intruderId,
        }),
      );

      expect(written.ok).toBe(false);

      const part = await runWithActor(intruderId, () =>
        appendPartSummaryRevision(theirs.scope, {
          partId: plan.partIds[0] as string,
          summary: "partie",
          authorId: intruderId,
        }),
      );

      expect(part.ok).toBe(false);
      expect(
        await prisma.chapterSummaryRevision.count({
          where: { chapterId: plan.chapterIds[0] as string },
        }),
      ).toBe(0);
      expect(
        await prisma.partSummaryRevision.count({ where: { partId: plan.partIds[0] as string } }),
      ).toBe(0);
    });
  });

  /**
   * The acceptance criterion itself, from the reading side: what a later
   * chapter's context is built out of.
   */
  describe("what the context composer is handed", () => {
    it("returns the stored summaries at both resolutions, with their distances", async () => {
      const plan = await seedPlan("context");

      // Summarise the three chapters before the last one, and both parts.
      for (const [index, chapterId] of plan.chapterIds.slice(0, 3).entries()) {
        await runWithActor(ownerId, () =>
          summarizeChapter(plan.scope, {
            port: stubPort({ chapter: chapterAnswer(`c${index + 1}`) }),
            chapterId,
            authorId: ownerId,
          }),
        );
      }

      for (const [index, partId] of plan.partIds.entries()) {
        await runWithActor(ownerId, () =>
          appendPartSummaryRevision(plan.scope, {
            partId,
            summary: `partie-${index + 1}`,
            authorId: ownerId,
          }),
        );
      }

      // The target is the fourth chapter — second chapter of the second part.
      const context = await readPrecedingSummaries(plan.scope, plan.chapterIds[3] as string);

      expect(context.ok).toBe(true);
      if (!context.ok) return;

      // Three preceding chapters, nearest at distance 1, in story order.
      expect(context.value.chapters.map((chapter) => chapter.distance)).toEqual([3, 2, 1]);
      expect(context.value.chapters.map((chapter) => chapter.briefSummary)).toEqual([
        "bref-c1",
        "bref-c2",
        "bref-c3",
      ]);
      expect(context.value.chapters[2]?.detailedSummary).toBe("detaille-c3");

      // Exactly one part is *entirely* behind the target: the first. The
      // target's own part is represented by its chapters, because half of it
      // has not happened yet.
      expect(context.value.parts).toEqual([
        { id: plan.partIds[0], distance: 1, summary: "partie-1" },
      ]);
    });

    it("offers the current summary of a chapter and never an earlier one", async () => {
      const plan = await seedPlan("current-only");
      const chapterId = plan.chapterIds[0] as string;

      for (const marker of ["vieux", "neuf"]) {
        await runWithActor(ownerId, () =>
          summarizeChapter(plan.scope, {
            port: stubPort({ chapter: chapterAnswer(marker) }),
            chapterId,
            authorId: ownerId,
          }),
        );
      }

      const context = await readPrecedingSummaries(plan.scope, plan.chapterIds[1] as string);

      expect(context.ok).toBe(true);
      if (!context.ok) return;
      expect(context.value.chapters).toHaveLength(1);
      expect(context.value.chapters[0]?.briefSummary).toBe("bref-neuf");
    });

    it("composes chapter 1 from nothing, without failing", async () => {
      const plan = await seedPlan("first-chapter");

      const context = await readPrecedingSummaries(plan.scope, plan.chapterIds[0] as string);

      expect(context.ok).toBe(true);
      if (!context.ok) return;
      expect(context.value).toEqual({ parts: [], chapters: [] });
    });
  });
});
