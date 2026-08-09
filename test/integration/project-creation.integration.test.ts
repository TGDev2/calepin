/**
 * CAL-040's own write, against a real PostgreSQL: `createProjectWithSourceText`
 * creates a `Project`, its `SourceText` and the first `SourceTextVersion`
 * together, or none of the three.
 *
 * The atomicity half of that sentence is what this suite exists to prove.
 * `source_text_versions_word_count_check` (CAL-017/CAL-041) is a hand-written
 * `CHECK` Prisma cannot express, and the interface layer's own validation is
 * expected to refuse an over-limit text before this function is ever called —
 * so what matters here is that the constraint, if it ever fires anyway, takes
 * the whole transaction down with it rather than leaving an orphaned project.
 *
 * Ownership isolation for this function is asserted in
 * `owner-access.integration.test.ts`, which pins it as one of the repository's
 * entry points; this suite is the function's own behaviour.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { createProjectWithSourceText } from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("createProjectWithSourceText (CAL-040)", () => {
  const seam = new PrismaClient();
  let ownerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await seam.user.create({
      data: { email: "project-creation-owner@example.test" },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    resetDatabaseClient();
    await seam.$disconnect();
  });

  it("creates the project, its source text and the first version together, with the schema's defaults", async () => {
    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({
        ownerId,
        title: "project-creation-defaults",
        sourceText: { content: "alpha beta gamma delta epsilon", wordCount: 5 },
      }),
    );

    expect(project.userId).toBe(ownerId);
    expect(project.status).toBe("DRAFT");
    expect(project.language).toBe("fr");
    expect(project.targetLength).toBe("STANDARD");
    expect(project.targetWordCount).toBeNull();
    expect(project.targetAudience).toBe("Grand public");
    expect(project.freedomLevel).toBe("BALANCED");

    const sourceText = await seam.sourceText.findUnique({ where: { projectId: project.id } });
    expect(sourceText).not.toBeNull();

    const versions = await seam.sourceTextVersion.findMany({
      where: { sourceTextId: sourceText?.id },
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      versionNumber: 1,
      content: "alpha beta gamma delta epsilon",
      wordCount: 5,
      language: "fr",
      editedById: ownerId,
    });
  });

  it("stores a CUSTOM target length and mirrors the chosen language onto the source text version", async () => {
    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({
        ownerId,
        title: "project-creation-custom-length",
        language: "en",
        targetLength: "CUSTOM",
        targetWordCount: 120_000,
        sourceText: { content: "one two three", wordCount: 3 },
      }),
    );

    expect(project.language).toBe("en");
    expect(project.targetLength).toBe("CUSTOM");
    expect(project.targetWordCount).toBe(120_000);

    const sourceText = await seam.sourceText.findUnique({ where: { projectId: project.id } });
    const versions = await seam.sourceTextVersion.findMany({
      where: { sourceTextId: sourceText?.id },
    });
    expect(versions[0]?.language).toBe("en");
  });

  it("rolls back the whole transaction when the source text exceeds the 2000-word check", async () => {
    const title = "project-creation-over-limit";

    await expect(
      runWithActor(ownerId, async () =>
        createProjectWithSourceText({
          ownerId,
          title,
          // The content itself is irrelevant to the CHECK — it validates the
          // stored column, not a recount — so a short string with a false
          // word count is enough to hit it deliberately.
          sourceText: { content: "irrelevant", wordCount: 2001 },
        }),
      ),
    ).rejects.toThrow(/source_text_versions_word_count_check/);

    // Not merely refused: no project was left behind on the way to refusing
    // it (CLAUDE.md §6 — never write partial data).
    expect(await seam.project.count({ where: { title } })).toBe(0);
  });
});
