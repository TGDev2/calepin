-- CreateEnum
CREATE TYPE "analysis_section" AS ENUM ('FACTUAL_SUMMARY', 'PREMISE', 'MAIN_CONFLICT', 'NARRATIVE_PROMISE', 'THEMES', 'CHARACTERS', 'RELATIONSHIPS', 'POINT_OF_VIEW', 'TENSE', 'TONE', 'SINGULAR_ELEMENTS', 'AMBIGUITIES', 'OPEN_QUESTIONS', 'ELEMENTS_TO_PRESERVE', 'WEAKNESSES', 'CLICHE_RISKS', 'DEVELOPMENT_POTENTIAL');

-- CreateEnum
CREATE TYPE "analysis_element_kind" AS ENUM ('FACTUAL', 'INTERPRETATION');

-- CreateEnum
CREATE TYPE "analysis_revision_origin" AS ENUM ('GENERATED', 'EDITED');

-- CreateTable
CREATE TABLE "analyses" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_section_revisions" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "section" "analysis_section" NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "origin" "analysis_revision_origin" NOT NULL,
    "sourceTextVersionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_section_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_elements" (
    "id" TEXT NOT NULL,
    "sectionRevisionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "analysis_element_kind" NOT NULL,
    "label" TEXT,
    "statement" TEXT NOT NULL,
    "evidence" TEXT,

    CONSTRAINT "analysis_elements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_annotations" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analyses_projectId_key" ON "analyses"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_section_revisions_analysisId_section_revisionNumbe_key" ON "analysis_section_revisions"("analysisId", "section", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_elements_sectionRevisionId_position_key" ON "analysis_elements"("sectionRevisionId", "position");

-- CreateIndex
CREATE INDEX "analysis_annotations_elementId_idx" ON "analysis_annotations"("elementId");

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_section_revisions" ADD CONSTRAINT "analysis_section_revisions_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_section_revisions" ADD CONSTRAINT "analysis_section_revisions_sourceTextVersionId_fkey" FOREIGN KEY ("sourceTextVersionId") REFERENCES "source_text_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_section_revisions" ADD CONSTRAINT "analysis_section_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_elements" ADD CONSTRAINT "analysis_elements_sectionRevisionId_fkey" FOREIGN KEY ("sectionRevisionId") REFERENCES "analysis_section_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_annotations" ADD CONSTRAINT "analysis_annotations_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "analysis_elements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_annotations" ADD CONSTRAINT "analysis_annotations_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The specification asks the analysis to carry a validation status. These two
-- columns are that status, and Prisma cannot say that they move together:
-- without the constraint, an analysis could be validated by nobody, or record
-- an author for a validation that never happened.
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_validation_check" CHECK (
    ("validatedAt" IS NULL AND "validatedById" IS NULL)
    OR ("validatedAt" IS NOT NULL AND "validatedById" IS NOT NULL)
);

-- The current revision of a section is the one with the highest number, so the
-- numbering is load-bearing rather than decorative: a zero or a negative
-- revision would make "current" meaningless.
ALTER TABLE "analysis_section_revisions" ADD CONSTRAINT "analysis_section_revisions_revision_number_check" CHECK (
    "revisionNumber" > 0
);

-- Elements are ordered inside their revision, and the order is the section's
-- reading order.
ALTER TABLE "analysis_elements" ADD CONSTRAINT "analysis_elements_position_check" CHECK (
    "position" >= 0
);
