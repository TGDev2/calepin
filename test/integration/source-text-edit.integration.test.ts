/**
 * CAL-046's acceptance criterion, against a real PostgreSQL: **editing the
 * source text creates a version and says explicitly which downstream stages
 * become obsolete** — and destroys nothing on the way.
 *
 * Two halves, and the second is the one worth a database. That an append writes
 * a row is not interesting; that every earlier version is still byte-identical
 * afterwards, that a refused edit leaves the table exactly as it was, and that
 * not one row of the analysis, the direction, the bible, the plan or the
 * chapters moves — those are claims about statements PostgreSQL actually ran,
 * and nothing short of running them proves it.
 *
 * The obsolescence rule itself is exhausted next door, in
 * `packages/shared/src/obsolescence/assess.test.ts`, over states no fixture
 * could reach. What is proved here is that the query really does produce those
 * states from rows.
 *
 * Every string written here is technical (CLAUDE.md §9). The fixture texts are
 * counted words with no meaning, chosen so the word count identifies the
 * version.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  createProjectWithSourceText,
  getSourceText,
  listSourceTextVersions,
  openProjectScope,
  type ProjectScope,
  readSourceTextObsolescence,
  reconcileProjectStatus,
  updateSourceText,
} from "@calepin/shared/repository";
import { SOURCE_TEXT_MAX_WORDS } from "@calepin/shared/text";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

/** A text of exactly `count` words, synthetic and technical. */
function wordsOfLength(count: number, tag = "mot"): string {
  return Array.from({ length: count }, (_unused, index) => `${tag}${index}`).join(" ");
}

/**
 * The two instants the obsolescence fixture is built on, and the order between
 * them is the whole point: the founding version comes first, every downstream
 * stage is produced after it, and the edit under test lands now — later than
 * both. Forced rather than left to the clock, because what the rule compares is
 * `updatedAt` against the current version's `createdAt`, and a fixture relying
 * on two `now()` calls landing microseconds apart would be asserting the
 * clock's resolution rather than the rule.
 */
const FOUNDING_VERSION_WRITTEN_AT = new Date("2019-01-01T00:00:00.000Z");
const STAGES_PRODUCED_AT = new Date("2020-01-01T00:00:00.000Z");

