/**
 * CAL-083's write: writing one proposed direction off marks that row and
 * nothing else, and the row stays readable afterwards — against a real
 * PostgreSQL.
 *
 * The backlog's *la direction écartée reste consultable dans l'historique* is
 * a property of a statement, not of a screen, so it is proved the way CAL-077
 * proved its own absence: the whole set of directions is photographed before
 * the write and compared afterwards, so a column nobody anticipated moving
 * fails here too.
 *
 * Cross-owner isolation is proved once, table by table, in
 * `owner-access.integration.test.ts`; the negative half is repeated here only
 * where the refusal has its own remedy — an already-discarded direction and
 * the canonical one are `CONFLICT`, and a stranger's is `NOT_FOUND`.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  createProjectWithSourceText,
  discardDirection,
  getDirectionsForComparison,
  openProjectScope,
  type ProjectScope,
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

/** A synthetic French sentence written for this file (§8). */
const REASON = "Le protagoniste refait exactement le trajet de la deuxième direction.";

describe("discarding one proposed direction (CAL-083)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({ data: { email: "direction-discard@example.test" } });
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
    /** The three directions the mission proposes, in the order it returns them. */
    readonly first: string;
    readonly second: string;
    readonly third: string;
  }

  function directionData(projectId: string, workingTitle: string, isCanonical = false) {
    return {
      projectId,
      workingTitle,
      developedPremise: "fixture",
      dominantGenre: "fixture",
      mainConflict: "fixture",
      protagonistArc: "fixture",
      endingNature: "fixture",
      novelPotentialAssessment: "fixture",
      narrativeEngine: NARRATIVE_ENGINE,
      origin: "PROPOSED" as const,
      isCanonical,
    };
  }

  /** Three directions, as the mission proposes them — the shape a discard acts on. */
  async function seedProject(
    label: string,
    canonicalIndex: number | null = null,
  ): Promise<Fixture> {
    setActor(ownerId);

    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({ ownerId, title: label, sourceText: { content: "fixture" } }),
    );

    const opened = await openProjectScope({ ownerId, projectId: project.id });
    if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

    async function seedDirection(title: string, index: number): Promise<string> {
      const row = await prisma.creativeDirection.create({
        data: directionData(project.id, title, index === canonicalIndex),
        select: { id: true },
      });

      return row.id;
    }

    return {
      scope: opened.value,
      projectId: project.id,
      first: await seedDirection("première", 0),
      second: await seedDirection("deuxième", 1),
      third: await seedDirection("troisième", 2),
    };
  }

  /** Every column of every direction of a project, as one comparable value. */
  async function photograph(projectId: string): Promise<string> {
    const rows = await seam.creativeDirection.findMany({
      where: { projectId },
      orderBy: { id: "asc" },
    });

    return JSON.stringify(rows);
  }

  it("marks the named direction and leaves it readable", async () => {
    const fixture = await seedProject("discarded-stays");
    setActor(ownerId);

    const before = new Date();
    const discarded = await runWithActor(ownerId, async () =>
      discardDirection(fixture.scope, { directionId: fixture.second, reason: REASON }),
    );

    expect(discarded.ok).toBe(true);
    if (!discarded.ok) return;

    expect(discarded.value.discardedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1_000);

    const directions = await getDirectionsForComparison(fixture.scope);
    const written = directions.find((direction) => direction.id === fixture.second);

    expect(directions).toHaveLength(3);
    expect(written?.discardedAt).not.toBeNull();
    expect(written?.discardReason).toBe(REASON);
    // The whole row survives: a discard is a marker, never a deletion or a
    // blanking, which is what "reste consultable" means at the storage layer.
    expect(written?.workingTitle).toBe("deuxième");
    expect(written?.narrativeEngine).toEqual(NARRATIVE_ENGINE);
  });

  it("writes off a direction with no reason at all", async () => {
    const fixture = await seedProject("no-reason");
    setActor(ownerId);

    const discarded = await runWithActor(ownerId, async () =>
      discardDirection(fixture.scope, { directionId: fixture.first, reason: null }),
    );

    expect(discarded.ok).toBe(true);

    const directions = await getDirectionsForComparison(fixture.scope);
    const written = directions.find((direction) => direction.id === fixture.first);

    expect(written?.discardedAt).not.toBeNull();
    expect(written?.discardReason).toBeNull();
  });

  // The acceptance criterion's quiet half: the two directions the author kept
  // are not disturbed by the one they rejected.
  it("touches no other direction of the project", async () => {
    const fixture = await seedProject("no-side-effect");
    setActor(ownerId);

    const kept = [fixture.first, fixture.third];
    const before = await seam.creativeDirection.findMany({
      where: { id: { in: kept } },
      orderBy: { id: "asc" },
    });

    await runWithActor(ownerId, async () =>
      discardDirection(fixture.scope, { directionId: fixture.second, reason: REASON }),
    );

    const after = await seam.creativeDirection.findMany({
      where: { id: { in: kept } },
      orderBy: { id: "asc" },
    });

    expect(JSON.stringify(after)).toEqual(JSON.stringify(before));
  });

  it("records who wrote it off, through the audit extension", async () => {
    const fixture = await seedProject("attributed");
    setActor(ownerId);

    await runWithActor(ownerId, async () =>
      discardDirection(fixture.scope, { directionId: fixture.first, reason: REASON }),
    );

    const row = await seam.creativeDirection.findUniqueOrThrow({
      where: { id: fixture.first },
      select: { updatedById: true, version: true },
    });

    expect(row.updatedById).toBe(ownerId);
    expect(row.version).toBe(2);
  });

  // A second click on a stale screen. The remedy is to look again, not to
  // write again, so the answer is a conflict and the row does not move.
  it("refuses a second discard, and writes nothing", async () => {
    const fixture = await seedProject("already-discarded");
    setActor(ownerId);

    await runWithActor(ownerId, async () =>
      discardDirection(fixture.scope, { directionId: fixture.first, reason: REASON }),
    );

    const before = await photograph(fixture.projectId);

    const again = await runWithActor(ownerId, async () =>
      discardDirection(fixture.scope, {
        directionId: fixture.first,
        reason: "Une autre raison.",
      }),
    );

    expect(again.ok).toBe(false);
    if (again.ok) return;

    expect(again.error.code).toBe("CONFLICT");
    expect(await photograph(fixture.projectId)).toEqual(before);
  });

  // Writing off the direction the whole novel is built on is not a discard;
  // it is a change of mind about the novel.
  it("refuses to discard the canonical direction", async () => {
    const fixture = await seedProject("canonical", 1);
    setActor(ownerId);

    const before = await photograph(fixture.projectId);

    const refused = await runWithActor(ownerId, async () =>
      discardDirection(fixture.scope, { directionId: fixture.second, reason: null }),
    );

    expect(refused.ok).toBe(false);
    if (refused.ok) return;

    expect(refused.error.code).toBe("CONFLICT");
    expect(await photograph(fixture.projectId)).toEqual(before);
  });

  it("answers NOT_FOUND for a direction of another project", async () => {
    const mine = await seedProject("mine");
    const theirs = await seedProject("theirs");
    setActor(ownerId);

    const before = await photograph(theirs.projectId);

    const refused = await runWithActor(ownerId, async () =>
      discardDirection(mine.scope, { directionId: theirs.first, reason: null }),
    );

    expect(refused.ok).toBe(false);
    if (refused.ok) return;

    expect(refused.error.code).toBe("NOT_FOUND");
    expect(await photograph(theirs.projectId)).toEqual(before);
  });
});
