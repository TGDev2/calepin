/**
 * CAL-210's acceptance criterion, against a real PostgreSQL and a real Redis:
 * **running `propose-directions` puts three directions with divergent narrative
 * engines in the database, and an answer whose engines collide triggers the
 * targeted relaunch CAL-080 left to "the executor task".**
 *
 * The oracle is `getDirectionsForComparison(scope)` and nothing else, because
 * that is the one function the comparison screen calls: `directions/page.tsx`
 * reads it, parses each `narrativeEngine` and runs `checkDirectionDivergence`
 * over the standing ones. Asserting the rows instead would let a refactor keep
 * this file green while the screen went blank.
 *
 * Nothing in the chain is stubbed except the network, as in
 * `analysis-generation.integration.test.ts`: the generation is reserved, handed
 * to a real BullMQ worker, claimed under the row's own lock, produced by the
 * **real** executor over the **real** `@calepin/ai` pipeline, and written by the
 * transaction that completes the attempt.
 *
 * Every fixture value is technical (§9): identifiers, counts, and text made of
 * `mot-*` tokens no reader could mistake for a novel.
 */

import {
  createAnthropicAdapter,
  createModelProviderPort,
  MISSION_REGISTRY,
  type ModelProviderPort,
} from "@calepin/ai";
import { answer, type SimulatedClient, simulatedClient, text } from "@calepin/ai/testing";
import {
  checkDirectionDivergence,
  describeNarrativeEngine,
  DIRECTION_PROPOSAL_COUNT,
  type DirectionProposal,
  type NarrativeEngine,
  narrativeEngineSchema,
  type ResolvedDirection,
  resolveDirectionProposals,
} from "@calepin/direction";
import {
  createProposeDirectionsExecutor,
  MAX_DIRECTION_PROPOSAL_ASKS,
  proposeDirectionsAsk,
} from "@calepin/direction/generation";
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
  type DirectionSnapshot,
  getDirectionsForComparison,
  openProjectScope,
  type ProjectScope,
  reserveGeneration,
  writeGeneratedDirectionsWithin,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import type { Worker } from "bullmq";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const ROUTED_MODEL = MISSION_REGISTRY["propose-directions"].model;
const REPORTED_USAGE = { input_tokens: 1_000, output_tokens: 400 } as const;

const silent = createLogger({ level: "silent" });

type QueueConnection = ReturnType<typeof createQueueConnection>;

/** `words` synthetic tokens. No prose reaches this repository (§8, §9). */
function filler(label: string, words: number): string {
  return Array.from({ length: words }, (_, i) => `mot-${label}-${i}`).join(" ");
}

const SOURCE_TEXT = filler("src", 120);

function engine(overrides: Partial<NarrativeEngine> = {}): NarrativeEngine {
  return {
    conflictNature: "internal",
    tensionSource: "concealment",
    protagonistStake: "belonging",
    shiftTrigger: "revelation",
    resolutionNature: "sacrifice",
    ...overrides,
  };
}

/**
 * Three engines that differ on two axes each — the minimum the gate demands, so
 * an answer built from them is exactly as divergent as the product requires and
 * not a comfortable margin above it.
 */
const DIVERGENT_ENGINES: readonly NarrativeEngine[] = [
  engine(),
  engine({ tensionSource: "deadline", shiftTrigger: "betrayal" }),
  engine({ tensionSource: "dilemma", shiftTrigger: "irruption" }),
];

type Treatments = DirectionProposal["dimensionTreatments"];

function treatments(overrides: Partial<Treatments> = {}): Treatments {
  return {
    premise: "preserve",
    "main-conflict": "preserve",
    "narrative-promise": "preserve",
    themes: "preserve",
    protagonist: "preserve",
    "secondary-characters": "preserve",
    setting: "preserve",
    tone: "preserve",
    "point-of-view": "preserve",
    ending: "preserve",
    ...overrides,
  };
}

