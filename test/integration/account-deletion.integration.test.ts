/**
 * CAL-031's acceptance criterion, against a real PostgreSQL: **after a
 * deletion, no data of the account is readable through the API or present in
 * the database, and the stored exports are purged.**
 *
 * Three accounts, one full project graph each — a row in every one of the
 * thirty-five project-owned tables, plus the things no cascade reaches: an
 * OAuth account, a live session, a pending verification token and a rate-limit
 * row, both keyed by a bare address. One account is deleted, one is a control
 * that must survive untouched, and the third proves that a bucket failing does
 * not resurrect an account.
 *
 * The list of tables is the registry, never a list written here: a model added
 * later that the cascade does not reach fails this suite rather than shipping
 * as a row that outlives its owner.
 *
 * Both halves matter. "Nothing of theirs" is only meaningful beside "and
 * everything of the other one", so no emptiness assertion stands here without
 * the control beside it.
 *
 * Every string is technical. §9 forbids literary content in a committed
 * artefact, and a deletion suite needs none: what is under test is whether a
 * row is gone, never what it said.
 */

import {
  type AccountDeletionReport,
  collectAccountInventory,
  deleteAccount,
  type QueueCancellation,
  type StoragePurge,
} from "@calepin/shared/account";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  delegateName,
  getProjectForOwner,
  listProjectsForOwner,
  openProjectScope,
  PROJECT_OWNED_MODEL_NAMES,
  type ProjectOwnedModelName,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";
import { fixtureGenerationKey } from "./generation-fixture";
import { createProjectGraph, type ProjectGraph } from "./project-graph";

/** Everything `createProjectGraph` does not create, because no project owns it. */
interface Equipment {
  readonly email: string;
  /** The spelling `@auth/core` writes an identifier under. */
  readonly identifier: string;
  readonly sessionToken: string;
  readonly verificationToken: string;
  readonly exportKey: string;
  readonly coverKey: string;
  /** The generation still `QUEUED` — the one with work left to cancel. */
  readonly liveGenerationId: string;
  readonly finishedGenerationId: string;
}

interface CountingDelegate {
  count: (args: { where: object }) => Promise<number>;
}

/** A port that records what it was asked to do and reports it did all of it. */
function recordingPorts() {
  const purged: string[] = [];
  const cancelled: string[] = [];

  const storage: StoragePurge = {
    purgeObjects: (keys) => {
      purged.push(...keys);
      return Promise.resolve(keys.length);
    },
  };

  const queue: QueueCancellation = {
    cancelGenerations: (ids) => {
      cancelled.push(...ids);
      return Promise.resolve(ids.length);
    },
  };

  return { storage, queue, purged, cancelled };
}

const HOUR_MS = 60 * 60 * 1000;

