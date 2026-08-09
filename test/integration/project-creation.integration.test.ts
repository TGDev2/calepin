/**
 * CAL-040's own write, against a real PostgreSQL: `createProjectWithSourceText`
 * creates a `Project`, its `SourceText` and the first `SourceTextVersion`
 * together, or none of the three.
 *
 * CAL-041 moved the word count *into* this function. It used to be a caller's
 * claim — the over-limit case in this very suite used to prove the hole, by
 * passing `{ content: "irrelevant", wordCount: 2001 }` and watching the
 * database be the first thing to notice. Now the count is derived from the
 * content here, so the two cannot disagree, and the limit is refused before
 * the transaction opens rather than by `source_text_versions_word_count_check`
 * at the end of it. That `CHECK` still exists and is still proven, in
 * `source-text-word-limit.integration.test.ts`, which reaches the column
 * directly — it is the last line of defense, and this is now the first.
 *
 * Ownership isolation for this function is asserted in
 * `owner-access.integration.test.ts`, which pins it as one of the repository's
 * entry points; this suite is the function's own behaviour.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { createProjectWithSourceText } from "@calepin/shared/repository";
import {
  countWords,
  FRENCH_WORD_COUNT_CORPUS,
  FRENCH_WORD_COUNT_CORPUS_WORDS,
  SOURCE_TEXT_MAX_WORDS,
} from "@calepin/shared/text";
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
        sourceText: { content: "alpha beta gamma delta epsilon" },
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
        sourceText: { content: "one two three" },
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

  it("refuses a source text past the limit, and writes nothing on the way", async () => {
    const title = "project-creation-over-limit";
    const overLimit = Array.from({ length: SOURCE_TEXT_MAX_WORDS + 1 }, () => "mot").join(" ");

    await expect(
      runWithActor(ownerId, async () =>
        createProjectWithSourceText({ ownerId, title, sourceText: { content: overLimit } }),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      category: "validation",
      fieldPath: "sourceText",
      // The count reaches the visitor in French, and it names both numbers.
      userMessage: "Le texte source dépasse la limite de 2000 mots (actuellement 2001).",
    });

    // Not merely refused: no project was left behind on the way to refusing
    // it (CLAUDE.md §6 — never write partial data).
    expect(await seam.project.count({ where: { title } })).toBe(0);
  });

  it("accepts a source text at exactly the limit", async () => {
    const atLimit = Array.from({ length: SOURCE_TEXT_MAX_WORDS }, () => "mot").join(" ");

    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({
        ownerId,
        title: "project-creation-at-limit",
        sourceText: { content: atLimit },
      }),
    );

    const version = await seam.sourceTextVersion.findFirst({
      where: { sourceText: { projectId: project.id } },
    });
    expect(version?.wordCount).toBe(SOURCE_TEXT_MAX_WORDS);
  });

  it("derives the stored word count from the stored content, for real French typography", async () => {
    // The claim CAL-041 exists to make, at the persistence layer: recounting
    // the column's own content answers the number stored beside it. A caller
    // cannot state a count any more, so there is nothing left to disagree.
    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({
        ownerId,
        title: "project-creation-french-typography",
        // Submitted the way a browser submits a textarea: CRLF line endings
        // and decomposed accents, neither of which the counter ever saw.
        sourceText: { content: FRENCH_WORD_COUNT_CORPUS.replace(/\n/gu, "\r\n").normalize("NFD") },
      }),
    );

    const version = await seam.sourceTextVersion.findFirst({
      where: { sourceText: { projectId: project.id } },
    });

    expect(version?.wordCount).toBe(FRENCH_WORD_COUNT_CORPUS_WORDS);
    expect(countWords(version?.content ?? "")).toBe(version?.wordCount);
    // Normalized on the way in, so the row holds the string that was counted.
    expect(version?.content).toBe(FRENCH_WORD_COUNT_CORPUS);
  });
});
