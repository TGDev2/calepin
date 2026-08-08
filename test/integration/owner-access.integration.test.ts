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
import {
  createProject,
  delegateName,
  deleteProject,
  getProjectForOwner,
  listProjectDashboardRows,
  listProjectsForOwner,
  openProjectScope,
  PROJECT_OWNED_MODEL_NAMES,
  type ProjectOwnedModelName,
  type ProjectScope,
  requireOwnedRow,
  scopedWhere,
  updateProject,
  type UpdateProjectInput,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";
import { createProjectGraph, type ProjectGraph } from "./project-graph";

/** The repository's data entry points — every export that touches the database. */
const ENTRY_POINTS = [
  "createProject",
  "deleteProject",
  "getProjectForOwner",
  "listProjectDashboardRows",
  "listProjectsForOwner",
  "openProjectScope",
  "requireOwnedRow",
  "updateProject",
];

/** Its pure helpers: they build or check a value and reach nothing. */
const HELPERS = [
  "assertProjectScope",
  "delegateName",
  "isProjectOwnedModel",
  "isProjectScope",
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

    it("createProject gives the project to the owner it names", async () => {
      const created = await runWithActor(bob.ownerId, async () =>
        createProject({ ownerId: bob.ownerId, title: "owner-access-created" }),
      );

      expect(created.userId).toBe(bob.ownerId);
      expect((await listProjectsForOwner(alice.ownerId)).map((project) => project.id)) //
        .not.toContain(created.id);
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
