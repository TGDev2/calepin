import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The database is the one `global-setup.ts` started and migrated, so this suite
// exercises the committed schema instead of a copy of it maintained by hand.
describe("source text word limit", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createProject(email: string) {
    const user = await prisma.user.create({ data: { email, name: "Test User" } });
    const project = await prisma.project.create({
      data: { title: "Test Project", userId: user.id },
    });
    const sourceText = await prisma.sourceText.create({ data: { projectId: project.id } });

    return { userId: user.id, sourceTextId: sourceText.id };
  }

  it("accepts a version at the 2000-word limit", async () => {
    const { userId, sourceTextId } = await createProject("word-limit-accept@example.test");

    const version = await prisma.sourceTextVersion.create({
      data: {
        sourceTextId,
        versionNumber: 1,
        content: "mot ".repeat(2000),
        wordCount: 2000,
        language: "fr",
        editedById: userId,
      },
    });

    expect(version.wordCount).toBe(2000);
  });

  it("rejects a version above the limit through the database constraint", async () => {
    const { userId, sourceTextId } = await createProject("word-limit-reject@example.test");

    await expect(
      prisma.sourceTextVersion.create({
        data: {
          sourceTextId,
          versionNumber: 1,
          content: "mot ",
          wordCount: 2001,
          language: "fr",
          editedById: userId,
        },
      }),
    ).rejects.toThrow(/source_text_versions_word_count_check/);
  });
});
