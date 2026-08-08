import type { Prisma } from "@prisma/client";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AuditedClient, createAuditedClient } from "./audited-client";

const CANONICAL_PER_PROJECT_KEY = /creative_directions_canonical_per_project_key/;

/**
 * Fixture strings are deliberately technical. CLAUDE.md §9 forbids literary
 * content in any committed artefact, and a schema test needs none: what is
 * under test is the shape, never the prose it will one day hold.
 */
// `projectId` is required and the rest is optional, stated rather than left to
// a `Record<string, unknown>` spread — that shape erased `projectId` from the
// result type, so a call missing it compiled and only failed at runtime.
type DirectionOverrides = Partial<Prisma.CreativeDirectionUncheckedCreateInput> & {
  projectId: string;
};

function fixtureDirection(
  overrides: DirectionOverrides,
): Prisma.CreativeDirectionUncheckedCreateInput {
  return {
    workingTitle: "fixture title",
    developedPremise: "fixture premise",
    dominantGenre: "fixture genre",
    mainConflict: "fixture conflict",
    protagonistArc: "fixture arc",
    newStakes: ["fixture stake"],
    charactersToIntroduce: ["fixture character"],
    endingNature: "fixture ending",
    mainRisks: ["fixture risk"],
    elementsKeptFromSource: ["fixture kept element"],
    elementsTransformed: ["fixture transformed element"],
    novelPotentialAssessment: "fixture assessment",
    origin: "PROPOSED",
    ...overrides,
  };
}

