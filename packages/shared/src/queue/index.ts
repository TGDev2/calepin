/**
 * `@calepin/shared/queue` — the asynchronous transport (CAL-060).
 *
 * ADR-001 makes two long-lived processes over the same packages the shape of
 * this system: `apps/web` enqueues, `apps/worker` consumes, and neither holds
 * authoritative state in memory. This module is the seam between them — the
 * Redis connection, the declared queues, the job contracts both sides agree on,
 * and the shutdown that lets the consumer be replaced without losing work.
 *
 * It is a separate entry point from the rest of `@calepin/shared` for the same
 * reason `./database` is: what the interface layer may import (`enqueueJob`) is
 * not what only a process shell may touch (`createQueueConnection`), and a
 * separate specifier is what lets lint tell them apart.
 *
 * Server-side only.
 */

export type { CreateQueueCancellationOptions } from "./cancellation";
export { createQueueCancellation } from "./cancellation";
export type { CreateQueueConnectionOptions, QueueConnectionRole } from "./connection";
export {
  configureQueueConnection,
  createQueueConnection,
  getQueueConnection,
  PRODUCER_MAX_RETRIES_PER_REQUEST,
  QUEUE_CONNECTION_ROLES,
  queueConnectionOptions,
  resetQueueConnection,
} from "./connection";
export type { JobOutcome, RegisteredJob, StartQueueWorkerOptions } from "./consumer";
export { defineJob, startQueueWorker } from "./consumer";
export type {
  AttemptLeaseRenewalHandle,
  GenerationExecutor,
  GenerationExecutorRequest,
  GenerationExecutors,
  GenerationJobOutcome,
  GenerationJobPayload,
  GenerationJobResult,
  GenerationProduct,
  RunGenerationJobOptions,
  StartAttemptLeaseRenewalOptions,
} from "./generation";
export {
  enqueueGeneration,
  GENERATION_JOB,
  GENERATION_JOB_OUTCOMES,
  generationJobPayloadSchema,
  generationJobResultSchema,
  NO_GENERATION_EXECUTORS,
  runGenerationJob,
  startAttemptLeaseRenewal,
} from "./generation";
export type { JobContract, JobPayload, JobResult, PingPayload, PingResult } from "./jobs";
export { handlePing, PING_JOB, pingPayloadSchema, pingResultSchema } from "./jobs";
export type { EnqueuedJob } from "./producer";
export { closeProducers, enqueueJob, getQueue } from "./producer";
export type { QueueName } from "./queues";
export {
  DEFAULT_JOB_OPTIONS,
  DEFAULT_WORKER_CONCURRENCY,
  GENERATION_JOB_OPTIONS,
  GENERATION_LEASE_MS,
  GENERATION_LEASE_RENEWAL_MS,
  GENERATION_STALE_AFTER_MS,
  isQueueName,
  MAX_GENERATION_ATTEMPTS,
  QUEUE_NAMES,
  QUEUE_PREFIX,
  RECONCILIATION_BATCH_SIZE,
  RECONCILIATION_INTERVAL_MS,
} from "./queues";
export type {
  ReconcileGenerationsOptions,
  ReconcileGenerationsPayload,
  ReconcileGenerationsResult,
  ScheduleGenerationReconciliationOptions,
} from "./reconciliation";
export {
  GENERATION_RECONCILIATION_SCHEDULER,
  RECONCILE_GENERATIONS_JOB,
  reconcileGenerations,
  reconcileGenerationsPayloadSchema,
  reconcileGenerationsResultSchema,
  scheduleGenerationReconciliation,
  unscheduleGenerationReconciliation,
} from "./reconciliation";
export type {
  GracefulShutdownOptions,
  InstallSignalHandlersOptions,
  ShutdownHandle,
  ShutdownOutcome,
  ShutdownSignal,
  SignalTarget,
} from "./shutdown";
export {
  createGracefulShutdown,
  DEFAULT_SHUTDOWN_GRACE_MS,
  installSignalHandlers,
  SHUTDOWN_SIGNALS,
} from "./shutdown";
