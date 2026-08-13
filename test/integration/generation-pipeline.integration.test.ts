/**
 * CAL-208's acceptance criterion, against a real PostgreSQL and a real Redis:
 * **a queued generation really calls a model, and the attempt records what the
 * call was — its model, its tokens, its duration and its prompt version.**
 *
 * Nothing in the chain is stubbed except the network. The generation is
 * reserved by `reserveGeneration`, handed to a real BullMQ worker by
 * `enqueueGeneration`, claimed by `claimGenerationAttempt` under the row's own
 * lock, and produced by the **real** `analyze-source-text` executor over the
 * **real** `@calepin/ai` pipeline on a **real** Anthropic adapter — whose only
 * fake part is the `MessagesClient` underneath it (§8). So the prompt is
 * rendered by the registry, the answer is parsed against the domain's own
 * schema, the usage is the provider's own report, and the duration is the one
 * the runner measured.
 *
 * The oracle is the `GenerationAttempt` row and nothing else. A return value
 * would let a refactor keep the assertion true while the column moved, and the
 * column is what the operations view, the cost summary and the estimate all
 * read.
 *
 * Every fixture value is technical (§9): identifiers, counts, tokens, model
 * names, and a source text made of `mot-src-*` tokens that no reader could
 * mistake for a novel — deliberately, since this is the one mission whose input
 * is an author's whole starting text.
 */

import {
  createAnthropicAdapter,
  createModelProviderPort,
  currentPrompt,
  MISSION_REGISTRY,
  type ModelProviderPort,
} from "@calepin/ai";
import { answer, type SimulatedClient, simulatedClient, text } from "@calepin/ai/testing";
import {
  analyzeSourceTextAsk,
  createAnalyzeSourceTextExecutor,
} from "@calepin/analysis/generation";
import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
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
import { openProjectScope, type ProjectScope, reserveGeneration } from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import type { Worker } from "bullmq";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/** What the registry routes the mission to — read, so a retune moves with it. */
const ROUTED_MODEL = MISSION_REGISTRY["analyze-source-text"].model;

/** Distinctive, so a double count or a default would be visible as itself. */
const REPORTED_USAGE = { input_tokens: 4_321, output_tokens: 876 } as const;

const silent = createLogger({ level: "silent" });

type QueueConnection = ReturnType<typeof createQueueConnection>;

/** `words` synthetic tokens. No prose reaches this repository (§8, §9). */
function filler(label: string, words: number): string {
  return Array.from({ length: words }, (_, i) => `mot-${label}-${i}`).join(" ");
}

const SOURCE_TEXT = filler("src", 120);

/** A run of the fixture that is genuinely a passage of it, for the evidence check. */
const REAL_QUOTATION = "mot-src-4 mot-src-5 mot-src-6";

/** A run that is not, so the correction path is walked rather than described. */
const INVENTED_QUOTATION = "mot-inventé-1 mot-inventé-2";

function listed(label: string, kind: "FACTUAL" | "INTERPRETATION", evidence: string | null) {
  return { kind, label, statement: filler(label, 6), evidence };
}

/**
 * A seventeen-section diagnostic that satisfies `sourceTextAnalysisSchema`.
 *
 * Built at each section's declared minimum rather than filled out, so the
 * fixture states the contract's floor instead of an arbitrary shape — and so a
 * floor that moves fails here rather than passing with a stale surplus.
 */
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

/** The real pipeline over a fake socket: one adapter, one canned answer. */
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

let producer: QueueConnection;
let consumer: QueueConnection;
let sequence = 0;

interface Fixture {
  readonly ownerId: string;
  readonly projectId: string;
  readonly scope: ProjectScope;
  readonly sourceTextId: string;
  readonly sourceTextVersionId: string;
}

async function createFixture(): Promise<Fixture> {
  sequence += 1;
  const label = `pipeline-${sequence}`;

  const user = await prisma.user.create({ data: { email: `${label}@example.test` } });
  setActor(user.id);

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      title: label,
      language: "français",
      targetAudience: "Grand public",
    },
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

