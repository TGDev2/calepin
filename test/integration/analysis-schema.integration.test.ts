import { AnalysisSection, PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const VALIDATION_CHECK = /analyses_validation_check/;
const REVISION_NUMBER_CHECK = /analysis_section_revisions_revision_number_check/;
const POSITION_CHECK = /analysis_elements_position_check/;

/**
 * Fixture strings are deliberately technical. CLAUDE.md §9 forbids literary
 * content in any committed artefact, and a schema test needs none: what is
 * under test is the shape, never the prose it will one day hold.
 */
const FIXTURE_STATEMENT = "fixture statement";

describe("analysis schema", () => {
  let prisma: PrismaClient;
  let userId: string;
  let sequence = 0;

  /** A project with a source text version, which every revision must reference. */
  async function createProjectFixture() {
    sequence += 1;
    const project = await prisma.project.create({
      data: { title: `analysis-schema-${sequence}`, userId },
    });
    const sourceText = await prisma.sourceText.create({ data: { projectId: project.id } });
    const version = await prisma.sourceTextVersion.create({
      data: {
        sourceTextId: sourceText.id,
        versionNumber: 1,
        content: "fixture source text",
        wordCount: 3,
        editedById: userId,
      },
    });

    return { projectId: project.id, sourceTextVersionId: version.id };
  }

  async function createAnalysisFixture() {
    const { projectId, sourceTextVersionId } = await createProjectFixture();
    const analysis = await prisma.analysis.create({ data: { projectId } });

    return { projectId, sourceTextVersionId, analysisId: analysis.id };
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    const user = await prisma.user.create({
      data: { email: "analysis-schema@example.test", name: "Test User" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // CAL-014's first acceptance criterion. The seventeen sections are the
  // seventeen members of one enum, so the proof is that each of them accepts a
  // revision with an element and comes back out again.
  describe("the seventeen sections", () => {
    it("each holds its own revision and elements", async () => {
      const { analysisId, sourceTextVersionId } = await createAnalysisFixture();
      const sections = Object.values(AnalysisSection);

      expect(sections).toHaveLength(17);

      for (const section of sections) {
        await prisma.analysisSectionRevision.create({
          data: {
            analysisId,
            section,
            revisionNumber: 1,
            origin: "GENERATED",
            sourceTextVersionId,
            createdById: userId,
            elements: {
              create: {
                position: 0,
                kind: "FACTUAL",
                label: section,
                statement: FIXTURE_STATEMENT,
                evidence: "fixture passage",
              },
            },
          },
        });
      }

      const stored = await prisma.analysisSectionRevision.findMany({
        where: { analysisId },
        include: { elements: true },
      });

      expect(stored).toHaveLength(17);
      expect(stored.map((revision) => revision.section).sort()).toEqual([...sections].sort());
      for (const revision of stored) {
        expect(revision.elements).toHaveLength(1);
      }
    });

    // The current state of the analysis is "the highest-numbered revision of
    // each section". With no isCurrent column that has to stay one indexed
    // query, not seventeen — DISTINCT ON reads it straight off
    // analysis_section_revisions_analysisId_section_revisionNumber_key.
    it("are read in a single query, current revision only", async () => {
      const { analysisId, sourceTextVersionId } = await createAnalysisFixture();

      for (const section of Object.values(AnalysisSection)) {
        for (const revisionNumber of [1, 2]) {
          await prisma.analysisSectionRevision.create({
            data: {
              analysisId,
              section,
              revisionNumber,
              origin: revisionNumber === 1 ? "GENERATED" : "EDITED",
              sourceTextVersionId,
              createdById: userId,
            },
          });
        }
      }

      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();

      try {
        const result = await client.query<{ section: string; revisionNumber: number }>(
          `SELECT DISTINCT ON ("section") "section", "revisionNumber"
             FROM "analysis_section_revisions"
            WHERE "analysisId" = $1
            ORDER BY "section", "revisionNumber" DESC`,
          [analysisId],
        );

        expect(result.rows).toHaveLength(17);
        expect(result.rows.every((row) => row.revisionNumber === 2)).toBe(true);
      } finally {
        await client.end();
      }
    });
  });

  // CAL-014's second acceptance criterion. A NOT NULL enum column is the only
  // version of "every element carries its marker" that survives a write which
  // does not go through Prisma.
  describe("the factual / interpretation marker", () => {
    it("accepts both markers on the same section", async () => {
      const { analysisId, sourceTextVersionId } = await createAnalysisFixture();

      const revision = await prisma.analysisSectionRevision.create({
        data: {
          analysisId,
          section: "THEMES",
          revisionNumber: 1,
          origin: "GENERATED",
          sourceTextVersionId,
          createdById: userId,
          elements: {
            create: [
              { position: 0, kind: "FACTUAL", statement: FIXTURE_STATEMENT, evidence: "fixture" },
              { position: 1, kind: "INTERPRETATION", statement: FIXTURE_STATEMENT },
            ],
          },
        },
        include: { elements: { orderBy: { position: "asc" } } },
      });

      expect(revision.elements.map((element) => element.kind)).toEqual([
        "FACTUAL",
        "INTERPRETATION",
      ]);
      // An interpretation needs no supporting passage; a factual element has
      // somewhere to put one. CAL-071 owns when it becomes mandatory.
      expect(revision.elements[1]?.evidence).toBeNull();
    });

    it("refuses an element stored without one, even through raw SQL", async () => {
      const { analysisId, sourceTextVersionId } = await createAnalysisFixture();
      const revision = await prisma.analysisSectionRevision.create({
        data: {
          analysisId,
          section: "THEMES",
          revisionNumber: 1,
          origin: "GENERATED",
          sourceTextVersionId,
          createdById: userId,
        },
      });

      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();

      try {
        await expect(
          client.query(
            `INSERT INTO "analysis_elements" ("id", "sectionRevisionId", "position", "statement")
             VALUES ($1, $2, 0, $3)`,
            ["unmarked-element", revision.id, FIXTURE_STATEMENT],
          ),
        ).rejects.toThrow(/null value in column "kind"/);
      } finally {
        await client.end();
      }
    });
  });

  // The specification asks the analysis to carry a validation status. These two
  // columns are it: a timestamp cannot disagree with itself the way a status
  // enum beside it could.
  describe("validation", () => {
    it("starts unvalidated", async () => {
      const { analysisId } = await createAnalysisFixture();
      const analysis = await prisma.analysis.findUniqueOrThrow({ where: { id: analysisId } });

      expect(analysis.validatedAt).toBeNull();
      expect(analysis.validatedById).toBeNull();
    });

    it("records the moment and its author together", async () => {
      const { analysisId } = await createAnalysisFixture();
      const validatedAt = new Date();

      const analysis = await prisma.analysis.update({
        where: { id: analysisId },
        data: { validatedAt, validatedById: userId },
      });

      expect(analysis.validatedAt).toEqual(validatedAt);
      expect(analysis.validatedById).toBe(userId);
    });

    it("rejects a validation with no author", async () => {
      const { projectId } = await createProjectFixture();

      await expect(
        prisma.analysis.create({ data: { projectId, validatedAt: new Date() } }),
      ).rejects.toThrow(VALIDATION_CHECK);
    });

    it("rejects an author with no validation", async () => {
      const { projectId } = await createProjectFixture();

      await expect(
        prisma.analysis.create({ data: { projectId, validatedById: userId } }),
      ).rejects.toThrow(VALIDATION_CHECK);
    });

    it("rejects an update that leaves only one of the two set", async () => {
      const { analysisId } = await createAnalysisFixture();
      await prisma.analysis.update({
        where: { id: analysisId },
        data: { validatedAt: new Date(), validatedById: userId },
      });

      await expect(
        prisma.analysis.update({ where: { id: analysisId }, data: { validatedById: null } }),
      ).rejects.toThrow(VALIDATION_CHECK);
    });
  });

  describe("versioning", () => {
    it("keeps every revision of a section and treats the highest as current", async () => {
      const { analysisId, sourceTextVersionId } = await createAnalysisFixture();

      for (const revisionNumber of [1, 2, 3]) {
        await prisma.analysisSectionRevision.create({
          data: {
            analysisId,
            section: "TONE",
            revisionNumber,
            origin: revisionNumber === 1 ? "GENERATED" : "EDITED",
            sourceTextVersionId,
            createdById: userId,
          },
        });
      }

      const all = await prisma.analysisSectionRevision.findMany({
        where: { analysisId, section: "TONE" },
      });
      const current = await prisma.analysisSectionRevision.findFirst({
        where: { analysisId, section: "TONE" },
        orderBy: { revisionNumber: "desc" },
      });

      expect(all).toHaveLength(3);
      expect(current?.revisionNumber).toBe(3);
    });

    // Two regenerations of the same section racing each other must collide
    // rather than silently lose one of the two.
    it("refuses two revisions of one section under the same number", async () => {
      const { analysisId, sourceTextVersionId } = await createAnalysisFixture();
      const revision = {
        analysisId,
        section: "THEMES",
        revisionNumber: 1,
        origin: "GENERATED",
        sourceTextVersionId,
        createdById: userId,
      } as const;

      await prisma.analysisSectionRevision.create({ data: revision });

      await expect(prisma.analysisSectionRevision.create({ data: revision })).rejects.toMatchObject(
        { code: "P2002" },
      );
    });

    it("refuses a revision number that would make 'current' meaningless", async () => {
      const { analysisId, sourceTextVersionId } = await createAnalysisFixture();

      await expect(
        prisma.analysisSectionRevision.create({
          data: {
            analysisId,
            section: "THEMES",
            revisionNumber: 0,
            origin: "GENERATED",
            sourceTextVersionId,
            createdById: userId,
          },
        }),
      ).rejects.toThrow(REVISION_NUMBER_CHECK);
    });

    it("orders elements inside a revision and refuses a negative position", async () => {
      const { analysisId, sourceTextVersionId } = await createAnalysisFixture();
      const revision = await prisma.analysisSectionRevision.create({
        data: {
          analysisId,
          section: "THEMES",
          revisionNumber: 1,
          origin: "GENERATED",
          sourceTextVersionId,
          createdById: userId,
        },
      });

      await expect(
        prisma.analysisElement.create({
          data: {
            sectionRevisionId: revision.id,
            position: -1,
            kind: "FACTUAL",
            statement: FIXTURE_STATEMENT,
          },
        }),
      ).rejects.toThrow(POSITION_CHECK);
    });
  });

  describe("annotation", () => {
    it("accepts several notes on one element", async () => {
      const { analysisId, sourceTextVersionId } = await createAnalysisFixture();
      const revision = await prisma.analysisSectionRevision.create({
        data: {
          analysisId,
          section: "WEAKNESSES",
          revisionNumber: 1,
          origin: "GENERATED",
          sourceTextVersionId,
          createdById: userId,
          elements: {
            create: { position: 0, kind: "INTERPRETATION", statement: FIXTURE_STATEMENT },
          },
        },
        include: { elements: true },
      });
      const elementId = revision.elements[0]?.id ?? "";

      await prisma.analysisAnnotation.createMany({
        data: [
          { elementId, authorId: userId, body: "fixture note 1" },
          { elementId, authorId: userId, body: "fixture note 2" },
        ],
      });

      const element = await prisma.analysisElement.findUniqueOrThrow({
        where: { id: elementId },
        include: { annotations: true },
      });

      expect(element.annotations).toHaveLength(2);
    });
  });

  // The reason the section is the unit of versioning. CAL-077 requires that
  // regenerating one section modify neither the other sections nor the
  // annotations already attached to them; with per-section revisions the other
  // sections' rows are not rewritten, so their identifiers — and therefore the
  // annotations pointing at them — survive by construction.
  describe("regenerating one section", () => {
    it("leaves the other sections and their annotations byte-identical", async () => {
      const { analysisId, sourceTextVersionId } = await createAnalysisFixture();

      const untouched = await prisma.analysisSectionRevision.create({
        data: {
          analysisId,
          section: "CHARACTERS",
          revisionNumber: 1,
          origin: "GENERATED",
          sourceTextVersionId,
          createdById: userId,
          elements: {
            create: { position: 0, kind: "FACTUAL", statement: FIXTURE_STATEMENT },
          },
        },
        include: { elements: true },
      });
      const untouchedElementId = untouched.elements[0]?.id ?? "";
      await prisma.analysisAnnotation.create({
        data: { elementId: untouchedElementId, authorId: userId, body: "fixture note" },
      });

      await prisma.analysisSectionRevision.create({
        data: {
          analysisId,
          section: "THEMES",
          revisionNumber: 1,
          origin: "GENERATED",
          sourceTextVersionId,
          createdById: userId,
          elements: {
            create: { position: 0, kind: "INTERPRETATION", statement: FIXTURE_STATEMENT },
          },
        },
      });

      const before = await prisma.analysisElement.findUniqueOrThrow({
        where: { id: untouchedElementId },
        include: { annotations: true },
      });

      // The regeneration: a second revision of THEMES only.
      await prisma.analysisSectionRevision.create({
        data: {
          analysisId,
          section: "THEMES",
          revisionNumber: 2,
          origin: "GENERATED",
          sourceTextVersionId,
          createdById: userId,
          elements: {
            create: { position: 0, kind: "INTERPRETATION", statement: FIXTURE_STATEMENT },
          },
        },
      });

      const after = await prisma.analysisElement.findUniqueOrThrow({
        where: { id: untouchedElementId },
        include: { annotations: true },
      });

      expect(after).toEqual(before);
      // And the regenerated section did gain a revision, so the assertion above
      // is not passing because nothing happened.
      expect(
        await prisma.analysisSectionRevision.count({ where: { analysisId, section: "THEMES" } }),
      ).toBe(2);
    });
  });

  // A revision references a source text version with onDelete: Restrict, and
  // deleting a project cascades into both tables at once. That the cascade
  // reaches the revisions before the reference is checked is a property of
  // PostgreSQL's trigger queue, not of the schema, so it is asserted rather
  // than assumed: a project must remain deletable.
  describe("deleting a project", () => {
    it("removes the whole analysis without tripping the source text reference", async () => {
      const { projectId, analysisId, sourceTextVersionId } = await createAnalysisFixture();
      const revision = await prisma.analysisSectionRevision.create({
        data: {
          analysisId,
          section: "OPEN_QUESTIONS",
          revisionNumber: 1,
          origin: "GENERATED",
          sourceTextVersionId,
          createdById: userId,
          elements: {
            create: { position: 0, kind: "INTERPRETATION", statement: FIXTURE_STATEMENT },
          },
        },
        include: { elements: true },
      });
      await prisma.analysisAnnotation.create({
        data: {
          elementId: revision.elements[0]?.id ?? "",
          authorId: userId,
          body: "fixture note",
        },
      });

      await prisma.project.delete({ where: { id: projectId } });

      expect(await prisma.analysis.count({ where: { id: analysisId } })).toBe(0);
      expect(await prisma.analysisSectionRevision.count({ where: { analysisId } })).toBe(0);
      expect(
        await prisma.analysisElement.count({ where: { sectionRevisionId: revision.id } }),
      ).toBe(0);
      expect(
        await prisma.analysisAnnotation.count({ where: { authorId: userId } }),
      ).toBeGreaterThan(0);
      expect(
        await prisma.analysisAnnotation.count({ where: { elementId: revision.elements[0]?.id } }),
      ).toBe(0);
    });
  });
});
