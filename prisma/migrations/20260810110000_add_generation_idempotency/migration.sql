-- CAL-058 — idempotent generations and no double counting.
--
-- Two columns, and between them they close the four ways one model call can be
-- charged twice: the same ask enqueued twice, the same try recorded twice, the
-- same attempt completed twice, and a worker that died mid-call being re-run.

-- AlterTable
ALTER TABLE "generation_attempts" ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3);

-- An attempt written before the lease existed is running under a worker no
-- claim can find. Dating its lease at its own start makes it reclaimable
-- instead of permanent, which is the state the column exists to remove; it also
-- lets the CHECK below hold over rows that predate it.
UPDATE "generation_attempts"
SET "leaseExpiresAt" = "startedAt"
WHERE "status" = 'RUNNING';

-- AlterTable — added nullable, filled, then made mandatory. The key is derived
-- from the row's own columns, and a row written before the derivation existed
-- names no ask: `sha256(id)` gives each one a value of the right shape that no
-- real ask can ever collide with, since no ask hashes an identifier alone.
ALTER TABLE "generations" ADD COLUMN     "idempotencyKey" TEXT;

UPDATE "generations"
SET "idempotencyKey" = encode(sha256(convert_to("id", 'UTF8')), 'hex')
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "generations" ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "generations_projectId_idempotencyKey_key" ON "generations"("projectId", "idempotencyKey");

-- Constraints Prisma's schema language cannot express, as in
-- add_operations_models: their intent lives in the doc comments beside the
-- columns, their enforcement lives here.

-- The shape `generationIdempotencyKey` produces, restated where it binds. The
-- function is the only sanctioned way to build one, and this is what stops a
-- row written by anything else — a fixture, an import, a future call site —
-- from carrying a readable rendering of the input instead of a digest of it
-- (CLAUDE.md §9: the input may hold the author's own instruction).
ALTER TABLE "generations" ADD CONSTRAINT "generations_idempotency_key_check"
  CHECK ("idempotencyKey" ~ '^[0-9a-f]{64}$');

-- A lease exists exactly while an attempt runs. The equivalence is what makes
-- the reclaim total: a RUNNING attempt with no lease would be a row no worker
-- holds and no claim can take over — the permanent ghost this mechanism exists
-- to make unrepresentable — and a completed attempt still carrying one would
-- invite a claim to reclaim work that is already recorded and paid for.
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_lease_check"
  CHECK (("leaseExpiresAt" IS NOT NULL) = ("status" = 'RUNNING'));
