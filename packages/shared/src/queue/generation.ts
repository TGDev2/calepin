/**
 * A `Generation` row, driven by the queue (CAL-061).
 *
 * The rule the whole task turns on: **the row is the truth and the job is a
 * hint.** A job says "somebody should look at this generation"; everything that
 * is *true* about it — queued, running, succeeded, failed, cancelled, which
 * attempt, what it cost — is a statement in PostgreSQL. Nothing here needs Redis
 * to have behaved, which is what makes a lost job, a duplicated job and a killed
 * worker three flavours of latency rather than three flavours of corruption.
 *
 * Four consequences, and each is a line of code rather than a habit:
 *
 * - **The payload is one identifier.** Mission, target, owner and replay payload
 *   are read from the row. A payload that carried them could be stale, and the
 *   replay payload may hold the author's own instruction — which §9 keeps out of
 *   Redis, where it would land in every queue inspector and stalled-job dump.
 * - **The job id *is* the generation id.** A second enqueue of the same ask is
 *   dropped by Redis instead of running twice, and the account-deletion
 *   cancellation can name a job without a column to store one in.
 * - **The claim is the only arbiter.** This runner does not decide whether work
 *   is owed; it asks, and `claimGenerationAttempt` answers under the row's own
 *   lock. A redelivery costs one `SELECT`.
 * - **A mission with no executor leaves the row alone.** During a rolling
 *   release a job written by the new version is routinely picked up by an old
 *   worker. Failing the author's generation because *this* process has not been
 *   deployed yet would be the wrong answer; the row stays `QUEUED` and waits for
 *   a worker that knows the mission. Nothing is spent while it waits.
 *
 * Server-side only.
 */

import type { $Enums } from "@prisma/client";
import { z } from "zod";

import { runWithActor } from "../audit";
import { type Result, succeed } from "../errors";
import {
  type AttemptUsage,
  type GenerationClaim,
  type GenerationPersistence,
  runGenerationAttempt,
} from "../generation";
import { type Logger, logger as processLogger } from "../logging";
import {
  type AttemptLeaseRenewal,
  createGenerationPersistence,
  openProjectScope,
  type ProjectScope,
  readGenerationForRun,
  renewGenerationAttemptLease,
  type TransactionClient,
} from "../repository";
import type { JobContract } from "./jobs";
import { type EnqueuedJob, enqueueJob } from "./producer";
import { GENERATION_JOB_OPTIONS, GENERATION_LEASE_MS, GENERATION_LEASE_RENEWAL_MS } from "./queues";

/** The mission enum, under this module's own name — see `../repository`. */
export type GenerationMission = $Enums.GenerationMission;

/**
 * What one delivery came to, from the *queue's* point of view.
 *
 * `failed` is a job that worked: it ran an attempt, the attempt failed, and the
 * row records why. Conflating that with a broken job is exactly the confusion
 * this task exists to remove — the health of the transport and the outcome of a
 * generation are two different questions, answered in two different places.
 */
export const GENERATION_JOB_OUTCOMES = ["produced", "skipped", "failed", "vanished"] as const;

export type GenerationJobOutcome = (typeof GENERATION_JOB_OUTCOMES)[number];

export const generationJobPayloadSchema = z.object({
  generationId: z.string().min(1),
});

export type GenerationJobPayload = z.infer<typeof generationJobPayloadSchema>;

export const generationJobResultSchema = z.object({
  generationId: z.string().min(1),
  outcome: z.enum(GENERATION_JOB_OUTCOMES),
  /** The attempt this delivery opened, when it opened one. */
  attempt: z.number().int().positive().optional(),
});

export type GenerationJobResult = z.infer<typeof generationJobResultSchema>;

export const GENERATION_JOB: JobContract<GenerationJobPayload, GenerationJobResult> = {
  queue: "generation",
  name: "run-generation",
  payload: generationJobPayloadSchema,
  result: generationJobResultSchema,
};

/**
 * Hands a generation to the queue.
 *
 * Safe to call on a generation that already has a job: the id makes the second
 * one a duplicate Redis drops. That is what lets both the producer of the ask
 * and the reconciliation sweep call it without either having to know what the
 * other did.
 */
export function enqueueGeneration(generationId: string): Promise<Result<EnqueuedJob>> {
  return enqueueJob(
    GENERATION_JOB,
    { generationId },
    { jobId: generationId, ...GENERATION_JOB_OPTIONS },
  );
}

