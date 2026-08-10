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
 * through domain code with an injected port (§3.3, §5.3) — which is why the
 * generation worker takes an **executor per mission** and this shell composes
 * `NO_GENERATION_EXECUTORS`: no mission runs asynchronously yet, and a
 * generation whose mission is not registered is left queued for a worker that
 * has it rather than failed. Registering the first one is a line here and
 * nothing else.
 *
 * **Two connections, not one.** The consumer blocks and must never give up on a
 * command (`maxRetriesPerRequest: null`); the producer must fail fast so the
 * reconciliation sweep can report a refused enqueue and try again next minute
 * rather than hang. The worker is a producer now because the sweep enqueues.
 *
 * Every import after the environment is dynamic — see `./environment`.
 */

import { loadEnv } from "./environment";

async function main(): Promise<void> {
  const env = await loadEnv();

  const { configureLogger, logger } = await import("@calepin/shared/logging");
  const {
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
    NO_GENERATION_EXECUTORS,
    PING_JOB,
    RECONCILE_GENERATIONS_JOB,
    reconcileGenerations,
    runGenerationJob,
    scheduleGenerationReconciliation,
    startQueueWorker,
  } = await import("@calepin/shared/queue");
  const { disconnectDatabase } = await import("./database");

  configureLogger({ level: env.LOG_LEVEL });

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
            executors: NO_GENERATION_EXECUTORS,
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
            executors: NO_GENERATION_EXECUTORS,
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
            executors: NO_GENERATION_EXECUTORS,
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
