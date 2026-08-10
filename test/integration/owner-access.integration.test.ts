/**
 * CAL-023's acceptance criterion, against a real PostgreSQL: **an attempt to
 * reach another user's project through every exposed entry point fails
 * everywhere.**
 *
 * Two users, one full project graph each — a row in every one of the
 * thirty-five project-owned tables. Then, for each of those tables and for each
 * function the repository exports, the same question twice: the owner reaches
 * their own row, and the other user reaches nothing.
 *
 * Both halves matter. A filter that matched nothing at all would pass every
 * "finds nothing" assertion in this file while being completely broken, so no
 * negative assertion stands here without the positive one beside it.
 *
 * The list of models is the registry, not a list written here, and the list of
 * entry points is pinned against the module's own exports. A model or a
 * function added later without an isolation test fails this suite rather than
 * shipping unguarded.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { fail, NotFoundError, succeed } from "@calepin/shared/errors";
import {
  computeProjectAggregates,
  createProject,
  createProjectWithSourceText,
  delegateName,
  deleteProject,
  duplicateProject,
  getGenerationContextForProject,
  getProjectForOwner,
  getProjectTargetLength,
  getSourceText,
  listProjectDashboardRows,
  listProjectsForOwner,
  listRunningGenerations,
  listSourceTextVersions,
  openProjectScope,
  PROJECT_OWNED_MODEL_NAMES,
  type ProjectOwnedModelName,
  type ProjectScope,
  readMissionMeasurements,
  readProjectCostSummary,
  readSourceTextObsolescence,
  reconcileProjectAggregates,
  requireOwnedRow,
  scopedWhere,
  updateProject,
  type UpdateProjectInput,
  updateSourceText,
  withProjectAggregates,
  withProjectTransaction,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";
import { createProjectGraph, type ProjectGraph } from "./project-graph";

/**
 * The repository's data entry points — every export that touches the database.
 *
 * The six status functions of CAL-034 are isolated in
 * `project-status.integration.test.ts` rather than here: they are all one
 * mechanism, they need a project seeded up a stage to refuse anything
 * meaningful, and the assertion below is what makes leaving one of them untested
 * fail.
 */
const ENTRY_POINTS = [
  "archiveProject",
  "computeProjectAggregates",
  "createProject",
  "createProjectWithSourceText",
  "deleteProject",
  "duplicateProject",
  "getGenerationContextForProject",
  "getProjectForOwner",
  "getProjectTargetLength",
  "getSourceText",
  "listProjectDashboardRows",
  "listProjectsForOwner",
  "listRunningGenerations",
  "listSourceTextVersions",
  "openProjectScope",
  "readMissionMeasurements",
  "readProjectCostSummary",
  "readProjectProgress",
  "readSourceTextObsolescence",
  "reconcileProjectAggregates",
  "reconcileProjectStatus",
  "refreshProjectStatus",
  "requireOwnedRow",
  "restoreProject",
  "updateProject",
  "updateSourceText",
  "withProjectAggregates",
  "withProjectStatus",
  "withProjectTransaction",
];

/** Its pure helpers: they build or check a value and reach nothing. */
const HELPERS = [
  "assertProjectScope",
  "delegateName",
  "isProjectOwnedModel",
  "isProjectScope",
  "isUnduplicatedModel",
  "projectOwnedFilter",
  "scopedWhere",
];

/**
 * A scope naming another user's project — the shape an attack takes once the
 * type system is out of the picture.
 *
 * The brand is a registry symbol, so a caller determined to forge one can. That
 * is why the brand is not the guarantee: every statement the repository runs
 * names the owner as well as the project, so a forged scope reaches nothing
 * either. This suite proves that, rather than assuming the brand holds.
 */
function forgedScope(ownerId: string, projectId: string): ProjectScope {
  return {
    [Symbol.for("calepin.ProjectScope")]: true,
    projectId,
    ownerId,
  } as unknown as ProjectScope;
}

