/**
 * CAL-077 — regenerating one section of the diagnostic, against a real
 * PostgreSQL.
 *
 * The backlog's acceptance criterion is an *absence*: regenerating a section
 * must change nothing but that section. An absence cannot be proved by
 * asserting the two or three things a reviewer happened to think of, so this
 * suite asserts it the only way that means anything — it photographs every row
 * of every analysis table before the write and compares the whole photograph
 * afterwards, so a column nobody anticipated moving fails here too.
 *
 * The pure contract around the write — what the mission is asked, what it may
 * answer, and CAL-071's evidence rule at section granularity — is proved in
 * `packages/analysis/src/section-regeneration.test.ts`.
 *
 * The fixtures are a few words long and about nothing (§9).
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  addAnalysisAnnotation,
  createProjectWithSourceText,
  editAnalysisSection,
  getAnalysis,
  openProjectScope,
  type ProjectScope,
  refreshProjectStatus,
  regenerateAnalysisSection,
  type RegeneratedAnalysisElement,
  updateSourceText,
  validateAnalysis,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

describe("regenerating one section of the diagnostic (CAL-077)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;
  let intruderId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({
      data: { email: "analysis-regeneration@example.test" },
    });
    ownerId = owner.id;
    setActor(ownerId);

    const intruder = await prisma.user.create({
      data: { email: "analysis-regeneration-intruder@example.test" },
    });
    intruderId = intruder.id;
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
    readonly analysisId: string;
    readonly sourceTextVersionId: string;
  }

  /**
   * A project whose diagnostic already holds three sections — the state an
   * author is in when they decide one of them is not good enough.
   *
   * Three rather than one, because the criterion is about the sections that
   * are *not* regenerated: a fixture with a single section could not tell a
   * statement scoped to one section from a statement scoped to the analysis.
   */
  async function seedAnalysed(label: string): Promise<Fixture> {
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

    const analysis = await prisma.analysis.create({ data: { projectId: project.id } });

    const sections = [
      { section: "THEMES" as const, labels: ["Premier", "Second"] },
      { section: "CHARACTERS" as const, labels: ["Une figure"] },
      { section: "PREMISE" as const, labels: [null] },
    ];

    for (const { section, labels } of sections) {
      await prisma.analysisSectionRevision.create({
        data: {
          analysisId: analysis.id,
          section,
          revisionNumber: 1,
          origin: "GENERATED",
          sourceTextVersionId: version.id,
          createdById: ownerId,
          elements: {
            create: labels.map((label, index) => ({
              position: index + 1,
              kind: "INTERPRETATION" as const,
              origin: "GENERATED" as const,
              label,
              statement: `Énoncé ${index + 1}.`,
              evidence: null,
            })),
          },
        },
      });
    }

    return {
      scope: opened.value,
      projectId: project.id,
      analysisId: analysis.id,
      sourceTextVersionId: version.id,
    };
  }

  /** Every lineage of one section, in position order. */
  async function lineagesOf(
    analysisId: string,
    section: "THEMES" | "CHARACTERS",
  ): Promise<readonly string[]> {
    const revision = await prisma.analysisSectionRevision.findFirstOrThrow({
      where: { analysisId, section },
      orderBy: { revisionNumber: "desc" },
      select: { elements: { orderBy: { position: "asc" }, select: { lineageId: true } } },
    });

    return revision.elements.map((element) => element.lineageId);
  }

  /**
   * Every row of every analysis table, as text.
   *
   * Serialised rather than compared object by object so one `toEqual` covers
   * columns this suite does not know about: a column added later is in the
   * photograph the day it exists, which is the only way an assertion about
   * *nothing else changed* keeps meaning that.
   */
  async function photograph(analysisId: string): Promise<string> {
    const [revisions, annotations, analysis] = await Promise.all([
      prisma.analysisSectionRevision.findMany({
        where: { analysisId },
        orderBy: [{ section: "asc" }, { revisionNumber: "asc" }],
        include: { elements: { orderBy: { position: "asc" } } },
      }),
      prisma.analysisAnnotation.findMany({ where: { analysisId }, orderBy: { id: "asc" } }),
      prisma.analysis.findUniqueOrThrow({ where: { id: analysisId } }),
    ]);

    return JSON.stringify({ revisions, annotations, analysis });
  }

  const answer: readonly RegeneratedAnalysisElement[] = [
    { kind: "INTERPRETATION", label: "Reprise", statement: "Un énoncé repris.", evidence: null },
  ];

  const regenerate = (
    scope: ProjectScope,
    section: "THEMES" | "CHARACTERS" | "PREMISE",
    elements: readonly RegeneratedAnalysisElement[] = answer,
    generationId: string | null = null,
  ) =>
    runWithActor(ownerId, async () =>
      regenerateAnalysisSection(scope, { section, elements, generationId }),
    );

  describe("the absence of side effects", () => {
    it("leaves every other table row exactly as it was", async () => {
      const fixture = await seedAnalysed("regeneration-no-side-effect");

      // Two notes, on two different sections: one on the section about to be
      // regenerated, one on a section that is not.
      const [themeLineage] = await lineagesOf(fixture.analysisId, "THEMES");
      const [characterLineage] = await lineagesOf(fixture.analysisId, "CHARACTERS");

      await runWithActor(ownerId, async () =>
        addAnalysisAnnotation(fixture.scope, {
          lineageId: themeLineage ?? "",
          body: "Note sur un thème.",
        }),
      );
      await runWithActor(ownerId, async () =>
        addAnalysisAnnotation(fixture.scope, {
          lineageId: characterLineage ?? "",
          body: "Note sur un personnage.",
        }),
      );

      // A second revision of THEMES, so the suite also proves that an earlier
      // revision of the *regenerated* section survives its own regeneration.
      const edited = await runWithActor(ownerId, async () =>
        editAnalysisSection(fixture.scope, {
          section: "THEMES",
          elements: [
            {
              lineageId: themeLineage ?? null,
              kind: "INTERPRETATION",
              label: "Premier",
              statement: "Premier énoncé, revu.",
              evidence: null,
            },
          ],
        }),
      );
      expect(edited.ok).toBe(true);

      const before = await photograph(fixture.analysisId);

      const done = await regenerate(fixture.scope, "THEMES");

      expect(done.ok).toBe(true);
      if (!done.ok) return;
      expect(done.value.revisionNumber).toBe(3);

      const after = JSON.parse(await photograph(fixture.analysisId)) as {
        revisions: { section: string; revisionNumber: number }[];
        annotations: unknown[];
        analysis: { updatedAt: string; version: number; validatedAt: string | null };
      };
      const parsedBefore = JSON.parse(before) as typeof after;

      // 1. The only rows added are the new revision and its elements: every
      //    revision that existed is byte-identical, elements included.
      const untouched = after.revisions.filter(
        (revision) => !(revision.section === "THEMES" && revision.revisionNumber === 3),
      );
      expect(JSON.stringify(untouched)).toBe(JSON.stringify(parsedBefore.revisions));

      // 2. Not one annotation row moved — not its body, not its `updatedAt`,
      //    not its optimistic-concurrency counter.
      expect(JSON.stringify(after.annotations)).toBe(JSON.stringify(parsedBefore.annotations));

      // 3. The `Analysis` row moved, and only through its audit block. That is
      //    the one deliberate write outside the section: the analysis as a
      //    whole did move, and the row is where CAL-022 records it.
      expect(after.analysis.version).toBe(parsedBefore.analysis.version + 1);
      expect(after.analysis.validatedAt).toBeNull();
      expect({ ...after.analysis, updatedAt: null, version: null }).toEqual({
        ...parsedBefore.analysis,
        updatedAt: null,
        version: null,
      });
    });

    it("touches no section but the one it was asked for", async () => {
      const fixture = await seedAnalysed("regeneration-one-section");

      const done = await regenerate(fixture.scope, "THEMES");
      expect(done.ok).toBe(true);

      const analysis = await getAnalysis(fixture.scope);
      const bySection = new Map(
        (analysis?.sections ?? []).map((section) => [section.section, section]),
      );

      expect(bySection.get("THEMES")?.revisionNumber).toBe(2);
      expect(bySection.get("CHARACTERS")?.revisionNumber).toBe(1);
      expect(bySection.get("PREMISE")?.revisionNumber).toBe(1);
      expect(bySection.get("CHARACTERS")?.elements).toHaveLength(1);
    });

    it("keeps the notes it orphaned, and says how many it orphaned", async () => {
      const fixture = await seedAnalysed("regeneration-orphaned-notes");
      const [themeLineage] = await lineagesOf(fixture.analysisId, "THEMES");

      await runWithActor(ownerId, async () =>
        addAnalysisAnnotation(fixture.scope, {
          lineageId: themeLineage ?? "",
          body: "Note sur un thème.",
        }),
      );

      const done = await regenerate(fixture.scope, "THEMES");

      expect(done.ok).toBe(true);
      if (!done.ok) return;
      expect(done.value.orphanedAnnotationCount).toBe(1);

      // The row is still there, on the lineage it always named — it is only no
      // longer shown, because the element it is about is no longer current.
      expect(
        await prisma.analysisAnnotation.count({ where: { analysisId: fixture.analysisId } }),
      ).toBe(1);

      const analysis = await getAnalysis(fixture.scope);
      const themes = analysis?.sections.find((section) => section.section === "THEMES");
      expect(themes?.elements.flatMap((element) => element.annotations)).toEqual([]);
    });
  });

  describe("the append", () => {
    it("creates a version rather than overwriting one", async () => {
      const fixture = await seedAnalysed("regeneration-appends");

      const done = await regenerate(fixture.scope, "THEMES");
      expect(done.ok).toBe(true);

      const revisions = await prisma.analysisSectionRevision.findMany({
        where: { analysisId: fixture.analysisId, section: "THEMES" },
        orderBy: { revisionNumber: "asc" },
        select: { revisionNumber: true, origin: true, elements: { select: { id: true } } },
      });

      expect(revisions.map((revision) => revision.revisionNumber)).toEqual([1, 2]);
      expect(revisions[0]?.elements).toHaveLength(2);
      expect(revisions[1]?.origin).toBe("GENERATED");
    });

    it("appends even when the answer repeats what was already there", async () => {
      const fixture = await seedAnalysed("regeneration-identical-answer");
      const identical: readonly RegeneratedAnalysisElement[] = [
        { kind: "INTERPRETATION", label: "Premier", statement: "Énoncé 1.", evidence: null },
        { kind: "INTERPRETATION", label: "Second", statement: "Énoncé 2.", evidence: null },
      ];

      const done = await regenerate(fixture.scope, "THEMES", identical);

      // Unlike an edit, which writes nothing when the form comes back
      // untouched: an answer that happens to match is still an answer somebody
      // paid for, and the revision is what links its generation to it.
      expect(done.ok).toBe(true);
      if (done.ok) expect(done.value.revisionNumber).toBe(2);
    });

    it("marks every element GENERATED and mints a new lineage for each", async () => {
      const fixture = await seedAnalysed("regeneration-fresh-lineages");
      const before = await lineagesOf(fixture.analysisId, "THEMES");

      await regenerate(fixture.scope, "THEMES");

      const after = await lineagesOf(fixture.analysisId, "THEMES");
      expect(after.some((lineage) => before.includes(lineage))).toBe(false);

      const themes = (await getAnalysis(fixture.scope))?.sections.find(
        (section) => section.section === "THEMES",
      );
      expect(themes?.elements.map((element) => element.origin)).toEqual(["GENERATED"]);
      expect(themes?.elements.map((element) => element.provenance)).toEqual(["proposed"]);
    });

    it("records the current source text version, not the one the replaced revision read", async () => {
      const fixture = await seedAnalysed("regeneration-source-version");

      await runWithActor(ownerId, async () =>
        updateSourceText(fixture.scope, { content: "fixture, deuxième version" }),
      );

      const done = await regenerate(fixture.scope, "THEMES");
      expect(done.ok).toBe(true);

      const revision = await prisma.analysisSectionRevision.findFirstOrThrow({
        where: { analysisId: fixture.analysisId, section: "THEMES", revisionNumber: 2 },
        select: { sourceTextVersionId: true },
      });

      expect(revision.sourceTextVersionId).not.toBe(fixture.sourceTextVersionId);
    });

    it("links the revision to the generation that produced it", async () => {
      const fixture = await seedAnalysed("regeneration-generation-link");
      const generation = await prisma.generation.create({
        data: {
          projectId: fixture.projectId,
          mission: "REGENERATE_ANALYSIS_SECTION",
          status: "RUNNING",
          idempotencyKey: "a".repeat(64),
          input: {},
        },
        select: { id: true },
      });

      const done = await regenerate(fixture.scope, "THEMES", answer, generation.id);
      expect(done.ok).toBe(true);

      const revision = await prisma.analysisSectionRevision.findFirstOrThrow({
        where: { analysisId: fixture.analysisId, section: "THEMES", revisionNumber: 2 },
        select: { generationId: true },
      });

      expect(revision.generationId).toBe(generation.id);
    });
  });

  describe("what it refuses", () => {
    it("refuses a validated analysis, and writes nothing", async () => {
      const fixture = await seedAnalysed("regeneration-validated");
      // `createProjectWithSourceText` does not push the stored status forward
      // by itself — the convention `analysis-editing` already follows.
      expect((await refreshProjectStatus(fixture.scope)).ok).toBe(true);

      const validated = await runWithActor(ownerId, async () => validateAnalysis(fixture.scope));
      expect(validated.ok).toBe(true);

      const before = await photograph(fixture.analysisId);
      const done = await regenerate(fixture.scope, "THEMES");

      expect(done.ok).toBe(false);
      if (!done.ok) expect(done.error.category).toBe("conflict");
      expect(await photograph(fixture.analysisId)).toBe(before);
    });

    it("refuses a project that holds no analysis", async () => {
      setActor(ownerId);
      const project = await runWithActor(ownerId, async () =>
        createProjectWithSourceText({
          ownerId,
          title: "regeneration-no-analysis",
          sourceText: { content: "fixture" },
        }),
      );
      const opened = await openProjectScope({ ownerId, projectId: project.id });
      if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

      const done = await regenerate(opened.value, "THEMES");

      expect(done.ok).toBe(false);
      if (!done.ok) expect(done.error.code).toBe("NOT_FOUND");
    });

    it("refuses an answer with no element at all", async () => {
      const fixture = await seedAnalysed("regeneration-empty-answer");
      const before = await photograph(fixture.analysisId);

      const done = await regenerate(fixture.scope, "THEMES", []);

      expect(done.ok).toBe(false);
      if (!done.ok) expect(done.error.category).toBe("validation");
      expect(await photograph(fixture.analysisId)).toBe(before);
    });

    it("refuses a generation that belongs to another project", async () => {
      const mine = await seedAnalysed("regeneration-foreign-generation-mine");
      const theirs = await seedAnalysed("regeneration-foreign-generation-theirs");

      const foreign = await prisma.generation.create({
        data: {
          projectId: theirs.projectId,
          mission: "REGENERATE_ANALYSIS_SECTION",
          status: "RUNNING",
          idempotencyKey: "b".repeat(64),
          input: {},
        },
        select: { id: true },
      });

      const before = await photograph(mine.analysisId);
      const done = await regenerate(mine.scope, "THEMES", answer, foreign.id);

      expect(done.ok).toBe(false);
      if (!done.ok) expect(done.error.code).toBe("NOT_FOUND");
      expect(await photograph(mine.analysisId)).toBe(before);
    });

    it("reaches nothing through a scope naming somebody else's project", async () => {
      const fixture = await seedAnalysed("regeneration-forged-scope");
      const before = await photograph(fixture.analysisId);

      // The brand is a registry symbol, so it can be forged; what refuses the
      // write is that every statement names the owner as well as the project
      // (§3.5), which is what this asserts rather than assumes.
      const forged = {
        [Symbol.for("calepin.ProjectScope")]: true,
        projectId: fixture.projectId,
        ownerId: intruderId,
      } as unknown as ProjectScope;

      const done = await runWithActor(intruderId, async () =>
        regenerateAnalysisSection(forged, {
          section: "THEMES",
          elements: answer,
          generationId: null,
        }),
      );

      expect(done.ok).toBe(false);
      if (!done.ok) expect(done.error.code).toBe("NOT_FOUND");
      expect(await photograph(fixture.analysisId)).toBe(before);
    });
  });
});
