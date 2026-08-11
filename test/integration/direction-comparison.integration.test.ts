/**
 * CAL-082's read: `getDirectionsForComparison` returns every direction
 * proposed for a project, oldest first, each with its critique when one
 * exists — against a real PostgreSQL.
 *
 * Ownership is proved once, table by table, in
 * `owner-access.integration.test.ts`; what is proved here is what that table
 * cannot exercise — ordering, a legitimately empty project, and that a
 * direction with no evaluation yet reports `null` rather than failing.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  createProjectWithSourceText,
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

describe("the direction comparison read (CAL-082)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({
      data: { email: "direction-comparison@example.test" },
    });
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

  async function seedProject(label: string): Promise<Fixture> {
    setActor(ownerId);

    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({ ownerId, title: label, sourceText: { content: "fixture" } }),
    );

    const opened = await openProjectScope({ ownerId, projectId: project.id });
    if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

    return { scope: opened.value, projectId: project.id };
  }

  function fixtureDirectionData(projectId: string, workingTitle: string) {
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
    };
  }

  it("returns nothing for a project no direction has been proposed for", async () => {
    const fixture = await seedProject("no-directions");

    expect(await getDirectionsForComparison(fixture.scope)).toEqual([]);
  });

  it("reports a direction with no evaluation yet as null, not a failure", async () => {
    const fixture = await seedProject("no-evaluation");
    setActor(ownerId);

    await prisma.creativeDirection.create({
      data: fixtureDirectionData(fixture.projectId, "sole direction"),
    });

    const directions = await getDirectionsForComparison(fixture.scope);
    expect(directions).toHaveLength(1);
    expect(directions[0]?.evaluation).toBeNull();
  });

  it("orders directions oldest first, and carries a direction's evaluation with it", async () => {
    const fixture = await seedProject("ordered");
    setActor(ownerId);

    const first = await prisma.creativeDirection.create({
      data: fixtureDirectionData(fixture.projectId, "first"),
    });
    // A distinct createdAt without depending on real-clock timing: the second
    // row is created against an explicit later timestamp, since two inserts
    // in the same test can otherwise land in the same millisecond.
    const second = await prisma.creativeDirection.create({
      data: {
        ...fixtureDirectionData(fixture.projectId, "second"),
        createdAt: new Date(Date.now() + 1000),
      },
    });

    await prisma.directionEvaluation.create({
      data: {
        directionId: second.id,
        promises: [
          { label: "fixture", element: "workingTitle", evidence: null, whatItCommitsTo: "fixture" },
        ],
        shortfalls: [
          { label: "fixture", element: "workingTitle", evidence: null, whyAtRisk: "fixture" },
        ],
        conventions: [
          { label: "fixture", element: "workingTitle", evidence: null, whyConventional: "fixture" },
        ],
        comparativeWeaknesses: [
          {
            label: "fixture",
            element: "workingTitle",
            evidence: null,
            whyLessInteresting: "fixture",
          },
        ],
        createdById: ownerId,
      },
    });

    const directions = await getDirectionsForComparison(fixture.scope);

    expect(directions.map((direction) => direction.id)).toEqual([first.id, second.id]);
    expect(directions[0]?.evaluation).toBeNull();
    expect(directions[1]?.narrativeEngine).toEqual(NARRATIVE_ENGINE);
    expect(directions[1]?.evaluation).toMatchObject({
      promises: [expect.objectContaining({ label: "fixture" })],
    });
  });
});
