/**
 * CAL-072's read: `getAnalysis` returns the *current* revision of each
 * section — the one with the highest `revisionNumber` — never a stale one,
 * against a real PostgreSQL.
 *
 * Ownership is proved once, table by table, in
 * `owner-access.integration.test.ts`; what is proved here is the one rule that
 * table cannot exercise — that a section regenerated more than once reports
 * only its latest content, and that elements come back in the order they were
 * written.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  createProjectWithSourceText,
  getAnalysis,
  openProjectScope,
  type ProjectScope,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

describe("the narrative diagnostic read (CAL-072)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({
      data: { email: "analysis-diagnostic@example.test" },
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
    readonly sourceTextVersionId: string;
  }

  /** A project created the way the product creates one — wizard write path. */
  async function seedProject(label: string): Promise<Fixture> {
    setActor(ownerId);

    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({ ownerId, title: label, sourceText: { content: "fixture" } }),
    );

    const opened = await openProjectScope({ ownerId, projectId: project.id });
    if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

    const version = await prisma.sourceTextVersion.findFirstOrThrow({
      where: { sourceText: { projectId: project.id } },
      select: { id: true },
    });

    return { scope: opened.value, projectId: project.id, sourceTextVersionId: version.id };
  }

  it("returns nothing for a project that has never been analysed", async () => {
    const fixture = await seedProject("never-analysed");

    expect(await getAnalysis(fixture.scope)).toBeNull();
  });

  it("returns an empty section list for an analysis with no revisions yet", async () => {
    const fixture = await seedProject("no-revisions");
    setActor(ownerId);

    await prisma.analysis.create({ data: { projectId: fixture.projectId } });

    expect(await getAnalysis(fixture.scope)).toEqual({ validatedAt: null, sections: [] });
  });

  it("reports only the current (highest-numbered) revision of a regenerated section", async () => {
    const fixture = await seedProject("regenerated");
    setActor(ownerId);

    const analysis = await prisma.analysis.create({ data: { projectId: fixture.projectId } });

    const first = await prisma.analysisSectionRevision.create({
      data: {
        analysisId: analysis.id,
        section: "THEMES",
        revisionNumber: 1,
        origin: "GENERATED",
        sourceTextVersionId: fixture.sourceTextVersionId,
        createdById: ownerId,
      },
    });
    await prisma.analysisElement.create({
      data: {
        sectionRevisionId: first.id,
        position: 1,
        kind: "FACTUAL",
        origin: "GENERATED",
        label: "old",
        statement: "stale",
      },
    });

    const second = await prisma.analysisSectionRevision.create({
      data: {
        analysisId: analysis.id,
        section: "THEMES",
        revisionNumber: 2,
        origin: "GENERATED",
        sourceTextVersionId: fixture.sourceTextVersionId,
        createdById: ownerId,
      },
    });
    await prisma.analysisElement.create({
      data: {
        sectionRevisionId: second.id,
        position: 1,
        kind: "INTERPRETATION",
        origin: "GENERATED",
        label: "new",
        statement: "current",
      },
    });

    const result = await getAnalysis(fixture.scope);

    expect(result?.sections).toEqual([
      {
        section: "THEMES",
        revisionNumber: 2,
        origin: "GENERATED",
        elements: [
          {
            lineageId: expect.any(String),
            kind: "INTERPRETATION",
            label: "new",
            statement: "current",
            evidence: null,
            origin: "GENERATED",
            // A generated revision the author has not passed over.
            provenance: "proposed",
            annotations: [],
          },
        ],
      },
    ]);
  });

  it("orders a section's elements by position", async () => {
    const fixture = await seedProject("ordering");
    setActor(ownerId);

    const analysis = await prisma.analysis.create({ data: { projectId: fixture.projectId } });
    const revision = await prisma.analysisSectionRevision.create({
      data: {
        analysisId: analysis.id,
        section: "CHARACTERS",
        revisionNumber: 1,
        origin: "GENERATED",
        sourceTextVersionId: fixture.sourceTextVersionId,
        createdById: ownerId,
      },
    });

    for (const position of [3, 1, 2]) {
      await prisma.analysisElement.create({
        data: {
          sectionRevisionId: revision.id,
          position,
          kind: "FACTUAL",
          origin: "GENERATED",
          label: `label-${position}`,
          statement: `statement-${position}`,
        },
      });
    }

    const result = await getAnalysis(fixture.scope);

    expect(result?.sections[0]?.elements.map((element) => element.label)).toEqual([
      "label-1",
      "label-2",
      "label-3",
    ]);
  });
});
