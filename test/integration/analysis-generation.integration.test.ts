/**
 * CAL-209's acceptance criterion, against a real PostgreSQL and a real Redis:
 * **running `analyze-source-text` on a source text produces an analysis the
 * diagnostic screen can show, with its seventeen sections and its
 * fact/interpretation markers.**
 *
 * The oracle is `getAnalysis(scope)` and nothing else, because that is the one
 * function the screen calls: `apps/web/src/app/projects/[projectId]/analysis`
 * reads it, then maps `ANALYSIS_SECTIONS` and renders each section's elements
 * with their `ElementKindBadge`. Asserting the rows instead would let a refactor
 * keep this file green while the screen went blank; asserting the snapshot is
 * asserting what the page is handed. That the page renders such a snapshot is
 * `narrative-diagnostic.spec.ts`'s half, in a browser.
 *
 * Nothing in the chain is stubbed except the network, as in
 * `generation-pipeline.integration.test.ts`: the generation is reserved, handed
 * to a real BullMQ worker, claimed under the row's own lock, produced by the
 * **real** executor over the **real** `@calepin/ai` pipeline, and written by the
 * transaction that completes the attempt.
 *
 * Every fixture value is technical (§9): identifiers, counts and a source text
 * made of `mot-src-*` tokens no reader could mistake for a novel.
 */

