-- CAL-063 — failure recovery: classified retries, exponential backoff, replay.
--
-- Three columns and one enum, all on `generations`. The idea they encode is the
-- same one CAL-060/061 built the lifecycle on: the row is the truth. A backoff
-- expressed as a deadline in PostgreSQL survives a worker being killed, where a
-- `setTimeout` in a process does not — so `nextAttemptAt` is a column and there
-- is no timer anywhere in the retry path.

-- CreateEnum
CREATE TYPE "generation_failure_class" AS ENUM ('TRANSIENT', 'RATE_LIMITED', 'PERMANENT');

-- AlterTable
ALTER TABLE "generations" ADD COLUMN     "attemptCeiling" INTEGER,
ADD COLUMN     "failureClass" "generation_failure_class",
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "generations_status_nextAttemptAt_idx" ON "generations"("status", "nextAttemptAt");

-- Constraints Prisma's schema language cannot express, as in
-- add_generation_progress: the columns' own doc comments state the invariants,
-- these are what enforce them.

-- A classification exists exactly while a failure is the last thing that
-- happened to this generation: it is waiting for another attempt, or it has
-- failed for good. A running, succeeded or cancelled generation carries none —
-- a cancellation is not a failure, the same distinction
-- generations_failure_check already draws for the code and the category.
--
-- The second clause is the load-bearing one. A retry deadline only means
-- something on a queued row that is queued *because* something failed; without
-- it the schema could hold a fresh generation with a deadline nobody set, and
-- `listDeliverableGenerations` would honour it.
ALTER TABLE "generations" ADD CONSTRAINT "generations_retry_check"
  CHECK (
    ("failureClass" IS NULL OR "status" IN ('QUEUED', 'FAILED'))
    AND ("nextAttemptAt" IS NULL OR ("status" = 'QUEUED' AND "failureClass" IS NOT NULL))
  );

-- A ceiling below one is a generation that may never be attempted, which is not
-- a state worth being able to represent: replaying it would write the row and
-- change nothing. Null is the ordinary case — the default ceiling, held in code
-- as MAX_GENERATION_ATTEMPTS rather than duplicated here as a column default.
ALTER TABLE "generations" ADD CONSTRAINT "generations_attempt_ceiling_check"
  CHECK ("attemptCeiling" IS NULL OR "attemptCeiling" >= 1);
