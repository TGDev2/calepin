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
  addAnalysisAnnotation,
  cancelGeneration,
  claimGenerationAttempt,
  completeGenerationAttempt,
  computeProjectAggregates,
  createProject,
  createProjectWithSourceText,
  delegateName,
  deleteAnalysisAnnotation,
  deleteProject,
  duplicateProject,
  editAnalysisSection,
  getAnalysis,
  getBibleOverview,
  getDirectionsForComparison,
  getGenerationContextForProject,
  getProjectForOwner,
  getProjectTargetLength,
  getSourceText,
  listFailedGenerations,
  listProjectDashboardRows,
  listProjectsForOwner,
  listRecentGenerations,
  listRunningGenerations,
  listSourceTextVersions,
  lockBibleElement,
  openProjectScope,
  PROJECT_OWNED_MODEL_NAMES,
  type ProjectOwnedModelName,
  type ProjectScope,
  readBibleLockGate,
  readGenerationForRun,
  readMissionMeasurements,
  readProjectCostSummary,
  readSourceTextObsolescence,
  reconcileProjectAggregates,
  renewGenerationAttemptLease,
  replayGeneration,
  requireOwnedRow,
  reserveGeneration,
  scopedWhere,
  unlockBibleElement,
  updateAnalysisAnnotation,
  updateGenerationProgress,
  updateProject,
  type UpdateProjectInput,
  updateSourceText,
  validateAnalysis,
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
 * fail. `regenerateAnalysisSection` is isolated in
 * `analysis-regeneration.integration.test.ts` for the same reason — it needs an
 * analysis with sections, elements and notes before it can refuse anything.
 * `discardDirection` is isolated in `direction-discard.integration.test.ts`,
 * which seeds the three directions a discard is chosen among — the graph below
 * holds one, and one direction cannot show that the others do not move.
 * `editDirection` and `writeUserDirection` are isolated in
 * `direction-edit.integration.test.ts` for the same reason: they need a
 * direction with a chosen origin (proposed, edited, user-written, discarded,
 * canonical) to prove the transition and refusal rules, which the shared
 * graph's one always-`PROPOSED` direction cannot do on its own.
 * `selectCanonicalDirection` and `readCanonicalDirectionObsolescence` are
 * isolated in `direction-canonical.integration.test.ts`, which seeds the
 * validated analysis a choice requires and the downstream work a change has to
 * warn about — neither of which the shared graph is arranged to hold.
 * `getRelationshipGraph`, `writeRelationship`, `editRelationship` and
 * `deleteRelationship` are isolated in
 * `relationship-graph.integration.test.ts`: they need a cast of three and both
 * directions of a pair before a one-sided tie can be told from an absent one,
 * which the shared graph's single relationship cannot show.
 * `lockBibleElement`, `unlockBibleElement` and `readBibleLockGate` are tested
 * here *and* in `bible-lock.integration.test.ts`: the isolation half belongs
 * below because they are the one place a caller names a Prisma model by hand,
 * so `scopedWhere` is all that stands between a lock written by name and
 * another author's row; the behaviour half needs a generation to block, which
 * the shared graph is not arranged to produce.
 * `editCharacter` is isolated in `character-editing.integration.test.ts`: it
 * needs a locked field, a locked row and a name collision to prove its own
 * refusals, none of which the shared graph is arranged to hold.
 * `writeCanonFact`, `editCanonFact`, `setCanonFactStatus` and
 * `deleteCanonFact` are isolated in `canon-fact-editing.integration.test.ts`:
 * they need the three temporal shapes, a timeline event to end a fact, an
 * extracted fact beside a hand-written one and a chapter plan citing one before
 * their refusals mean anything — the shared graph holds one permanent fact.
 */
