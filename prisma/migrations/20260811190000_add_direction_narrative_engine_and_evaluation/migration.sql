-- AlterTable
-- Added nullable first, backfilled, then locked NOT NULL: the local demo
-- seed already holds creative_directions rows, and a bare
-- "ADD COLUMN ... NOT NULL" with no default fails against a populated table.
ALTER TABLE "creative_directions" ADD COLUMN     "narrativeEngine" JSONB;

UPDATE "creative_directions"
SET "narrativeEngine" = '{"conflictNature":"interpersonal","tensionSource":"pursuit","protagonistStake":"life","shiftTrigger":"revelation","resolutionNature":"victory"}'::jsonb
WHERE "narrativeEngine" IS NULL;

ALTER TABLE "creative_directions" ALTER COLUMN "narrativeEngine" SET NOT NULL;

-- CreateTable
CREATE TABLE "direction_evaluations" (
    "id" TEXT NOT NULL,
    "directionId" TEXT NOT NULL,
    "promises" JSONB NOT NULL,
    "shortfalls" JSONB NOT NULL,
    "conventions" JSONB NOT NULL,
    "comparativeWeaknesses" JSONB NOT NULL,
    "generationId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direction_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "direction_evaluations_directionId_key" ON "direction_evaluations"("directionId");

-- AddForeignKey
ALTER TABLE "direction_evaluations" ADD CONSTRAINT "direction_evaluations_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "creative_directions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direction_evaluations" ADD CONSTRAINT "direction_evaluations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direction_evaluations" ADD CONSTRAINT "direction_evaluations_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