/** One direction as the mission answers it, at every list's declared minimum. */
function direction(
  label: string,
  narrativeEngine: NarrativeEngine,
  dimensionTreatments: Treatments = treatments(),
): DirectionProposal {
  return {
    workingTitle: `titre-${label}`,
    developedPremise: filler(`premisse-${label}`, 12),
    dominantGenre: `genre-${label}`,
    mainConflict: filler(`conflit-${label}`, 10),
    protagonistArc: filler(`arc-${label}`, 10),
    newStakes: [`enjeu-${label}-1`, `enjeu-${label}-2`],
    charactersToIntroduce: [],
    endingNature: filler(`fin-${label}`, 6),
    mainRisks: [`risque-${label}-1`, `risque-${label}-2`],
    elementsKeptFromSource: [`garde-${label}-1`, `garde-${label}-2`],
    elementsTransformed: [`transforme-${label}-1`],
    novelPotentialAssessment: filler(`potentiel-${label}`, 12),
    dimensionTreatments,
    narrativeEngine,
  };
}

/** Three genuinely divergent directions — the answer that needs no relaunch. */
function divergentAnswer() {
  return {
    directions: DIVERGENT_ENGINES.map((declared, index) => direction(`ok-${index}`, declared)),
  };
}

/**
 * Three directions that vary only by their decor: one engine, three labels.
 *
 * This is the answer the task names — *trois directions volontairement peu
 * divergentes* — and what every relaunch case below starts from.
 */
function decorVariationsAnswer() {
  return {
    directions: [0, 1, 2].map((index) => direction(`decor-${index}`, engine())),
  };
}

/** The answer a relaunch asked for `count` directions gets. */
function relaunchAnswer(count: number, from = 1) {
  return {
    directions: Array.from({ length: count }, (_, offset) =>
      direction(`relance-${from + offset}`, DIVERGENT_ENGINES[from + offset] ?? engine()),
    ),
  };
}

/** The rows a resolver would hand the writer, built by hand. */
function resolvedDirections(count = DIRECTION_PROPOSAL_COUNT): readonly ResolvedDirection[] {
  // Through the real resolver, which is what drops the declaration no column
  // stores — the writer's contract is what it hands over, not a shape rebuilt
  // here to look like it.
  return resolveDirectionProposals(
    Array.from({ length: count }, (_, index) =>
      direction(`direct-${index}`, DIVERGENT_ENGINES[index] ?? engine()),
    ),
  );
}

/**
 * A provider that answers each queued payload in turn, and records every call.
 *
 * A queue rather than one answer, because a relaunch is precisely a second call:
 * `provider.calls.length` is how this suite proves one happened, and what the
 * second call was asked is read off `provider.calls[1]`.
 */
function simulatedProvider(payloads: readonly unknown[]): {
  port: ModelProviderPort;
  provider: SimulatedClient;
} {
  const provider = simulatedClient(
    payloads.map((payload) =>
      answer({
        content: [text(JSON.stringify(payload))],
        usage: REPORTED_USAGE,
        model: ROUTED_MODEL,
      }),
    ),
  );

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
  readonly sourceTextVersionId: string;
  readonly analysisId: string;
}

/**
 * Its own project per test, seeded stepwise rather than from
 * `createProjectGraph`: that graph already holds a `CreativeDirection`, so every
 * assertion here about a first proposal would be an assertion about the fixture
 * — and the pre-flight refusal would fire on every test.
 *
 * The analysis is seeded **validated**, because the mission refuses to run
 * otherwise, and with one real section, because the prompt is rendered from it.
 */
