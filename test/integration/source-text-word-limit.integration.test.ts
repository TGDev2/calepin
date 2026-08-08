import { PrismaClient } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("source text word limit", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const connectionUri = container.getConnectionUri();

    // Use raw postgres client to set up schema.
    const pgClient = new Client({ connectionString: connectionUri });
    await pgClient.connect();

    const setupQueries = [
      `CREATE TYPE "project_status" AS ENUM ('DRAFT', 'ANALYSIS_IN_PROGRESS', 'DIRECTION_TO_CHOOSE', 'BIBLE_TO_VALIDATE', 'OUTLINE_IN_PROGRESS', 'WRITING_IN_PROGRESS', 'REVISION', 'COMPLETED', 'PUBLISHED', 'ARCHIVED')`,
      `CREATE TYPE "target_length" AS ENUM ('SHORT', 'STANDARD', 'LONG', 'CUSTOM')`,
      `CREATE TYPE "freedom_level" AS ENUM ('LOW', 'BALANCED', 'HIGH')`,
      `CREATE TABLE "users" (
        "id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "users_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE UNIQUE INDEX "users_email_key" ON "users"("email")`,
      `CREATE TABLE "projects" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "language" TEXT NOT NULL DEFAULT 'fr',
        "targetLength" "target_length" NOT NULL DEFAULT 'STANDARD',
        "targetAudience" TEXT NOT NULL DEFAULT 'Grand public',
        "freedomLevel" "freedom_level" NOT NULL DEFAULT 'BALANCED',
        "status" "project_status" NOT NULL DEFAULT 'DRAFT',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE INDEX "projects_userId_idx" ON "projects"("userId")`,
      `CREATE INDEX "projects_userId_status_idx" ON "projects"("userId", "status")`,
      `CREATE INDEX "projects_userId_updatedAt_idx" ON "projects"("userId", "updatedAt")`,
      `ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `CREATE TABLE "source_texts" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "source_texts_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE UNIQUE INDEX "source_texts_projectId_key" ON "source_texts"("projectId")`,
      `ALTER TABLE "source_texts" ADD CONSTRAINT "source_texts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `CREATE TABLE "source_text_versions" (
        "id" TEXT NOT NULL,
        "sourceTextId" TEXT NOT NULL,
        "versionNumber" INTEGER NOT NULL,
        "content" TEXT NOT NULL,
        "wordCount" INTEGER NOT NULL,
        "language" TEXT NOT NULL DEFAULT 'fr',
        "editedById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "source_text_versions_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "source_text_versions_word_count_check" CHECK ("wordCount" <= 2000)
      )`,
      `CREATE UNIQUE INDEX "source_text_versions_sourceTextId_versionNumber_key" ON "source_text_versions"("sourceTextId", "versionNumber")`,
      `ALTER TABLE "source_text_versions" ADD CONSTRAINT "source_text_versions_sourceTextId_fkey" FOREIGN KEY ("sourceTextId") REFERENCES "source_texts"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "source_text_versions" ADD CONSTRAINT "source_text_versions_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    ];

    for (const query of setupQueries) {
      await pgClient.query(query);
    }
    await pgClient.end();

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: connectionUri,
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  it("accepts a 2000-word source text version", async () => {
    const user = await prisma.user.create({
      data: {
        email: "test@example.com",
        name: "Test User",
      },
    });

    const project = await prisma.project.create({
      data: {
        title: "Test Project",
        userId: user.id,
      },
    });

    const sourceText = await prisma.sourceText.create({
      data: {
        projectId: project.id,
      },
    });

    const twoKContent = "word ".repeat(400); // 400 words

    const version = await prisma.sourceTextVersion.create({
      data: {
        sourceTextId: sourceText.id,
        versionNumber: 1,
        content: twoKContent,
        wordCount: 400,
        language: "fr",
        editedById: user.id,
      },
    });

    expect(version.wordCount).toBe(400);
  });

  it("rejects a 2001-word source text version via CHECK constraint", async () => {
    const user = await prisma.user.create({
      data: {
        email: "test2@example.com",
        name: "Test User 2",
      },
    });

    const project = await prisma.project.create({
      data: {
        title: "Test Project 2",
        userId: user.id,
      },
    });

    const sourceText = await prisma.sourceText.create({
      data: {
        projectId: project.id,
      },
    });

    await expect(
      prisma.sourceTextVersion.create({
        data: {
          sourceTextId: sourceText.id,
          versionNumber: 1,
          content: "word ",
          wordCount: 2001,
          language: "fr",
          editedById: user.id,
        },
      }),
    ).rejects.toThrow();
  });
});
