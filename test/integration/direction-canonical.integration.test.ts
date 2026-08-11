/**
 * CAL-086 against a real PostgreSQL: **one retained direction per project, the
 * status that follows from it, and a change that warns without destroying
 * anything.**
 *
 * Three claims, and each is a property of a statement rather than of a screen,
 * so each is proved as one.
 *
 *   - *Une seule direction par projet* — the partial unique index is real, so
 *     the suite counts the flagged rows after a change rather than trusting the
 *     two updates to have been ordered correctly.
 *   - *Transition du statut vers bible à valider* — read back off
 *     `projects.status`, which nothing here ever writes directly.
 *   - *Sans jamais supprimer ni régénérer* — the bible, the plan and every
 *     chapter are photographed whole before the change and compared afterwards,
 *     the shape CAL-077 and CAL-083 both used: a column nobody anticipated
 *     moving fails here too.
 *
 * The downstream rows are **backdated by an hour** rather than left to land a
 * few milliseconds before the change. `updatedAt` is what separates work built
 * on the old direction from work rebuilt since, and a test whose two sides can
 * share a millisecond is a test that fails for the wrong reason.
 *
 * Cross-owner isolation is proved once, table by table, in
 * `owner-access.integration.test.ts`; the negative half is repeated here only
 * where a refusal has its own remedy.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  createProjectWithSourceText,
  discardDirection,
  getProjectForOwner,
  openProjectScope,
  type ProjectScope,
  readCanonicalDirectionObsolescence,
  reconcileProjectStatus,
  selectCanonicalDirection,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const NARRATIVE_ENGINE = {
  conflictNature: "interpersonal",
  tensionSource: "pursuit",
  protagonistStake: "life",
  shiftTrigger: "revelation",
  resolutionNature: "victory",
};

describe("retaining one novelistic direction (CAL-086)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({ data: { email: "direction-canonical@example.test" } });
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
    readonly first: string;
    readonly second: string;
    readonly third: string;
  }

  interface SeedOptions {
    /** The stage a validated analysis puts the project at — the normal case. */
    readonly validateAnalysis?: boolean;
    /** A bible, a plan and two chapters, all produced an hour ago. */
    readonly downstream?: boolean;
  }

  /**
   * A project at the stage where a direction is chosen: a source text, an
   * analysis, and the three proposals `propose-directions` would have written.
   *
   * The analysis is validated by writing the column and reconciling, not by
   * `validateAnalysis`: this is a fixture writing rows directly, which is the
   * one case `reconcileProjectStatus` exists for (CAL-034), and it keeps the
   * suite from depending on the seventeen sections a real validation needs.
   */
  async function seedProject(label: string, options: SeedOptions = {}): Promise<Fixture> {
    const { validateAnalysis = true, downstream = false } = options;
    setActor(ownerId);

    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({ ownerId, title: label, sourceText: { content: "fixture" } }),
    );

    // `analyses_validation_check` demands the two validation columns move
    // together — a validation with no author is not one.
    await prisma.analysis.create({
      data: {
        projectId: project.id,
        ...(validateAnalysis ? { validatedAt: new Date(), validatedById: ownerId } : {}),
      },
    });

    const opened = await openProjectScope({ ownerId, projectId: project.id });
    if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

    async function seedDirection(workingTitle: string): Promise<string> {
      const row = await prisma.creativeDirection.create({
        data: {
          projectId: project.id,
          workingTitle,
          developedPremise: "fixture",
          dominantGenre: "fixture",
          mainConflict: "fixture",
          protagonistArc: "fixture",
          endingNature: "fixture",
          novelPotentialAssessment: "fixture",
          narrativeEngine: NARRATIVE_ENGINE,
          origin: "PROPOSED",
        },
        select: { id: true },
      });

      return row.id;
    }

    const fixture: Fixture = {
      scope: opened.value,
      projectId: project.id,
      first: await seedDirection("première"),
      second: await seedDirection("deuxième"),
      third: await seedDirection("troisième"),
    };

    if (downstream) await seedDownstream(project.id);

    // The rows above were written behind the machine's back, so the column is
    // brought back in step the way CAL-034 says a fixture must.
    await reconcileProjectStatus(opened.value);

    return fixture;
  }

  /** A bible, a plan and two chapters, all produced an hour before now. */
  async function seedDownstream(projectId: string): Promise<void> {
    const bible = await prisma.bible.create({ data: { projectId } });
    const outline = await prisma.outline.create({ data: { projectId, bibleId: bible.id } });
    const part = await prisma.part.create({
      data: { outlineId: outline.id, orderKey: "i", title: "fixture" },
    });

    for (const orderKey of ["i", "r"]) {
      await prisma.chapter.create({
        data: { outlineId: outline.id, bibleId: bible.id, partId: part.id, orderKey },
      });
    }

    await backdate(projectId);
  }

  /**
   * Pushes every downstream row an hour into the past.
   *
   * Raw SQL, and deliberately: a Prisma `update` would fire `@updatedAt` and
   * write the very column this is setting. Nothing here is under test — it is
   * the fixture saying *this work was produced before the change*, which is the
   * only thing that makes the assertions below mean anything.
   */
  async function backdate(projectId: string): Promise<void> {
    await seam.$executeRaw`
      UPDATE "bibles" SET "updatedAt" = now() - interval '1 hour' WHERE "projectId" = ${projectId}
    `;
    await seam.$executeRaw`
      UPDATE "outlines" SET "updatedAt" = now() - interval '1 hour' WHERE "projectId" = ${projectId}
    `;
    await seam.$executeRaw`
      UPDATE "chapters" SET "updatedAt" = now() - interval '1 hour'
      WHERE "outlineId" IN (SELECT "id" FROM "outlines" WHERE "projectId" = ${projectId})
    `;
  }

  /** Every downstream row of a project, as one comparable value. */
  async function photographDownstream(projectId: string): Promise<string> {
    const [bibles, outlines, chapters] = await Promise.all([
      seam.bible.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
      seam.outline.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
      seam.chapter.findMany({ where: { outline: { projectId } }, orderBy: { id: "asc" } }),
    ]);

    return JSON.stringify({ bibles, outlines, chapters });
  }

  async function canonicalIds(projectId: string): Promise<readonly string[]> {
    const rows = await seam.creativeDirection.findMany({
      where: { projectId, isCanonical: true },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    return rows.map((row) => row.id);
  }

  async function statusOf(projectId: string): Promise<string> {
    const project = await seam.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { status: true },
    });

    return project.status;
  }

  describe("the first choice", () => {
    it("retains the direction and moves the project to BIBLE_TO_VALIDATE", async () => {
      const fixture = await seedProject("first-choice");
      setActor(ownerId);

      expect(await statusOf(fixture.projectId)).toBe("DIRECTION_TO_CHOOSE");

      const retained = await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.second }),
      );

      expect(retained.ok).toBe(true);
      if (!retained.ok) return;

      expect(retained.value).toMatchObject({ changed: true, previousDirectionId: null });
      expect(retained.value.obsolescence.hasObsoleteStages).toBe(false);
      expect(await canonicalIds(fixture.projectId)).toEqual([fixture.second]);
      expect(await statusOf(fixture.projectId)).toBe("BIBLE_TO_VALIDATE");
    });

    // The status is derived state (CAL-034), so the read the dashboard performs
    // has to agree with the column — the one thing a caller asserting a status
    // by hand would break.
    it("is visible through the project read every screen uses", async () => {
      const fixture = await seedProject("first-choice-read");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );

      const project = await getProjectForOwner({ ownerId, projectId: fixture.projectId });

      expect(project.ok).toBe(true);
      if (!project.ok) return;

      expect(project.value.status).toBe("BIBLE_TO_VALIDATE");
    });

    it("records who chose, through the audit extension", async () => {
      const fixture = await seedProject("attributed");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );

      const row = await seam.creativeDirection.findUniqueOrThrow({
        where: { id: fixture.first },
        select: { updatedById: true, version: true },
      });

      expect(row).toMatchObject({ updatedById: ownerId, version: 2 });
    });
  });

  describe("one direction per project", () => {
    it("clears the previous one in the same transaction", async () => {
      const fixture = await seedProject("single-canonical");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );

      const changed = await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.third }),
      );

      expect(changed.ok).toBe(true);
      if (!changed.ok) return;

      expect(changed.value.previousDirectionId).toBe(fixture.first);
      // Counted rather than inferred from the two updates: the partial unique
      // index is what actually holds this invariant.
      expect(await canonicalIds(fixture.projectId)).toEqual([fixture.third]);
    });

    it("leaves the direction that was retained until now readable and whole", async () => {
      const fixture = await seedProject("previous-stays");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );
      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.second }),
      );

      const previous = await seam.creativeDirection.findUniqueOrThrow({
        where: { id: fixture.first },
      });

      expect(previous.isCanonical).toBe(false);
      expect(previous.discardedAt).toBeNull();
      expect(previous.workingTitle).toBe("première");
    });

    // A second click on a stale screen. Nothing is written, so no timestamp
    // moves and nothing downstream is put in doubt by an act that changed
    // nothing.
    it("refuses to retain the direction it already holds", async () => {
      const fixture = await seedProject("already-retained");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );

      const before = await seam.creativeDirection.findUniqueOrThrow({
        where: { id: fixture.first },
        select: { version: true, updatedAt: true },
      });

      const again = await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );

      expect(again.ok).toBe(false);
      if (again.ok) return;

      expect(again.error.code).toBe("CONFLICT");
      expect(
        await seam.creativeDirection.findUniqueOrThrow({
          where: { id: fixture.first },
          select: { version: true, updatedAt: true },
        }),
      ).toEqual(before);
    });
  });

  describe("changing it after the bible exists", () => {
    it("refuses the change until what it leaves behind is acknowledged", async () => {
      const fixture = await seedProject("unacknowledged", { downstream: true });
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );

      const before = await photographDownstream(fixture.projectId);

      const refused = await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.second }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;

      expect(refused.error.code).toBe("OBSOLESCENCE_NOT_ACKNOWLEDGED");
      expect(refused.error.category).toBe("conflict");
      // Refused means refused: the flag did not move either.
      expect(await canonicalIds(fixture.projectId)).toEqual([fixture.first]);
      expect(await photographDownstream(fixture.projectId)).toEqual(before);
    });

    it("goes through once acknowledged, and names what is now in doubt", async () => {
      const fixture = await seedProject("acknowledged", { downstream: true });
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );

      const changed = await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, {
          directionId: fixture.second,
          acknowledgeObsolescence: true,
        }),
      );

      expect(changed.ok).toBe(true);
      if (!changed.ok) return;

      expect(changed.value.obsolescence.obsoleteStages).toEqual(["bible", "outline", "chapters"]);
      expect(
        changed.value.obsolescence.stages.find((entry) => entry.stage === "chapters"),
      ).toMatchObject({ presentCount: 2, precedingCount: 2 });
      expect(await canonicalIds(fixture.projectId)).toEqual([fixture.second]);
    });

    // The acceptance criterion's other half, and the one worth proving as an
    // absence: warning is all it does.
    it("deletes nothing and regenerates nothing", async () => {
      const fixture = await seedProject("nothing-destroyed", { downstream: true });
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );

      const before = await photographDownstream(fixture.projectId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, {
          directionId: fixture.third,
          acknowledgeObsolescence: true,
        }),
      );

      expect(await photographDownstream(fixture.projectId)).toEqual(before);
    });

    // The status does not fall back when the direction changes: the project has
    // still reached the bible stage, and the bible it holds is still there.
    it("leaves the project at the stage it had reached", async () => {
      const fixture = await seedProject("status-holds", { downstream: true });
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );

      expect(await statusOf(fixture.projectId)).toBe("BIBLE_TO_VALIDATE");

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, {
          directionId: fixture.second,
          acknowledgeObsolescence: true,
        }),
      );

      expect(await statusOf(fixture.projectId)).toBe("BIBLE_TO_VALIDATE");
    });

    // A first choice on a project that somehow holds downstream work asks for
    // no acknowledgement: nothing there was built on the direction being
    // chosen, because none was retained.
    it("asks for no acknowledgement on a first choice", async () => {
      const fixture = await seedProject("first-with-downstream", { downstream: true });
      setActor(ownerId);

      const retained = await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );

      expect(retained.ok).toBe(true);
      if (!retained.ok) return;

      expect(retained.value.obsolescence.hasObsoleteStages).toBe(false);
    });
  });

  describe("the standing report afterwards", () => {
    it("says nothing while no direction has been retained", async () => {
      const fixture = await seedProject("no-canonical-yet", { downstream: true });

      const report = await readCanonicalDirectionObsolescence(fixture.scope);

      expect(report.ok).toBe(true);
      if (!report.ok) return;

      expect(report.value.hasCanonicalDirection).toBe(false);
      expect(report.value.current.hasObsoleteStages).toBe(false);
      // It does say what a choice would cost, which is the warning itself.
      expect(report.value.onChange.obsoleteStages).toEqual(["bible", "outline", "chapters"]);
    });

    it("names the three stages after a change, and keeps naming them", async () => {
      const fixture = await seedProject("standing-report", { downstream: true });
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );
      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, {
          directionId: fixture.second,
          acknowledgeObsolescence: true,
        }),
      );

      const report = await readCanonicalDirectionObsolescence(fixture.scope);

      expect(report.ok).toBe(true);
      if (!report.ok) return;

      expect(report.value.hasCanonicalDirection).toBe(true);
      expect(report.value.current.obsoleteStages).toEqual(["bible", "outline", "chapters"]);
      // All three predate the change themselves, so all three carry the direct
      // reason rather than the inherited one: the direct reason wins when both
      // apply, and it is the one the author can act on first. Inheritance has
      // its own case below, where the bible has been rebuilt since.
      for (const entry of report.value.current.stages) {
        expect(entry.reason).toBe("canonical-direction-changed");
      }
    });

    // The inheritance rule, walked the way an author actually walks it: the
    // bible is rebuilt first, and the plan below it stays in doubt because it
    // still descends from the one that was replaced.
    it("clears a stage rebuilt since, and leaves what is below it in doubt", async () => {
      const fixture = await seedProject("partial-rebuild", { downstream: true });
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );
      await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, {
          directionId: fixture.second,
          acknowledgeObsolescence: true,
        }),
      );

      // The bible is rebuilt, and so are the chapters — but not the plan
      // between them, which is what makes the two reasons visible at once.
      await seam.$executeRaw`
        UPDATE "bibles" SET "updatedAt" = now() WHERE "projectId" = ${fixture.projectId}
      `;
      await seam.$executeRaw`
        UPDATE "chapters" SET "updatedAt" = now()
        WHERE "outlineId" IN (SELECT "id" FROM "outlines" WHERE "projectId" = ${fixture.projectId})
      `;

      const report = await readCanonicalDirectionObsolescence(fixture.scope);

      expect(report.ok).toBe(true);
      if (!report.ok) return;

      expect(report.value.current.obsoleteStages).toEqual(["outline", "chapters"]);
      expect(report.value.current.stages.find((entry) => entry.stage === "bible")?.isObsolete).toBe(
        false,
      );
      expect(report.value.current.stages.find((entry) => entry.stage === "outline")?.reason).toBe(
        "canonical-direction-changed",
      );
      // Rewritten since, and still in doubt: the chapters descend from a plan
      // that has not been. Without inheritance the report would call this
      // project clean the moment its chapters were touched for any reason.
      expect(report.value.current.stages.find((entry) => entry.stage === "chapters")?.reason).toBe(
        "upstream-obsolete",
      );
    });
  });

  describe("what it refuses", () => {
    it("refuses a direction the author has written off", async () => {
      const fixture = await seedProject("discarded");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        discardDirection(fixture.scope, { directionId: fixture.third, reason: null }),
      );

      const refused = await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.third }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;

      expect(refused.error.code).toBe("CONFLICT");
      expect(await canonicalIds(fixture.projectId)).toEqual([]);
    });

    // The status machine already holds this rule; naming it here is what turns
    // an ILLEGAL_STATUS_TRANSITION into a sentence the author can act on.
    it("refuses a choice made before the analysis is validated", async () => {
      const fixture = await seedProject("no-validated-analysis", { validateAnalysis: false });
      setActor(ownerId);

      const refused = await runWithActor(ownerId, async () =>
        selectCanonicalDirection(fixture.scope, { directionId: fixture.first }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;

      expect(refused.error.code).toBe("ANALYSIS_NOT_VALIDATED");
      expect(await canonicalIds(fixture.projectId)).toEqual([]);
      expect(await statusOf(fixture.projectId)).toBe("ANALYSIS_IN_PROGRESS");
    });

    it("answers NOT_FOUND for a direction of another project", async () => {
      const mine = await seedProject("mine");
      const theirs = await seedProject("theirs");
      setActor(ownerId);

      const refused = await runWithActor(ownerId, async () =>
        selectCanonicalDirection(mine.scope, { directionId: theirs.first }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;

      expect(refused.error.code).toBe("NOT_FOUND");
      expect(await canonicalIds(theirs.projectId)).toEqual([]);
    });
  });
});