/** What the executor is told about the generation it is running. */
export interface GenerationExecutorRequest {
  readonly scope: ProjectScope;
  readonly generationId: string;
  readonly mission: GenerationMission;
  readonly targetId: string | null;
  /**
   * The replay payload, as it was reserved. `unknown`, so the executor parses it
   * rather than trusting a shape a previous release may have written (§6).
   */
  readonly input: unknown;
}

/**
 * What a mission produced, ready to be written by the transaction that completes
 * the generation.
 *
 * The value itself never leaves the executor — it hands back the *write* instead,
 * as a closure. That is what keeps §7's "succeed is a single atomic operation"
 * true without this module knowing what a revision is (§5.7).
 */
export interface GenerationProduct {
  readonly append?: (client: TransactionClient) => Promise<Result<void>>;
}

export interface GenerationExecutor {
  /**
   * The model the mission routes to. Known before the call because the attempt
   * row is written before it (CAL-058); `completeGenerationAttempt` overwrites
   * it with whatever actually served, which a provider failover changes.
   */
  readonly model: string;
  /** The prompt version about to run (CAL-053), recorded by the claim. */
  readonly promptVersion?: number;
  /**
   * The model call and the validation of its answer. Never persists, and calls
   * `report` as soon as a provider has reported usage — on the way to a failure
   * as much as on the way to an answer.
   */
  produce(
    request: GenerationExecutorRequest,
    report: (usage: AttemptUsage) => void,
  ): Promise<Result<GenerationProduct>>;
}

/**
 * Which missions this process can run. Composed by the process shell, because
 * an executor reaches both a domain package and `@calepin/ai` and this module
 * may reach neither (§3.2).
 */
export type GenerationExecutors = Partial<Record<GenerationMission, GenerationExecutor>>;

/**
 * What a process composes when it runs no mission at all — every worker today.
 *
 * Empty rather than absent, and it behaves like `unavailableQueueCancellation`
 * one layer over: a generation whose mission is not here is left queued and said
 * out loud, never quietly reported as done.
 */
export const NO_GENERATION_EXECUTORS: GenerationExecutors = {};

export interface RunGenerationJobOptions {
  readonly generationId: string;
  readonly executors: GenerationExecutors;
  readonly leaseMs?: number;
  /** Non-positive disables renewal — which is what a crashed worker looks like. */
  readonly leaseRenewalMs?: number;
  readonly logger?: Logger;
  /** Injected clock (§8). */
  readonly now?: () => Date;
}

/**
 * Runs one generation, whatever state it is really in.
 *
 * Deliberately does **not** short-circuit on the status it just read: a settled
 * generation is refused by the claim, under the row's own lock, and having one
 * arbiter instead of two is worth the transaction. The read is for the owner and
 * the mission; the decision is the database's.
 */