/** Polls rather than sleeping a guessed number of milliseconds. */
async function until(predicate: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (await predicate()) return;

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`timed out waiting for ${label}`);
}

function readAttempt(generationId: string) {
  return seam.generationAttempt.findFirstOrThrow({
    where: { generationId },
    orderBy: { attempt: "desc" },
  });
}

beforeAll(() => {
  configureDatabaseClient(seam);

  producer = createQueueConnection({ url: REDIS_URL, role: "producer" });
  consumer = createQueueConnection({ url: REDIS_URL, role: "consumer" });
  configureQueueConnection(producer);
});

beforeEach(async () => {
  await seam.generation.deleteMany({});
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

describe("a queued analysis generation (CAL-208)", () => {
  it("runs through a real worker and records what the call was", async () => {
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

    const enqueued = await enqueueGeneration(generationId, "ANALYZE_SOURCE_TEXT");
    expect(enqueued.ok).toBe(true);

    await until(
      async () =>
        (await seam.generation.findUniqueOrThrow({ where: { id: generationId } })).status ===
        "SUCCEEDED",
      "the generation to succeed",
    );

    const attempt = await readAttempt(generationId);

    // The four columns the task is finished when the row carries.
    expect(attempt.model).toBe(ROUTED_MODEL);
    expect(attempt.inputTokens).toBe(REPORTED_USAGE.input_tokens);
    expect(attempt.outputTokens).toBe(REPORTED_USAGE.output_tokens);
    expect(attempt.promptVersion).toBe(currentPrompt("analyze-source-text").version);
    expect(attempt.durationMs).not.toBeNull();
    expect(attempt.durationMs ?? -1).toBeGreaterThanOrEqual(0);

    // And the shape of a healthy one: paid for once, settled, lease released.
    expect(attempt.attempt).toBe(1);
    expect(attempt.status).toBe("SUCCEEDED");
    expect(attempt.completedAt).not.toBeNull();
    expect(attempt.leaseExpiresAt).toBeNull();
    expect(attempt.estimatedCostUsd).not.toBeNull();
    expect(await seam.generationAttempt.count({ where: { generationId } })).toBe(1);
  });

  it("sends the mission's own prompt, carrying the version's whole text", async () => {
    const fixture = await createFixture();
    const generationId = await reserve(fixture, fixture.sourceTextVersionId);
    const { port, provider } = simulatedProvider(analysisAnswer());

    const outcome = await runGenerationJob({
      generationId,
      executors: executorsFor(port),
      logger: silent,
    });

    expect(outcome.outcome).toBe("produced");

    const call = provider.calls[0];
    expect(call).toBeDefined();
    expect(call?.params.model).toBe(ROUTED_MODEL);

    // The composer ran: the whole source text reached the provider, under the
    // project's own language and readership, constrained by the domain's schema.
    const sent = JSON.stringify(call?.params.messages);
    expect(sent).toContain("mot-src-0");
    expect(sent).toContain("mot-src-119");
    expect(call?.params.system).toContain("français");
    expect(sent).toContain("Grand public");
    expect(call?.params.output_config?.format?.type).toBe("json_schema");
  });

  // What this file's boundary used to be: until CAL-209 the generation
  // succeeded and wrote nothing. It now writes the diagnostic in the same
  // transaction that completes it, so the assertion is the opposite one. What
  // the analysis *contains* is `analysis-generation.integration.test.ts`'s;
  // what belongs here is that a succeeded generation left one behind.
  it("writes the analysis in the transaction that completes it", async () => {
    const fixture = await createFixture();
    const generationId = await reserve(fixture, fixture.sourceTextVersionId);
    const { port } = simulatedProvider(analysisAnswer());

    await runGenerationJob({ generationId, executors: executorsFor(port), logger: silent });

    expect((await seam.generation.findUniqueOrThrow({ where: { id: generationId } })).status).toBe(
      "SUCCEEDED",
    );
    expect(await seam.analysis.count({ where: { projectId: fixture.projectId } })).toBe(1);
  });

  // The ask names a version and every stage produced from it is attributed to
  // the version it names, so an edit that landed while the job waited has to
  // stop the run — before a provider is paid, not after.
  it("refuses an ask whose source text version has been superseded", async () => {
    const fixture = await createFixture();
    const generationId = await reserve(fixture, fixture.sourceTextVersionId);
    const { port, provider } = simulatedProvider(analysisAnswer());

    await prisma.sourceTextVersion.create({
      data: {
        sourceTextId: fixture.sourceTextId,
        versionNumber: 2,
        content: filler("edited", 130),
        wordCount: 130,
        editedById: fixture.ownerId,
      },
    });

    const outcome = await runGenerationJob({
      generationId,
      executors: executorsFor(port),
      logger: silent,
    });

    expect(outcome.outcome).toBe("failed");
    expect(provider.calls).toHaveLength(0);

    const row = await seam.generation.findUniqueOrThrow({ where: { id: generationId } });
    expect(row.status).toBe("FAILED");
    expect(row.errorCode).toBe("SOURCE_TEXT_VERSION_SUPERSEDED");

    // Nothing was asked of a provider, so nothing is recorded as spent.
    const attempt = await readAttempt(generationId);
    expect(attempt.inputTokens).toBeNull();
    expect(attempt.outputTokens).toBeNull();
    expect(attempt.estimatedCostUsd).toBeNull();
  });

  // The evidence check runs on the way through, and the failure mode that would
  // appear first in production is its correcting an element and taking the
  // generation down with it. What it corrects is now stored, and
  // `analysis-generation.integration.test.ts` reads it back off both branches.
  it("corrects an unfound quotation instead of failing the generation", async () => {
    const fixture = await createFixture();
    const generationId = await reserve(fixture, fixture.sourceTextVersionId);
    const { port } = simulatedProvider(analysisAnswer(INVENTED_QUOTATION));

    const outcome = await runGenerationJob({
      generationId,
      executors: executorsFor(port),
      logger: silent,
    });

    expect(outcome.outcome).toBe("produced");
    expect((await seam.generation.findUniqueOrThrow({ where: { id: generationId } })).status).toBe(
      "SUCCEEDED",
    );
  });

  // An answer that misses the contract is the pipeline's business, not this
  // executor's — but the row it leaves behind is what an author sees, and the
  // tokens it spent are what they are billed for.
  it("records what a rejected answer cost, and writes no result", async () => {
    const fixture = await createFixture();
    const generationId = await reserve(fixture, fixture.sourceTextVersionId);
    // Shares field names with the contract, so it is a form failure worth one
    // repair pass rather than an off-topic answer — hence two canned answers.
    const malformed = { ...analysisAnswer(), themes: [] };
    const provider = simulatedClient([
      answer({
        content: [text(JSON.stringify(malformed))],
        usage: REPORTED_USAGE,
        model: ROUTED_MODEL,
      }),
      answer({
        content: [text(JSON.stringify(malformed))],
        usage: REPORTED_USAGE,
        model: ROUTED_MODEL,
      }),
    ]);
    const port = createModelProviderPort({
      adapters: [createAnthropicAdapter({ client: provider.client })],
      log: silent,
    });

    const outcome = await runGenerationJob({
      generationId,
      executors: executorsFor(port),
      logger: silent,
    });

    expect(outcome.outcome).toBe("failed");

    const row = await seam.generation.findUniqueOrThrow({ where: { id: generationId } });
    expect(row.errorCode).toBe("MODEL_OUTPUT_INVALID");

    const attempt = await readAttempt(generationId);
    // Both passes were paid for: the repair's answer is not free because it was
    // rejected too.
    expect(attempt.inputTokens).toBe(REPORTED_USAGE.input_tokens * 2);
    expect(attempt.outputTokens).toBe(REPORTED_USAGE.output_tokens * 2);
    expect(attempt.estimatedCostUsd).not.toBeNull();
    expect(await seam.analysis.count({ where: { projectId: fixture.projectId } })).toBe(0);
  });
});
