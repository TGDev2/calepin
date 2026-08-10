/**
 * CAL-066's acceptance criterion, against a real PostgreSQL and a real Redis:
 * **a fact extraction never waits behind a plan generation.**
 *
 * The two missions route to different queues (`mission-routing.test.ts`
 * proves the mapping itself, with no database); what only an integration
 * test can prove is that the routing actually changes behaviour — that a
 * `generation-slow` worker holding a long `BUILD_CHAPTER_OUTLINE` call does
 * not delay a `generation-fast` worker's `EXTRACT_FACTS` call, because they
 * are two real BullMQ workers on two real queues rather than one worker with
 * a queue of mixed jobs.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { succeed } from "@calepin/shared/errors";
import { createLogger } from "@calepin/shared/logging";
import {
  closeProducers,
  configureQueueConnection,
  createQueueConnection,
  defineJob,
  enqueueGeneration,
  GENERATION_FAST_JOB,
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
const MODEL = "claude-opus-5";

type QueueConnection = ReturnType<typeof createQueueConnection>;

const silent = createLogger({ level: "silent" });

let producer: QueueConnection;
let consumer: QueueConnection;

const { prisma, setActor } = createAuditedClient();
const seam = new PrismaClient();

let sequence = 0;

function deferred(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { promise, release };
}

/** Polls a condition rather than sleeping a guessed number of milliseconds. */
async function until(predicate: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (await predicate()) return;

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`timed out waiting for ${label}`);
}

async function statusOf(generationId: string): Promise<string> {
  return (await prisma.generation.findUniqueOrThrow({ where: { id: generationId } })).status;
}

interface Fixture {
  readonly ownerId: string;
  readonly scope: ProjectScope;
  /** A BUILD_CHAPTER_OUTLINE generation — routes to `generation-slow`. */
  readonly slowGenerationId: string;
  /** An EXTRACT_FACTS generation — routes to `generation-fast`. */
  readonly fastGenerationId: string;
}

async function createFixture(): Promise<Fixture> {
  sequence += 1;
  const user = await prisma.user.create({
    data: { email: `queue-routing-${sequence}@example.test` },
  });
  setActor(user.id);

  const project = await prisma.project.create({
    data: { userId: user.id, title: `queue-routing-${sequence}` },
  });

  const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
  if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

  const slow = await runWithActor(user.id, async () =>
    reserveGeneration(opened.value, {
      mission: "BUILD_CHAPTER_OUTLINE",
      input: { note: `slow-${sequence}` },
    }),
  );
  const fast = await runWithActor(user.id, async () =>
    reserveGeneration(opened.value, {
      mission: "EXTRACT_FACTS",
      targetId: `chapter-${sequence}`,
      input: { note: `fast-${sequence}` },
    }),
  );
  if (!slow.ok || !fast.ok) throw new Error("a reservation was refused");

  return {
    ownerId: user.id,
    scope: opened.value,
    slowGenerationId: slow.value.id,
    fastGenerationId: fast.value.id,
  };
}

/** An executor that blocks on `gate` before answering — the held `write-scene`/`build-chapter-outline` call. */
function blockingExecutor(
  mission: "BUILD_CHAPTER_OUTLINE",
  gate: Promise<void>,
): GenerationExecutors {
  return {
    [mission]: {
      model: MODEL,
      async produce(_request, report) {
        report({ model: MODEL, inputTokens: 100, outputTokens: 10, estimatedCostUsd: "0.0001" });
        await gate;

        return succeed({});
      },
    },
  };
}

/** An executor that answers immediately — the short `extract-facts` call. */
function immediateExecutor(mission: "EXTRACT_FACTS"): GenerationExecutors {
  return {
    [mission]: {
      model: MODEL,
      async produce(_request, report) {
        report({ model: MODEL, inputTokens: 100, outputTokens: 10, estimatedCostUsd: "0.0001" });

        return succeed({});
      },
    },
  };
}

const started: Worker[] = [];

beforeAll(async () => {
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
  await getQueue(GENERATION_FAST_JOB.queue).obliterate({ force: true });
});

afterAll(async () => {
  await closeProducers();
  resetQueueConnection();
  resetDatabaseClient();
  await Promise.all([producer?.quit(), consumer?.quit()]);
  await Promise.all([prisma.$disconnect(), seam.$disconnect()]);
});

describe("a fact extraction beside a plan generation (CAL-066)", () => {
  it("finishes while the plan generation is still running, never queued behind it", async () => {
    const fixture = await createFixture();
    const gate = deferred();

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
              executors: blockingExecutor("BUILD_CHAPTER_OUTLINE", gate.promise),
              leaseRenewalMs: 0,
              logger: silent,
            }),
          ),
        ],
      }),
    );
    started.push(
      startQueueWorker({
        queue: GENERATION_FAST_JOB.queue,
        connection: consumer,
        concurrency: 1,
        logger: silent,
        jobs: [
          defineJob(GENERATION_FAST_JOB, (payload) =>
            runGenerationJob({
              generationId: payload.generationId,
              executors: immediateExecutor("EXTRACT_FACTS"),
              leaseRenewalMs: 0,
              logger: silent,
            }),
          ),
        ],
      }),
    );

    const slowEnqueued = await enqueueGeneration(fixture.slowGenerationId, "BUILD_CHAPTER_OUTLINE");
    expect(slowEnqueued.ok).toBe(true);
    // Landed on the slow lane, not the fast one.
    expect(
      await getQueue(GENERATION_SLOW_JOB.queue).getJob(fixture.slowGenerationId),
    ).toBeDefined();

    await until(
      async () => (await statusOf(fixture.slowGenerationId)) === "RUNNING",
      "the plan generation to be claimed and start blocking",
    );

    const fastEnqueued = await enqueueGeneration(fixture.fastGenerationId, "EXTRACT_FACTS");
    expect(fastEnqueued.ok).toBe(true);
    expect(
      await getQueue(GENERATION_FAST_JOB.queue).getJob(fixture.fastGenerationId),
    ).toBeDefined();

    // The acceptance criterion itself: the extraction reaches SUCCEEDED on its
    // own, real BullMQ worker while the plan generation is still blocked on
    // its gate — nothing here has released it yet.
    await until(
      async () => (await statusOf(fixture.fastGenerationId)) === "SUCCEEDED",
      "the fact extraction to finish without waiting for the plan generation",
    );
    expect(await statusOf(fixture.slowGenerationId)).toBe("RUNNING");

    gate.release();
    await until(
      async () => (await statusOf(fixture.slowGenerationId)) === "SUCCEEDED",
      "the plan generation to finish once released",
    );
  });
});