async function createFixture(options: { validated?: boolean } = {}): Promise<Fixture> {
  sequence += 1;
  const label = `direction-generation-${sequence}`;

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

  // `analyses_validation_check` takes the timestamp and its author together or
  // neither: a validation records who made it, or it did not happen.
  const validated = options.validated !== false;
  const analysis = await prisma.analysis.create({
    data: {
      projectId: project.id,
      validatedAt: validated ? new Date() : null,
      validatedById: validated ? user.id : null,
    },
  });
  const revision = await prisma.analysisSectionRevision.create({
    data: {
      analysisId: analysis.id,
      section: "FACTUAL_SUMMARY",
      revisionNumber: 1,
      origin: "GENERATED",
      sourceTextVersionId: version.id,
      createdById: user.id,
    },
  });
  await prisma.analysisElement.create({
    data: {
      sectionRevisionId: revision.id,
      position: 1,
      origin: "GENERATED",
      kind: "FACTUAL",
      statement: filler("diag", 10),
      evidence: null,
    },
  });

  const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
  if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

  return {
    ownerId: user.id,
    projectId: project.id,
    scope: opened.value,
    sourceTextVersionId: version.id,
    analysisId: analysis.id,
  };
}

async function reserve(fixture: Fixture, sourceTextVersionId: string): Promise<string> {
  const reserved = await runWithActor(fixture.ownerId, async () =>
    reserveGeneration(fixture.scope, {
      mission: "PROPOSE_DIRECTIONS",
      targetId: null,
      input: proposeDirectionsAsk(sourceTextVersionId),
    }),
  );

  if (!reserved.ok) throw new Error("a reservation was refused");

  return reserved.value.id;
}

function executorsFor(port: ModelProviderPort): GenerationExecutors {
  return { PROPOSE_DIRECTIONS: createProposeDirectionsExecutor(port) };
}

/** The whole chain, without Redis: the same runner the worker calls. */
async function generate(fixture: Fixture, payloads: readonly unknown[] = [divergentAnswer()]) {
  const generationId = await reserve(fixture, fixture.sourceTextVersionId);
  const { port, provider } = simulatedProvider(payloads);

  await runGenerationJob({ generationId, executors: executorsFor(port), logger: silent });

  return { generationId, provider };
}

/** The writer on its own, inside a transaction the caller holds — its contract. */
async function writeDirectly(
  fixture: Fixture,
  overrides: {
    scope?: ProjectScope;
    actorId?: string;
    directions?: readonly ResolvedDirection[];
  } = {},
) {
  const actorId = overrides.actorId ?? fixture.ownerId;

  return runWithActor(actorId, async () =>
    database.$transaction(async (tx) =>
      writeGeneratedDirectionsWithin(tx, overrides.scope ?? fixture.scope, {
        directions: overrides.directions ?? resolvedDirections(),
      }),
    ),
  );
}

function enginesOf(directions: readonly DirectionSnapshot[]): readonly NarrativeEngine[] {
  return directions.map((row) => narrativeEngineSchema.parse(row.narrativeEngine));
}

/** Every direction row of the project, for proving that nothing moved. */
async function photograph(projectId: string): Promise<string> {
  const rows = await seam.creativeDirection.findMany({
    where: { projectId },
    orderBy: { id: "asc" },
  });

  return JSON.stringify(rows);
}

async function attemptOf(generationId: string) {
  return seam.generationAttempt.findFirstOrThrow({
    where: { generationId },
    orderBy: { attempt: "desc" },
  });
}

