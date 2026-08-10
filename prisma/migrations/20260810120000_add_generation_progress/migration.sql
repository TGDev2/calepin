-- CAL-062 — real-time generation progress.
--
-- Two display-only columns: a named step and an indicative percentage.
-- Advisory, never read by anything that decides the generation's fate, and
-- reset to null by `claimGenerationAttempt` whenever a new attempt opens.

-- AlterTable
ALTER TABLE "generations" ADD COLUMN     "progressStep" TEXT,
ADD COLUMN     "progressPercent" INTEGER;

-- Constraints Prisma's schema language cannot express, as in
-- add_generation_idempotency: the column's own doc comment states the
-- range, this is what enforces it.
ALTER TABLE "generations" ADD CONSTRAINT "generations_progress_percent_check"
  CHECK ("progressPercent" IS NULL OR ("progressPercent" BETWEEN 0 AND 100));