const ENTRY_POINTS = [
  "addAnalysisAnnotation",
  "archiveProject",
  "cancelGeneration",
  "claimGenerationAttempt",
  "completeGenerationAttempt",
  "computeProjectAggregates",
  "createProject",
  "createProjectWithSourceText",
  "deleteAnalysisAnnotation",
  "deleteCanonFact",
  "deleteRelationship",
  "deleteProject",
  "discardDirection",
  "duplicateProject",
  "editAnalysisSection",
  "editCanonFact",
  "editCharacter",
  "editDirection",
  "editRelationship",
  "getAnalysis",
  "getBibleOverview",
  "getCharacterForEdit",
  "getDirectionsForComparison",
  "getGenerationContextForProject",
  "getProjectForOwner",
  "getProjectTargetLength",
  "getRelationshipGraph",
  "getSourceText",
  "listProjectDashboardRows",
  "listProjectsForOwner",
  "listFailedGenerations",
  "listRecentGenerations",
  "listRunningGenerations",
  "listSourceTextVersions",
  "lockBibleElement",
  "openProjectScope",
  "readBibleLockGate",
  "readCanonicalDirectionObsolescence",
  "readMissionMeasurements",
  "readProjectCostSummary",
  "readProjectProgress",
  "readSourceTextObsolescence",
  "reconcileProjectAggregates",
  "reconcileProjectStatus",
  "refreshProjectStatus",
  "regenerateAnalysisSection",
  "renewGenerationAttemptLease",
  "replayGeneration",
  "requireOwnedRow",
  "reserveGeneration",
  "restoreProject",
  "selectCanonicalDirection",
  "setCanonFactStatus",
  "unlockBibleElement",
  "updateAnalysisAnnotation",
  "updateGenerationProgress",
  "updateProject",
  "updateSourceText",
  "validateAnalysis",
  "withProjectAggregates",
  "withProjectStatus",
  "withProjectTransaction",
  "writeCanonFact",
  "writeRelationship",
  "writeUserDirection",
];

/**
 * The five functions that are **ungated on purpose** (CAL-061).
 *
 * A reconciliation sweep acts for nobody: it looks at every project at once, and
 * there is no owner to open a scope with. Listing them separately is what keeps
 * the carve-out a decision rather than an omission — a sixth name appearing here
 * is a review conversation, and a sixth name appearing in neither list fails the
 * assertion below.
 *
 * Four of them are statements over status columns that return a count and read
 * nothing an owner could care about. The fifth, `readGenerationForRun`, is the
 * one that makes the other four safe: it resolves *whose* a generation is, so
 * the job runner can open a real scope and do everything afterwards through the
 * gated functions. Its own test is that the owner it names is the true one —
 * everything downstream is only as scoped as that answer is right.
 */
const SYSTEM_ENTRY_POINTS = [
  "exhaustSpentGenerations",
  "listDeliverableGenerations",
  "readGenerationForRun",
  "reclaimExpiredAttempts",
  "requeueOrphanedGenerations",
];

/**
 * Its pure helpers: they build or check a value and reach nothing.
 *
 * `createGenerationPersistence` is one of them despite what its result does:
 * the factory itself issues no statement, and each of the three methods it
 * returns is an entry point listed above, isolated on its own.
 */
