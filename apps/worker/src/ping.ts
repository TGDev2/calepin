/**
 * Produces one dummy job and exits — `pnpm worker:ping` (CAL-060).
 *
 * CAL-060 is finished when a dummy task is *produced, consumed and traced*, and
 * a test that produces it proves the code rather than the deployment. This is
 * the producer a person can run: start `pnpm dev:services`, start `pnpm
 * worker`, run this, and the two processes' logs show the same job id crossing
 * Redis between them.
 *
 * It also survives the task as the smallest possible liveness check — a `ping`
 * that never completes says the transport is down and says nothing about the
 * database, a provider or a project.
 */

import { randomUUID } from "node:crypto";

import { loadEnv } from "./environment";

async function main(): Promise<void> {
  const env = await loadEnv();

  const { configureLogger, logger } = await import("@calepin/shared/logging");
  const { closeProducers, configureQueueConnection, createQueueConnection, enqueueJob, PING_JOB } =
    await import("@calepin/shared/queue");

  configureLogger({ level: env.LOG_LEVEL });

  const connection = configureQueueConnection(
    createQueueConnection({ url: env.REDIS_URL, role: "producer" }),
  );

  try {
    const enqueued = await enqueueJob(PING_JOB, { token: randomUUID(), issuedAt: Date.now() });

    if (!enqueued.ok) {
      logger.error("queue.ping-refused", {
        errorCode: enqueued.error.code,
        errorCategory: enqueued.error.category,
      });
      process.exitCode = 1;

      return;
    }

    logger.info("queue.ping-enqueued", {
      jobId: enqueued.value.id,
      queueName: enqueued.value.queueName,
      jobName: enqueued.value.jobName,
    });
  } finally {
    await closeProducers();
    await connection.quit();
  }
}

await main();