export async function runGenerationJob(
  options: RunGenerationJobOptions,
): Promise<GenerationJobResult> {
  const {
    generationId,
    executors,
    leaseMs = GENERATION_LEASE_MS,
    leaseRenewalMs = GENERATION_LEASE_RENEWAL_MS,
    logger = processLogger,
    now = () => new Date(),
  } = options;

  const target = await readGenerationForRun(generationId);

  if (target === null) {
    // The row is gone — an account deleted while its job was still in the queue.
    // Nothing to generate and nothing to record it against, so the job is done.
    logger.info("generation.row-vanished", { generationId });

    return { generationId, outcome: "vanished" };
  }

  const executor = executors[target.mission];

  if (executor === undefined) {
    logger.error("generation.mission-unhandled", {
      generationId,
      projectId: target.projectId,
      missionId: target.mission,
      errorCode: "JOB_NOT_HANDLED",
      errorCategory: "internal",
    });

    // A throw, so the delivery fails and is visible. The **row is left where it
    // is**: `QUEUED`, with no attempt, for a worker that knows this mission. The
    // sweep will offer it again, and its attempt ceiling never closes a
    // generation that has never been tried.
    throw new Error("no executor is registered for this generation's mission");
  }

  const opened = await openProjectScope({
    ownerId: target.ownerId,
    projectId: target.projectId,
  });

  if (!opened.ok) {
    // The project disappeared between the two reads. Same answer as a missing
    // row, for the same reason.
    logger.info("generation.row-vanished", { generationId, projectId: target.projectId });

    return { generationId, outcome: "vanished" };
  }

  const scope = opened.value;
  const request: GenerationExecutorRequest = {
    scope,
    generationId,
    mission: target.mission,
    targetId: target.targetId,
    input: target.input,
  };

  const persistence = createGenerationPersistence<GenerationProduct>(scope, {
    generationId,
    model: executor.model,
    leaseMs,
    now,
    append: (client, product) => product.append?.(client) ?? Promise.resolve(succeed(undefined)),
  });

  let renewal: AttemptLeaseRenewalHandle | undefined;

  // The renewal can only start once the claim has allocated an attempt number,
  // and the claim happens inside `runGenerationAttempt`. Wrapping the port is
  // how the runner learns the number without the port having to hand it out.
  const persist: GenerationPersistence<GenerationProduct> = {
    async claim(context): Promise<GenerationClaim> {
      const claim = await persistence.claim(context);

      if (claim.kind === "claimed" && leaseRenewalMs > 0) {
        const attempt = claim.attempt;

        renewal = startAttemptLeaseRenewal({
          generationId,
          attempt,
          intervalMs: leaseRenewalMs,
          logger,
          renew: () =>
            renewGenerationAttemptLease(scope, { generationId, attempt, leaseMs, now: now() }),
        });
      }

      return claim;
    },
    succeed: (value, outcome) => persistence.succeed(value, outcome),
    fail: (outcome) => persistence.fail(outcome),
  };

  try {
    const run = await runWithActor(target.ownerId, async () =>
      runGenerationAttempt<GenerationProduct>({
        generationId,
        promptVersion: executor.promptVersion,
        persist,
        produce: (report) => executor.produce(request, report),
        now: () => now().getTime(),
      }),
    );

    if (!run.ok) {
      // The attempt failed and the row says so, with its code and its category.
      // The job did what it was asked; the failure is the generation's, which is
      // where a reader will look for it.
      logger.warn("generation.attempt-failed", {
        generationId,
        projectId: target.projectId,
        missionId: target.mission,
        errorCode: run.error.code,
        errorCategory: run.error.category,
      });

      return { generationId, outcome: "failed" };
    }

    if (run.value.kind === "skipped") {
      return { generationId, outcome: "skipped", attempt: run.value.attempt };
    }

    return { generationId, outcome: "produced", attempt: run.value.attempt };
  } finally {
    renewal?.stop();
  }
}

export interface AttemptLeaseRenewalHandle {
  stop(): void;
}

export interface StartAttemptLeaseRenewalOptions {
  readonly generationId: string;
  readonly attempt: number;
  readonly intervalMs: number;
  /**
   * One renewal. Injected rather than built here so the loop — the part with
   * the timer, the overlap guard and the stop condition — can be tested without
   * a database (§8).
   */
  readonly renew: () => Promise<Result<AttemptLeaseRenewal>>;
  readonly logger?: Logger;
}

/**
 * Keeps pushing an attempt's lease back until it is told to stop.
 *
 * Three things it must not do, and each is one line here. It must not let a slow
 * database stack renewals on top of each other (`renewing`). It must not throw
 * out of a timer, which in Node is an unhandled rejection and a dead process
 * (the `catch`). And it must not keep renewing an attempt somebody else has
 * taken over: a renewal that moves no row means the lease is gone, and going on
 * would be this worker insisting on a claim it no longer holds.
 */
export function startAttemptLeaseRenewal(
  options: StartAttemptLeaseRenewalOptions,
): AttemptLeaseRenewalHandle {
  const { generationId, attempt, intervalMs, renew, logger = processLogger } = options;

  let stopped = false;
  let renewing = false;

  const timer = setInterval(() => {
    if (stopped || renewing) return;

    renewing = true;

    void renew()
      .then((renewed) => {
        if (renewed.ok && renewed.value === "lost") {
          // Reclaimed under us. The answer this attempt is still computing will
          // be dropped by `completeGenerationAttempt` as `already-completed`.
          logger.warn("generation.lease-lost", { generationId, attempt });
          stop();
        }
      })
      .catch((error: unknown) => {
        // A blip on the way to the database is not a reason to give up the
        // lease: the next tick is 30 s away and the lease outlasts several.
        logger.warn("generation.lease-renewal-failed", {
          generationId,
          attempt,
          errorName: error instanceof Error ? error.name : "unknown",
        });
      })
      .finally(() => {
        renewing = false;
      });
  }, intervalMs);

  // A pending renewal must not be the reason the process stays alive.
  timer.unref?.();

  function stop(): void {
    if (stopped) return;

    stopped = true;
    clearInterval(timer);
  }

  return { stop };
}