const HELPERS = [
  "assertProjectScope",
  "createGenerationPersistence",
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

      expect(exported).toEqual([...ENTRY_POINTS, ...SYSTEM_ENTRY_POINTS, ...HELPERS].sort());
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
    // CAL-058. The four write paths of a generation's life, and the reason
    // isolating them matters more than isolating a read: a forged scope that
    // reached one would not merely see another author's work, it would open,
    // claim, complete or reopen a *paid* call against their project.
    it("reserveGeneration refuses another owner's project", async () => {
      const ask = { mission: "WRITE_SCENE", targetId: "chapter-x", input: {} } as const;

      const mine = await runWithActor(alice.ownerId, async () =>
        reserveGeneration(aliceScope, ask),
      );
      expect(mine.ok).toBe(true);

      const theirs = await runWithActor(bob.ownerId, async () =>
        reserveGeneration(forgedScope(bob.ownerId, alice.projectId), ask),
      );
      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
    });

    it("claimGenerationAttempt refuses another owner's generation", async () => {
      const theirs = await claimGenerationAttempt(forgedScope(bob.ownerId, alice.projectId), {
        generationId: alice.rows.Generation,
        model: "fixture-model",
      });

      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
      // And the attempt the graph seeded is untouched: a refused claim must not
      // reclaim, complete or otherwise move a row it could not read.
      expect(
        await prisma.generationAttempt.count({
          where: { id: alice.rows.GenerationAttempt, status: "RUNNING" },
        }),
      ).toBe(1);
    });

    it("completeGenerationAttempt refuses another owner's generation", async () => {
      const theirs = await completeGenerationAttempt(forgedScope(bob.ownerId, alice.projectId), {
        generationId: alice.rows.Generation,
        attempt: 1,
        durationMs: 1,
        status: "succeeded",
        retryable: false,
        usage: { model: "fixture-model", inputTokens: 10, outputTokens: 10 },
      });

      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
      expect(
        await prisma.generationAttempt.count({
          where: { id: alice.rows.GenerationAttempt, status: "RUNNING" },
        }),
      ).toBe(1);
    });

    it("replayGeneration refuses another owner's generation", async () => {
      const theirs = await replayGeneration(
        forgedScope(bob.ownerId, alice.projectId),
        alice.rows.Generation,
      );

      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
    });

    // CAL-064. Cancelling is the one write on this list a *reader* can trigger
    // from a button, so a forged scope reaching it would be a way to stop
    // another author's paid work from a URL. The positive half runs against a
    // generation this test opens for itself, because cancelling is terminal and
    // the graph's shared row is still needed, running, by the assertions below.
    it("cancelGeneration refuses another owner's generation", async () => {
      const theirs = await cancelGeneration(
        forgedScope(bob.ownerId, alice.projectId),
        alice.rows.Generation,
      );

      expect(theirs.ok).toBe(false);
      if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
      expect(
        (await prisma.generation.findUniqueOrThrow({ where: { id: alice.rows.Generation } }))
          .status,
      ).not.toBe("CANCELLED");

      const opened = await runWithActor(alice.ownerId, async () =>
        reserveGeneration(aliceScope, {
          mission: "WRITE_SCENE",
          targetId: "chapter-cancelled",
          input: {},
        }),
      );
      if (!opened.ok) throw new Error("the owner could not open their own generation");

      const mine = await cancelGeneration(aliceScope, opened.value.id);
      expect(mine.ok && mine.value).toBe("cancelled");
      expect(
        (await prisma.generation.findUniqueOrThrow({ where: { id: opened.value.id } })).status,
      ).toBe("CANCELLED");
    });

    // CAL-061. Renewal is a write, and the one a long generation makes over and
    // over: a forged scope reaching it would let one author hold another's
    // attempt open indefinitely, which is the opposite of what the lease exists
    // for. `lost` and not a refusal, because the statement is the same shape as
    // "somebody reclaimed this" — nothing moved, so nothing is claimed.
    it("renewGenerationAttemptLease moves no lease but the owner's", async () => {
      // The graph seeds a `QUEUED` generation beside a `RUNNING` attempt, which
      // no claim ever produces — a claim moves the generation to `RUNNING` in
      // the same locked transaction that opens the attempt. Since CAL-064 the
      // renewal is also the watch and renews only against a `RUNNING`
      // generation, so the fixture has to be the pair the real code makes.
      // Harmless for everything after it: `RUNNING` is in the running list the
      // later assertions read, and the failure case overwrites the row anyway.
      await prisma.generation.update({
        where: { id: alice.rows.Generation },
        data: { status: "RUNNING" },
      });

      const before = await prisma.generationAttempt.findUniqueOrThrow({
        where: { id: alice.rows.GenerationAttempt },
      });

      const theirs = await renewGenerationAttemptLease(forgedScope(bob.ownerId, alice.projectId), {
        generationId: alice.rows.Generation,
        attempt: 1,
        leaseMs: 60_000,
      });
      expect(theirs.ok && theirs.value).toBe("lost");
      expect(
        (
          await prisma.generationAttempt.findUniqueOrThrow({
            where: { id: alice.rows.GenerationAttempt },
          })
        ).leaseExpiresAt,
      ).toEqual(before.leaseExpiresAt);

      const mine = await renewGenerationAttemptLease(aliceScope, {
        generationId: alice.rows.Generation,
        attempt: 1,
        leaseMs: 60_000,
      });
      expect(mine.ok && mine.value).toBe("renewed");
    });

    // CAL-062. A progress write is exactly as confined as any other write on
    // a live generation: a forged scope must not be able to plant a step or a
    // percentage onto another owner's row. The fixture's generation is
    // `QUEUED` by default; this function only ever writes a `RUNNING` one
    // (§7's own reasoning — nothing is "in progress" before an attempt has
    // claimed it), so the test moves it there itself, harmlessly for every
    // later assertion in this file: nothing downstream reads this row's exact
    // status, only its presence in the "running" list, which already
    // includes `QUEUED`.
    it("updateGenerationProgress writes no step but the owner's", async () => {
      await prisma.generation.update({
        where: { id: alice.rows.Generation },
        data: { status: "RUNNING" },
      });

      await updateGenerationProgress(forgedScope(bob.ownerId, alice.projectId), {
        generationId: alice.rows.Generation,
        step: "seized",
        percent: 90,
      });
      expect(
        (await prisma.generation.findUniqueOrThrow({ where: { id: alice.rows.Generation } }))
          .progressStep,
      ).toBeNull();

      await updateGenerationProgress(aliceScope, {
        generationId: alice.rows.Generation,
        step: "Rédaction en cours",
        percent: 40,
      });
      expect(
        (await prisma.generation.findUniqueOrThrow({ where: { id: alice.rows.Generation } }))
          .progressStep,
      ).toBe("Rédaction en cours");
    });

    // CAL-061. The one ungated read, and the hinge the other four hang on: the
    // job runner opens its `ProjectScope` from the owner this returns, so every
    // scoped call it makes afterwards is exactly as confined as this answer is
    // correct. It takes no scope by design — a sweep acts for nobody — which is
    // why what is asserted here is truthfulness rather than refusal.
    it("readGenerationForRun names the true owner of the generation it reads", async () => {
      const target = await readGenerationForRun(alice.rows.Generation);

      expect(target).toMatchObject({
        id: alice.rows.Generation,
        projectId: alice.projectId,
        ownerId: alice.ownerId,
        mission: "WRITE_SCENE",
      });
      expect(target?.ownerId).not.toBe(bob.ownerId);

      // A scope opened from it reaches the project, and one opened from anyone
      // else's id does not — which is the property the runner depends on.
      const opened = await openProjectScope({
        ownerId: target?.ownerId ?? "",
        projectId: target?.projectId ?? "",
      });
      expect(opened.ok).toBe(true);

      expect(await readGenerationForRun("no_such_generation")).toBeNull();
    });

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

    /**
     * CAL-063's replay screen. The fixture graph's generation is `QUEUED`, so
     * this reader answers nothing for either owner until one is failed — and
     * failing Alice's is what makes "not Bob's" mean something rather than
     * being satisfied by an empty database on both sides.
     */
    it("listFailedGenerations never returns another owner's generation", async () => {
      await seam.$executeRaw`
        UPDATE "generations"
        SET "status" = 'FAILED', "completedAt" = now(),
            "errorCode" = 'PROVIDER_UNAVAILABLE', "errorCategory" = 'PROVIDER',
            "failureClass" = 'PERMANENT'
        WHERE "id" = ${alice.rows.Generation}
      `;

      const alicesFailed = await listFailedGenerations(aliceScope);
      const bobsFailed = await listFailedGenerations(bobScope);

      expect(alicesFailed.map((row) => row.id)).toContain(alice.rows.Generation);
      expect(bobsFailed.map((row) => row.id)).not.toContain(alice.rows.Generation);
    });

    // CAL-068's operations screen — user-wide, so there is no scope to forge:
    // the isolation is entirely in `WHERE p."userId" = ...`. The fixture graph
    // seeds exactly one `Generation` (`WRITE_SCENE`) with one
    // `GenerationAttempt` (`model: "fixture-model"`, no usage recorded) per
    // owner, which is enough to prove both the isolation and the aggregation
    // without a bespoke seed. Runs after `listFailedGenerations`'s own test,
    // which has already moved Alice's row to `FAILED` — asserted here rather
    // than re-asserted as `QUEUED`, since that mutation is exactly what proves
    // the status and error columns are read back correctly too.
    it("listRecentGenerations never returns another owner's generation", async () => {
      const bobsGenerations = await listRecentGenerations(bob.ownerId);
      const alicesGenerations = await listRecentGenerations(alice.ownerId);

      expect(bobsGenerations.map((row) => row.id)).not.toContain(alice.rows.Generation);
      expect(alicesGenerations.map((row) => row.id)).not.toContain(bob.rows.Generation);

      const alicesRow = alicesGenerations.find((row) => row.id === alice.rows.Generation);
      expect(alicesRow).toMatchObject({
        projectId: alice.projectId,
        mission: "WRITE_SCENE",
        status: "FAILED",
        model: "fixture-model",
        attemptCount: 1,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
        estimatedCostUsd: "0.000000",
        errorCode: "PROVIDER_UNAVAILABLE",
        errorCategory: "provider",
        failureClass: "permanent",
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

    // CAL-072's diagnostic screen. The fixture graph seeds one
    // `AnalysisSectionRevision` (`FACTUAL_SUMMARY`) with one `AnalysisElement`
    // (`kind: "FACTUAL", statement: "fixture"`) per owner — enough to prove the
    // read reaches the row without a bespoke seed. A bare nullable rather than a
    // `Result`, so "refused" reads the same as "not analysed yet": both are
    // `null`.
    it("getAnalysis refuses another owner's project", async () => {
      const mine = await getAnalysis(aliceScope);
      expect(mine).toEqual({
        validatedAt: null,
        sections: [
          {
            section: "FACTUAL_SUMMARY",
            revisionNumber: 1,
            origin: "GENERATED",
            elements: [
              {
                lineageId: expect.any(String),
                kind: "FACTUAL",
                label: null,
                statement: "fixture",
                evidence: null,
                origin: "GENERATED",
                provenance: "proposed",
                annotations: [
                  {
                    id: expect.any(String),
                    body: "fixture",
                    createdAt: expect.any(Date),
                    updatedAt: expect.any(Date),
                  },
                ],
              },
            ],
          },
        ],
      });

      const theirs = await getAnalysis(forgedScope(bob.ownerId, alice.projectId));
      expect(theirs).toBeNull();
    });

    // CAL-096's consultation screen. The nine parallel reads are exercised at
    // once through the same graph the other entry points share, rather than
    // isolated the way `getRelationshipGraph` is: nothing here classifies or
    // orders the rows, so one cast, one tie, one place, one rule, one event
    // and one fact are enough to prove every section is scoped, and a second
    // fixture would only repeat this one.
    it("getBibleOverview refuses another owner's project", async () => {
      const mine = await getBibleOverview(aliceScope);

      expect(mine).toMatchObject({
        bibleId: alice.rows.Bible,
        validatedAt: null,
        identity: { workingTitle: "fixture", origin: "GENERATED", lockedAt: null },
        style: { pointOfView: "fixture", origin: "GENERATED", lockedAt: null },
        world: { era: "fixture", origin: "GENERATED", lockedAt: null },
        places: [{ id: alice.rows.Place, name: "owner-access-alice-place", origin: "GENERATED" }],
        worldRules: [
          { id: alice.rows.WorldRule, name: "owner-access-alice-rule", origin: "GENERATED" },
        ],
        relationships: [
          { id: alice.rows.Relationship, type: "FAMILY", label: "fixture", origin: "GENERATED" },
        ],
        timeline: [
          {
            id: alice.rows.TimelineEvent,
            name: "owner-access-alice-event",
            origin: "GENERATED",
            participants: [{ characterId: alice.rows.Character, declaredAge: null }],
          },
        ],
        canonFacts: [
          {
            id: alice.rows.CanonFact,
            statement: "fixture",
            source: "BIBLE",
            status: "PROPOSED",
            beliefs: [{ characterId: alice.rows.Character, state: "BELIEVES_TRUE" }],
            subjects: [{ characterId: alice.rows.Character, placeId: null }],
          },
        ],
      });
      expect(mine?.characters).toHaveLength(2);
      expect(mine?.characters.map((c) => c.id)).toContain(alice.rows.Character);

      const theirs = await getBibleOverview(forgedScope(bob.ownerId, alice.projectId));
      expect(theirs).toBeNull();
    });

    // CAL-082's comparison screen. The fixture graph seeds one
    // `CreativeDirection` with one `DirectionEvaluation` per owner — a bare
    // array rather than a `Result`, `getAnalysis`'s convention: "refused"
    // reads the same as "none proposed yet", both an empty array.
    it("getDirectionsForComparison refuses another owner's project", async () => {
      const mine = await getDirectionsForComparison(aliceScope);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        workingTitle: "fixture",
        origin: "PROPOSED",
        evaluation: { createdAt: expect.any(Date) },
      });

      const theirs = await getDirectionsForComparison(forgedScope(bob.ownerId, alice.projectId));
      expect(theirs).toEqual([]);
    });

    // CAL-073's three write paths. Each is refused the same way and for the
    // same reason: the scope names the owner, and the statement that touches
    // the row carries the filter.
    it("editAnalysisSection refuses another owner's project", async () => {
      const seized = await runWithActor(bob.ownerId, async () =>
        editAnalysisSection(forgedScope(bob.ownerId, alice.projectId), {
          section: "FACTUAL_SUMMARY",
          elements: [
            {
              lineageId: null,
              kind: "FACTUAL",
              label: null,
              statement: "seized",
              evidence: null,
            },
          ],
        }),
      );

      expect(seized.ok).toBe(false);
      if (!seized.ok) expect(seized.error.code).toBe("NOT_FOUND");

      // Not merely refused: no revision was appended on the way to refusing it.
      const after = await getAnalysis(aliceScope);
      expect(after?.sections[0]?.revisionNumber).toBe(1);
    });

    it("addAnalysisAnnotation refuses another owner's project", async () => {
      const mineFirst = await getAnalysis(aliceScope);
      const lineageId = mineFirst?.sections[0]?.elements[0]?.lineageId ?? "";

      const seized = await runWithActor(bob.ownerId, async () =>
        addAnalysisAnnotation(forgedScope(bob.ownerId, alice.projectId), {
          lineageId,
          body: "seized",
        }),
      );

      expect(seized.ok).toBe(false);
      if (!seized.ok) expect(seized.error.code).toBe("NOT_FOUND");
    });

    it("updateAnalysisAnnotation and deleteAnalysisAnnotation refuse another owner's note", async () => {
      const rewritten = await runWithActor(bob.ownerId, async () =>
        updateAnalysisAnnotation(bobScope, {
          annotationId: alice.rows.AnalysisAnnotation,
          body: "seized",
        }),
      );
      const removed = await runWithActor(bob.ownerId, async () =>
        deleteAnalysisAnnotation(bobScope, alice.rows.AnalysisAnnotation),
      );

      expect(rewritten.ok).toBe(false);
      expect(removed.ok).toBe(false);
      if (!rewritten.ok) expect(rewritten.error.code).toBe("NOT_FOUND");
      if (!removed.ok) expect(removed.error.code).toBe("NOT_FOUND");

      // And the owner's own note is untouched by the attempt.
      const stillThere = await getAnalysis(aliceScope);
      expect(stillThere?.sections[0]?.elements[0]?.annotations[0]?.body).toBe("fixture");
    });

    // CAL-074's write. Isolated here rather than proved only by its own
    // happy-path suite, for the reason every other analysis entry point is:
    // the scope's owner is what the statement underneath actually checks.
    it("validateAnalysis refuses another owner's project", async () => {
      const seized = await runWithActor(bob.ownerId, async () =>
        validateAnalysis(forgedScope(bob.ownerId, alice.projectId)),
      );

      expect(seized.ok).toBe(false);
      if (!seized.ok) expect(seized.error.code).toBe("NOT_FOUND");

      // Not merely refused: Alice's analysis is still unvalidated.
      const stillUnvalidated = await getAnalysis(aliceScope);
      expect(stillUnvalidated?.validatedAt).toBeNull();
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

    // CAL-095. The three lock entry points are the only place in this layer
    // where a caller names a Prisma model by hand, so the delegate they reach
    // is chosen at runtime and `scopedWhere` is the whole of what keeps a lock
    // written by name off another author's row.
    it("lockBibleElement and unlockBibleElement refuse another owner's element", async () => {
      const target = { model: "WorldRule", id: alice.rows.WorldRule, field: null } as const;

      const stolen = await runWithActor(bob.ownerId, () =>
        lockBibleElement(forgedScope(bob.ownerId, alice.projectId), target),
      );
      expect(stolen.ok).toBe(false);
      if (!stolen.ok) expect(stolen.error.code).toBe("NOT_FOUND");

      // Alice's own row is reachable, so the refusal above is isolation and not
      // a lock that never works.
      const mine = await runWithActor(alice.ownerId, () => lockBibleElement(aliceScope, target));
      expect(mine.ok).toBe(true);

      const unstolen = await runWithActor(bob.ownerId, () =>
        unlockBibleElement(forgedScope(bob.ownerId, alice.projectId), target),
      );
      expect(unstolen.ok).toBe(false);
      if (!unstolen.ok) expect(unstolen.error.code).toBe("NOT_FOUND");

      const lifted = await runWithActor(alice.ownerId, () =>
        unlockBibleElement(aliceScope, target),
      );
      expect(lifted.ok).toBe(true);
    });

    it("readBibleLockGate sees no lock of another owner's bible", async () => {
      const target = { model: "CanonFact", id: alice.rows.CanonFact, field: null } as const;

      await runWithActor(alice.ownerId, () => lockBibleElement(aliceScope, target));

      const mine = await readBibleLockGate(aliceScope, { mission: "EXTRACT_INITIAL_FACTS" });
      expect(mine.ok && mine.value.blocked).toBe(true);

      const theirs = await readBibleLockGate(forgedScope(bob.ownerId, alice.projectId), {
        mission: "EXTRACT_INITIAL_FACTS",
      });
      expect(theirs.ok && theirs.value.blocked).toBe(false);

      const bobs = await readBibleLockGate(bobScope, { mission: "EXTRACT_INITIAL_FACTS" });
      expect(bobs.ok && bobs.value.blocked).toBe(false);

      await runWithActor(alice.ownerId, () => unlockBibleElement(aliceScope, target));
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
      await expect(listRecentGenerations("")).rejects.toMatchObject({
        code: "PROJECT_SCOPE_REQUIRED",
      });
    });
  });
});
