import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AuditedClient, createAuditedClient } from "./audited-client";
import { fixtureGenerationKey, fixtureLease } from "./generation-fixture";

/**
 * CAL-021, against the real server. Two acceptance criteria drive this suite:
 * a failed generation is replayable from its trace, and a quality issue carries
 * the five statuses of the specification. The rest proves the constraints the
 * migration hand-writes, and that the operational indicators of specification
 * §17 are computable from these tables rather than merely intended to be.
 *
 * Every fixture string is technical (§9). Nothing here needs prose: what is
 * under test is what a row records about a call, never what the call produced.
 */
describe("operations schema", () => {
  let prisma: AuditedClient;
  let setActor: (id: string) => void;
  let sequence = 0;
  let generations = 0;

  /**
   * A distinct key per fixture row. Two rows meaning one ask would share one,
   * and the unique index would refuse the second — which is CAL-058's own
   * suite's business, not this one's.
   */
  function generationKey(): string {
    generations += 1;

    return fixtureGenerationKey(`operations-generation-${generations}`);
  }

  async function createProjectFixture() {
    sequence += 1;
    const user = await prisma.user.create({
      data: { email: `operations-${sequence}@example.test`, name: "Test User" },
    });
    setActor(user.id);
    const project = await prisma.project.create({
      data: { title: `operations-${sequence}`, userId: user.id },
    });

    return { userId: user.id, projectId: project.id };
  }

  async function createChapterFixture() {
    const base = await createProjectFixture();
    const bible = await prisma.bible.create({ data: { projectId: base.projectId } });
    const outline = await prisma.outline.create({
      data: { projectId: base.projectId, bibleId: bible.id },
    });
    const part = await prisma.part.create({
      data: { outlineId: outline.id, orderKey: "i", title: `part-${sequence}` },
    });
    const chapter = await prisma.chapter.create({
      data: { outlineId: outline.id, bibleId: bible.id, partId: part.id, orderKey: "i" },
    });

    return { ...base, bibleId: bible.id, outlineId: outline.id, chapterId: chapter.id };
  }

  function revisionData(
    chapterId: string,
    createdById: string,
    revisionNumber: number,
    generationId?: string,
  ) {
    return {
      chapterId,
      createdById,
      revisionNumber,
      origin: generationId ? ("GENERATED" as const) : ("EDITED" as const),
      content: `fixture-content-${revisionNumber}`,
      wordCount: 10 * revisionNumber,
      generationId: generationId ?? null,
    };
  }

  /** The mission's resolved input — identifiers and options, never a prompt. */
  const REPLAY_PAYLOAD = { chapterOrderKey: "i", targetWordCount: 1200, freedomLevel: "balanced" };

  beforeAll(() => {
    ({ prisma, setActor } = createAuditedClient());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // The acceptance criterion, end to end: the trace of a failed generation is
  // enough to run it again, and the failure left the chapter exactly as it was.
  describe("replaying a failed generation from its trace", () => {
    it("keeps the last valid revision, then succeeds on a second attempt driven by the stored payload alone", async () => {
      const fixture = await createChapterFixture();
      const lastValid = await prisma.chapterRevision.create({
        data: revisionData(fixture.chapterId, fixture.userId, 1),
      });

      const generation = await prisma.generation.create({
        data: {
          projectId: fixture.projectId,
          mission: "WRITE_SCENE",
          targetId: fixture.chapterId,
          input: REPLAY_PAYLOAD,
          idempotencyKey: generationKey(),
        },
      });
      expect(generation.status).toBe("QUEUED");

      // Attempt 1 — recorded as running before the model is called, then failed.
      await prisma.generationAttempt.create({
        data: {
          generationId: generation.id,
          attempt: 1,
          model: "fixture-model",
          leaseExpiresAt: fixtureLease(),
        },
      });
      await prisma.generationAttempt.update({
        where: { generationId_attempt: { generationId: generation.id, attempt: 1 } },
        data: {
          status: "FAILED",
          errorCode: "PROVIDER_UNAVAILABLE",
          errorCategory: "PROVIDER",
          inputTokens: 4200,
          outputTokens: 0,
          estimatedCostUsd: "0.012600",
          durationMs: 8400,
          completedAt: new Date(),
          leaseExpiresAt: null,
        },
      });
      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: "FAILED",
          errorCode: "PROVIDER_UNAVAILABLE",
          errorCategory: "PROVIDER",
          completedAt: new Date(),
        },
      });

      // The project is still valid: nothing was written but the trace.
      const afterFailure = await prisma.chapterRevision.findMany({
        where: { chapterId: fixture.chapterId },
      });
      expect(afterFailure).toHaveLength(1);
      expect(afterFailure[0]?.id).toBe(lastValid.id);
      expect(afterFailure[0]?.content).toBe(lastValid.content);

      // The replay reads nothing but the row: the mission, the target and the
      // payload are all there.
      const trace = await prisma.generation.findUniqueOrThrow({ where: { id: generation.id } });
      expect(trace.mission).toBe("WRITE_SCENE");
      expect(trace.targetId).toBe(fixture.chapterId);
      expect(trace.input).toEqual(REPLAY_PAYLOAD);
      expect(trace.errorCategory).toBe("PROVIDER");

      // Attempt 2, from that payload. The success appends a revision and
      // completes the generation — one write in production, two here.
      await prisma.generationAttempt.create({
        data: {
          generationId: trace.id,
          attempt: 2,
          model: "fixture-model-fallback",
          promptVersion: 3,
          status: "SUCCEEDED",
          inputTokens: 4200,
          outputTokens: 1800,
          estimatedCostUsd: "0.058200",
          durationMs: 31500,
          completedAt: new Date(),
        },
      });
      const produced = await prisma.chapterRevision.create({
        data: revisionData(fixture.chapterId, fixture.userId, 2, trace.id),
      });
      await prisma.generation.update({
        where: { id: trace.id },
        data: {
          status: "SUCCEEDED",
          errorCode: null,
          errorCategory: null,
          completedAt: new Date(),
        },
      });

      const revisions = await prisma.chapterRevision.findMany({
        where: { chapterId: fixture.chapterId },
        orderBy: { revisionNumber: "asc" },
      });
      expect(revisions.map((revision) => revision.id)).toEqual([lastValid.id, produced.id]);
      expect(revisions[1]?.generationId).toBe(trace.id);

      // "Nombre de tentatives" is the trace, not a counter: both attempts are
      // there, and the fallback model of the second one is recorded.
      const attempts = await prisma.generationAttempt.findMany({
        where: { generationId: trace.id },
        orderBy: { attempt: "asc" },
      });
      expect(attempts).toHaveLength(2);
      expect(attempts.map((one) => one.status)).toEqual(["FAILED", "SUCCEEDED"]);
      expect(attempts.map((one) => one.model)).toEqual(["fixture-model", "fixture-model-fallback"]);
    });

    // The idempotency the shared port's contract asks for in words, as a
    // constraint: a redelivered job cannot write a second cost line.
    it("refuses a second row for the same generation and attempt number", async () => {
      const fixture = await createProjectFixture();
      const generation = await prisma.generation.create({
        data: {
          projectId: fixture.projectId,
          mission: "EXTRACT_FACTS",
          input: {},
          idempotencyKey: generationKey(),
        },
      });
      const attempt = {
        generationId: generation.id,
        attempt: 1,
        model: "fixture-model",
        leaseExpiresAt: fixtureLease(),
      };
      await prisma.generationAttempt.create({ data: attempt });

      await expect(prisma.generationAttempt.create({ data: attempt })).rejects.toMatchObject({
        code: "P2002",
        meta: { target: ["generationId", "attempt"] },
      });
    });

    it("stores each of the five states of a queued generation", async () => {
      const fixture = await createProjectFixture();

      for (const status of ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const) {
        const terminal = status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";
        const generation = await prisma.generation.create({
          data: {
            projectId: fixture.projectId,
            mission: "CHECK_COHERENCE",
            input: {},
            idempotencyKey: generationKey(),
            status,
            completedAt: terminal ? new Date() : null,
            errorCode: status === "FAILED" ? "PROVIDER_UNAVAILABLE" : null,
            errorCategory: status === "FAILED" ? "PROVIDER" : null,
          },
        });

        expect(generation.status).toBe(status);
      }
    });
  });

  describe("the constraints the migration hand-writes", () => {
    it("refuses a terminal generation with no end, and a pending one with an end", async () => {
      const fixture = await createProjectFixture();
      const base = {
        projectId: fixture.projectId,
        mission: "WRITE_SCENE" as const,
        input: {},
        idempotencyKey: generationKey(),
      };

      await expect(
        prisma.generation.create({ data: { ...base, status: "SUCCEEDED" } }),
      ).rejects.toThrow(/generations_completion_check/);
      await expect(
        prisma.generation.create({ data: { ...base, status: "RUNNING", completedAt: new Date() } }),
      ).rejects.toThrow(/generations_completion_check/);
    });

    it("refuses a code without its category, and an error on anything but a failure", async () => {
      const fixture = await createProjectFixture();
      const base = {
        projectId: fixture.projectId,
        mission: "WRITE_SCENE" as const,
        input: {},
        idempotencyKey: generationKey(),
      };

      await expect(
        prisma.generation.create({
          data: { ...base, status: "FAILED", completedAt: new Date(), errorCode: "TIMEOUT" },
        }),
      ).rejects.toThrow(/generations_failure_check/);
      // A cancelled generation is not a failed one: nothing went wrong, so
      // there is nothing to classify.
      await expect(
        prisma.generation.create({
          data: {
            ...base,
            status: "CANCELLED",
            completedAt: new Date(),
            errorCode: "TIMEOUT",
            errorCategory: "TIMEOUT",
          },
        }),
      ).rejects.toThrow(/generations_failure_check/);
    });

    it("refuses a zeroth attempt, negative usage, and a finished attempt with no end", async () => {
      const fixture = await createProjectFixture();
      const generation = await prisma.generation.create({
        data: {
          projectId: fixture.projectId,
          mission: "SUMMARIZE_CHAPTER",
          input: {},
          idempotencyKey: generationKey(),
        },
      });
      const base = {
        generationId: generation.id,
        model: "fixture-model",
        leaseExpiresAt: fixtureLease(),
      };

      await expect(
        prisma.generationAttempt.create({ data: { ...base, attempt: 0 } }),
      ).rejects.toThrow(/generation_attempts_attempt_check/);
      await expect(
        prisma.generationAttempt.create({ data: { ...base, attempt: 1, outputTokens: -1 } }),
      ).rejects.toThrow(/generation_attempts_usage_check/);
      await expect(
        prisma.generationAttempt.create({
          data: { ...base, attempt: 1, estimatedCostUsd: "-0.000001" },
        }),
      ).rejects.toThrow(/generation_attempts_usage_check/);
      await expect(
        prisma.generationAttempt.create({
          data: { ...base, attempt: 1, status: "SUCCEEDED", leaseExpiresAt: null },
        }),
      ).rejects.toThrow(/generation_attempts_completion_check/);
    });

    it("refuses offsets with no revision to index into, and an end before its start", async () => {
      const fixture = await createChapterFixture();
      const issue = await prisma.qualityIssue.create({
        data: {
          projectId: fixture.projectId,
          category: "STYLE",
          severity: "MINOR",
          checkId: "fixture-check",
          explanation: "fixture explanation",
        },
      });
      const revision = await prisma.chapterRevision.create({
        data: revisionData(fixture.chapterId, fixture.userId, 1),
      });

      await expect(
        prisma.qualityIssuePassage.create({
          data: { issueId: issue.id, chapterId: fixture.chapterId, startOffset: 0, endOffset: 12 },
        }),
      ).rejects.toThrow(/quality_issue_passages_offsets_check/);
      await expect(
        prisma.qualityIssuePassage.create({
          data: {
            issueId: issue.id,
            chapterId: fixture.chapterId,
            chapterRevisionId: revision.id,
            startOffset: 12,
            endOffset: 4,
          },
        }),
      ).rejects.toThrow(/quality_issue_passages_offsets_check/);
      await expect(
        prisma.qualityIssuePassage.create({
          data: {
            issueId: issue.id,
            chapterId: fixture.chapterId,
            chapterRevisionId: revision.id,
            startOffset: 0,
          },
        }),
      ).rejects.toThrow(/quality_issue_passages_offsets_check/);
    });

    it("refuses a passage anchored into another chapter's revision", async () => {
      const fixture = await createChapterFixture();
      const other = await createChapterFixture();
      const issue = await prisma.qualityIssue.create({
        data: {
          projectId: fixture.projectId,
          category: "FACTUAL_CONTINUITY",
          severity: "CRITICAL",
          checkId: "fixture-check",
          explanation: "fixture explanation",
        },
      });
      const foreign = await prisma.chapterRevision.create({
        data: revisionData(other.chapterId, other.userId, 1),
      });

      await expect(
        prisma.qualityIssuePassage.create({
          data: {
            issueId: issue.id,
            chapterId: fixture.chapterId,
            chapterRevisionId: foreign.id,
            startOffset: 0,
            endOffset: 4,
          },
        }),
      ).rejects.toThrow(/quality_issue_passages_chapterId_chapterRevisionId_fkey/);
    });

    it("refuses a ready export with no end and an error code on anything but a failure", async () => {
      const fixture = await createProjectFixture();
      const base = {
        projectId: fixture.projectId,
        requestedById: fixture.userId,
        format: "MARKDOWN" as const,
      };

      await expect(prisma.export.create({ data: { ...base, status: "READY" } })).rejects.toThrow(
        /exports_completion_check/,
      );
      await expect(
        prisma.export.create({
          data: { ...base, status: "READY", completedAt: new Date(), errorCode: "INTERNAL" },
        }),
      ).rejects.toThrow(/exports_failure_check/);
      await expect(prisma.export.create({ data: { ...base, byteSize: -1 } })).rejects.toThrow(
        /exports_size_check/,
      );
    });

    it("refuses a malformed public address and a visible novel with no publication date", async () => {
      const fixture = await createProjectFixture();
      const base = {
        projectId: fixture.projectId,
        title: "fixture-title",
        authorName: "Test Author",
      };

      for (const slug of ["Fixture-Slug", "fixture slug", "-fixture", "fixture--slug", "ab"]) {
        await expect(prisma.publication.create({ data: { ...base, slug } })).rejects.toThrow(
          /publications_slug_check/,
        );
      }

      await expect(
        prisma.publication.create({
          data: { ...base, slug: `fixture-${sequence}`, visibility: "PUBLIC" },
        }),
      ).rejects.toThrow(/publications_published_check/);
    });
  });

  describe("the quality issue", () => {
    it("stores each of the five categories and each of the five statuses", async () => {
      const fixture = await createProjectFixture();
      const cases = [
        { category: "FACTUAL_CONTINUITY", status: "DETECTED" },
        { category: "PSYCHOLOGICAL_CONTINUITY", status: "ACCEPTED" },
        { category: "STRUCTURE", status: "TO_FIX" },
        { category: "STYLE", status: "FIXED" },
        { category: "ORIGINALITY", status: "IGNORED" },
      ] as const;

      for (const [index, { category, status }] of cases.entries()) {
        const issue = await prisma.qualityIssue.create({
          data: {
            projectId: fixture.projectId,
            category,
            severity: "MAJOR",
            status,
            checkId: `fixture-check-${index}`,
            explanation: "fixture explanation",
            proposedFix: "fixture fix",
          },
        });

        expect(issue.status).toBe(status);
        expect(issue.category).toBe(category);
      }
    });

    it("defaults to detected, the status a check writes", async () => {
      const fixture = await createProjectFixture();
      const issue = await prisma.qualityIssue.create({
        data: {
          projectId: fixture.projectId,
          category: "STRUCTURE",
          severity: "MINOR",
          checkId: "fixture-check",
          explanation: "fixture explanation",
        },
      });

      expect(issue.status).toBe("DETECTED");
      expect(issue.proposedFix).toBeNull();
      expect(issue.detectedByGenerationId).toBeNull();
    });

    // The three shapes the audit produces: a whole-manuscript remark, a
    // whole-chapter one, and a located one.
    it("holds an issue with no passage, one with a chapter, and one with offsets", async () => {
      const fixture = await createChapterFixture();
      const revision = await prisma.chapterRevision.create({
        data: revisionData(fixture.chapterId, fixture.userId, 1),
      });
      const issue = await prisma.qualityIssue.create({
        data: {
          projectId: fixture.projectId,
          category: "ORIGINALITY",
          severity: "MAJOR",
          checkId: "fixture-check",
          explanation: "fixture explanation",
        },
      });

      expect(await prisma.qualityIssuePassage.count({ where: { issueId: issue.id } })).toBe(0);

      const wholeChapter = await prisma.qualityIssuePassage.create({
        data: { issueId: issue.id, chapterId: fixture.chapterId },
      });
      const located = await prisma.qualityIssuePassage.create({
        data: {
          issueId: issue.id,
          chapterId: fixture.chapterId,
          chapterRevisionId: revision.id,
          startOffset: 4,
          endOffset: 18,
        },
      });

      expect(wholeChapter.chapterRevisionId).toBeNull();
      expect(located.chapterRevisionId).toBe(revision.id);
      expect(await prisma.qualityIssuePassage.count({ where: { issueId: issue.id } })).toBe(2);
    });
  });

  describe("what a deletion does", () => {
    // targetId carries no foreign key on purpose: a generation is an accounting
    // record, and deleting a chapter must not change what a project has cost.
    it("keeps a generation and its cost when the chapter it wrote is deleted", async () => {
      const fixture = await createChapterFixture();
      const generation = await prisma.generation.create({
        data: {
          projectId: fixture.projectId,
          mission: "WRITE_SCENE",
          targetId: fixture.chapterId,
          input: REPLAY_PAYLOAD,
          idempotencyKey: generationKey(),
          status: "SUCCEEDED",
          completedAt: new Date(),
        },
      });
      await prisma.generationAttempt.create({
        data: {
          generationId: generation.id,
          attempt: 1,
          model: "fixture-model",
          status: "SUCCEEDED",
          estimatedCostUsd: "0.041000",
          completedAt: new Date(),
        },
      });
      await prisma.chapterRevision.create({
        data: revisionData(fixture.chapterId, fixture.userId, 1, generation.id),
      });

      await prisma.chapter.delete({ where: { id: fixture.chapterId } });

      const kept = await prisma.generation.findUniqueOrThrow({ where: { id: generation.id } });
      expect(kept.targetId).toBe(fixture.chapterId);
      expect(await prisma.generationAttempt.count({ where: { generationId: generation.id } })).toBe(
        1,
      );
    });

    // Losing the trace must never cost the author a version of their chapter.
    it("un-references a revision's generation when the generation goes, keeping the revision", async () => {
      const fixture = await createChapterFixture();
      const generation = await prisma.generation.create({
        data: {
          projectId: fixture.projectId,
          mission: "WRITE_SCENE",
          targetId: fixture.chapterId,
          input: {},
          idempotencyKey: generationKey(),
          status: "SUCCEEDED",
          completedAt: new Date(),
        },
      });
      const revision = await prisma.chapterRevision.create({
        data: revisionData(fixture.chapterId, fixture.userId, 1, generation.id),
      });

      await prisma.generation.delete({ where: { id: generation.id } });

      const after = await prisma.chapterRevision.findUniqueOrThrow({ where: { id: revision.id } });
      expect(after.generationId).toBeNull();
      expect(after.content).toBe(revision.content);
    });

    it("takes every operational row of a project with the project", async () => {
      const fixture = await createChapterFixture();
      const generation = await prisma.generation.create({
        data: {
          projectId: fixture.projectId,
          mission: "CHECK_COHERENCE",
          input: {},
          idempotencyKey: generationKey(),
        },
      });
      await prisma.generationAttempt.create({
        data: {
          generationId: generation.id,
          attempt: 1,
          model: "fixture-model",
          leaseExpiresAt: fixtureLease(),
        },
      });
      const issue = await prisma.qualityIssue.create({
        data: {
          projectId: fixture.projectId,
          category: "STYLE",
          severity: "MINOR",
          checkId: "fixture-check",
          explanation: "fixture explanation",
          detectedByGenerationId: generation.id,
        },
      });
      await prisma.qualityIssuePassage.create({
        data: { issueId: issue.id, chapterId: fixture.chapterId },
      });
      await prisma.export.create({
        data: {
          projectId: fixture.projectId,
          requestedById: fixture.userId,
          format: "DOCX",
          status: "READY",
          completedAt: new Date(),
        },
      });
      await prisma.publication.create({
        data: {
          projectId: fixture.projectId,
          slug: `fixture-publication-${sequence}`,
          title: "fixture-title",
          authorName: "Test Author",
        },
      });

      await prisma.project.delete({ where: { id: fixture.projectId } });

      expect(await prisma.generation.count({ where: { id: generation.id } })).toBe(0);
      expect(await prisma.generationAttempt.count({ where: { generationId: generation.id } })).toBe(
        0,
      );
      expect(await prisma.qualityIssue.count({ where: { id: issue.id } })).toBe(0);
      expect(await prisma.qualityIssuePassage.count({ where: { issueId: issue.id } })).toBe(0);
      expect(await prisma.export.count({ where: { projectId: fixture.projectId } })).toBe(0);
      expect(await prisma.publication.count({ where: { projectId: fixture.projectId } })).toBe(0);
    });
  });

  // The design constraint of this task: the §17 indicators must be computable
  // from these tables. Four of them are computed here from real rows.
  describe("the indicators of the specification", () => {
    it("sums a project's cost across every attempt, failures included (§17.8)", async () => {
      const fixture = await createProjectFixture();
      const generation = await prisma.generation.create({
        data: {
          projectId: fixture.projectId,
          mission: "WRITE_SCENE",
          input: {},
          idempotencyKey: generationKey(),
          status: "SUCCEEDED",
          completedAt: new Date(),
        },
      });
      await prisma.generationAttempt.createMany({
        data: [
          {
            generationId: generation.id,
            attempt: 1,
            model: "fixture-model",
            status: "FAILED",
            errorCode: "PROVIDER_UNAVAILABLE",
            errorCategory: "PROVIDER",
            estimatedCostUsd: "0.012600",
            completedAt: new Date(),
          },
          {
            generationId: generation.id,
            attempt: 2,
            model: "fixture-model",
            status: "SUCCEEDED",
            estimatedCostUsd: "0.058200",
            completedAt: new Date(),
          },
        ],
      });

      const total = await prisma.generationAttempt.aggregate({
        where: { generation: { projectId: fixture.projectId } },
        _sum: { estimatedCostUsd: true },
      });

      // The failed attempt is in the total. A single row per generation could
      // only have carried one of the two numbers.
      expect(total._sum.estimatedCostUsd?.toString()).toBe("0.0708");
    });

    it("measures the delay between a project's creation and its first chapter (§17.9)", async () => {
      const fixture = await createProjectFixture();
      const project = await prisma.project.findUniqueOrThrow({ where: { id: fixture.projectId } });
      const completedAt = new Date(project.createdAt.getTime() + 90_000);
      await prisma.generation.create({
        data: {
          projectId: fixture.projectId,
          mission: "WRITE_SCENE",
          input: {},
          idempotencyKey: generationKey(),
          status: "SUCCEEDED",
          completedAt,
        },
      });

      const first = await prisma.generation.findFirstOrThrow({
        where: { projectId: fixture.projectId, mission: "WRITE_SCENE", status: "SUCCEEDED" },
        orderBy: { completedAt: "asc" },
      });
      // A succeeded generation always has an end — generations_completion_check
      // — so the fallback below is the assertion above failing, not a default.
      const firstChapterAt = first.completedAt ?? project.createdAt;

      expect(first.completedAt).not.toBeNull();
      expect(firstChapterAt.getTime() - project.createdAt.getTime()).toBe(90_000);
    });

    it("counts a project as having exported once one export is ready (§17.7)", async () => {
      const exported = await createProjectFixture();
      const notExported = await createProjectFixture();
      await prisma.export.create({
        data: {
          projectId: exported.projectId,
          requestedById: exported.userId,
          format: "MARKDOWN",
          status: "READY",
          byteSize: 40_960,
          wordCount: 6_400,
          completedAt: new Date(),
        },
      });
      await prisma.export.create({
        data: {
          projectId: notExported.projectId,
          requestedById: notExported.userId,
          format: "MARKDOWN",
          status: "FAILED",
          errorCode: "INTERNAL",
          completedAt: new Date(),
        },
      });

      const withReady = await prisma.export.groupBy({
        by: ["projectId"],
        where: {
          status: "READY",
          projectId: { in: [exported.projectId, notExported.projectId] },
        },
      });

      expect(withReady.map((row) => row.projectId)).toEqual([exported.projectId]);
    });

    it("counts a regeneration as a second succeeded generation on one target (§17.10)", async () => {
      const fixture = await createChapterFixture();
      const base = {
        projectId: fixture.projectId,
        mission: "WRITE_SCENE" as const,
        targetId: fixture.chapterId,
        status: "SUCCEEDED" as const,
      };
      // Two asks, not one delivered twice: a regeneration starts from the
      // revision the previous one wrote, so its payload — and therefore its
      // key — is a different one (CAL-058). Writing the same key twice here
      // would be refused by the unique index, correctly.
      await prisma.generation.create({
        data: {
          ...base,
          input: { ...REPLAY_PAYLOAD, baseRevisionNumber: 1 },
          idempotencyKey: generationKey(),
          completedAt: new Date(),
        },
      });
      await prisma.generation.create({
        data: {
          ...base,
          input: { ...REPLAY_PAYLOAD, baseRevisionNumber: 2 },
          idempotencyKey: generationKey(),
          completedAt: new Date(),
        },
      });

      const perTarget = await prisma.generation.groupBy({
        by: ["mission", "targetId"],
        where: { projectId: fixture.projectId, status: "SUCCEEDED" },
        _count: { _all: true },
      });

      expect(perTarget).toHaveLength(1);
      expect(perTarget[0]?._count._all).toBe(2);
    });
  });
});
