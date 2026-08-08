import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CHECK_CONSTRAINT = /projects_custom_target_word_count_check/;

describe("project schema", () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const user = await prisma.user.create({
      data: { email: "project-schema@example.test", name: "Test User" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // The specification offers four target lengths, three of them presets and one
  // custom. The enum names the choice; only the custom choice carries a number.
  // Neither half of that rule is expressible in the Prisma schema, so both are
  // asserted against the running database.
  describe("custom target length", () => {
    it("stores the word count of a custom length", async () => {
      const project = await prisma.project.create({
        data: { title: "Custom", userId, targetLength: "CUSTOM", targetWordCount: 64_000 },
      });

      expect(project.targetWordCount).toBe(64_000);
    });

    it("leaves a preset length without a word count", async () => {
      const project = await prisma.project.create({
        data: { title: "Preset", userId, targetLength: "STANDARD" },
      });

      expect(project.targetWordCount).toBeNull();
    });

    it("rejects a custom length with no word count", async () => {
      await expect(
        prisma.project.create({
          data: { title: "Custom, no count", userId, targetLength: "CUSTOM" },
        }),
      ).rejects.toThrow(CHECK_CONSTRAINT);
    });

    it("rejects a custom length whose word count is not positive", async () => {
      await expect(
        prisma.project.create({
          data: { title: "Custom, zero", userId, targetLength: "CUSTOM", targetWordCount: 0 },
        }),
      ).rejects.toThrow(CHECK_CONSTRAINT);
    });

    it("rejects a preset length carrying a word count that could contradict it", async () => {
      await expect(
        prisma.project.create({
          data: { title: "Preset, count", userId, targetLength: "SHORT", targetWordCount: 100_000 },
        }),
      ).rejects.toThrow(CHECK_CONSTRAINT);
    });

    it("rejects a project updated into an inconsistent pair", async () => {
      const project = await prisma.project.create({
        data: { title: "Update", userId, targetLength: "CUSTOM", targetWordCount: 64_000 },
      });

      // Switching to a preset without clearing the count is the same
      // contradiction arriving through an update rather than an insert.
      await expect(
        prisma.project.update({ where: { id: project.id }, data: { targetLength: "LONG" } }),
      ).rejects.toThrow(CHECK_CONSTRAINT);
    });
  });

  // CAL-012's third acceptance criterion. The dashboard (CAL-065) lists one
  // user's projects, most recently modified first, and filters that list by
  // status; these are the two access paths that must not degrade to a scan.
  describe("dashboard listing indexes", () => {
    it("indexes projects by user and last modification, and by user and status", async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();

      try {
        const result = await client.query<{ indexdef: string }>(
          "SELECT indexdef FROM pg_indexes WHERE tablename = 'projects'",
        );
        // Postgres quotes an identifier only when it has to — "updatedAt" is
        // quoted, status is not — so the comparison is made on unquoted text.
        const columnLists = result.rows.map(
          (row) => /\(([^)]*)\)$/.exec(row.indexdef.replaceAll('"', ""))?.[1],
        );

        expect(columnLists).toContain("userId, updatedAt");
        expect(columnLists).toContain("userId, status");

        // An index on userId alone would be redundant with either composite:
        // a btree serves any lookup keyed on its leading column.
        expect(columnLists).not.toContain("userId");
      } finally {
        await client.end();
      }
    });
  });
});