describe("source text editing and obsolescence propagation (CAL-046)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({ data: { email: "source-text-edit@example.test" } });
    ownerId = owner.id;
    setActor(ownerId);
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

  /** A project created the way the product creates one — wizard write path. */
  async function seedProject(label: string, content = wordsOfLength(5)): Promise<Fixture> {
    setActor(ownerId);

    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({ ownerId, title: label, sourceText: { content } }),
    );

    const opened = await openProjectScope({ ownerId, projectId: project.id });
    if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

    return { scope: opened.value, projectId: project.id };
  }

  async function edit(fixture: Fixture, content: string) {
    return runWithActor(ownerId, async () => updateSourceText(fixture.scope, { content }));
  }

  async function versionsOf(projectId: string) {
    return prisma.sourceTextVersion.findMany({
      where: { sourceText: { projectId } },
      orderBy: { versionNumber: "asc" },
      select: { versionNumber: true, content: true, wordCount: true, editedById: true },
    });
  }

  describe("editing the source text", () => {
    it("appends a version and leaves the previous one exactly as it was", async () => {
      const fixture = await seedProject("append", wordsOfLength(5));
      const before = await versionsOf(fixture.projectId);

      const edited = await edit(fixture, wordsOfLength(9, "terme"));

      expect(edited.ok).toBe(true);
      if (edited.ok)
        expect(edited.value).toEqual({ created: true, versionNumber: 2, wordCount: 9 });

      const after = await versionsOf(fixture.projectId);

      expect(after).toHaveLength(2);
      // Not "still present": still identical. An append that rewrote the row it
      // appends after would satisfy a count and destroy the history.
      expect(after[0]).toEqual(before[0]);
      expect(after[1]).toMatchObject({ versionNumber: 2, wordCount: 9, editedById: ownerId });
    });

    it("numbers versions from the highest one, however many there already are", async () => {
      const fixture = await seedProject("numbering");

      for (let step = 2; step <= 5; step += 1) {
        const edited = await edit(fixture, wordsOfLength(step, `pas${step}`));
        expect(edited.ok && edited.value.versionNumber).toBe(step);
      }

      const versions = await listSourceTextVersions(fixture.scope);
      expect(versions.ok && versions.value.map((row) => row.versionNumber)).toEqual([
        5, 4, 3, 2, 1,
      ]);
    });

    it("counts the words itself rather than believing a caller", async () => {
      const fixture = await seedProject("counting");

      await edit(fixture, `  ${wordsOfLength(12)}  \r\n`);

      const current = await getSourceText(fixture.scope);
      expect(current.ok && current.value.wordCount).toBe(12);
      // The stored string is the normalized one, so a recount of the column can
      // never disagree with the number stored beside it.
      expect(current.ok && current.value.content).toBe(wordsOfLength(12));
    });

    it("writes no version when the text comes back unchanged", async () => {
      // A form posted back untouched is not a modification, and a history padded
      // with duplicates would make the obsolescence panel cry wolf on every
      // visit to the editor.
      const fixture = await seedProject("unchanged", wordsOfLength(7));

      const edited = await edit(fixture, wordsOfLength(7));

      expect(edited.ok).toBe(true);
      if (edited.ok)
        expect(edited.value).toEqual({ created: false, versionNumber: 1, wordCount: 7 });
      expect(await versionsOf(fixture.projectId)).toHaveLength(1);
    });

    it("treats a difference of line endings alone as unchanged", async () => {
      const fixture = await seedProject("normalisation", "alpha\nbeta");

      const edited = await edit(fixture, "alpha\r\nbeta");

      expect(edited.ok && edited.value.created).toBe(false);
      expect(await versionsOf(fixture.projectId)).toHaveLength(1);
    });

    it("refuses a text over the limit and writes nothing at all", async () => {
      const fixture = await seedProject("over-limit");
      const before = await versionsOf(fixture.projectId);

      const edited = await edit(fixture, wordsOfLength(SOURCE_TEXT_MAX_WORDS + 1));

      expect(edited.ok).toBe(false);
      if (!edited.ok) {
        expect(edited.error.category).toBe("validation");
        // The field path, never the field value (§9).
        expect(edited.error.fieldPath).toBe("content");
        expect(edited.error.userMessage).toContain(String(SOURCE_TEXT_MAX_WORDS));
      }

      expect(await versionsOf(fixture.projectId)).toEqual(before);
    });

    it("accepts a text of exactly the limit", async () => {
      const fixture = await seedProject("at-limit");

      const edited = await edit(fixture, wordsOfLength(SOURCE_TEXT_MAX_WORDS));

      expect(edited.ok && edited.value.wordCount).toBe(SOURCE_TEXT_MAX_WORDS);
    });

    it("refuses an empty text and writes nothing", async () => {
      const fixture = await seedProject("empty");

      const edited = await edit(fixture, "   \n  ");

      expect(edited.ok).toBe(false);
      if (!edited.ok) expect(edited.error.category).toBe("validation");
      expect(await versionsOf(fixture.projectId)).toHaveLength(1);
    });

    it("credits the author on the version and on the container it hangs off", async () => {
      const fixture = await seedProject("attribution");

      await edit(fixture, wordsOfLength(4, "signe"));

      const sourceText = await prisma.sourceText.findFirstOrThrow({
        where: { projectId: fixture.projectId },
        select: { updatedById: true, version: true },
      });

      // The version records who wrote it; the container records that the source
      // text as a whole moved, through the CAL-022 extension.
      expect(sourceText.updatedById).toBe(ownerId);
      expect(sourceText.version).toBeGreaterThan(1);
    });

    it("moves the derived status along with the evidence it wrote", async () => {
      // `hasSourceText` is status evidence, so the append and the recomputation
      // land in one transaction — the whole reason this goes through
      // `withProjectStatus` rather than a bare write.
      const fixture = await seedProject("status");

      await edit(fixture, wordsOfLength(6, "etape"));

      const project = await prisma.project.findUniqueOrThrow({
        where: { id: fixture.projectId },
        select: { status: true },
      });

      expect(project.status).toBe("ANALYSIS_IN_PROGRESS");
    });

    it("gives concurrent edits distinct version numbers rather than colliding", async () => {
      // The append reads the highest version and then writes the next one, with
      // a full round trip in between. Without the row lock `withProjectStatus`
      // takes, four transactions read the same maximum and three of them fail
      // the unique index on (sourceTextId, versionNumber).
      const fixture = await seedProject("concurrency");

      const results = await Promise.all(
        [2, 3, 4, 5].map(async (step) => edit(fixture, wordsOfLength(step, `simultane${step}`))),
      );

      expect(results.every((result) => result.ok)).toBe(true);

      const versions = await versionsOf(fixture.projectId);
      expect(versions.map((row) => row.versionNumber)).toEqual([1, 2, 3, 4, 5]);
    });

    it("refuses a project that holds no source text", async () => {
      setActor(ownerId);
      const bare = await prisma.project.create({ data: { userId: ownerId, title: "bare" } });
      const opened = await openProjectScope({ ownerId, projectId: bare.id });
      if (!opened.ok) throw new Error("the fixture could not open a scope");

      const edited = await runWithActor(ownerId, async () =>
        updateSourceText(opened.value, { content: wordsOfLength(3) }),
      );

      expect(edited.ok).toBe(false);
      if (!edited.ok) expect(edited.error.code).toBe("NOT_FOUND");
    });
  });

  describe("obsolescence propagation", () => {
    /**
     * A project carrying one row of every downstream stage, each produced after
     * the founding version of the source text and before any edit — the state a
     * real project is in the moment before its author changes the text.
     *
     * `reconcileProjectStatus` at the end is the documented repair path for a
     * graph written directly: without it the stored status still says `DRAFT`
     * while the rows say `OUTLINE_IN_PROGRESS`, and the first edit would be
     * refused by CAL-034's transition gate rather than by anything under test.
     */
    async function seedFullChain(label: string): Promise<Fixture & { sectionRevisionId: string }> {
      const fixture = await seedProject(label);
      setActor(ownerId);

      const version = await prisma.sourceTextVersion.findFirstOrThrow({
        where: { sourceText: { projectId: fixture.projectId } },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      });

      const analysis = await prisma.analysis.create({
        data: {
          projectId: fixture.projectId,
          validatedAt: STAGES_PRODUCED_AT,
          validatedById: ownerId,
        },
      });
      const sectionRevision = await prisma.analysisSectionRevision.create({
        data: {
          analysisId: analysis.id,
          section: "FACTUAL_SUMMARY",
          revisionNumber: 1,
          origin: "GENERATED",
          sourceTextVersionId: version.id,
          createdById: ownerId,
        },
      });

      await prisma.creativeDirection.create({
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

      const bible = await prisma.bible.create({
        data: {
          projectId: fixture.projectId,
          validatedAt: STAGES_PRODUCED_AT,
          validatedById: ownerId,
        },
      });
      const outline = await prisma.outline.create({
        data: { projectId: fixture.projectId, bibleId: bible.id },
      });
      const part = await prisma.part.create({
        data: { outlineId: outline.id, orderKey: "i", title: "fixture-part" },
      });

      for (const orderKey of ["i", "r"]) {
        await prisma.chapter.create({
          data: { outlineId: outline.id, bibleId: bible.id, partId: part.id, orderKey },
        });
      }

      await dateTheChain(fixture.projectId);
      await reconcileProjectStatus(fixture.scope);

      return { ...fixture, sectionRevisionId: sectionRevision.id };
    }

    /**
     * Stamps the founding version and the five stages onto the two instants
     * above, so the fixture's ordering is a fact rather than a race.
     *
     * Raw SQL throughout: `@updatedAt` is applied client-side by Prisma and the
     * CAL-022 extension fires on an `update`, so writing these through the
     * client would overwrite the very columns being set — and credit the fixture
     * with a change it is only pretending happened.
     */
    async function dateTheChain(projectId: string): Promise<void> {
      await prisma.$executeRaw`
        UPDATE "source_text_versions" SET "createdAt" = ${FOUNDING_VERSION_WRITTEN_AT}
        WHERE "sourceTextId" IN (SELECT "id" FROM "source_texts" WHERE "projectId" = ${projectId})
      `;
      await prisma.$executeRaw`
        UPDATE "creative_directions" SET "updatedAt" = ${STAGES_PRODUCED_AT}
        WHERE "projectId" = ${projectId}
      `;
      await prisma.$executeRaw`
        UPDATE "bibles" SET "updatedAt" = ${STAGES_PRODUCED_AT} WHERE "projectId" = ${projectId}
      `;
      await prisma.$executeRaw`
        UPDATE "outlines" SET "updatedAt" = ${STAGES_PRODUCED_AT} WHERE "projectId" = ${projectId}
      `;
      await prisma.$executeRaw`
        UPDATE "chapters" SET "updatedAt" = ${STAGES_PRODUCED_AT}
        WHERE "outlineId" IN (SELECT "id" FROM "outlines" WHERE "projectId" = ${projectId})
      `;
    }

    /** Every downstream table, counted — the "nothing was deleted" census. */
    async function census(projectId: string) {
      return {
        sourceTextVersions: await prisma.sourceTextVersion.count({
          where: { sourceText: { projectId } },
        }),
        analyses: await prisma.analysis.count({ where: { projectId } }),
        sectionRevisions: await prisma.analysisSectionRevision.count({
          where: { analysis: { projectId } },
        }),
        directions: await prisma.creativeDirection.count({ where: { projectId } }),
        bibles: await prisma.bible.count({ where: { projectId } }),
        outlines: await prisma.outline.count({ where: { projectId } }),
        parts: await prisma.part.count({ where: { outline: { projectId } } }),
        chapters: await prisma.chapter.count({ where: { outline: { projectId } } }),
      };
    }

    it("reports nothing before the source text has ever been edited", async () => {
      // The founding version is the current one, and every stage was produced
      // against it. A project nobody has edited must never carry a warning.
      const fixture = await seedProject("never-edited");

      const report = await readSourceTextObsolescence(fixture.scope);

      expect(report.ok).toBe(true);
      if (report.ok) {
        expect(report.value).toMatchObject({
          currentVersionNumber: 1,
          versionCount: 1,
          hasObsoleteStages: false,
          obsoleteStages: [],
        });
      }
    });

    it("names every stage the edit left behind, in dependency order", async () => {
      const fixture = await seedFullChain("full-chain");

      const before = await readSourceTextObsolescence(fixture.scope);
      expect(before.ok && before.value.hasObsoleteStages).toBe(false);

      await edit(fixture, wordsOfLength(11, "revision"));

      const after = await readSourceTextObsolescence(fixture.scope);
      expect(after.ok).toBe(true);
      if (!after.ok) return;

      expect(after.value.currentVersionNumber).toBe(2);
      expect(after.value.obsoleteStages).toEqual([
        "analysis",
        "direction",
        "bible",
        "outline",
        "chapters",
      ]);
      expect(
        after.value.stages.map((entry) => [entry.stage, entry.reason, entry.precedingCount]),
      ).toEqual([
        ["analysis", "source-text-changed", 1],
        ["direction", "source-text-changed", 1],
        ["bible", "source-text-changed", 1],
        ["outline", "source-text-changed", 1],
        ["chapters", "source-text-changed", 2],
      ]);
    });

    it("deletes nothing and regenerates nothing", async () => {
      // The other half of the criterion, and the half a report cannot state:
      // every downstream row is still there after the edit that put it in doubt.
      const fixture = await seedFullChain("nothing-destroyed");
      const before = await census(fixture.projectId);

      await edit(fixture, wordsOfLength(13, "intact"));

      expect(await census(fixture.projectId)).toEqual({
        ...before,
        sourceTextVersions: before.sourceTextVersions + 1,
      });
    });

    it("clears the analysis once it is produced against the new version, and only it", async () => {
      // The case the inheritance rule exists for. Redoing the analysis makes the
      // analysis current; the direction under it still descends from the one
      // that was replaced, and must stay in doubt.
      const fixture = await seedFullChain("regenerated-analysis");

      await edit(fixture, wordsOfLength(15, "reprise"));

      const current = await prisma.sourceTextVersion.findFirstOrThrow({
        where: { sourceText: { projectId: fixture.projectId } },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      });
      const analysis = await prisma.analysis.findUniqueOrThrow({
        where: { projectId: fixture.projectId },
        select: { id: true },
      });

      setActor(ownerId);
      await prisma.analysisSectionRevision.create({
        data: {
          analysisId: analysis.id,
          section: "FACTUAL_SUMMARY",
          revisionNumber: 2,
          origin: "GENERATED",
          sourceTextVersionId: current.id,
          createdById: ownerId,
        },
      });

      const report = await readSourceTextObsolescence(fixture.scope);
      expect(report.ok).toBe(true);
      if (!report.ok) return;

      expect(report.value.obsoleteStages).toEqual(["direction", "bible", "outline", "chapters"]);
    });

    it("keeps the doubt alive for a stage touched after the edit", async () => {
      // The author edits the source text, then renames a chapter without redoing
      // anything upstream. The chapter is newer than the edit and still descends
      // from an analysis that is not.
      const fixture = await seedFullChain("inherited");

      await edit(fixture, wordsOfLength(17, "herite"));

      setActor(ownerId);
      await prisma.chapter.updateMany({
        where: { outline: { projectId: fixture.projectId } },
        data: { status: "TO_WRITE" },
      });

      const report = await readSourceTextObsolescence(fixture.scope);
      expect(report.ok).toBe(true);
      if (!report.ok) return;

      const chapters = report.value.stages.find((entry) => entry.stage === "chapters");
      expect(chapters).toMatchObject({
        isObsolete: true,
        precedingCount: 0,
        reason: "upstream-obsolete",
      });
    });

    it("puts nothing in doubt in a project that holds only a source text", async () => {
      const fixture = await seedProject("bare-chain");

      await edit(fixture, wordsOfLength(8, "seul"));

      const report = await readSourceTextObsolescence(fixture.scope);
      expect(report.ok && report.value.hasObsoleteStages).toBe(false);
    });

    it("refuses a project that holds no source text", async () => {
      setActor(ownerId);
      const bare = await prisma.project.create({ data: { userId: ownerId, title: "no-text" } });
      const opened = await openProjectScope({ ownerId, projectId: bare.id });
      if (!opened.ok) throw new Error("the fixture could not open a scope");

      const report = await readSourceTextObsolescence(opened.value);

      expect(report.ok).toBe(false);
      if (!report.ok) expect(report.error.code).toBe("NOT_FOUND");
    });
  });
});