describe("account deletion", () => {
  const { prisma, setActor } = createAuditedClient();
  /** The client the account module itself reads, registered on the seam. */
  const seam = new PrismaClient();

  let alice: ProjectGraph;
  let aliceKit: Equipment;
  let bob: ProjectGraph;
  let bobKit: Equipment;

  /**
   * The delegate a model is served by, on the fixture client. Cast and
   * confined here so the assertions below can iterate the registry rather than
   * name thirty-five delegates by hand — the trade `owner-access` already
   * documents.
   */
  function delegateOf(model: ProjectOwnedModelName): CountingDelegate {
    const client: unknown = prisma;
    const delegate = (client as Record<string, CountingDelegate | undefined>)[delegateName(model)];

    if (!delegate) throw new Error(`no Prisma delegate for the owned model ${model}`);

    return delegate;
  }

  function rowsOf(graph: ProjectGraph, model: ProjectOwnedModelName): Promise<number> {
    return delegateOf(model).count({ where: { id: graph.rows[model] } });
  }

  /**
   * Adds what hangs off the *account* rather than off a project, and fills the
   * two `Restrict` author columns `createProjectGraph` leaves null — so all
   * seven of them are exercised here, not the five a smaller fixture happens
   * to reach.
   *
   * The address is deliberately mixed-case: an account created through an
   * OAuth provider keeps the spelling the provider sent, while `@auth/core`
   * writes a verification token under the NFKC-lowercased form. A deletion
   * that only knew one of the two would leave the other behind.
   */
  async function equip(graph: ProjectGraph, label: string): Promise<Equipment> {
    setActor(graph.ownerId);

    const email = `${label}.Mixed@Example.Test`;
    const identifier = email.normalize("NFKC").toLowerCase().trim();
    const sessionToken = `${label}-session`;
    const verificationToken = `${label}-verification`;
    const exportKey = `exports/${label}.md`;
    const coverKey = `covers/${label}.png`;
    const validatedAt = new Date();

    await prisma.user.update({ where: { id: graph.ownerId }, data: { email } });

    await prisma.account.create({
      data: {
        userId: graph.ownerId,
        provider: "google",
        providerAccountId: `${label}-google`,
        type: "oauth",
      },
    });
    await prisma.session.create({
      data: { sessionToken, userId: graph.ownerId, expires: new Date(Date.now() + HOUR_MS) },
    });
    await prisma.verificationToken.create({
      data: { identifier, token: verificationToken, expires: new Date(Date.now() + HOUR_MS) },
    });
    await prisma.emailSignInRequest.create({ data: { identifier } });

    await prisma.analysis.update({
      where: { id: graph.rows.Analysis },
      data: { validatedAt, validatedById: graph.ownerId },
    });
    await prisma.bible.update({
      where: { id: graph.rows.Bible },
      data: { validatedAt, validatedById: graph.ownerId },
    });

    await prisma.export.update({
      where: { id: graph.rows.Export },
      data: { status: "READY", completedAt: new Date(), storageKey: exportKey, byteSize: 12 },
    });
    await prisma.publication.update({
      where: { id: graph.rows.Publication },
      data: { coverStorageKey: coverKey },
    });

    // `createProjectGraph`'s own generation defaults to QUEUED; a second,
    // finished one is what proves only live work is handed to the queue port.
    const finished = await prisma.generation.create({
      data: {
        projectId: graph.projectId,
        mission: "SUMMARIZE_CHAPTER",
        input: {},
        idempotencyKey: fixtureGenerationKey(`${graph.projectId}-summarize-chapter`),
        status: "SUCCEEDED",
        completedAt: new Date(),
      },
    });

    return {
      email,
      identifier,
      sessionToken,
      verificationToken,
      exportKey,
      coverKey,
      liveGenerationId: graph.rows.Generation,
      finishedGenerationId: finished.id,
    };
  }

  beforeAll(async () => {
    configureDatabaseClient(seam);

    alice = await createProjectGraph(prisma, setActor, "account-deletion-alice");
    aliceKit = await equip(alice, "account-deletion-alice");

    bob = await createProjectGraph(prisma, setActor, "account-deletion-bob");
    bobKit = await equip(bob, "account-deletion-bob");
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  describe("the census taken before anything is destroyed", () => {
    it("counts what the account holds, and counts only", async () => {
      const inventory = await collectAccountInventory(alice.ownerId);

      expect(inventory.ok).toBe(true);
      if (!inventory.ok) return;

      expect(inventory.value).toEqual({
        userId: alice.ownerId,
        email: aliceKit.email,
        projects: 1,
        chapters: 2,
        revisions: 1,
        generations: 2,
        queuedGenerations: 1,
        exports: 1,
        publications: 1,
        storedObjects: 2,
      });
    });

    it("counts one owner's rows and never another's", async () => {
      const inventory = await collectAccountInventory(bob.ownerId);

      expect(inventory.ok).toBe(true);
      if (!inventory.ok) return;

      // Two accounts, identically shaped graphs: a query that had lost its
      // owner filter would report two projects here, not one.
      expect(inventory.value.projects).toBe(1);
      expect(inventory.value.email).toBe(bobKit.email);
    });

    // The census is rendered on a screen and can be quoted into a support
    // conversation. Every field but the two identifiers is a number, and a
    // later field carrying a project title would fail here rather than in
    // production (§9).
    it("carries no field a reader could read as part of a novel", async () => {
      const inventory = await collectAccountInventory(alice.ownerId);
      if (!inventory.ok) throw inventory.error;

      const strings = Object.entries(inventory.value)
        .filter(([, value]) => typeof value === "string")
        .map(([key]) => key)
        .sort();

      expect(strings).toEqual(["email", "userId"]);
    });
  });

  describe("a mismatched confirmation", () => {
    let refusal: Awaited<ReturnType<typeof deleteAccount>>;
    const ports = recordingPorts();

    beforeAll(async () => {
      refusal = await deleteAccount({
        userId: alice.ownerId,
        confirmation: `not-${aliceKit.email}`,
        storage: ports.storage,
        queue: ports.queue,
      });
    });

    it("fails as a validation error, in French, naming the field", () => {
      expect(refusal.ok).toBe(false);
      if (refusal.ok) return;

      expect(refusal.error.code).toBe("VALIDATION_FAILED");
      expect(refusal.error.category).toBe("validation");
      expect(refusal.error.fieldPath).toBe("confirmation");
      expect(refusal.error.userMessage).toMatch(/Aucune donnée n'a été supprimée/);
    });

    // The failure mode worth the most: a deletion that half-runs leaves data
    // nobody can see and nobody deletes.
    it.each(PROJECT_OWNED_MODEL_NAMES)("leaves the %s row untouched", async (model) => {
      expect(await rowsOf(alice, model)).toBe(1);
    });

    it("leaves the account, its session and its pending token untouched", async () => {
      expect(await prisma.user.count({ where: { id: alice.ownerId } })).toBe(1);
      expect(await prisma.session.count({ where: { userId: alice.ownerId } })).toBe(1);
      expect(
        await prisma.verificationToken.count({ where: { identifier: aliceKit.identifier } }),
      ).toBe(1);
    });

    it("reaches neither the bucket nor the queue", () => {
      expect(ports.purged).toEqual([]);
      expect(ports.cancelled).toEqual([]);
    });
  });

  describe("a confirmed deletion", () => {
    const ports = recordingPorts();
    let report: AccountDeletionReport;

    beforeAll(async () => {
      const outcome = await deleteAccount({
        // Typed with different capitalisation and stray spacing, the way a
        // person retypes their own address.
        confirmation: `  ${aliceKit.email.toUpperCase()} `,
        userId: alice.ownerId,
        storage: ports.storage,
        queue: ports.queue,
      });

      if (!outcome.ok) throw outcome.error;

      report = outcome.value;
    });

    it.each(PROJECT_OWNED_MODEL_NAMES)("leaves no %s row in the database", async (model) => {
      expect(await rowsOf(alice, model)).toBe(0);
    });

    it("leaves no account, no linked provider and no session", async () => {
      expect(await prisma.user.count({ where: { id: alice.ownerId } })).toBe(0);
      expect(await prisma.account.count({ where: { userId: alice.ownerId } })).toBe(0);
      expect(await prisma.session.count({ where: { userId: alice.ownerId } })).toBe(0);
      expect(await prisma.session.count({ where: { sessionToken: aliceKit.sessionToken } })).toBe(
        0,
      );
    });

    // Neither table has a foreign key to `users`, so no cascade reaches them:
    // without an explicit delete, a pending sign-in link and the rate-limit
    // trail would outlive the account and keep naming the address.
    it("leaves no pending sign-in link and no rate-limit trail for the address", async () => {
      expect(
        await prisma.verificationToken.count({ where: { identifier: aliceKit.identifier } }),
      ).toBe(0);
      expect(
        await prisma.emailSignInRequest.count({ where: { identifier: aliceKit.identifier } }),
      ).toBe(0);
    });

    it("reads as gone through every entry point that could still find it", async () => {
      expect(await listProjectsForOwner(alice.ownerId)).toEqual([]);

      const project = await getProjectForOwner({
        ownerId: alice.ownerId,
        projectId: alice.projectId,
      });
      expect(project.ok).toBe(false);
      if (!project.ok) expect(project.error.code).toBe("NOT_FOUND");

      const scope = await openProjectScope({
        ownerId: alice.ownerId,
        projectId: alice.projectId,
      });
      expect(scope.ok).toBe(false);
      if (!scope.ok) expect(scope.error.code).toBe("NOT_FOUND");

      const inventory = await collectAccountInventory(alice.ownerId);
      expect(inventory.ok).toBe(false);
      if (!inventory.ok) expect(inventory.error.code).toBe("NOT_FOUND");
    });

    // The project is gone, so nobody can ask for it by id any more — which is
    // exactly why the row would never be found and never be deleted either.
    it("hands the bucket both objects, and nothing else", () => {
      expect([...ports.purged].sort()).toEqual([aliceKit.coverKey, aliceKit.exportKey].sort());
      expect(report.purgedObjects).toBe(2);
      expect(report.orphanedObjects).toBe(0);
    });

    it("hands the queue the live generation and not the finished one", () => {
      expect(ports.cancelled).toEqual([aliceKit.liveGenerationId]);
      expect(ports.cancelled).not.toContain(aliceKit.finishedGenerationId);
      expect(report.cancelledJobs).toBe(1);
      expect(report.uncancelledJobs).toBe(0);
    });

    // The operation journal is built from this report, so what it may carry is
    // what the log may carry: counts, a duration and one identifier (§9).
    it("reports counts and one identifier, never a fragment of the novel", () => {
      const strings = Object.entries(report)
        .filter(([, value]) => typeof value === "string")
        .map(([key]) => key);

      expect(strings).toEqual(["userId"]);
      expect(report).toMatchObject({ userId: alice.ownerId, projects: 1 });
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
    });

    // Without this the whole suite would pass against a `TRUNCATE`.
    it.each(PROJECT_OWNED_MODEL_NAMES)("leaves the other account's %s row alone", async (model) => {
      expect(await rowsOf(bob, model)).toBe(1);
    });

    it("leaves the other account, its session and its pending token alone", async () => {
      expect(await prisma.user.count({ where: { id: bob.ownerId } })).toBe(1);
      expect(await prisma.session.count({ where: { sessionToken: bobKit.sessionToken } })).toBe(1);
      expect(await prisma.verificationToken.count({ where: { identifier: bobKit.identifier } })) //
        .toBe(1);
      expect(await prisma.emailSignInRequest.count({ where: { identifier: bobKit.identifier } })) //
        .toBe(1);
    });

    it("refuses a second deletion of the same account", async () => {
      const again = await deleteAccount({
        userId: alice.ownerId,
        confirmation: aliceKit.email,
        storage: ports.storage,
        queue: ports.queue,
      });

      expect(again.ok).toBe(false);
      if (!again.ok) expect(again.error.code).toBe("NOT_FOUND");
    });
  });

  describe("a deletion whose bucket is unreachable", () => {
    let carol: ProjectGraph;
    let carolKit: Equipment;
    let report: AccountDeletionReport;

    beforeAll(async () => {
      carol = await createProjectGraph(prisma, setActor, "account-deletion-carol");
      carolKit = await equip(carol, "account-deletion-carol");

      const outcome = await deleteAccount({
        userId: carol.ownerId,
        confirmation: carolKit.email,
        storage: { purgeObjects: () => Promise.reject(new Error("bucket unreachable")) },
        queue: { cancelGenerations: () => Promise.reject(new Error("queue unreachable")) },
      });

      if (!outcome.ok) throw outcome.error;

      report = outcome.value;
    });

    // The account is already gone by the time either port runs. Rethrowing
    // would answer "your account could not be deleted" for an account that no
    // longer exists — the one answer that is certainly wrong.
    it.each(PROJECT_OWNED_MODEL_NAMES)("still leaves no %s row behind", async (model) => {
      expect(await rowsOf(carol, model)).toBe(0);
    });

    it("still leaves no account and no session", async () => {
      expect(await prisma.user.count({ where: { id: carol.ownerId } })).toBe(0);
      expect(await prisma.session.count({ where: { userId: carol.ownerId } })).toBe(0);
    });

    it("counts what it could not clean up, so an operator can finish the job", () => {
      expect(report).toMatchObject({
        purgedObjects: 0,
        orphanedObjects: 2,
        cancelledJobs: 0,
        uncancelledJobs: 1,
      });
    });
  });

  /**
   * The module's surface, pinned. A function added here without an isolation
   * test of its own fails this assertion rather than shipping unproven — the
   * guard `owner-access.integration.test.ts` puts on the repository.
   */
  it("exposes exactly the entry points this suite covers", async () => {
    const surface = Object.keys(await import("@calepin/shared/account")).sort();

    expect(surface).toEqual(
      [
        "collectAccountInventory",
        "deleteAccount",
        "matchesDeletionConfirmation",
        "unavailableQueueCancellation",
        "unavailableStoragePurge",
      ].sort(),
    );
  });
});
