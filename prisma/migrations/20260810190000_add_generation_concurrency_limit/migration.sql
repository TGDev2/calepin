-- CAL-065 — concurrency limiting for generations.
--
-- Two nullable overrides, one per row that can carry one: null means "use the
-- system default" (DEFAULT_PROJECT_GENERATION_CONCURRENCY_LIMIT /
-- DEFAULT_USER_GENERATION_CONCURRENCY_LIMIT in @calepin/shared/generation),
-- the same shape `generations.attemptCeiling` already uses for its own
-- per-row override (CAL-063). Enforced at the claim, under the row's own
-- lock — nothing here is a queue setting, because BullMQ OSS has no per-group
-- concurrency primitive to hold one.

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "generationConcurrencyLimit" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "generationConcurrencyLimit" INTEGER;

-- CreateIndex
-- How many of a project's generations are RUNNING right now — read on every
-- claim, and served by neither existing index on `generations`.
CREATE INDEX "generations_projectId_status_idx" ON "generations"("projectId", "status");

-- A cap of zero or fewer would refuse every generation forever, which is not
-- a state worth being able to represent — the same reasoning
-- generations_attempt_ceiling_check already applies to attemptCeiling. Null
-- is the ordinary case: the system default, held in code rather than
-- duplicated here as a column default.
ALTER TABLE "projects" ADD CONSTRAINT "projects_generation_concurrency_limit_check"
  CHECK ("generationConcurrencyLimit" IS NULL OR "generationConcurrencyLimit" >= 1);

ALTER TABLE "users" ADD CONSTRAINT "users_generation_concurrency_limit_check"
  CHECK ("generationConcurrencyLimit" IS NULL OR "generationConcurrencyLimit" >= 1);

-- `nextAttemptAt` now has a second legitimate reason to be set on a `QUEUED`
-- row: a claim refused for being over capacity, which schedules a near
-- deadline so the reconciliation sweep offers the row again shortly, rather
-- than waiting out its full staleness window. That refusal opens no attempt
-- and classifies no failure — nothing went wrong, there is nothing to
-- classify — so `generations_retry_check` (add_generation_retry) requiring a
-- `failureClass` alongside every `nextAttemptAt` is now too strict: it was
-- correct for the one reason CAL-063 knew about, not for both. The
-- constraint's real job is unchanged and stays enforced — `nextAttemptAt` is
-- never set on a row that is not `QUEUED`.
ALTER TABLE "generations" DROP CONSTRAINT "generations_retry_check";

ALTER TABLE "generations" ADD CONSTRAINT "generations_retry_check"
  CHECK (
    ("failureClass" IS NULL OR "status" IN ('QUEUED', 'FAILED'))
    AND ("nextAttemptAt" IS NULL OR "status" = 'QUEUED')
  );
