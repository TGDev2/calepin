-- CreateEnum
CREATE TYPE "direction_origin" AS ENUM ('PROPOSED', 'EDITED', 'USER_WRITTEN');

-- CreateTable
CREATE TABLE "creative_directions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workingTitle" TEXT NOT NULL,
    "developedPremise" TEXT NOT NULL,
    "dominantGenre" TEXT NOT NULL,
    "mainConflict" TEXT NOT NULL,
    "protagonistArc" TEXT NOT NULL,
    "newStakes" TEXT[],
    "charactersToIntroduce" TEXT[],
    "endingNature" TEXT NOT NULL,
    "mainRisks" TEXT[],
    "elementsKeptFromSource" TEXT[],
    "elementsTransformed" TEXT[],
    "novelPotentialAssessment" TEXT NOT NULL,
    "isCanonical" BOOLEAN NOT NULL DEFAULT false,
    "origin" "direction_origin" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creative_directions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creative_directions_projectId_idx" ON "creative_directions"("projectId");

-- AddForeignKey
ALTER TABLE "creative_directions" ADD CONSTRAINT "creative_directions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one canonical direction per project. A plain unique index on
-- "projectId" would forbid the several non-canonical directions this table
-- exists to hold, and a CHECK constraint cannot compare across rows. A
-- partial unique index is the only mechanism that expresses "unique among the
-- canonical ones", and Prisma's schema DSL has no syntax for it.
CREATE UNIQUE INDEX "creative_directions_canonical_per_project_key"
    ON "creative_directions"("projectId")
    WHERE "isCanonical" = true;