import {
  createAnthropicAdapter,
  createModelProviderPort,
  MISSION_REGISTRY,
  type ModelProviderPort,
} from "@calepin/ai";
import { answer, type SimulatedClient, simulatedClient, text } from "@calepin/ai/testing";
import {
  ANALYSIS_SECTIONS,
  type AnalysisSection,
  type ResolvedAnalysisSection,
} from "@calepin/analysis";
import {
  analyzeSourceTextAsk,
  createAnalyzeSourceTextExecutor,
} from "@calepin/analysis/generation";
import { runWithActor } from "@calepin/shared/audit";
import {
  configureDatabaseClient,
  type DatabaseClient,
  resetDatabaseClient,
} from "@calepin/shared/database";
import { createLogger } from "@calepin/shared/logging";
import {
  closeProducers,
  configureQueueConnection,
  createQueueConnection,
  defineJob,
  enqueueGeneration,
  GENERATION_SLOW_JOB,
  type GenerationExecutors,
  getQueue,
  resetQueueConnection,
  runGenerationJob,
  startQueueWorker,
} from "@calepin/shared/queue";
import {
  type AnalysisSnapshot,
  getAnalysis,
  openProjectScope,
  type ProjectScope,
  reserveGeneration,
  writeGeneratedAnalysisWithin,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import type { Worker } from "bullmq";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const ROUTED_MODEL = MISSION_REGISTRY["analyze-source-text"].model;
const REPORTED_USAGE = { input_tokens: 1_234, output_tokens: 567 } as const;

const silent = createLogger({ level: "silent" });

type QueueConnection = ReturnType<typeof createQueueConnection>;

/** `words` synthetic tokens. No prose reaches this repository (§8, §9). */
function filler(label: string, words: number): string {
  return Array.from({ length: words }, (_, i) => `mot-${label}-${i}`).join(" ");
}

const SOURCE_TEXT = filler("src", 120);

/** A run of the fixture that really is a passage of it. */
const REAL_QUOTATION = "mot-src-4 mot-src-5 mot-src-6";

/** A run that is not, so the correction is walked rather than described. */
const INVENTED_QUOTATION = "mot-inventé-1 mot-inventé-2";

/**
 * The six sections that hold one element and no heading, and the four that may
 * legitimately hold none — read off the same contract the answer below honours,
 * so a section moving between the two groups fails here rather than passing.
 */
const PARAGRAPH_SECTIONS: readonly AnalysisSection[] = [
  "FACTUAL_SUMMARY",
  "PREMISE",
  "MAIN_CONFLICT",
  "NARRATIVE_PROMISE",
  "TONE",
  "DEVELOPMENT_POTENTIAL",
];

const EMPTY_SECTIONS: readonly AnalysisSection[] = [
  "RELATIONSHIPS",
  "AMBIGUITIES",
  "OPEN_QUESTIONS",
  "CLICHE_RISKS",
];

function listed(label: string, kind: "FACTUAL" | "INTERPRETATION", evidence: string | null) {
  return { kind, label, statement: filler(label, 6), evidence };
}

/** A seventeen-section diagnostic at each section's declared minimum. */
function analysisAnswer(evidence: string | null = REAL_QUOTATION) {
  return {
    factualSummary: { kind: "FACTUAL", statement: filler("sum", 12), evidence },
    premise: { kind: "FACTUAL", statement: filler("pre", 8), evidence: null },
    mainConflict: { kind: "INTERPRETATION", statement: filler("con", 8), evidence: null },
    narrativePromise: { kind: "INTERPRETATION", statement: filler("pro", 8), evidence: null },
    themes: [listed("theme", "INTERPRETATION", null)],
    characters: [listed("personnage", "FACTUAL", evidence)],
    relationships: [],
    pointOfView: [listed("pdv", "FACTUAL", null)],
    tense: [listed("temps", "FACTUAL", null)],
    tone: { kind: "INTERPRETATION", statement: filler("ton", 8), evidence: null },
    singularElements: [listed("singulier", "INTERPRETATION", null)],
    ambiguities: [],
    openQuestions: [],
    elementsToPreserve: [listed("preserver", "INTERPRETATION", null)],
    weaknesses: [listed("fragilite", "INTERPRETATION", null)],
    clicheRisks: [],
    developmentPotential: {
      kind: "INTERPRETATION",
      statement: filler("pot", 12),
      evidence: null,
    },
  };
}

/** The seventeen groups a resolver would hand the writer, built by hand. */
function resolvedSections(): readonly ResolvedAnalysisSection[] {
  return ANALYSIS_SECTIONS.map((section) => ({
    section,
    elements: EMPTY_SECTIONS.includes(section)
      ? []
      : [
          {
            kind: "INTERPRETATION" as const,
            label: PARAGRAPH_SECTIONS.includes(section) ? null : `étiquette-${section}`,
            statement: filler(section, 5),
            evidence: null,
          },
        ],
  }));
}

function simulatedProvider(payload: unknown): {
  port: ModelProviderPort;
  provider: SimulatedClient;
} {
  const provider = simulatedClient([
    answer({
      content: [text(JSON.stringify(payload))],
      usage: REPORTED_USAGE,
      model: ROUTED_MODEL,
    }),
  ]);

  return {
    port: createModelProviderPort({
      adapters: [createAnthropicAdapter({ client: provider.client })],
      log: silent,
    }),
    provider,
  };
}

const { prisma, setActor } = createAuditedClient();
const seam = new PrismaClient();
const started: Worker[] = [];

let database: DatabaseClient;
let producer: QueueConnection;
let consumer: QueueConnection;
let intruderId: string;
let sequence = 0;

interface Fixture {
  readonly ownerId: string;
  readonly projectId: string;
  readonly scope: ProjectScope;
  readonly sourceTextId: string;
  readonly sourceTextVersionId: string;
}

/**
 * Its own project per test, seeded stepwise rather than from
 * `createProjectGraph`: that graph already holds an `Analysis` with a
 * `FACTUAL_SUMMARY` revision and an annotation, so every assertion here about a
 * first analysis would be an assertion about the fixture.
 */
async function createFixture(): Promise<Fixture> {
  sequence += 1;
  const label = `analysis-generation-${sequence}`;

  const user = await prisma.user.create({ data: { email: `${label}@example.test` } });
  setActor(user.id);

  const project = await prisma.project.create({
    data: { userId: user.id, title: label, language: "français", targetAudience: "Grand public" },
  });
  const sourceText = await prisma.sourceText.create({ data: { projectId: project.id } });
  const version = await prisma.sourceTextVersion.create({
    data: {
      sourceTextId: sourceText.id,
      versionNumber: 1,
      content: SOURCE_TEXT,
      wordCount: 120,
      editedById: user.id,
    },
  });

  const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
  if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

  return {
    ownerId: user.id,
    projectId: project.id,
    scope: opened.value,
    sourceTextId: sourceText.id,
    sourceTextVersionId: version.id,
  };
}

async function reserve(fixture: Fixture, sourceTextVersionId: string): Promise<string> {
  const reserved = await runWithActor(fixture.ownerId, async () =>
    reserveGeneration(fixture.scope, {
      mission: "ANALYZE_SOURCE_TEXT",
      targetId: null,
      input: analyzeSourceTextAsk(sourceTextVersionId),
    }),
  );

  if (!reserved.ok) throw new Error("a reservation was refused");

  return reserved.value.id;
}

function executorsFor(port: ModelProviderPort): GenerationExecutors {
  return { ANALYZE_SOURCE_TEXT: createAnalyzeSourceTextExecutor(port) };
}

/** The whole chain, without Redis: the same runner the worker calls. */
async function generate(fixture: Fixture, payload: unknown = analysisAnswer()) {
  const generationId = await reserve(fixture, fixture.sourceTextVersionId);
  const { port, provider } = simulatedProvider(payload);

  await runGenerationJob({ generationId, executors: executorsFor(port), logger: silent });

  return { generationId, provider };
}

/** The writer on its own, inside a transaction the caller holds — its contract. */
async function writeDirectly(
  fixture: Fixture,
  overrides: {
    scope?: ProjectScope;
    actorId?: string;
    sections?: readonly ResolvedAnalysisSection[];
    sourceTextVersionId?: string;
    generationId?: string | null;
  } = {},
) {
  const actorId = overrides.actorId ?? fixture.ownerId;

  return runWithActor(actorId, async () =>
    database.$transaction(async (tx) =>
      writeGeneratedAnalysisWithin(tx, overrides.scope ?? fixture.scope, {
        sections: overrides.sections ?? resolvedSections(),
        sourceTextVersionId: overrides.sourceTextVersionId ?? fixture.sourceTextVersionId,
        generationId: overrides.generationId ?? null,
      }),
    ),
  );
}

function sectionOf(snapshot: AnalysisSnapshot, section: AnalysisSection) {
  return snapshot.sections.find((entry) => entry.section === section);
}

/** Every row of every analysis table, for proving that nothing moved. */
async function photograph(projectId: string): Promise<string> {
  const [analyses, revisions, elements] = await Promise.all([
    seam.analysis.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
    seam.analysisSectionRevision.findMany({
      where: { analysis: { projectId } },
      orderBy: [{ section: "asc" }, { revisionNumber: "asc" }],
    }),
    seam.analysisElement.findMany({
      where: { sectionRevision: { analysis: { projectId } } },
      orderBy: { id: "asc" },
    }),
  ]);

  return JSON.stringify({ analyses, revisions, elements });
}

beforeAll(async () => {
  database = configureDatabaseClient(seam);

  producer = createQueueConnection({ url: REDIS_URL, role: "producer" });
  consumer = createQueueConnection({ url: REDIS_URL, role: "consumer" });
  configureQueueConnection(producer);

  const intruder = await prisma.user.create({
    data: { email: "analysis-generation-intruder@example.test" },
  });
  intruderId = intruder.id;
});

afterEach(async () => {
  await Promise.all(started.splice(0).map((worker) => worker.close(true)));
  await getQueue(GENERATION_SLOW_JOB.queue).obliterate({ force: true });
});

afterAll(async () => {
  await closeProducers();
  resetQueueConnection();
  resetDatabaseClient();
  await Promise.all([producer?.quit(), consumer?.quit()]);
  await Promise.all([prisma.$disconnect(), seam.$disconnect()]);
});

describe("a produced analysis reaches the diagnostic screen (CAL-209)", () => {
  it("writes the seventeen sections a real worker's generation produced", async () => {
    const fixture = await createFixture();
    const generationId = await reserve(fixture, fixture.sourceTextVersionId);
    const { port } = simulatedProvider(analysisAnswer());

    started.push(
      startQueueWorker({
        queue: GENERATION_SLOW_JOB.queue,
        connection: consumer,
        concurrency: 1,
        logger: silent,
        jobs: [
          defineJob(GENERATION_SLOW_JOB, (payload) =>
            runGenerationJob({
              generationId: payload.generationId,
              executors: executorsFor(port),
              logger: silent,
            }),
          ),
        ],
      }),
    );

    expect((await enqueueGeneration(generationId, "ANALYZE_SOURCE_TEXT")).ok).toBe(true);

    await until(
      async () =>
        (await seam.generation.findUniqueOrThrow({ where: { id: generationId } })).status ===
        "SUCCEEDED",
      "the generation to succeed",
    );

    const snapshot = await getAnalysis(fixture.scope);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.validatedAt).toBeNull();

    // Compared as a **set**: seventeen revisions written at once share
    // `revisionNumber: 1`, and `getAnalysis` orders by that column, so the
    // array's order is not something a caller may read anything into. The
    // screen agrees — it maps `ANALYSIS_SECTIONS` and looks each one up.
    expect(new Set(snapshot?.sections.map((entry) => entry.section))).toEqual(
      new Set(ANALYSIS_SECTIONS),
    );
  });

  it("marks every element as the mission's own proposal", async () => {
    const fixture = await createFixture();
    await generate(fixture);

    const snapshot = await getAnalysis(fixture.scope);
    if (snapshot === null) throw new Error("the generation wrote no analysis");

    for (const section of snapshot.sections) {
      expect(section.origin).toBe("GENERATED");
      expect(section.revisionNumber).toBe(1);

      for (const element of section.elements) {
        expect(element.origin).toBe("GENERATED");
        // What the second badge on screen says: written by the analysis, not yet
        // passed over by the author.
        expect(element.provenance).toBe("proposed");
        expect(element.annotations).toEqual([]);
      }
    }
  });

  it("carries both markers, and a heading exactly where a section has one", async () => {
    const fixture = await createFixture();
    await generate(fixture);

    const snapshot = await getAnalysis(fixture.scope);
    if (snapshot === null) throw new Error("the generation wrote no analysis");

    // The two the screen tells apart with `ElementKindBadge`.
    expect(sectionOf(snapshot, "FACTUAL_SUMMARY")?.elements[0]?.kind).toBe("FACTUAL");
    expect(sectionOf(snapshot, "WEAKNESSES")?.elements[0]?.kind).toBe("INTERPRETATION");

    for (const section of snapshot.sections) {
      const paragraph = PARAGRAPH_SECTIONS.includes(section.section);

      if (EMPTY_SECTIONS.includes(section.section)) {
        expect(section.elements).toEqual([]);
        continue;
      }

      expect(section.elements.length).toBeGreaterThan(0);

      for (const element of section.elements) {
        expect(element.label === null).toBe(paragraph);
      }
    }
  });

  it("keeps the quotation the text really supports", async () => {
    const fixture = await createFixture();
    await generate(fixture);

    const snapshot = await getAnalysis(fixture.scope);
    if (snapshot === null) throw new Error("the generation wrote no analysis");

    expect(sectionOf(snapshot, "CHARACTERS")?.elements[0]?.evidence).toBe(REAL_QUOTATION);
  });

  // CAL-208 could only assert that the correction did not fail the generation:
  // *what it corrects is invisible until CAL-209 stores the corrected analysis*.
  // This is that sentence closed, on both of the check's branches.
  it("stores what verification corrected, not what the model claimed", async () => {
    const fixture = await createFixture();
    await generate(fixture, analysisAnswer(INVENTED_QUOTATION));

    const snapshot = await getAnalysis(fixture.scope);
    if (snapshot === null) throw new Error("the generation wrote no analysis");

    // A free marker on an element quoting a passage nobody wrote: demoted, and
    // the invented quotation dropped.
    expect(sectionOf(snapshot, "CHARACTERS")?.elements[0]).toMatchObject({
      kind: "INTERPRETATION",
      evidence: null,
    });

    // A marker the section's own definition decides (`ANALYSIS_FIXED_KINDS`):
    // only the quotation goes.
    expect(sectionOf(snapshot, "FACTUAL_SUMMARY")?.elements[0]).toMatchObject({
      kind: "FACTUAL",
      evidence: null,
    });
  });

  it("gives every element its own lineage and names the generation", async () => {
    const fixture = await createFixture();
    const { generationId } = await generate(fixture);

    const snapshot = await getAnalysis(fixture.scope);
    if (snapshot === null) throw new Error("the generation wrote no analysis");

    const lineages = snapshot.sections.flatMap((entry) =>
      entry.elements.map((element) => element.lineageId),
    );

    expect(lineages.length).toBeGreaterThan(0);
    expect(lineages.every((lineage) => lineage.length > 0)).toBe(true);
    // Minted per element, so an annotation can name one without naming another.
    expect(new Set(lineages).size).toBe(lineages.length);

    const revisions = await seam.analysisSectionRevision.findMany({
      where: { analysis: { projectId: fixture.projectId } },
      select: { generationId: true, sourceTextVersionId: true, createdById: true },
    });

    expect(revisions).toHaveLength(ANALYSIS_SECTIONS.length);
    // ADR-001's link, on every one of the seventeen.
    expect(revisions.every((row) => row.generationId === generationId)).toBe(true);
    expect(revisions.every((row) => row.sourceTextVersionId === fixture.sourceTextVersionId)).toBe(
      true,
    );
    expect(revisions.every((row) => row.createdById === fixture.ownerId)).toBe(true);
  });

  it("appends a second revision to every section when the analysis is run again", async () => {
    const fixture = await createFixture();
    await generate(fixture);

    const first = await writeDirectly(fixture);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(first.value.created).toBe(false);
    expect(first.value.sectionCount).toBe(ANALYSIS_SECTIONS.length);

    const snapshot = await getAnalysis(fixture.scope);
    if (snapshot === null) throw new Error("the second write produced no analysis");

    expect(snapshot.sections.every((entry) => entry.revisionNumber === 2)).toBe(true);

    // Nothing was replaced in place: the first analysis is still on file, which
    // is what makes CAL-147's history possible.
    const revisions = await seam.analysisSectionRevision.count({
      where: { analysis: { projectId: fixture.projectId } },
    });

    expect(revisions).toBe(ANALYSIS_SECTIONS.length * 2);
  });
});