describe("creative direction schema", () => {
  let prisma: AuditedClient;
  let setActor: (id: string) => void;
  let sequence = 0;

  async function createProjectFixture() {
    sequence += 1;
    const user = await prisma.user.create({
      data: {
        email: `creative-direction-schema-${sequence}@example.test`,
        name: "Test User",
      },
    });
    setActor(user.id);
    const project = await prisma.project.create({
      data: { title: `creative-direction-schema-${sequence}`, userId: user.id },
    });

    return project.id;
  }

  beforeAll(() => {
    ({ prisma, setActor } = createAuditedClient());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // CAL-015's acceptance criterion: several directions coexist per project.
  it("holds several directions on one project, each with its own origin", async () => {
    const projectId = await createProjectFixture();

    await prisma.creativeDirection.createMany({
      data: [
        fixtureDirection({ projectId, workingTitle: "proposed", origin: "PROPOSED" }),
        fixtureDirection({ projectId, workingTitle: "edited", origin: "EDITED" }),
        fixtureDirection({ projectId, workingTitle: "user-written", origin: "USER_WRITTEN" }),
      ],
    });

    const stored = await prisma.creativeDirection.findMany({ where: { projectId } });

    expect(stored).toHaveLength(3);
    expect(stored.map((direction) => direction.origin).sort()).toEqual([
      "EDITED",
      "PROPOSED",
      "USER_WRITTEN",
    ]);
    expect(stored.every((direction) => direction.isCanonical === false)).toBe(true);
  });

  // CAL-015's other acceptance criterion, and the reason for the partial
  // unique index: at most one canonical direction per project, enforced by
  // the database rather than by application code.
  describe("canonical uniqueness", () => {
    it("accepts a single canonical direction", async () => {
      const projectId = await createProjectFixture();

      const direction = await prisma.creativeDirection.create({
        data: fixtureDirection({ projectId, isCanonical: true }),
      });

      expect(direction.isCanonical).toBe(true);
    });

    it("refuses a second canonical direction on the same project", async () => {
      const projectId = await createProjectFixture();
      await prisma.creativeDirection.create({
        data: fixtureDirection({ projectId, isCanonical: true }),
      });

      await expect(
        prisma.creativeDirection.create({
          data: fixtureDirection({ projectId, isCanonical: true }),
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    // Prisma's friendly P2002 message names the conflicting fields, not the raw
    // index — this is the same distinction analysis-schema.integration.test.ts
    // draws between a Prisma-declared @@unique and a hand-written constraint.
    // A raw insert against the driver surfaces Postgres's own error, which does
    // name the partial index this task added.
    it("refuses it even through raw SQL, naming the partial index", async () => {
      const projectId = await createProjectFixture();
      await prisma.creativeDirection.create({
        data: fixtureDirection({ projectId, isCanonical: true }),
      });

      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();

      try {
        await expect(
          client.query(
            `INSERT INTO "creative_directions"
               ("id", "projectId", "workingTitle", "developedPremise", "dominantGenre",
                "mainConflict", "protagonistArc", "newStakes", "charactersToIntroduce",
                "endingNature", "mainRisks", "elementsKeptFromSource", "elementsTransformed",
                "novelPotentialAssessment", "isCanonical", "origin", "updatedAt", "updatedById")
             VALUES
               ($1, $2, 'fixture title', 'fixture premise', 'fixture genre',
                'fixture conflict', 'fixture arc', '{}', '{}',
                'fixture ending', '{}', '{}', '{}',
                'fixture assessment', true, 'PROPOSED', now(),
                (SELECT "userId" FROM "projects" WHERE "id" = $2))`,
            ["raw-insert-fixture", projectId],
          ),
        ).rejects.toThrow(CANONICAL_PER_PROJECT_KEY);
      } finally {
        await client.end();
      }
    });

    it("allows any number of non-canonical directions alongside one canonical one", async () => {
      const projectId = await createProjectFixture();
      await prisma.creativeDirection.create({
        data: fixtureDirection({ projectId, isCanonical: true }),
      });

      await prisma.creativeDirection.createMany({
        data: [
          fixtureDirection({ projectId, isCanonical: false }),
          fixtureDirection({ projectId, isCanonical: false }),
        ],
      });

      expect(await prisma.creativeDirection.count({ where: { projectId } })).toBe(3);
    });

    it("lets a different direction become canonical once the first is demoted", async () => {
      const projectId = await createProjectFixture();
      const first = await prisma.creativeDirection.create({
        data: fixtureDirection({ projectId, isCanonical: true }),
      });
      const second = await prisma.creativeDirection.create({
        data: fixtureDirection({ projectId, isCanonical: false }),
      });

      await prisma.creativeDirection.update({
        where: { id: first.id },
        data: { isCanonical: false },
      });
      const promoted = await prisma.creativeDirection.update({
        where: { id: second.id },
        data: { isCanonical: true },
      });

      expect(promoted.isCanonical).toBe(true);
    });

    it("refuses promoting a second direction while the first stays canonical", async () => {
      const projectId = await createProjectFixture();
      await prisma.creativeDirection.create({
        data: fixtureDirection({ projectId, isCanonical: true }),
      });
      const second = await prisma.creativeDirection.create({
        data: fixtureDirection({ projectId, isCanonical: false }),
      });

      await expect(
        prisma.creativeDirection.update({
          where: { id: second.id },
          data: { isCanonical: true },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("allows the same canonical flag on directions from different projects", async () => {
      const firstProjectId = await createProjectFixture();
      const secondProjectId = await createProjectFixture();

      const first = await prisma.creativeDirection.create({
        data: fixtureDirection({ projectId: firstProjectId, isCanonical: true }),
      });
      const second = await prisma.creativeDirection.create({
        data: fixtureDirection({ projectId: secondProjectId, isCanonical: true }),
      });

      expect(first.isCanonical).toBe(true);
      expect(second.isCanonical).toBe(true);
    });
  });

  describe("deleting a project", () => {
    it("cascades away its creative directions", async () => {
      const projectId = await createProjectFixture();
      await prisma.creativeDirection.createMany({
        data: [
          fixtureDirection({ projectId, isCanonical: true }),
          fixtureDirection({ projectId, isCanonical: false }),
        ],
      });

      await prisma.project.delete({ where: { id: projectId } });

      expect(await prisma.creativeDirection.count({ where: { projectId } })).toBe(0);
    });
  });
});