interface CountingDelegate {
  count: (args: { where: object }) => Promise<number>;
  updateMany: (args: { where: object; data: object }) => Promise<{ count: number }>;
  deleteMany: (args: { where: object }) => Promise<{ count: number }>;
}

describe("owner access policy", () => {
  const { prisma, setActor } = createAuditedClient();
  /** The client the repository layer itself reads, registered on the seam. */
  const seam = new PrismaClient();

  let alice: ProjectGraph;
  let bob: ProjectGraph;
  let aliceScope: ProjectScope;
  let bobScope: ProjectScope;

  /**
   * The delegate a model is served by, on the fixture client. Cast and
   * confined here so the assertions below can iterate the registry rather than
   * name thirty-five delegates by hand — the trade
   * `audit-fields.integration.test.ts` already documents.
   */
  function delegateOf(model: ProjectOwnedModelName): CountingDelegate {
    const client: unknown = prisma;
    const delegate = (client as Record<string, CountingDelegate | undefined>)[delegateName(model)];

    if (!delegate) throw new Error(`no Prisma delegate for the owned model ${model}`);

    return delegate;
  }

  async function openScope(graph: ProjectGraph): Promise<ProjectScope> {
    const opened = await openProjectScope({
      ownerId: graph.ownerId,
      projectId: graph.projectId,
    });

    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    return opened.value;
  }

  beforeAll(async () => {
    configureDatabaseClient(seam);

    alice = await createProjectGraph(prisma, setActor, "owner-access-alice");
    bob = await createProjectGraph(prisma, setActor, "owner-access-bob");

    aliceScope = await openScope(alice);
    bobScope = await openScope(bob);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  describe("the graph the criterion is asserted against", () => {
    // Without this, every "finds nothing" below could be true of an empty
    // table. The fixture is required to have seeded all thirty-five.
    it.each(PROJECT_OWNED_MODEL_NAMES)("seeded a row of %s for each owner", (model) => {
      expect(alice.rows[model]).toBeTruthy();
      expect(bob.rows[model]).toBeTruthy();
      expect(alice.rows[model]).not.toBe(bob.rows[model]);
    });
  });

  describe("reading", () => {
    it.each(PROJECT_OWNED_MODEL_NAMES)("lets the owner read their own %s", async (model) => {
      const found = await delegateOf(model).count({
        where: scopedWhere(model, aliceScope, { id: alice.rows[model] }),
      });

      expect(found).toBe(1);
    });

    // The criterion, table by table.
    it.each(PROJECT_OWNED_MODEL_NAMES)("hides another owner's %s", async (model) => {
      const found = await delegateOf(model).count({
        where: scopedWhere(model, bobScope, { id: alice.rows[model] }),
      });

      expect(found).toBe(0);
    });

    // The scope is a receipt of a check that already happened; what protects
    // the row is the statement. A scope naming Alice's project with Bob's id
    // reaches nothing, because the filter carries both columns.
    it.each(PROJECT_OWNED_MODEL_NAMES)("hides %s from a forged scope", async (model) => {
      const found = await delegateOf(model).count({
        where: scopedWhere(model, forgedScope(bob.ownerId, alice.projectId), {
          id: alice.rows[model],
        }),
      });

      expect(found).toBe(0);
    });
  });

  describe("writing", () => {
    it.each(PROJECT_OWNED_MODEL_NAMES)("updates none of another owner's %s", async (model) => {
      const { count } = await runWithActor(bob.ownerId, async () =>
        delegateOf(model).updateMany({
          where: scopedWhere(model, bobScope, { id: alice.rows[model] }),
          data: {},
        }),
      );

      expect(count).toBe(0);
    });

    it.each(PROJECT_OWNED_MODEL_NAMES)("deletes none of another owner's %s", async (model) => {
      const { count } = await delegateOf(model).deleteMany({
        where: scopedWhere(model, bobScope, { id: alice.rows[model] }),
      });

      expect(count).toBe(0);
      // And the row is still there — a delete that matched nothing and a delete
      // that silently removed the row both report zero if only the count is read.
      expect(
        await delegateOf(model).count({
          where: scopedWhere(model, aliceScope, { id: alice.rows[model] }),
        }),
      ).toBe(1);
    });
  });

  describe("the repository entry points", () => {
    it("has an isolation test for every function it exports", async () => {
      const repository: Record<string, unknown> = await import("@calepin/shared/repository");
      const exported = Object.entries(repository)
        .filter(([, value]) => typeof value === "function")
        .map(([name]) => name)
        .sort();

      expect(exported).toEqual([...ENTRY_POINTS, ...HELPERS].sort());
    });

    it("openProjectScope refuses another owner's project", async () => {
      const opened = await openProjectScope({
        ownerId: bob.ownerId,
        projectId: alice.projectId,
      });

      expect(opened.ok).toBe(false);
      // The same failure a missing project gives, deliberately: the code
      // travels to the client, and a distinct one would confirm that the
      // project exists.
      if (!opened.ok) expect(opened.error.code).toBe("NOT_FOUND");

      const missing = await openProjectScope({ ownerId: bob.ownerId, projectId: "no_such_id" });
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.error.code).toBe("NOT_FOUND");
    });

    // CAL-042, CAL-044, CAL-045. The project's language, freedom level and
    // target audience are what every future generation call propagates
    // (CLAUDE.md §5.8); none may leak across an owner boundary any more than
    // the project itself does.
    it("getGenerationContextForProject refuses another owner's project", async () => {
      const mine = await getGenerationContextForProject(aliceScope);
      expect(mine.ok).toBe(true);
      if (mine.ok) {
        expect(mine.value).toEqual({
          language: "fr",
          freedomLevel: "BALANCED",
          targetAudience: "Grand public",
        });
      }

      const theirs = await getGenerationContextForProject(
        forgedScope(bob.ownerId, alice.projectId),
      );
      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
    });

    // CAL-043. `getPlanGenerationContext` (`@calepin/outline`) reads this
    // before deriving a chapter calibration from it — it must not leak across
    // an owner boundary any more than the project itself does.
    it("getProjectTargetLength refuses another owner's project", async () => {
      const mine = await getProjectTargetLength(aliceScope);
      expect(mine.ok).toBe(true);
      if (mine.ok) {
        expect(mine.value).toEqual({ targetLength: "STANDARD", targetWordCount: null });
      }

      const theirs = await getProjectTargetLength(forgedScope(bob.ownerId, alice.projectId));
      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
    });

    // CAL-056. `project-graph.ts` seeds one `GenerationAttempt` per owner
    // (mission WRITE_SCENE, no usage recorded), so the owner's own summary is
    // one attempt of real, deterministic zeros — enough to prove the read
    // reaches the row without asserting on anything a full pricing fixture
    // would need (`generation-cost.integration.test.ts` covers the totals).
    it("readProjectCostSummary refuses another owner's project", async () => {
      const mine = await readProjectCostSummary(aliceScope);
      expect(mine.ok).toBe(true);
      if (mine.ok) {
        expect(mine.value).toEqual({
          attemptCount: 1,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: "0.000000",
          byMission: [
            {
              mission: "WRITE_SCENE",
              attemptCount: 1,
              inputTokens: 0,
              outputTokens: 0,
              estimatedCostUsd: "0.000000",
            },
          ],
          byDay: [expect.objectContaining({ attemptCount: 1 })],
        });
      }

      const theirs = await readProjectCostSummary(forgedScope(bob.ownerId, alice.projectId));
      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
    });

    // CAL-057. The graph's one attempt records no usage, so the owner's own
    // history is empty rather than absent — the answer that makes an estimate
    // fall back on the mission registry, and a different answer from the
    // refusal below (`generation-measurements.integration.test.ts` covers the
    // medians).
    it("readMissionMeasurements refuses another owner's project", async () => {
      const mine = await readMissionMeasurements(aliceScope);
      expect(mine.ok).toBe(true);
      if (mine.ok) expect(mine.value).toEqual([]);

      const theirs = await readMissionMeasurements(forgedScope(bob.ownerId, alice.projectId));
      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
    });

    it("getProjectForOwner refuses another owner's project", async () => {
      const mine = await getProjectForOwner({
        ownerId: alice.ownerId,
        projectId: alice.projectId,
      });
      expect(mine.ok).toBe(true);

      const theirs = await getProjectForOwner({
        ownerId: bob.ownerId,
        projectId: alice.projectId,
      });
      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
    });

    it("listProjectsForOwner never returns another owner's project", async () => {
      const bobsProjects = await listProjectsForOwner(bob.ownerId);
      const alicesProjects = await listProjectsForOwner(alice.ownerId);

      expect(bobsProjects.map((project) => project.id)).toContain(bob.projectId);
      expect(bobsProjects.map((project) => project.id)).not.toContain(alice.projectId);
      expect(alicesProjects.map((project) => project.id)).not.toContain(bob.projectId);
    });

    // The fixture graph gives each owner one chapter with a revision
    // (wordCount 1) and one without — enough to prove the aggregates without
    // a bespoke seed, on top of the isolation the assertion is really about.
    it("listProjectDashboardRows never returns another owner's project or aggregates", async () => {
      const bobsRows = await listProjectDashboardRows(bob.ownerId);
      const alicesRows = await listProjectDashboardRows(alice.ownerId);

      expect(bobsRows.map((row) => row.id)).not.toContain(alice.projectId);
      expect(alicesRows.map((row) => row.id)).not.toContain(bob.projectId);

      const bobsRow = bobsRows.find((row) => row.id === bob.projectId);
      expect(bobsRow).toMatchObject({
        plannedChapterCount: 2,
        writtenChapterCount: 1,
        totalWordCount: 1,
      });
    });

    // The fixture graph seeds one `Generation` per owner, `QUEUED` by
    // default (`project-graph.ts`) — already "running" for this reader's
    // purposes, with no extra seed needed.
    it("listRunningGenerations never returns another owner's generation", async () => {
      const alicesRunning = await listRunningGenerations(aliceScope);
      const bobsRunning = await listRunningGenerations(bobScope);

      expect(alicesRunning.map((row) => row.id)).toContain(alice.rows.Generation);
      expect(alicesRunning.map((row) => row.id)).not.toContain(bob.rows.Generation);
      expect(bobsRunning.map((row) => row.id)).not.toContain(alice.rows.Generation);
    });

    it("updateProject refuses a scope forged for another owner's project", async () => {
      const before = await getProjectForOwner({
        ownerId: alice.ownerId,
        projectId: alice.projectId,
      });

      const updated = await runWithActor(bob.ownerId, async () =>
        updateProject(forgedScope(bob.ownerId, alice.projectId), { title: "seized" }),
      );

      expect(updated.ok).toBe(false);
      if (!updated.ok) expect(updated.error.code).toBe("NOT_FOUND");

      const after = await getProjectForOwner({
        ownerId: alice.ownerId,
        projectId: alice.projectId,
      });
      expect(after.ok && before.ok && after.value.title).toBe(before.ok && before.value.title);
    });

    it("deleteProject refuses a scope forged for another owner's project", async () => {
      const deleted = await deleteProject(forgedScope(bob.ownerId, alice.projectId));

      expect(deleted.ok).toBe(false);
      if (!deleted.ok) expect(deleted.error.code).toBe("NOT_FOUND");
      expect((await getProjectForOwner({ ownerId: alice.ownerId, projectId: alice.projectId })).ok) //
        .toBe(true);
    });

    // CAL-035. A duplication reads every table of a project and writes a copy
    // of each row, so a forged scope here would not leak one row but a whole
    // novel — into a project the forger owns and can read at leisure. The
    // criterion the copy itself is held to is
    // `project-duplication.integration.test.ts`; what is asserted here is that
    // it never runs for anyone but the owner.
    it("duplicateProject refuses a scope forged for another owner's project", async () => {
      const before = await listProjectsForOwner(bob.ownerId);

      const duplicated = await runWithActor(bob.ownerId, async () =>
        duplicateProject(forgedScope(bob.ownerId, alice.projectId), { title: "seized" }),
      );

      expect(duplicated.ok).toBe(false);
      if (!duplicated.ok) expect(duplicated.error.code).toBe("NOT_FOUND");

      // Not merely refused: nothing was created on the way to refusing it.
      const after = await listProjectsForOwner(bob.ownerId);
      expect(after.map((project) => project.id)).toEqual(before.map((project) => project.id));
    });

    // CAL-033's three entry points, all of which reach `projects` through a
    // statement naming the owner — the `FOR UPDATE` that opens the transaction
    // for two of them, and the aggregate query itself for the third. The
    // counters they maintain are asserted in
    // `project-aggregates.integration.test.ts`; what is asserted here is that
    // another owner moves none of them.
    it("the aggregate entry points refuse a scope forged for another owner's project", async () => {
      const forged = forgedScope(bob.ownerId, alice.projectId);

      const computed = await computeProjectAggregates(forged);
      expect(computed.ok).toBe(false);
      if (!computed.ok) expect(computed.error.code).toBe("NOT_FOUND");

      const reconciled = await reconcileProjectAggregates(forged);
      expect(reconciled.ok).toBe(false);
      if (!reconciled.ok) expect(reconciled.error.code).toBe("NOT_FOUND");

      let mutated = false;
      const wrapped = await withProjectAggregates(forged, async () => {
        mutated = true;
        return succeed();
      });

      expect(wrapped.ok).toBe(false);
      // The lock is taken before the mutation, so the mutation never ran.
      expect(mutated).toBe(false);

      // And the owner's own counters are exactly what the fixture seeded.
      const mine = await computeProjectAggregates(aliceScope);
      expect(mine.ok).toBe(true);
      if (mine.ok) expect(mine.value).toEqual({ writtenChapterCount: 1, totalWordCount: 1 });
    });

    /**
     * CAL-055's seam, and the one entry point here that protects nothing by
     * itself.
     *
     * `withProjectTransaction` deliberately takes no lock and re-proves no
     * ownership: it opens a transaction and hands out a client, so that a
     * domain repository whose write moves no derived column has a seam to write
     * through without holding a database client of its own (§3.5). What
     * protects the rows is the `scopedWhere` on each statement inside it, and
     * that is exactly what is asserted — the body runs for a forged scope, and
     * still reaches nothing.
     *
     * A forged scope that got this far would be caught by `assertProjectScope`
     * before the transaction opens; a *genuine* scope on the intruder's own
     * project is the harder case, and the one below.
     */
    it("the plain transaction seam refuses a forged scope and scopes what it opens", async () => {
      const forged = forgedScope(bob.ownerId, alice.projectId);

      let ranUnderForgedScope = false;
      const wrapped = await withProjectTransaction(forged, async () => {
        ranUnderForgedScope = true;
        return succeed();
      });

      expect(wrapped.ok).toBe(false);
      expect(ranUnderForgedScope).toBe(false);

      // With a scope that is genuinely bob's, the transaction opens — and the
      // statements inside it still reach none of alice's rows, because the
      // filter names the owner rather than the project alone.
      const scoped = await withProjectTransaction(bobScope, async (tx) =>
        succeed(
          await tx.chapterRevision.count({
            where: scopedWhere("ChapterRevision", bobScope, { id: alice.rows.ChapterRevision }),
          }),
        ),
      );

      expect(scoped.ok).toBe(true);
      if (scoped.ok) expect(scoped.value).toBe(0);

      // The same statement against his own row finds it, so the zero above
      // means "not yours" rather than "the query was wrong".
      const own = await withProjectTransaction(bobScope, async (tx) =>
        succeed(
          await tx.chapterRevision.count({
            where: scopedWhere("ChapterRevision", bobScope, { id: bob.rows.ChapterRevision }),
          }),
        ),
      );

      expect(own.ok).toBe(true);
      if (own.ok) expect(own.value).toBe(1);
    });

    // A failing `Result` from the body rolls the transaction back rather than
    // committing it — Prisma rolls back on a throw and on nothing else, so this
    // is what keeps "writes nothing at all" (§6) true of a multi-statement body.
    it("rolls the transaction back when the body reports a failure", async () => {
      const before = await prisma.partSummaryRevision.count({
        where: { partId: bob.rows.Part },
      });

      const rolled = await withProjectTransaction(bobScope, async (tx) => {
        await tx.partSummaryRevision.create({
          data: {
            partId: bob.rows.Part,
            revisionNumber: 99,
            summary: "fixture",
            wordCount: 1,
            createdById: bob.ownerId,
          },
        });

        return fail(new NotFoundError({ message: "the body decided to fail after writing" }));
      });

      expect(rolled.ok).toBe(false);
      expect(await prisma.partSummaryRevision.count({ where: { partId: bob.rows.Part } })).toBe(
        before,
      );
    });

    // CAL-046. These four are the only entry points that read or write the
    // author's own prose, so a leak here is the whole novel rather than a
    // number about it. What they do is asserted in
    // `source-text-edit.integration.test.ts`; what is asserted here is that
    // nobody but the owner reaches them.
    it("the source text entry points refuse a scope forged for another owner's project", async () => {
      const forged = forgedScope(bob.ownerId, alice.projectId);

      const mine = await getSourceText(aliceScope);
      expect(mine.ok).toBe(true);

      const theirs = await getSourceText(forged);
      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");

      // A list, so "refused" is an empty answer rather than a failure — and an
      // empty answer only means something beside the owner's non-empty one.
      const myVersions = await listSourceTextVersions(aliceScope);
      expect(myVersions.ok && myVersions.value.length).toBeGreaterThan(0);

      const theirVersions = await listSourceTextVersions(forged);
      expect(theirVersions.ok && theirVersions.value).toEqual([]);

      const myReport = await readSourceTextObsolescence(aliceScope);
      expect(myReport.ok).toBe(true);

      const theirReport = await readSourceTextObsolescence(forged);
      expect(theirReport.ok).toBe(false);
      if (!theirReport.ok) expect(theirReport.error.code).toBe("NOT_FOUND");
    });

    it("updateSourceText writes nothing through a scope forged for another owner", async () => {
      const before = await getSourceText(aliceScope);

      const seized = await runWithActor(bob.ownerId, async () =>
        updateSourceText(forgedScope(bob.ownerId, alice.projectId), { content: "texte saisi" }),
      );

      expect(seized.ok).toBe(false);
      if (!seized.ok) expect(seized.error.code).toBe("NOT_FOUND");

      // Not merely refused: the owner's current version is untouched, and no
      // version was appended on the way to refusing it.
      const after = await getSourceText(aliceScope);
      expect(after.ok && before.ok && after.value).toEqual(before.ok ? before.value : null);
    });

    it("requireOwnedRow refuses a row from another owner's project", async () => {
      const mine = await requireOwnedRow("Chapter", alice.rows.Chapter, aliceScope);
      expect(mine.ok).toBe(true);

      const theirs = await requireOwnedRow("Chapter", alice.rows.Chapter, bobScope);
      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
    });

    // Ownership is not a field of the patch, and the patch is rebuilt field by
    // field rather than spread — so a caller reaching this function from
    // untyped code cannot hand a project to someone else either.
    it("updateProject cannot transfer a project to another user", async () => {
      // The cast is the point: this is what a call site reached from untyped
      // code looks like, and the type is the only thing that would have stopped
      // it. The assertion is that the runtime does too.
      const patch = { title: "renamed", userId: bob.ownerId } as unknown as UpdateProjectInput;

      const updated = await runWithActor(alice.ownerId, async () =>
        updateProject(aliceScope, patch),
      );

      expect(updated.ok).toBe(true);
      if (updated.ok) expect(updated.value.userId).toBe(alice.ownerId);
      expect((await listProjectsForOwner(bob.ownerId)).map((project) => project.id)) //
        .not.toContain(alice.projectId);
    });

    // CAL-034 removed `status` from the patch, and the field-by-field rebuild is
    // what makes the removal hold at runtime too: a caller reaching this
    // function from untyped code cannot declare a project finished either.
    it("updateProject cannot set a project status by hand", async () => {
      const before = await getProjectForOwner({
        ownerId: alice.ownerId,
        projectId: alice.projectId,
      });
      if (!before.ok) throw new Error("the fixture's own project is unreadable");

      const patch = {
        title: "renamed twice",
        status: "COMPLETED",
      } as unknown as UpdateProjectInput;

      const updated = await runWithActor(alice.ownerId, async () =>
        updateProject(aliceScope, patch),
      );

      expect(updated.ok).toBe(true);
      if (updated.ok) expect(updated.value.status).toBe(before.value.status);
    });

    it("createProject gives the project to the owner it names", async () => {
      const created = await runWithActor(bob.ownerId, async () =>
        createProject({ ownerId: bob.ownerId, title: "owner-access-created" }),
      );

      expect(created.userId).toBe(bob.ownerId);
      expect((await listProjectsForOwner(alice.ownerId)).map((project) => project.id)) //
        .not.toContain(created.id);
    });

    // CAL-040. The wizard's one write: a project and its founding source text
    // in one transaction. Both rows must belong to the owner it names, and
    // neither is reachable by scoping to someone else's — the same criterion
    // the table-by-table sweep above proves for every other model, checked
    // here for the one pair this function creates together.
    it("createProjectWithSourceText gives the project and its source text to the owner it names", async () => {
      const created = await runWithActor(bob.ownerId, async () =>
        createProjectWithSourceText({
          ownerId: bob.ownerId,
          title: "owner-access-created-with-source-text",
          sourceText: { content: "Un texte source de test." },
        }),
      );

      expect(created.userId).toBe(bob.ownerId);

      const opened = await openProjectScope({ ownerId: bob.ownerId, projectId: created.id });
      if (!opened.ok)
        throw new Error("the owner could not open a scope on the project just created");
      const createdScope = opened.value;

      expect(
        await delegateOf("SourceText").count({
          where: scopedWhere("SourceText", createdScope, { projectId: created.id }),
        }),
      ).toBe(1);

      expect(
        await delegateOf("SourceText").count({
          where: scopedWhere("SourceText", aliceScope, { projectId: created.id }),
        }),
      ).toBe(0);
    });

    // An owner id that never got established would query the projects of
    // nobody — an empty list that reads exactly like a user with no projects.
    it("refuses an entry point called with no owner at all", async () => {
      await expect(listProjectsForOwner("")).rejects.toMatchObject({
        code: "PROJECT_SCOPE_REQUIRED",
      });
      await expect(
        getProjectForOwner({ ownerId: "", projectId: alice.projectId }),
      ).rejects.toMatchObject({ code: "PROJECT_SCOPE_REQUIRED" });
      await expect(
        openProjectScope({ ownerId: "", projectId: alice.projectId }),
      ).rejects.toMatchObject({ code: "PROJECT_SCOPE_REQUIRED" });
    });
  });
});
