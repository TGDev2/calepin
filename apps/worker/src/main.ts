/**
 * The worker process (CAL-060, CAL-061) — `pnpm worker`.
 *
 * ADR-001: *`apps/worker` is a plain long-lived Node process consuming BullMQ
 * queues. It serves no HTTP.* This file is the whole of the shell: it reads the
 * environment, configures the logger, registers the database client, opens the
 * Redis connections, starts the workers, registers the reconciliation schedule,
 * and arranges for the process to stop without dropping what it is doing.
 *
 * It holds no business rule and never will. A mission runs here by being called
 * through domain code with an injected port (§3.3, §5.3), which is why the
 * generation worker takes an **executor per mission** and why composing them is
 * this file's job: an executor reaches a domain package and `@calepin/ai`, and
 * `@calepin/shared/queue` may reach neither.
 *
 * Since CAL-208 the map is no longer empty. `ANALYZE_SOURCE_TEXT` is registered
 * and really calls a model; every other mission is still absent, and absent
 * means **left alone** rather than failed — during a rolling release a job
 * written by the new version is routinely picked up by an old worker, and
 * failing an author's generation because this process has not been deployed yet
 * would be the wrong answer. The row stays `QUEUED` for a worker that knows it.
 *
 * The same map goes to all three generation workers even though `MISSION_QUEUE`
 * sends this one mission to `generation-slow`. Routing is that table's decision,
 * not this file's, and a per-queue map here would be a second answer able to
 * disagree with it.
 *
 * **Two connections, not one.** The consumer blocks and must never give up on a
 * command (`maxRetriesPerRequest: null`); the producer must fail fast so the
 * reconciliation sweep can report a refused enqueue and try again next minute
 * rather than hang. The worker is a producer now because the sweep enqueues.
 *
 * Every import after the environment is dynamic — see `./environment`.
 */

// Type-only, so it is erased and the dynamic-import discipline above holds —
// `environment.ts` imports `Env` the same way and for the same reason.
import type { GenerationExecutors } from "@calepin/shared/queue";

import { loadEnv } from "./environment";

