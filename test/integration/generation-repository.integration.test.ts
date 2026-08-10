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
import { fixtureGenerationKey } from "./generation-fixture";

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
        idempotencyKey: fixtureGenerationKey("generation-repository-analyze"),
        status: "QUEUED",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const newer = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "WRITE_SCENE",
        input: {},
        idempotencyKey: fixtureGenerationKey("generation-repository-write-scene"),
        status: "RUNNING",
        createdAt: new Date("2026-01-01T00:05:00.000Z"),
      },
    });
    await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "CHECK_COHERENCE",
        input: {},
        idempotencyKey: fixtureGenerationKey("generation-repository-check"),
        status: "SUCCEEDED",
        completedAt: new Date(),
      },
    });
    await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "FIX_ISSUE",
        input: {},
        idempotencyKey: fixtureGenerationKey("generation-repository-fix"),
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

  /**
   * CAL-065. Computed over the same oldest-first array this query already
   * returns: a `QUEUED` row's rank among the project's own queued
   * generations, and nothing for a `RUNNING` one — it already has a slot.
   */
  it("ranks the queued generations, oldest first, and gives a running one no position", async () => {
    const user = await prisma.user.create({
      data: { email: "generation-repository-queue-position@example.test" },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: { userId: user.id, title: "Queue position fixture" },
    });

    const first = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "ANALYZE_SOURCE_TEXT",
        input: {},
        idempotencyKey: fixtureGenerationKey("generation-repository-queue-position-1"),
        status: "QUEUED",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const second = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "EXTRACT_FACTS",
        input: {},
        idempotencyKey: fixtureGenerationKey("generation-repository-queue-position-2"),
        status: "QUEUED",
        createdAt: new Date("2026-01-01T00:01:00.000Z"),
      },
    });
    const running = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "WRITE_SCENE",
        input: {},
        idempotencyKey: fixtureGenerationKey("generation-repository-queue-position-running"),
        status: "RUNNING",
        createdAt: new Date("2026-01-01T00:02:00.000Z"),
      },
    });
    const third = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "CHECK_COHERENCE",
        input: {},
        idempotencyKey: fixtureGenerationKey("generation-repository-queue-position-3"),
        status: "QUEUED",
        createdAt: new Date("2026-01-01T00:03:00.000Z"),
      },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    const rows = await listRunningGenerations(opened.value);
    const byId = new Map(rows.map((row) => [row.id, row.queuePosition]));

    expect(byId.get(first.id)).toBe(1);
    expect(byId.get(second.id)).toBe(2);
    expect(byId.get(running.id)).toBeNull();
    expect(byId.get(third.id)).toBe(3);
  });

  it("carries the named step and percentage a mission last reported (CAL-062)", async () => {
    const user = await prisma.user.create({
      data: { email: "generation-repository-progress@example.test" },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: { userId: user.id, title: "Generation progress fixture" },
    });

    const withProgress = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "WRITE_SCENE",
        input: {},
        idempotencyKey: fixtureGenerationKey("generation-repository-progress-write-scene"),
        status: "RUNNING",
        progressStep: "Composition du contexte",
        progressPercent: 30,
      },
    });
    const withoutProgress = await prisma.generation.create({
      data: {
        projectId: project.id,
        mission: "EXTRACT_FACTS",
        input: {},
        idempotencyKey: fixtureGenerationKey("generation-repository-progress-extract-facts"),
        status: "QUEUED",
      },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    const running = await listRunningGenerations(opened.value);

    expect(running.find((row) => row.id === withProgress.id)).toMatchObject({
      progressStep: "Composition du contexte",
      progressPercent: 30,
    });
    expect(running.find((row) => row.id === withoutProgress.id)).toMatchObject({
      progressStep: null,
      progressPercent: null,
    });
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