beforeAll(async () => {
  database = configureDatabaseClient(seam);

  producer = createQueueConnection({ url: REDIS_URL, role: "producer" });
  consumer = createQueueConnection({ url: REDIS_URL, role: "consumer" });
  configureQueueConnection(producer);

  const intruder = await prisma.user.create({
    data: { email: "direction-generation-intruder@example.test" },
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

describe("produced directions reach the comparison screen (CAL-210)", () => {
  it("writes the three directions a real worker's generation produced", async () => {
    const fixture = await createFixture();
    const generationId = await reserve(fixture, fixture.sourceTextVersionId);
    const { port } = simulatedProvider([divergentAnswer()]);

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

    expect((await enqueueGeneration(generationId, "PROPOSE_DIRECTIONS")).ok).toBe(true);

    await until(
      async () =>
        (await seam.generation.findUniqueOrThrow({ where: { id: generationId } })).status ===
        "SUCCEEDED",
      "the generation to succeed",
    );

    const directions = await getDirectionsForComparison(fixture.scope);

    expect(directions).toHaveLength(DIRECTION_PROPOSAL_COUNT);
    // What the screen computes on every render, over the same rows.
    expect(checkDirectionDivergence(enginesOf(directions)).divergent).toBe(true);
  });

  it("marks every direction as the mission's own proposal", async () => {
    const fixture = await createFixture();
    await generate(fixture);

    const directions = await getDirectionsForComparison(fixture.scope);

    for (const row of directions) {
      expect(row.origin).toBe("PROPOSED");
      expect(row.isCanonical).toBe(false);
      expect(row.discardedAt).toBeNull();
      expect(row.evaluation).toBeNull();
    }
  });

  it("stores every attribute the comparison grid reads", async () => {
    const fixture = await createFixture();
    await generate(fixture);

    const [first] = await getDirectionsForComparison(fixture.scope);
    if (first === undefined) throw new Error("the generation wrote no direction");

    expect(first.workingTitle).toBe("titre-ok-0");
    expect(first.newStakes).toEqual(["enjeu-ok-0-1", "enjeu-ok-0-2"]);
    expect(first.charactersToIntroduce).toEqual([]);
    expect(first.elementsTransformed).toEqual(["transforme-ok-0-1"]);
    expect(narrativeEngineSchema.parse(first.narrativeEngine)).toEqual(DIVERGENT_ENGINES[0]);
  });

  it("asks once when the first answer already diverges", async () => {
    const fixture = await createFixture();
    const { provider } = await generate(fixture);

    expect(provider.calls).toHaveLength(1);
  });
});

describe("the relaunch CAL-080 left to this task", () => {
  // The task's own acceptance criterion, end to end.
  it("re-asks when three directions share one narrative engine", async () => {
    const fixture = await createFixture();
    const { generationId, provider } = await generate(fixture, [
      decorVariationsAnswer(),
      relaunchAnswer(2),
    ]);

    expect((await seam.generation.findUniqueOrThrow({ where: { id: generationId } })).status).toBe(
      "SUCCEEDED",
    );
    expect(provider.calls).toHaveLength(2);

    const directions = await getDirectionsForComparison(fixture.scope);

    expect(directions).toHaveLength(DIRECTION_PROPOSAL_COUNT);
    expect(checkDirectionDivergence(enginesOf(directions)).divergent).toBe(true);
    // The one the prefix-greedy rule kept, and the two the relaunch produced.
    // Compared as a **set**: three rows written by one `createMany` share a
    // `createdAt`, and `getDirectionsForComparison` orders by that column, so
    // the array's order is not something a caller may read anything into. The
    // screen agrees — it lays the cards out and highlights the axes any pair
    // differs on, which is symmetric.
    expect(new Set(directions.map((row) => row.workingTitle))).toEqual(
      new Set(["titre-decor-0", "titre-relance-1", "titre-relance-2"]),
    );
  });

  // The exclusion contract prompt V3 has carried since CAL-080, finally used.
  it("names the engine that stands, and asks only for the slots that collided", async () => {
    const fixture = await createFixture();
    const { provider } = await generate(fixture, [decorVariationsAnswer(), relaunchAnswer(2)]);

    const relaunch = provider.calls[1];
    if (relaunch === undefined) throw new Error("no relaunch was sent");

    const sent = JSON.stringify(relaunch.params.messages);

    expect(sent).toContain("propose 2 directions");
    // Read off `describeNarrativeEngine` itself rather than quoted here: the
    // clause the prompt carries and the clause the author reads for the same
    // five-tuple are one string, and an assertion that restated it would drift.
    expect(sent).toContain(describeNarrativeEngine(engine()));
  });

  // Every ask is paid for, and `AttemptUsage` replaces rather than accumulates:
  // an executor that reported each call on its own would record only the last.
  it("records what every ask of the loop cost, not only the last", async () => {
    const fixture = await createFixture();
    const { generationId } = await generate(fixture, [decorVariationsAnswer(), relaunchAnswer(2)]);

    const attempt = await attemptOf(generationId);

    expect(attempt.inputTokens).toBe(REPORTED_USAGE.input_tokens * 2);
    expect(attempt.outputTokens).toBe(REPORTED_USAGE.output_tokens * 2);
    expect(Number(attempt.estimatedCostUsd)).toBeGreaterThan(0);
  });

  it("keeps a compliant direction and re-asks the slot of one that overshoots", async () => {
    const fixture = await createFixture();
    await seam.project.update({
      where: { id: fixture.projectId },
      data: { freedomLevel: "LOW" },
    });

    const overshooting = {
      directions: [
        direction(
          "hors-1",
          DIVERGENT_ENGINES[0] ?? engine(),
          treatments({ themes: "reinterpret" }),
        ),
        direction("ok-1", DIVERGENT_ENGINES[1] ?? engine()),
        direction("ok-2", DIVERGENT_ENGINES[2] ?? engine()),
      ],
    };

    const { provider } = await generate(fixture, [
      overshooting,
      { directions: [direction("relance-0", DIVERGENT_ENGINES[0] ?? engine())] },
    ]);

    expect(provider.calls).toHaveLength(2);

    const directions = await getDirectionsForComparison(fixture.scope);

    expect(new Set(directions.map((row) => row.workingTitle))).toEqual(
      new Set(["titre-ok-1", "titre-ok-2", "titre-relance-0"]),
    );
  });

  // An explicit refusal rather than a loop — the task's own words.
  it("refuses after the bound rather than asking a fourth time", async () => {
    const fixture = await createFixture();
    const { generationId, provider } = await generate(fixture, [
      decorVariationsAnswer(),
      { directions: [direction("encore-1", engine()), direction("encore-2", engine())] },
      { directions: [direction("encore-3", engine()), direction("encore-4", engine())] },
    ]);

    expect(provider.calls).toHaveLength(MAX_DIRECTION_PROPOSAL_ASKS);

    const generation = await seam.generation.findUniqueOrThrow({ where: { id: generationId } });

    expect(generation.status).toBe("FAILED");
    expect(generation.errorCode).toBe("DIRECTION_DIVERGENCE_NOT_REACHED");
    // A conflict is not retryable, so nothing redelivers it: only a person's
    // replay reopens the row.
    expect(generation.failureClass).toBe("PERMANENT");
    expect(await getDirectionsForComparison(fixture.scope)).toEqual([]);
  });

  it("records what a refused loop cost, since every ask was paid for", async () => {
    const fixture = await createFixture();
    const { generationId } = await generate(fixture, [
      decorVariationsAnswer(),
      { directions: [direction("encore-1", engine()), direction("encore-2", engine())] },
      { directions: [direction("encore-3", engine()), direction("encore-4", engine())] },
    ]);

    const attempt = await attemptOf(generationId);

    expect(attempt.inputTokens).toBe(REPORTED_USAGE.input_tokens * MAX_DIRECTION_PROPOSAL_ASKS);
  });
});

describe("what the mission refuses before a provider is asked anything", () => {
  it("refuses an analysis nobody has validated", async () => {
    const fixture = await createFixture({ validated: false });
    const { generationId, provider } = await generate(fixture);

    expect(provider.calls).toEqual([]);

    const generation = await seam.generation.findUniqueOrThrow({ where: { id: generationId } });

    expect(generation.errorCode).toBe("ANALYSIS_NOT_VALIDATED");
    expect(await getDirectionsForComparison(fixture.scope)).toEqual([]);
  });

  it("refuses a project that already holds directions nobody wrote off", async () => {
    const fixture = await createFixture();
    expect((await writeDirectly(fixture)).ok).toBe(true);

    const before = await photograph(fixture.projectId);
    const { generationId, provider } = await generate(fixture);

    expect(provider.calls).toEqual([]);

    const generation = await seam.generation.findUniqueOrThrow({ where: { id: generationId } });

    expect(generation.errorCode).toBe("DIRECTIONS_ALREADY_PROPOSED");
    expect(await photograph(fixture.projectId)).toBe(before);

    // Nothing was asked, so nothing was measured: a try nobody made sums to
    // nothing (CAL-058).
    const attempt = await attemptOf(generationId);
    expect(attempt.inputTokens).toBeNull();
    expect(attempt.outputTokens).toBeNull();
  });

  it("proposes again once every standing direction has been written off", async () => {
    const fixture = await createFixture();
    expect((await writeDirectly(fixture)).ok).toBe(true);

    await seam.creativeDirection.updateMany({
      where: { projectId: fixture.projectId },
      data: { discardedAt: new Date() },
    });

    const { provider } = await generate(fixture);

    expect(provider.calls).toHaveLength(1);
    // Nothing is lost: the three written off are still there, beside the three
    // just proposed (CAL-083's doctrine).
    expect(await getDirectionsForComparison(fixture.scope)).toHaveLength(
      DIRECTION_PROPOSAL_COUNT * 2,
    );
  });

  it("refuses a source text version the author has already replaced", async () => {
    const fixture = await createFixture();
    const generationId = await reserve(fixture, fixture.sourceTextVersionId);

    const sourceText = await seam.sourceText.findFirstOrThrow({
      where: { projectId: fixture.projectId },
    });
    await prisma.sourceTextVersion.create({
      data: {
        sourceTextId: sourceText.id,
        versionNumber: 2,
        content: filler("src2", 120),
        wordCount: 120,
        editedById: fixture.ownerId,
      },
    });

    const { port, provider } = simulatedProvider([divergentAnswer()]);
    await runGenerationJob({ generationId, executors: executorsFor(port), logger: silent });

    expect(provider.calls).toEqual([]);

    const generation = await seam.generation.findUniqueOrThrow({ where: { id: generationId } });

    expect(generation.errorCode).toBe("SOURCE_TEXT_VERSION_SUPERSEDED");
  });
});

describe("what the write refuses, and what it reports", () => {
  it("writes the directions it is given and says how many", async () => {
    const fixture = await createFixture();
    const written = await writeDirectly(fixture);

    expect(written.ok).toBe(true);
    if (written.ok) expect(written.value.directionCount).toBe(DIRECTION_PROPOSAL_COUNT);
  });

  it("refuses an empty list", async () => {
    const fixture = await createFixture();
    const written = await writeDirectly(fixture, { directions: [] });

    expect(written.ok).toBe(false);
    if (!written.ok) expect(written.error.code).toBe("VALIDATION_FAILED");
    expect(await photograph(fixture.projectId)).toBe("[]");
  });

  // The refusal exists on both sides on purpose: the author may write their own
  // direction while a generation runs.
  it("refuses a project that already holds standing directions", async () => {
    const fixture = await createFixture();
    expect((await writeDirectly(fixture)).ok).toBe(true);

    const before = await photograph(fixture.projectId);
    const second = await writeDirectly(fixture);

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("DIRECTIONS_ALREADY_PROPOSED");
    expect(await photograph(fixture.projectId)).toBe(before);
  });

  it("reaches nothing through a forged scope", async () => {
    const fixture = await createFixture();
    const forged = forgedScope(intruderId, fixture.projectId);

    const written = await writeDirectly(fixture, { scope: forged, actorId: intruderId });

    expect(written.ok).toBe(false);
    if (!written.ok) expect(written.error.code).toBe("NOT_FOUND");
    expect(await photograph(fixture.projectId)).toBe("[]");
  });
});

/**
 * A scope naming another user's project — the shape an attack takes once the
 * type system is out of the picture. The brand is a registry symbol, so a caller
 * determined to forge one can; what protects the row is the statement.
 */
function forgedScope(ownerId: string, projectId: string): ProjectScope {
  return {
    [Symbol.for("calepin.ProjectScope")]: true,
    projectId,
    ownerId,
  } as unknown as ProjectScope;
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