async function main(): Promise<void> {
  const env = await loadEnv();

  const { configureLogger, logger } = await import("@calepin/shared/logging");
  const {
    CLEAN_QUEUES_JOB,
    cleanQueues,
    closeProducers,
    configureQueueConnection,
    createGracefulShutdown,
    createQueueConnection,
    defineJob,
    GENERATION_AUDIT_JOB,
    GENERATION_FAST_JOB,
    GENERATION_SLOW_JOB,
    handlePing,
    installSignalHandlers,
    PING_JOB,
    RECONCILE_GENERATIONS_JOB,
    reconcileGenerations,
    runGenerationJob,
    scheduleGenerationReconciliation,
    scheduleQueueCleanup,
    startQueueWorker,
  } = await import("@calepin/shared/queue");
  const { createAnalyzeSourceTextExecutor } = await import("@calepin/analysis/generation");
  const { disconnectDatabase } = await import("./database");
  const { createWorkerModelProvider } = await import("./model-provider");

  configureLogger({ level: env.LOG_LEVEL });

  // One port for the process: provider health is the one thing `@calepin/ai`
  // keeps between calls, and two ports would learn the same outage twice.
  const modelProvider = createWorkerModelProvider(env);

  // Which missions this worker can run. Keyed by the Prisma enum member, which
  // is what `runGenerationJob` looks a generation's mission up by; the typed
  // map is what turns a misspelling into a compile error rather than a mission
  // silently left unhandled.
  const executors: GenerationExecutors = {
    ANALYZE_SOURCE_TEXT: createAnalyzeSourceTextExecutor(modelProvider),
  };

  // One consumer connection for every worker in the process: BullMQ duplicates
  // it internally for the blocking reads each one needs.
  const consumer = createQueueConnection({ url: env.REDIS_URL, role: "consumer" });
  const producer = configureQueueConnection(
    createQueueConnection({ url: env.REDIS_URL, role: "producer" }),
  );

  // The per-user and per-project caps (CAL-065) are enforced at the claim,
  // not here — these are only the process-level ceilings on how many
  // generation jobs run at once, which have to sit above those caps or they
  // would never bind at all. One worker per generation queue (CAL-066): a
  // BullMQ `Worker` takes a queue, not a job name, and each queue's own
  // concurrency is what keeps a long `generation-slow` call from starving a
  // short `generation-fast` one — they run on entirely separate workers.
  const workers = [
    startQueueWorker({
      queue: GENERATION_FAST_JOB.queue,
      connection: consumer,
      concurrency: env.GENERATION_FAST_WORKER_CONCURRENCY,
      jobs: [
        defineJob(GENERATION_FAST_JOB, (payload) =>
          runGenerationJob({
            generationId: payload.generationId,
            executors,
          }),
        ),
      ],
    }),
    startQueueWorker({
      queue: GENERATION_SLOW_JOB.queue,
      connection: consumer,
      concurrency: env.GENERATION_SLOW_WORKER_CONCURRENCY,
      jobs: [
        defineJob(GENERATION_SLOW_JOB, (payload) =>
          runGenerationJob({
            generationId: payload.generationId,
            executors,
          }),
        ),
      ],
    }),
    startQueueWorker({
      queue: GENERATION_AUDIT_JOB.queue,
      connection: consumer,
      concurrency: env.GENERATION_AUDIT_WORKER_CONCURRENCY,
      jobs: [
        defineJob(GENERATION_AUDIT_JOB, (payload) =>
          runGenerationJob({
            generationId: payload.generationId,
            executors,
          }),
        ),
      ],
    }),
    // One worker for the whole `maintenance` queue, holding both its job kinds.
    // Two workers would consume each other's jobs — a BullMQ `Worker` takes a
    // queue, not a job name.
    startQueueWorker({
      queue: PING_JOB.queue,
      connection: consumer,
      jobs: [
        defineJob(PING_JOB, (payload) => handlePing(payload)),
        defineJob(RECONCILE_GENERATIONS_JOB, () => reconcileGenerations()),
        defineJob(CLEAN_QUEUES_JOB, () =>
          cleanQueues({
            completedJobTtlMs: env.QUEUE_CLEANUP_COMPLETED_JOB_TTL_MS,
            failedJobTtlMs: env.QUEUE_CLEANUP_FAILED_JOB_TTL_MS,
          }),
        ),
      ],
    }),
  ];

  // An upsert, so a fleet of workers converges on one schedule instead of one
  // each. A failure here must not stop the process: the workers are already
  // consuming, and every other delivery path still works — what is lost is the
  // recovery of generations nothing is holding, which the next start restores.
  try {
    await scheduleGenerationReconciliation();
  } catch (error: unknown) {
    const { errorLogFields } = await import("@calepin/shared/errors");
    logger.error("worker.reconciliation-not-scheduled", errorLogFields(error));
  }

  // Same reasoning, for the cleanup sweep: a failure here leaves finished jobs
  // to accumulate in Redis, not a generation unrecovered — worth logging and
  // nothing more.
  try {
    await scheduleQueueCleanup();
  } catch (error: unknown) {
    const { errorLogFields } = await import("@calepin/shared/errors");
    logger.error("worker.cleanup-not-scheduled", errorLogFields(error));
  }

  const shutdown = createGracefulShutdown({
    // Graceful: stops fetching, waits for the active jobs, keeps their locks.
    stop: async () => {
      await Promise.all(workers.map((worker) => worker.close()));
    },
    // Forced: only ever reached on a second signal or past the grace period.
    forceStop: async () => {
      await Promise.all(workers.map((worker) => worker.close(true)));
    },
    release: async () => {
      await closeProducers();
      await disconnectDatabase();
      await Promise.all([consumer.quit(), producer.quit()]);
    },
  });

  installSignalHandlers({
    handle: shutdown,
    target: process,
    exit: (code) => {
      // A graceful stop lets the event loop drain: every connection is closed
      // by `release`, so the process ends on its own and nothing in flight is
      // cut off mid-write. Only a forced stop is worth killing.
      process.exitCode = code;

      if (code !== 0) {
        process.exit(code);
      }
    },
  });

  logger.info("worker.started");

  await shutdown.finished;

  // Whether it was graceful or forced is already in the log: the shutdown
  // module writes `worker.shutdown-forced` on the path that was not.
  logger.info("worker.stopped");
}

await main();
