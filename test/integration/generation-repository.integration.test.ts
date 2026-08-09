/**
 * `listRunningGenerations` (CAL-039), against a real PostgreSQL: only the
 * generations still in flight come back, oldest first, and nothing else
 * about the row — never `input`, which may carry the mission's resolved
 * payload and counts as literary content under §9.
 *
 * Same shape as `project-dashboard.integration.test.ts`: a `createAuditedClient`
 * for seeding, a separate bare `PrismaClient` registered on the seam — the one
 * the repository function itself reads through.
 */

import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { listRunningGenerations, openProjectScope } from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

describe("listRunningGenerations (CAL-039)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  beforeAll(() => {
    configureDatabaseClient(seam);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  it("returns only the queued and running generations, oldest first, and never the input payload", async () => {
    const user = await prisma.user.create({
      data: { email: "generation-repository-owner@example.test" },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: { userId: user.id, title: "Generation repository fixture" },
    });

    const older = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "ANALYZE_SOURCE_TEXT",
        input: {},
        status: "QUEUED",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const newer = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "WRITE_SCENE",
        input: {},
        status: "RUNNING",
        createdAt: new Date("2026-01-01T00:05:00.000Z"),
      },
    });
    await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "CHECK_COHERENCE",
        input: {},
        status: "SUCCEEDED",
        completedAt: new Date(),
      },
    });
    await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "FIX_ISSUE",
        input: {},
        status: "FAILED",
        completedAt: new Date(),
      },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    const running = await listRunningGenerations(opened.value);

    expect(running.map((row) => row.id)).toEqual([older.id, newer.id]);
    expect(running.map((row) => row.mission)).toEqual(["ANALYZE_SOURCE_TEXT", "WRITE_SCENE"]);
    expect(running.map((row) => row.status)).toEqual(["QUEUED", "RUNNING"]);
    for (const row of running) expect(row).not.toHaveProperty("input");
  });

  it("returns nothing for a project with no generation in flight", async () => {
    const user = await prisma.user.create({
      data: { email: "generation-repository-idle@example.test" },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: { userId: user.id, title: "Idle project" },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    expect(await listRunningGenerations(opened.value)).toEqual([]);
  });
});
