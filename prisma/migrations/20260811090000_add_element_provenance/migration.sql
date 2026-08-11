-- CAL-073 · the traceability pattern: a lineage and an origin per element.
--
-- Two columns are added NOT NULL to a table that already has rows, so each one
-- is added nullable, backfilled, and only then constrained. The backfill is the
-- honest reading of what is already there: every analysis element in existence
-- was written by a generation or by the seed standing in for one, so its origin
-- is GENERATED, and none of them has ever been carried across a revision, so a
-- fresh lineage per row loses nothing.
--
-- The annotations move off the element row and onto (analysis, lineage). Their
-- backfill therefore has to run while `elementId` is still there — the join it
-- reads is the only place the pair can be recovered from.

-- CreateEnum
CREATE TYPE "content_origin" AS ENUM ('GENERATED', 'EDITED', 'USER_WRITTEN');

-- AlterTable: analysis_elements, added nullable so the backfill can run
ALTER TABLE "analysis_elements" ADD COLUMN "lineageId" TEXT;
ALTER TABLE "analysis_elements" ADD COLUMN "origin" "content_origin";

UPDATE "analysis_elements"
SET "lineageId" = gen_random_uuid()::text,
    "origin" = 'GENERATED'
WHERE "lineageId" IS NULL;

ALTER TABLE "analysis_elements" ALTER COLUMN "lineageId" SET NOT NULL;
ALTER TABLE "analysis_elements" ALTER COLUMN "origin" SET NOT NULL;

-- AlterTable: analysis_annotations, keyed by lineage instead of by element row
ALTER TABLE "analysis_annotations" ADD COLUMN "analysisId" TEXT;
ALTER TABLE "analysis_annotations" ADD COLUMN "lineageId" TEXT;

UPDATE "analysis_annotations" a
SET "analysisId" = r."analysisId",
    "lineageId" = e."lineageId"
FROM "analysis_elements" e
JOIN "analysis_section_revisions" r ON r."id" = e."sectionRevisionId"
WHERE e."id" = a."elementId";

-- Nothing should survive this: elementId was NOT NULL with a cascading foreign
-- key, so every row has a matching element. It is here because the columns
-- below are about to become NOT NULL, and failing loudly on a row the join
-- could not reach beats a constraint error that names no cause.
DELETE FROM "analysis_annotations" WHERE "analysisId" IS NULL OR "lineageId" IS NULL;

ALTER TABLE "analysis_annotations" ALTER COLUMN "analysisId" SET NOT NULL;
ALTER TABLE "analysis_annotations" ALTER COLUMN "lineageId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "analysis_annotations" DROP CONSTRAINT "analysis_annotations_elementId_fkey";

-- DropIndex
DROP INDEX "analysis_annotations_elementId_idx";

-- AlterTable
ALTER TABLE "analysis_annotations" DROP COLUMN "elementId";

-- CreateIndex
CREATE INDEX "analysis_annotations_analysisId_lineageId_idx" ON "analysis_annotations"("analysisId", "lineageId");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_elements_sectionRevisionId_lineageId_key" ON "analysis_elements"("sectionRevisionId", "lineageId");

-- AddForeignKey
ALTER TABLE "analysis_annotations" ADD CONSTRAINT "analysis_annotations_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
