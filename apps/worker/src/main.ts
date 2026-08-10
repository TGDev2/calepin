/**
 * The worker process (CAL-060) — `pnpm worker`.
 *
 * ADR-001: *`apps/worker` is a plain long-lived Node process consuming BullMQ
 * queues. It serves no HTTP.* This file is the whole of the shell: it reads the
 * environment, configures the logger, registers the database client, opens one
 * consumer connection, starts the workers, and arranges for the process to stop
 * without dropping what it is doing.
 *
 * It holds no business rule and never will. A mission runs here by being called
 * through domain code with an injected port (§3.3, §5.3); the day CAL-061 adds
 * the generation queue, what changes in this file is one more
 * `startQueueWorker` call.
 *
 * Every import after the environment is dynamic — see `./environment`.
 */

import { loadEnv } from "./environment";

async function main(): Promise<void> {
  const env = await loadEnv();

  const { configureLogger, logger } = await import("@calepin/shared/logging");
  const {
    createGracefulShutdown,
    createQueueConnection,
    handlePing,
    installSignalHandlers,
    PING_JOB,
    startQueueWorker,
  } = await import("@calepin/shared/queue");
  const { disconnectDatabase } = await import("./database");

  configureLogger({ level: env.LOG_LEVEL });

  // One connection for every worker in the process: BullMQ duplicates it
  // internally for the blocking reads each one needs.
  const connection = createQueueConnection({ url: env.REDIS_URL, role: "consumer" });

  const workers = [
    startQueueWorker({ contract: PING_JOB, connection, handle: (payload) => handlePing(payload) }),
  ];

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
      await disconnectDatabase();
      await connection.quit();
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
