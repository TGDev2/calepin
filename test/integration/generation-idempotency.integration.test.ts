/**
 * CAL-058's acceptance criterion, against a real PostgreSQL: **replaying a
 * failed generation does not increment the accounted cost twice.**
 *
 * The three things the task says to take into account are not mocked here, they
 * are performed. A **queue retry** is the same ask delivered twice and the same
 * completion delivered twice. A **worker restart mid-generation** is a claim
 * whose lease is left in the past and a second claim afterwards — the state a
 * killed process really leaves behind, written by the real claim rather than by
 * hand. A **provider failover** is the real `@calepin/ai` port over two real
 * adapters on simulated clients (§8), with the primary endpoint dropping every
 * answer, driven through the real `runGenerationAttempt` into the real
 * repository.
 *
 * The oracle is `readProjectCostSummary` — the query the product actually bills
 * from (CAL-056) — rather than a count of rows. What matters is not that the
 * table looks tidy; it is that the number an author is shown does not move when
 * only the system failed.
 *
 * Every fixture value is technical (§9): identifiers, counts, tokens, model
 * names. Nothing here needs prose.
 */

import {
  createAnthropicAdapter,
  createBedrockAdapter,
  createModelProviderPort,
  createProviderHealth,
  estimateCostUsd,
  type ProseGenerationResult,
  type Scheduler,
} from "@calepin/ai";
import { answer, droppedMidAnswer, fixedPrompt, simulatedClient, text } from "@calepin/ai/testing";
import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { type Result, succeed } from "@calepin/shared/errors";
import {
  generationIdempotencyKey,
  type GenerationRun,
  runGenerationAttempt,
} from "@calepin/shared/generation";
import { createLogger } from "@calepin/shared/logging";
import {
  claimGenerationAttempt,
  completeGenerationAttempt,
  createGenerationPersistence,
  openProjectScope,
  type ProjectScope,
  readProjectCostSummary,
  replayGeneration,
  reserveGeneration,
  updateGenerationProgress,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const MODEL = "claude-opus-5";

/** What one call reported. Two of them differ, so a double count is visible. */
const FIRST_CALL = { model: MODEL, inputTokens: 1_000, outputTokens: 200 };
const SECOND_CALL = { model: MODEL, inputTokens: 3_000, outputTokens: 700 };

function usageOf(call: typeof FIRST_CALL) {
  return { ...call, estimatedCostUsd: estimateCostUsd(MODEL, call) };
}

/** Virtual time: a backoff fires at once, a mission deadline never does. */
function virtualScheduler(): Scheduler {
  return {
    now: () => 0,
    setTimeout: (callback, delayMs) =>
      delayMs >= 60_000 ? undefined : globalThis.setTimeout(callback, 0),
    clearTimeout: (handle) => {
      if (handle !== undefined) {
        globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
      }
    },
  };
}

describe("generation idempotency (CAL-058)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();
  let sequence = 0;

  beforeAll(() => {
    configureDatabaseClient(seam);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  /** One owner, one project, one open scope. */
  async function createFixture(): Promise<{ ownerId: string; scope: ProjectScope }> {
    sequence += 1;
    const user = await prisma.user.create({
      data: { email: `idempotency-${sequence}@example.test` },
    });
    setActor(user.id);
    const project = await prisma.project.create({
      data: { userId: user.id, title: `idempotency-${sequence}` },
    });

    const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");

    return { ownerId: user.id, scope: opened.value };
  }

  /** The accounted cost, as the product reads it. */
  async function accountedCost(scope: ProjectScope): Promise<string> {
    const summary = await readProjectCostSummary(scope);
    if (!summary.ok) throw new Error("the owner's own cost summary was refused");

    return summary.value.estimatedCostUsd;
  }

  describe("the key", () => {
    it("gives one ask one generation, however many times it is delivered", async () => {
      const { ownerId, scope } = await createFixture();
      const ask = {
        mission: "WRITE_SCENE",
        targetId: "chapter-1",
        input: { baseRevisionId: "rev_1", targetWordCount: 1200 },
      } as const;

      const first = await runWithActor(ownerId, async () => reserveGeneration(scope, ask));
      // The same payload built in another order, as a second call site would.
      const second = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, {
          ...ask,
          input: { targetWordCount: 1200, baseRevisionId: "rev_1" },
        }),
      );

      if (!first.ok || !second.ok) throw new Error("a reservation was refused");

      expect(first.value.created).toBe(true);
      expect(second.value.created).toBe(false);
      expect(second.value.id).toBe(first.value.id);
      expect(first.value.idempotencyKey).toBe(
        generationIdempotencyKey({ ...ask, projectId: scope.projectId }),
      );
      expect(await prisma.generation.count({ where: { projectId: scope.projectId } })).toBe(1);
    });

    it("gives a genuinely different ask its own generation", async () => {
      const { ownerId, scope } = await createFixture();
      const base = { mission: "WRITE_SCENE", targetId: "chapter-1" } as const;

      // A regeneration names the revision it starts from, and that revision
      // moved — which is what makes it a second ask rather than a redelivery.
      const first = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { ...base, input: { baseRevisionId: "rev_1" } }),
      );
      const second = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { ...base, input: { baseRevisionId: "rev_2" } }),
      );

      if (!first.ok || !second.ok) throw new Error("a reservation was refused");

      expect(second.value.created).toBe(true);
      expect(second.value.id).not.toBe(first.value.id);
    });

    it("is refused for a project that is not the scope owner's", async () => {
      const mine = await createFixture();
      const theirs = await createFixture();
      const forged = { ...mine.scope, projectId: theirs.scope.projectId } as ProjectScope;

      const refused = await runWithActor(mine.ownerId, async () =>
        reserveGeneration(forged, { mission: "WRITE_SCENE", input: {} }),
      );

      expect(refused.ok).toBe(false);
      expect(refused.ok ? undefined : refused.error.code).toBe("NOT_FOUND");
      expect(await prisma.generation.count({ where: { projectId: theirs.scope.projectId } })).toBe(
        0,
      );
    });
  });

  // The three guarantees above are the database's, not a caller's care. Each of
  // these writes the row a careless call site would write, directly.
  describe("what the schema refuses", () => {
    it("refuses a second generation carrying one project's key twice", async () => {
      const { scope } = await createFixture();
      const row = {
        projectId: scope.projectId,
        mission: "WRITE_SCENE" as const,
        input: {},
        idempotencyKey: generationIdempotencyKey({
          mission: "WRITE_SCENE",
          projectId: scope.projectId,
          input: {},
        }),
      };

      await prisma.generation.create({ data: row });

      await expect(prisma.generation.create({ data: row })).rejects.toMatchObject({
        code: "P2002",
        meta: { target: ["projectId", "idempotencyKey"] },
      });
    });

    it("refuses a key that is not a digest", async () => {
      const { scope } = await createFixture();

      // §9: the payload may hold the author's own instruction, so a key built by
      // concatenating its parts would carry it into this index. The shape is
      // what stops that being merely a convention.
      await expect(
        prisma.generation.create({
          data: {
            projectId: scope.projectId,
            mission: "WRITE_SCENE",
            input: {},
            idempotencyKey: "WRITE_SCENE:chapter-1:rev_1",
          },
        }),
      ).rejects.toThrow(/generations_idempotency_key_check/);
    });

    it("refuses a running attempt with no lease, and a finished one that kept its", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "FIX_ISSUE", input: { issueId: "i1" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      await expect(
        prisma.generationAttempt.create({
          data: { generationId: reserved.value.id, attempt: 1, model: MODEL },
        }),
      ).rejects.toThrow(/generation_attempts_lease_check/);

      await expect(
        prisma.generationAttempt.create({
          data: {
            generationId: reserved.value.id,
            attempt: 1,
            model: MODEL,
            status: "SUCCEEDED",
            completedAt: new Date(),
            leaseExpiresAt: new Date(),
          },
        }),
      ).rejects.toThrow(/generation_attempts_lease_check/);
    });
  });

  describe("a queue that redelivers", () => {
    it("refuses a second claim while the first still holds its lease", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "EXTRACT_FACTS", input: { chapterId: "c1" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      const first = await claimGenerationAttempt(scope, {
        generationId: reserved.value.id,
        model: MODEL,
      });
      const second = await claimGenerationAttempt(scope, {
        generationId: reserved.value.id,
        model: MODEL,
      });

      expect(first.ok && first.value).toEqual({ kind: "claimed", attempt: 1 });
      expect(second.ok && second.value).toEqual({
        kind: "refused",
        reason: "in-flight",
        attempt: 1,
      });
      expect(
        await prisma.generationAttempt.count({ where: { generationId: reserved.value.id } }),
      ).toBe(1);
    });

    it("applies a completion once, and reports the redelivered one as already done", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "EXTRACT_FACTS", input: { chapterId: "c2" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      await claimGenerationAttempt(scope, { generationId: reserved.value.id, model: MODEL });

      const outcome = {
        generationId: reserved.value.id,
        attempt: 1,
        durationMs: 1_000,
        status: "succeeded" as const,
        retryable: false,
        usage: usageOf(FIRST_CALL),
      };

      const applied = await completeGenerationAttempt(scope, outcome);
      const redelivered = await completeGenerationAttempt(scope, outcome);

      expect(applied.ok && applied.value).toBe("applied");
      expect(redelivered.ok && redelivered.value).toBe("already-completed");

      // The whole criterion, in one number: the second delivery changed nothing.
      expect(await accountedCost(scope)).toBe(usageOf(FIRST_CALL).estimatedCostUsd);
    });

    it("asks no provider at all when the generation already succeeded", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "SUMMARIZE_CHAPTER", input: { chapterId: "c3" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      const persist = createGenerationPersistence<string>(scope, {
        generationId: reserved.value.id,
        model: MODEL,
      });

      let calls = 0;
      const run = async (): Promise<Result<GenerationRun<string>>> =>
        runGenerationAttempt({
          generationId: reserved.value.id,
          persist,
          produce: (report) => {
            calls += 1;
            report(usageOf(FIRST_CALL));

            return succeed("revision-token");
          },
        });

      const first = await run();
      const redelivery = await run();

      expect(first.ok && first.value).toMatchObject({ kind: "produced", attempt: 1 });
      expect(redelivery.ok && redelivery.value).toEqual({
        kind: "skipped",
        reason: "already-succeeded",
      });
      // *Reprise sans réexécution*, at the granularity a mission call has.
      expect(calls).toBe(1);
      expect(await accountedCost(scope)).toBe(usageOf(FIRST_CALL).estimatedCostUsd);
    });
  });

  describe("a worker that restarts mid-generation", () => {
    it("reclaims the interrupted attempt without charging for it, and lets the next one run", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "WRITE_SCENE", input: { chapterId: "c4" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      // The worker claims, and dies. Nothing completes the attempt: the row is
      // left RUNNING, with usage nobody will ever be able to fill in.
      const held = new Date("2026-03-01T10:00:00.000Z");
      await claimGenerationAttempt(scope, {
        generationId: reserved.value.id,
        model: MODEL,
        leaseMs: 60_000,
        now: held,
      });

      // The queue redelivers, past the lease. This is the restart.
      const afterRestart = new Date(held.getTime() + 120_000);
      const retaken = await claimGenerationAttempt(scope, {
        generationId: reserved.value.id,
        model: MODEL,
        now: afterRestart,
      });

      expect(retaken.ok && retaken.value).toEqual({ kind: "claimed", attempt: 2 });

      const interrupted = await prisma.generationAttempt.findFirstOrThrow({
        where: { generationId: reserved.value.id, attempt: 1 },
      });
      expect(interrupted).toMatchObject({
        status: "FAILED",
        errorCode: "GENERATION_INTERRUPTED",
        errorCategory: "INTERNAL",
        leaseExpiresAt: null,
      });
      // The four columns that decide money, all null. Nobody can say what an
      // unfinished call consumed, so nothing was written where a number would
      // have been invented.
      expect(interrupted.inputTokens).toBeNull();
      expect(interrupted.outputTokens).toBeNull();
      expect(interrupted.estimatedCostUsd).toBeNull();
      expect(interrupted.durationMs).toBeNull();

      await completeGenerationAttempt(scope, {
        generationId: reserved.value.id,
        attempt: 2,
        durationMs: 2_000,
        status: "succeeded",
        retryable: false,
        usage: usageOf(SECOND_CALL),
      });

      // Two attempt rows, one price: the failure came from the system, so it is
      // the re-run that is charged and only the re-run.
      expect(
        await prisma.generationAttempt.count({ where: { generationId: reserved.value.id } }),
      ).toBe(2);
      expect(await accountedCost(scope)).toBe(usageOf(SECOND_CALL).estimatedCostUsd);
    });

    it("discards the answer of an attempt that was reclaimed under it", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "WRITE_SCENE", input: { chapterId: "c5" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      const persist = createGenerationPersistence<string>(scope, {
        generationId: reserved.value.id,
        model: MODEL,
        // Expired the instant it is taken: the slow call this stands for is one
        // that outlived its lease.
        leaseMs: 0,
      });

      const run = await runGenerationAttempt({
        generationId: reserved.value.id,
        persist,
        produce: async (report) => {
          // Another worker takes over while this one is still "calling".
          await claimGenerationAttempt(scope, {
            generationId: reserved.value.id,
            model: MODEL,
          });
          report(usageOf(FIRST_CALL));

          return succeed("revision-token");
        },
      });

      expect(run.ok && run.value).toEqual({ kind: "skipped", reason: "superseded", attempt: 1 });
      // The answer was thrown away rather than written beside the other
      // worker's, and its price was not recorded — an under-count, which is the
      // only direction the specification allows.
      expect(await accountedCost(scope)).toBe("0.000000");
    });
  });

  describe("replaying a failed generation", () => {
    it("adds what the replay spends and re-adds nothing", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "CHECK_COHERENCE", input: { chapterId: "c6" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      await claimGenerationAttempt(scope, { generationId: reserved.value.id, model: MODEL });
      await completeGenerationAttempt(scope, {
        generationId: reserved.value.id,
        attempt: 1,
        durationMs: 1_000,
        status: "failed",
        // Non-retryable: the generation closes, and only an explicit replay
        // reopens it.
        retryable: false,
        errorCode: "MODEL_OUTPUT_INVALID",
        errorCategory: "provider",
        usage: usageOf(FIRST_CALL),
      });

      const afterFailure = await accountedCost(scope);
      expect(afterFailure).toBe(usageOf(FIRST_CALL).estimatedCostUsd);

      // A closed generation is not claimable: a replay is a decision.
      const refused = await claimGenerationAttempt(scope, {
        generationId: reserved.value.id,
        model: MODEL,
      });
      expect(refused.ok && refused.value).toMatchObject({ reason: "already-failed" });

      const replayed = await replayGeneration(scope, reserved.value.id);
      expect(replayed.ok && replayed.value.status).toBe("QUEUED");

      const retaken = await claimGenerationAttempt(scope, {
        generationId: reserved.value.id,
        model: MODEL,
      });
      expect(retaken.ok && retaken.value).toEqual({ kind: "claimed", attempt: 2 });

      await completeGenerationAttempt(scope, {
        generationId: reserved.value.id,
        attempt: 2,
        durationMs: 2_000,
        status: "succeeded",
        retryable: false,
        usage: usageOf(SECOND_CALL),
      });

      // The criterion, literally: the first attempt's price is still there
      // exactly once, and the replay added its own and nothing else.
      const first = Number(usageOf(FIRST_CALL).estimatedCostUsd);
      const second = Number(usageOf(SECOND_CALL).estimatedCostUsd);
      expect(Number(await accountedCost(scope))).toBeCloseTo(first + second, 6);

      // One generation, two attempts. The replay never opened a second row.
      expect(await prisma.generation.count({ where: { projectId: scope.projectId } })).toBe(1);
    });

    it("returns a retryable failure to the queue instead of closing it", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "CHECK_COHERENCE", input: { chapterId: "c7" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      await claimGenerationAttempt(scope, { generationId: reserved.value.id, model: MODEL });
      await completeGenerationAttempt(scope, {
        generationId: reserved.value.id,
        attempt: 1,
        durationMs: 1_000,
        status: "failed",
        retryable: true,
        errorCode: "PROVIDER_UNAVAILABLE",
        errorCategory: "provider",
      });

      // §7: classify before retrying. A transient failure is the queue's to
      // redeliver, and the next delivery finds an attempt owed.
      const retaken = await claimGenerationAttempt(scope, {
        generationId: reserved.value.id,
        model: MODEL,
      });
      expect(retaken.ok && retaken.value).toEqual({ kind: "claimed", attempt: 2 });
    });

    it("refuses to replay a generation that succeeded", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "SUMMARIZE_PART", input: { partId: "p1" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      await claimGenerationAttempt(scope, { generationId: reserved.value.id, model: MODEL });
      await completeGenerationAttempt(scope, {
        generationId: reserved.value.id,
        attempt: 1,
        durationMs: 500,
        status: "succeeded",
        retryable: false,
        usage: usageOf(FIRST_CALL),
      });

      const refused = await replayGeneration(scope, reserved.value.id);

      expect(refused.ok).toBe(false);
      expect(refused.ok ? undefined : refused.error.code).toBe("CONFLICT");
    });
  });

  describe("a provider failover", () => {
    it("records one attempt, at the price of the endpoint that answered", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "WRITE_SCENE", input: { chapterId: "c8" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      const scheduler = virtualScheduler();
      const primary = simulatedClient(droppedMidAnswer);
      const backup = simulatedClient(() =>
        answer({
          model: "anthropic.claude-opus-5",
          content: [text("BACKUP ANSWER")],
          usage: { input_tokens: 31, output_tokens: 12 },
        }),
      );
      const port = createModelProviderPort({
        adapters: [
          createAnthropicAdapter({ client: primary.client }),
          createBedrockAdapter({ client: backup.client }),
        ],
        scheduler,
        health: createProviderHealth({ scheduler }),
        random: () => 0,
        log: createLogger({ level: "silent" }),
      });

      const persist = createGenerationPersistence<ProseGenerationResult>(scope, {
        generationId: reserved.value.id,
        model: MODEL,
      });

      const run = await runGenerationAttempt<ProseGenerationResult>({
        generationId: reserved.value.id,
        persist,
        produce: async (report) => {
          const result = await port.generateProse({ prompt: fixedPrompt("write-scene") });

          if (result.ok) {
            report({
              model: result.value.model,
              inputTokens: result.value.usage.inputTokens,
              outputTokens: result.value.usage.outputTokens,
              estimatedCostUsd: estimateCostUsd(result.value.model, result.value.usage),
            });
          }

          return result;
        },
      });

      expect(run.ok && run.value.kind).toBe("produced");

      // Four calls to two providers, one attempt row, one price. The switch is
      // invisible to the generation's bookkeeping — which is what stops it
      // being billed as two.
      const attempts = await prisma.generationAttempt.findMany({
        where: { generationId: reserved.value.id },
      });
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        attempt: 1,
        // The endpoint that served, not the mission's declared primary: the
        // cost has to be attributed to the tariff that applies.
        model: "anthropic.claude-opus-5",
        inputTokens: 31,
        outputTokens: 12,
        status: "SUCCEEDED",
      });
      expect(await accountedCost(scope)).toBe(
        estimateCostUsd("anthropic.claude-opus-5", { inputTokens: 31, outputTokens: 12 }),
      );
    });
  });

  describe("resuming an interrupted costly operation", () => {
    it("runs only the calls that had not completed", async () => {
      // A `write-chapter` operation is five mission calls (CAL-057). The worker
      // dies after three. What "reprise sans réexécution de la partie déjà
      // aboutie" means concretely is that the resume re-reserves all five,
      // recognises the three already there, and calls a provider twice.
      const { ownerId, scope } = await createFixture();
      const chapterId = "c9";
      const phases = [
        { mission: "WRITE_SCENE", input: { chapterId, baseRevisionId: "rev_1" } },
        { mission: "EXTRACT_FACTS", input: { chapterId, baseRevisionId: "rev_1" } },
        { mission: "CHECK_COHERENCE", input: { chapterId, baseRevisionId: "rev_1" } },
        { mission: "SUMMARIZE_CHAPTER", input: { chapterId, baseRevisionId: "rev_1" } },
        { mission: "SUMMARIZE_PART", input: { partId: "p1", through: chapterId } },
      ] as const;

      let calls = 0;

      /** One pass over the bundle, stopping after `upTo` calls. */
      async function runOperation(upTo: number): Promise<void> {
        for (const [index, phase] of phases.entries()) {
          const reserved = await runWithActor(ownerId, async () =>
            reserveGeneration(scope, { ...phase, targetId: chapterId }),
          );
          if (!reserved.ok) throw new Error("a phase reservation was refused");

          const persist = createGenerationPersistence<string>(scope, {
            generationId: reserved.value.id,
            model: MODEL,
          });

          if (index >= upTo) return;

          await runGenerationAttempt({
            generationId: reserved.value.id,
            persist,
            produce: (report) => {
              calls += 1;
              report(usageOf(FIRST_CALL));

              return succeed(`phase-${index}`);
            },
          });
        }
      }

      await runOperation(3);
      expect(calls).toBe(3);

      await runOperation(phases.length);

      // Two more calls, not five: the three completed phases were recognised
      // by their keys and skipped.
      expect(calls).toBe(5);
      expect(await prisma.generation.count({ where: { projectId: scope.projectId } })).toBe(5);
      expect(
        await prisma.generationAttempt.count({
          where: { generation: { projectId: scope.projectId } },
        }),
      ).toBe(5);

      const unit = Number(usageOf(FIRST_CALL).estimatedCostUsd);
      expect(Number(await accountedCost(scope))).toBeCloseTo(unit * 5, 6);
    });
  });

  describe("generation progress (CAL-062)", () => {
    async function progressOf(
      generationId: string,
    ): Promise<{ progressStep: string | null; progressPercent: number | null }> {
      const row = await prisma.generation.findUniqueOrThrow({
        where: { id: generationId },
        select: { progressStep: true, progressPercent: true },
      });

      return row;
    }

    it("records a running generation's step and clamps the percentage to [0, 100]", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "WRITE_SCENE", input: { chapterId: "p1" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      await claimGenerationAttempt(scope, { generationId: reserved.value.id, model: MODEL });

      await updateGenerationProgress(scope, {
        generationId: reserved.value.id,
        step: "Composition du contexte",
        percent: 42,
      });
      expect(await progressOf(reserved.value.id)).toEqual({
        progressStep: "Composition du contexte",
        progressPercent: 42,
      });

      // A later call states the total again — it does not add to it, the same
      // discipline `report` uses for usage.
      await updateGenerationProgress(scope, {
        generationId: reserved.value.id,
        step: "Rédaction en cours",
        percent: 150,
      });
      expect(await progressOf(reserved.value.id)).toEqual({
        progressStep: "Rédaction en cours",
        progressPercent: 100,
      });

      await updateGenerationProgress(scope, {
        generationId: reserved.value.id,
        step: "Validation",
        percent: -5,
      });
      expect((await progressOf(reserved.value.id)).progressPercent).toBe(0);
    });

    it("is a no-op once the generation has left RUNNING", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "WRITE_SCENE", input: { chapterId: "p2" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      await claimGenerationAttempt(scope, { generationId: reserved.value.id, model: MODEL });
      await completeGenerationAttempt(scope, {
        generationId: reserved.value.id,
        attempt: 1,
        durationMs: 500,
        status: "succeeded",
        retryable: false,
        usage: usageOf(FIRST_CALL),
      });

      // The attempt is over; a late progress update racing the completion must
      // not resurrect a display value on a settled generation.
      await updateGenerationProgress(scope, {
        generationId: reserved.value.id,
        step: "Rédaction en cours",
        percent: 80,
      });

      expect(await progressOf(reserved.value.id)).toEqual({
        progressStep: null,
        progressPercent: null,
      });
    });

    it("is scoped: it never writes a row outside the caller's project", async () => {
      const mine = await createFixture();
      const theirs = await createFixture();
      const reserved = await runWithActor(theirs.ownerId, async () =>
        reserveGeneration(theirs.scope, { mission: "WRITE_SCENE", input: { chapterId: "p3" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      await claimGenerationAttempt(theirs.scope, {
        generationId: reserved.value.id,
        model: MODEL,
      });

      const forged = { ...mine.scope, projectId: theirs.scope.projectId } as ProjectScope;

      // Not a throw: an update matching no row is the ordinary shape of a
      // forged or late call, not a failure this function reports.
      await updateGenerationProgress(forged, {
        generationId: reserved.value.id,
        step: "Rédaction en cours",
        percent: 50,
      });

      expect(await progressOf(reserved.value.id)).toEqual({
        progressStep: null,
        progressPercent: null,
      });
    });

    it("clears a reclaimed attempt's progress when the next one opens", async () => {
      const { ownerId, scope } = await createFixture();
      const reserved = await runWithActor(ownerId, async () =>
        reserveGeneration(scope, { mission: "WRITE_SCENE", input: { chapterId: "p4" } }),
      );
      if (!reserved.ok) throw new Error("the reservation was refused");

      const held = new Date("2026-03-01T10:00:00.000Z");
      await claimGenerationAttempt(scope, {
        generationId: reserved.value.id,
        model: MODEL,
        leaseMs: 60_000,
        now: held,
      });
      await updateGenerationProgress(scope, {
        generationId: reserved.value.id,
        step: "Rédaction en cours",
        percent: 75,
      });
      expect((await progressOf(reserved.value.id)).progressStep).toBe("Rédaction en cours");

      // The worker holding that progress died. A redelivery past the lease
      // reclaims the attempt and opens a new one, which must not show the
      // dead attempt's last step.
      const afterRestart = new Date(held.getTime() + 120_000);
      const retaken = await claimGenerationAttempt(scope, {
        generationId: reserved.value.id,
        model: MODEL,
        now: afterRestart,
      });

      expect(retaken.ok && retaken.value).toEqual({ kind: "claimed", attempt: 2 });
      expect(await progressOf(reserved.value.id)).toEqual({
        progressStep: null,
        progressPercent: null,
      });
    });
  });
});