describe("what the write refuses, and what it reports", () => {
  it("opens the project's analysis when there is none, and says so", async () => {
    const fixture = await createFixture();

    expect(await seam.analysis.count({ where: { projectId: fixture.projectId } })).toBe(0);

    const written = await writeDirectly(fixture);

    expect(written.ok).toBe(true);
    if (!written.ok) return;

    expect(written.value.created).toBe(true);
    expect(written.value.orphanedAnnotationCount).toBe(0);
    expect(written.value.supersededEditedSectionCount).toBe(0);
    // Thirteen sections carry one element; four legitimately carry none.
    expect(written.value.elementCount).toBe(ANALYSIS_SECTIONS.length - EMPTY_SECTIONS.length);
  });

  it("counts the notes and the hand-written sections a re-analysis supersedes", async () => {
    const fixture = await createFixture();
    const first = await writeDirectly(fixture);
    if (!first.ok) throw new Error("the first write was refused");

    const themes = await seam.analysisSectionRevision.findFirstOrThrow({
      where: { analysisId: first.value.analysisId, section: "THEMES" },
      select: { id: true, elements: { select: { lineageId: true } } },
    });

    await prisma.analysisAnnotation.create({
      data: {
        analysisId: first.value.analysisId,
        lineageId: themes.elements[0]?.lineageId ?? "",
        authorId: fixture.ownerId,
        body: "Une note de l'auteur.",
      },
    });

    // One section the author rewrote by hand, which a re-analysis replaces.
    await prisma.analysisSectionRevision.create({
      data: {
        analysisId: first.value.analysisId,
        section: "PREMISE",
        revisionNumber: 2,
        origin: "EDITED",
        sourceTextVersionId: fixture.sourceTextVersionId,
        createdById: fixture.ownerId,
        elements: {
          create: [
            {
              position: 1,
              origin: "EDITED",
              kind: "INTERPRETATION",
              label: null,
              statement: "Une prémisse réécrite.",
              evidence: null,
            },
          ],
        },
      },
    });

    const second = await writeDirectly(fixture);

    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.orphanedAnnotationCount).toBe(1);
    expect(second.value.supersededEditedSectionCount).toBe(1);

    // Reported, never deleted: the note is still there, and so is the revision
    // the author wrote.
    expect(
      await seam.analysisAnnotation.count({ where: { analysisId: second.value.analysisId } }),
    ).toBe(1);
  });

  it("refuses a validated analysis and writes nothing", async () => {
    const fixture = await createFixture();
    const first = await writeDirectly(fixture);
    if (!first.ok) throw new Error("the first write was refused");

    await seam.analysis.update({
      where: { id: first.value.analysisId },
      data: { validatedAt: new Date(), validatedById: fixture.ownerId },
    });

    const before = await photograph(fixture.projectId);
    const written = await writeDirectly(fixture);

    expect(written.ok).toBe(false);
    if (!written.ok) expect(written.error.code).toBe("ANALYSIS_ALREADY_VALIDATED");
    expect(await photograph(fixture.projectId)).toBe(before);
  });

  // §6.5, *signaler avant la génération*: the refusal above is the second line
  // of defence, and reaching it would mean the author had paid for an answer
  // nothing could store. `provider.calls` empty is the whole assertion.
  it("refuses a validated analysis before a provider is asked anything", async () => {
    const fixture = await createFixture();
    const first = await writeDirectly(fixture);
    if (!first.ok) throw new Error("the first write was refused");

    await seam.analysis.update({
      where: { id: first.value.analysisId },
      data: { validatedAt: new Date(), validatedById: fixture.ownerId },
    });

    const { generationId, provider } = await generate(fixture);

    expect(provider.calls).toHaveLength(0);

    const row = await seam.generation.findUniqueOrThrow({ where: { id: generationId } });

    expect(row.status).toBe("FAILED");
    expect(row.errorCode).toBe("ANALYSIS_ALREADY_VALIDATED");

    // Nothing was bought, so nothing is counted.
    const attempt = await seam.generationAttempt.findFirstOrThrow({
      where: { generationId },
      orderBy: { attempt: "desc" },
    });

    expect(attempt.inputTokens).toBeNull();
    expect(attempt.outputTokens).toBeNull();
  });

  it("refuses a section named twice, before anything is written", async () => {
    const fixture = await createFixture();
    const sections = resolvedSections();
    const first = sections[0];

    if (first === undefined) throw new Error("the resolver produced no section");

    const written = await writeDirectly(fixture, { sections: [...sections, first] });

    expect(written.ok).toBe(false);
    if (!written.ok) expect(written.error.code).toBe("VALIDATION_FAILED");
    expect(await seam.analysis.count({ where: { projectId: fixture.projectId } })).toBe(0);
  });

  it("refuses a source text version that is not this project's", async () => {
    const mine = await createFixture();
    const theirs = await createFixture();

    const written = await writeDirectly(mine, {
      sourceTextVersionId: theirs.sourceTextVersionId,
    });

    expect(written.ok).toBe(false);
    if (!written.ok) expect(written.error.code).toBe("NOT_FOUND");
    expect(await seam.analysis.count({ where: { projectId: mine.projectId } })).toBe(0);
  });

  it("refuses a generation that is not this project's", async () => {
    const mine = await createFixture();
    const theirs = await createFixture();
    const foreign = await reserve(theirs, theirs.sourceTextVersionId);

    const written = await writeDirectly(mine, { generationId: foreign });

    expect(written.ok).toBe(false);
    if (!written.ok) expect(written.error.code).toBe("NOT_FOUND");
    expect(await seam.analysis.count({ where: { projectId: mine.projectId } })).toBe(0);
  });

  it("reaches nothing through a scope naming somebody else's project", async () => {
    const fixture = await createFixture();
    const first = await writeDirectly(fixture);
    if (!first.ok) throw new Error("the first write was refused");

    const before = await photograph(fixture.projectId);

    // The brand is a registry symbol, so it can be forged; what refuses the
    // write is that every statement names the owner as well as the project
    // (§3.5), which is what this asserts rather than assumes.
    const forged = {
      [Symbol.for("calepin.ProjectScope")]: true,
      projectId: fixture.projectId,
      ownerId: intruderId,
    } as unknown as ProjectScope;

    const written = await writeDirectly(fixture, { scope: forged, actorId: intruderId });

    expect(written.ok).toBe(false);
    if (!written.ok) expect(written.error.code).toBe("NOT_FOUND");
    expect(await photograph(fixture.projectId)).toBe(before);
  });
});

/** Polls rather than sleeping a guessed number of milliseconds. */
async function until(predicate: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (await predicate()) return;

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`timed out waiting for ${label}`);
}
