/**
 * `getPlanGenerationContext` (CAL-043), against a real PostgreSQL: it must
 * carry `GenerationContext`'s own fields (CAL-042) *and* the chapter
 * calibration derived from the project's chosen novel length — for a preset
 * and for a `CUSTOM` choice alike.
 *
 * Same shape as `generation-repository.integration.test.ts`: a
 * `createAuditedClient` for seeding, a separate bare `PrismaClient`
 * registered on the seam the repository layer itself reads through.
 */

import { getPlanGenerationContext } from "@calepin/outline";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { openProjectScope } from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

describe("getPlanGenerationContext (CAL-043)", () => {
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

  it("derives the STANDARD preset's midpoint into a chapter calibration, beside the language", async () => {
    const user = await prisma.user.create({
      data: { email: "plan-context-standard@example.test" },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: { userId: user.id, title: "Standard length", language: "en", targetLength: "STANDARD" },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    const context = await getPlanGenerationContext(opened.value);

    expect(context.ok).toBe(true);
    if (!context.ok) return;
    expect(context.value.language).toBe("en");
    // (50 000 + 80 000) / 2 = 65 000; 22 chapters of ~2 955 words.
    expect(context.value.chapterCalibration).toEqual({
      novelTargetWordCount: 65_000,
      chapterCount: 22,
      chapterTargetWordCount: 2_955,
    });
  });

  it("derives a CUSTOM word count into a chapter calibration", async () => {
    const user = await prisma.user.create({
      data: { email: "plan-context-custom@example.test" },
    });
    setActor(user.id);

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        title: "Custom length",
        targetLength: "CUSTOM",
        targetWordCount: 100_000,
      },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    const context = await getPlanGenerationContext(opened.value);

    expect(context.ok).toBe(true);
    if (!context.ok) return;
    // 100 000 / 3 000 ≈ 33 chapters of ~3 030 words.
    expect(context.value.chapterCalibration).toEqual({
      novelTargetWordCount: 100_000,
      chapterCount: 33,
      chapterTargetWordCount: 3_030,
    });
  });

  it("refuses a project that does not belong to the scope's owner", async () => {
    const owner = await prisma.user.create({
      data: { email: "plan-context-owner@example.test" },
    });
    setActor(owner.id);
    const project = await prisma.project.create({
      data: { userId: owner.id, title: "Owner's project" },
    });

    const intruder = await prisma.user.create({
      data: { email: "plan-context-intruder@example.test" },
    });

    const opened = await openProjectScope({ ownerId: intruder.id, projectId: project.id });

    expect(opened.ok).toBe(false);
  });
});
