/**
 * CAL-073's write: editing one section of the diagnostic, and annotating its
 * elements, against a real PostgreSQL.
 *
 * What is proved here is the promise the backlog makes — *l'origine de chaque
 * élément reste lisible après édition* — and it can only be proved against the
 * database, because the whole mechanism is that a lineage survives a table that
 * replaces its rows. Ownership is proved table by table in
 * `owner-access.integration.test.ts`; the pure rules that decide an origin are
 * proved in `packages/shared/src/provenance/provenance.test.ts`.
 *
 * The fixtures are a few words long and about nothing (§9).
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  addAnalysisAnnotation,
  ANALYSIS_ANNOTATION_CHAR_CEILING,
  type AnalysisElementSubmission,
  createProjectWithSourceText,
  deleteAnalysisAnnotation,
  editAnalysisSection,
  getAnalysis,
  openProjectScope,
  type ProjectScope,
  updateAnalysisAnnotation,
  updateSourceText,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

describe("editing and annotating the diagnostic (CAL-073)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({ data: { email: "analysis-editing@example.test" } });
    ownerId = owner.id;
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
   * A project with a generated `THEMES` section holding two elements — the
   * state every test below starts an edit from.
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

    await prisma.analysisSectionRevision.create({
      data: {
        analysisId: analysis.id,
        section: "THEMES",
        revisionNumber: 1,
        origin: "GENERATED",
        sourceTextVersionId: version.id,
        createdById: ownerId,
        elements: {
          create: [
            {
              position: 1,
              kind: "INTERPRETATION",
              origin: "GENERATED",
              label: "Premier",
              statement: "Premier énoncé.",
              evidence: null,
            },
            {
              position: 2,
              kind: "INTERPRETATION",
              origin: "GENERATED",
              label: "Second",
              statement: "Second énoncé.",
              evidence: null,
            },
          ],
        },
      },
    });

    return {
      scope: opened.value,
      projectId: project.id,
      analysisId: analysis.id,
      sourceTextVersionId: version.id,
    };
  }

  async function currentThemes(scope: ProjectScope) {
    const analysis = await getAnalysis(scope);
    const section = analysis?.sections.find((entry) => entry.section === "THEMES");

    if (section === undefined) throw new Error("the fixture lost its THEMES section");

    return section;
  }

  function submit(
    elements: readonly { lineageId: string | null; label: string; statement: string }[],
  ): readonly AnalysisElementSubmission[] {
    return elements.map((element) => ({
      lineageId: element.lineageId,
      kind: "INTERPRETATION" as const,
      label: element.label,
      statement: element.statement,
      evidence: null,
    }));
  }

  const edit = async (scope: ProjectScope, elements: readonly AnalysisElementSubmission[]) =>
    runWithActor(ownerId, async () => editAnalysisSection(scope, { section: "THEMES", elements }));

  describe("the origin of every element", () => {
    it("stays readable after an edit that touches one of them", async () => {
      const fixture = await seedAnalysed("origin-after-edit");
      const before = await currentThemes(fixture.scope);
      const [first, second] = before.elements;

      const saved = await edit(
        fixture.scope,
        submit([
          { lineageId: first?.lineageId ?? null, label: "Premier", statement: "Premier énoncé." },
          { lineageId: second?.lineageId ?? null, label: "Second", statement: "Réécrit." },
          { lineageId: null, label: "Troisième", statement: "Ajouté par l'auteur." },
        ]),
      );

      expect(saved.ok).toBe(true);

      const after = await currentThemes(fixture.scope);

      expect(after.revisionNumber).toBe(2);
      expect(after.origin).toBe("EDITED");
      expect(after.elements.map((element) => element.origin)).toEqual([
        "GENERATED",
        "EDITED",
        "USER_WRITTEN",
      ]);
      // The three states the backlog names, and the one they are read against.
      expect(after.elements.map((element) => element.provenance)).toEqual([
        "accepted",
        "edited",
        "user-written",
      ]);
      // The untouched element kept its identity; the new one was given one.
      expect(after.elements[0]?.lineageId).toBe(first?.lineageId);
      expect(after.elements[2]?.lineageId).not.toBe("");
    });

    it("survives a second edit that touches nothing it already carried", async () => {
      const fixture = await seedAnalysed("origin-across-two-edits");
      const before = await currentThemes(fixture.scope);
      const [first, second] = before.elements;

      await edit(
        fixture.scope,
        submit([
          { lineageId: first?.lineageId ?? null, label: "Premier", statement: "Premier énoncé." },
          { lineageId: second?.lineageId ?? null, label: "Second", statement: "Réécrit." },
        ]),
      );

      const middle = await currentThemes(fixture.scope);

      await edit(
        fixture.scope,
        submit([
          {
            lineageId: middle.elements[0]?.lineageId ?? null,
            label: "Premier",
            statement: "Premier énoncé.",
          },
          {
            lineageId: middle.elements[1]?.lineageId ?? null,
            label: "Second",
            statement: "Réécrit.",
          },
          { lineageId: null, label: "Troisième", statement: "Ajouté." },
        ]),
      );

      const after = await currentThemes(fixture.scope);

      expect(after.revisionNumber).toBe(3);
      // Still the model's, three revisions later — and still the author's for
      // the one they rewrote, rather than quietly re-attributed.
      expect(after.elements.map((element) => element.origin)).toEqual([
        "GENERATED",
        "EDITED",
        "USER_WRITTEN",
      ]);
    });

    it("never hands an element the author wrote back to the model", async () => {
      const fixture = await seedAnalysed("user-written-stays");
      const before = await currentThemes(fixture.scope);

      await edit(
        fixture.scope,
        submit([
          {
            lineageId: before.elements[0]?.lineageId ?? null,
            label: "Premier",
            statement: "Premier énoncé.",
          },
          { lineageId: null, label: "Mien", statement: "Écrit par moi." },
        ]),
      );

      const middle = await currentThemes(fixture.scope);
      const mine = middle.elements[1];

      await edit(
        fixture.scope,
        submit([
          {
            lineageId: middle.elements[0]?.lineageId ?? null,
            label: "Premier",
            statement: "Premier énoncé.",
          },
          { lineageId: mine?.lineageId ?? null, label: "Mien", statement: "Réécrit par moi." },
        ]),
      );

      const after = await currentThemes(fixture.scope);

      expect(after.elements[1]?.origin).toBe("USER_WRITTEN");
    });
  });

  describe("the append", () => {
    it("leaves the previous revision exactly as it was", async () => {
      const fixture = await seedAnalysed("append-only");
      const before = await currentThemes(fixture.scope);

      await edit(
        fixture.scope,
        submit([
          {
            lineageId: before.elements[0]?.lineageId ?? null,
            label: "Premier",
            statement: "Réécrit.",
          },
        ]),
      );

      const first = await prisma.analysisSectionRevision.findFirstOrThrow({
        where: { analysisId: fixture.analysisId, section: "THEMES", revisionNumber: 1 },
        include: { elements: { orderBy: { position: "asc" } } },
      });

      expect(first.origin).toBe("GENERATED");
      expect(first.elements).toHaveLength(2);
      expect(first.elements[0]?.statement).toBe("Premier énoncé.");
    });

    it("writes nothing when the form comes back untouched", async () => {
      const fixture = await seedAnalysed("unchanged-submit");
      const before = await currentThemes(fixture.scope);

      const saved = await edit(
        fixture.scope,
        submit(
          before.elements.map((element) => ({
            lineageId: element.lineageId,
            label: element.label ?? "",
            statement: element.statement,
          })),
        ),
      );

      expect(saved.ok).toBe(true);
      if (saved.ok) expect(saved.value.created).toBe(false);
      expect(
        await prisma.analysisSectionRevision.count({
          where: { analysisId: fixture.analysisId, section: "THEMES" },
        }),
      ).toBe(1);
    });

    it("touches no other section", async () => {
      const fixture = await seedAnalysed("one-section-only");

      await prisma.analysisSectionRevision.create({
        data: {
          analysisId: fixture.analysisId,
          section: "AMBIGUITIES",
          revisionNumber: 1,
          origin: "GENERATED",
          sourceTextVersionId: fixture.sourceTextVersionId,
          createdById: ownerId,
          elements: {
            create: {
              position: 1,
              kind: "INTERPRETATION",
              origin: "GENERATED",
              label: "Intacte",
              statement: "Intacte.",
            },
          },
        },
      });

      const before = await currentThemes(fixture.scope);
      await edit(
        fixture.scope,
        submit([
          {
            lineageId: before.elements[0]?.lineageId ?? null,
            label: "Premier",
            statement: "Réécrit.",
          },
        ]),
      );

      const analysis = await getAnalysis(fixture.scope);
      const ambiguities = analysis?.sections.find((entry) => entry.section === "AMBIGUITIES");

      expect(ambiguities?.revisionNumber).toBe(1);
      expect(ambiguities?.elements[0]?.origin).toBe("GENERATED");
      expect(ambiguities?.elements[0]?.provenance).toBe("proposed");
    });

    it("records the current source text version, not the one the model read", async () => {
      const fixture = await seedAnalysed("records-current-version");

      await runWithActor(ownerId, async () =>
        updateSourceText(fixture.scope, { content: "fixture, rewritten" }),
      );

      const newest = await prisma.sourceTextVersion.findFirstOrThrow({
        where: { sourceText: { projectId: fixture.projectId } },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      });

      const before = await currentThemes(fixture.scope);
      await edit(
        fixture.scope,
        submit([
          {
            lineageId: before.elements[0]?.lineageId ?? null,
            label: "Premier",
            statement: "Réécrit.",
          },
        ]),
      );

      const revision = await prisma.analysisSectionRevision.findFirstOrThrow({
        where: { analysisId: fixture.analysisId, section: "THEMES", revisionNumber: 2 },
        select: { sourceTextVersionId: true },
      });

      expect(revision.sourceTextVersionId).toBe(newest.id);
      expect(revision.sourceTextVersionId).not.toBe(fixture.sourceTextVersionId);
    });

    it("refuses to edit an analysis that has been validated", async () => {
      const fixture = await seedAnalysed("validated-is-locked");
      const before = await currentThemes(fixture.scope);

      await prisma.analysis.update({
        where: { id: fixture.analysisId },
        data: { validatedAt: new Date(), validatedById: ownerId },
      });

      const saved = await edit(
        fixture.scope,
        submit([
          {
            lineageId: before.elements[0]?.lineageId ?? null,
            label: "Premier",
            statement: "Réécrit.",
          },
        ]),
      );

      expect(saved.ok).toBe(false);
      if (!saved.ok) expect(saved.error.category).toBe("conflict");
    });

    it("refuses a project with no analysis at all", async () => {
      setActor(ownerId);

      const project = await runWithActor(ownerId, async () =>
        createProjectWithSourceText({
          ownerId,
          title: "no-analysis",
          sourceText: { content: "fixture" },
        }),
      );
      const opened = await openProjectScope({ ownerId, projectId: project.id });
      if (!opened.ok) throw new Error("the fixture could not open a scope");

      const saved = await edit(
        opened.value,
        submit([{ lineageId: null, label: "A", statement: "B." }]),
      );

      expect(saved.ok).toBe(false);
      if (!saved.ok) expect(saved.error.code).toBe("NOT_FOUND");
    });
  });

  describe("annotations", () => {
    it("stay attached to the element after its section is rewritten", async () => {
      const fixture = await seedAnalysed("notes-survive-an-edit");
      const before = await currentThemes(fixture.scope);
      const lineageId = before.elements[0]?.lineageId ?? "";

      const written = await runWithActor(ownerId, async () =>
        addAnalysisAnnotation(fixture.scope, { lineageId, body: "Ma note." }),
      );
      expect(written.ok).toBe(true);

      await edit(
        fixture.scope,
        submit([
          { lineageId, label: "Premier", statement: "Premier énoncé." },
          { lineageId: null, label: "Nouveau", statement: "Ajouté." },
        ]),
      );

      const after = await currentThemes(fixture.scope);

      expect(after.elements[0]?.annotations.map((note) => note.body)).toEqual(["Ma note."]);
      expect(after.elements[1]?.annotations).toEqual([]);
    });

    it("go with the element the author deleted", async () => {
      const fixture = await seedAnalysed("notes-follow-a-deletion");
      const before = await currentThemes(fixture.scope);
      const removed = before.elements[1]?.lineageId ?? "";

      await runWithActor(ownerId, async () =>
        addAnalysisAnnotation(fixture.scope, { lineageId: removed, body: "Note sur le second." }),
      );

      await edit(
        fixture.scope,
        submit([
          {
            lineageId: before.elements[0]?.lineageId ?? null,
            label: "Premier",
            statement: "Premier énoncé.",
          },
        ]),
      );

      const after = await currentThemes(fixture.scope);

      // The row is still there — it belongs to the revision it was written
      // against, which CAL-147 will show — but nothing in the current revision
      // carries its lineage, so the screen shows no orphan.
      expect(after.elements).toHaveLength(1);
      expect(after.elements[0]?.annotations).toEqual([]);
      expect(
        await prisma.analysisAnnotation.count({
          where: { analysisId: fixture.analysisId, lineageId: removed },
        }),
      ).toBe(1);
    });

    it("refuses a lineage that belongs to no element of this analysis", async () => {
      const fixture = await seedAnalysed("unknown-lineage");

      const written = await runWithActor(ownerId, async () =>
        addAnalysisAnnotation(fixture.scope, { lineageId: "lin_nothing", body: "Ma note." }),
      );

      expect(written.ok).toBe(false);
      if (!written.ok) expect(written.error.code).toBe("NOT_FOUND");
    });

    it("refuses an empty note and one past the ceiling", async () => {
      const fixture = await seedAnalysed("note-bounds");
      const lineageId = (await currentThemes(fixture.scope)).elements[0]?.lineageId ?? "";

      const empty = await runWithActor(ownerId, async () =>
        addAnalysisAnnotation(fixture.scope, { lineageId, body: "   " }),
      );
      const long = await runWithActor(ownerId, async () =>
        addAnalysisAnnotation(fixture.scope, {
          lineageId,
          body: "a".repeat(ANALYSIS_ANNOTATION_CHAR_CEILING + 1),
        }),
      );

      expect(empty.ok).toBe(false);
      expect(long.ok).toBe(false);
      if (!empty.ok) expect(empty.error.category).toBe("validation");
      if (!long.ok) expect(long.error.category).toBe("validation");
    });

    it("is rewritten and removed through the scope, and never without one", async () => {
      const fixture = await seedAnalysed("note-lifecycle");
      const lineageId = (await currentThemes(fixture.scope)).elements[0]?.lineageId ?? "";

      const written = await runWithActor(ownerId, async () =>
        addAnalysisAnnotation(fixture.scope, { lineageId, body: "Première version." }),
      );
      if (!written.ok) throw new Error("the fixture could not write its own note");

      const rewritten = await runWithActor(ownerId, async () =>
        updateAnalysisAnnotation(fixture.scope, {
          annotationId: written.value.annotationId,
          body: "Deuxième version.",
        }),
      );
      expect(rewritten.ok).toBe(true);
      expect((await currentThemes(fixture.scope)).elements[0]?.annotations[0]?.body).toBe(
        "Deuxième version.",
      );

      const removed = await runWithActor(ownerId, async () =>
        deleteAnalysisAnnotation(fixture.scope, written.value.annotationId),
      );
      expect(removed.ok).toBe(true);
      expect((await currentThemes(fixture.scope)).elements[0]?.annotations).toEqual([]);

      // Removing it twice is the same answer as removing something that was
      // never there: not found, never a silent success.
      const again = await runWithActor(ownerId, async () =>
        deleteAnalysisAnnotation(fixture.scope, written.value.annotationId),
      );
      expect(again.ok).toBe(false);
    });
  });
});
