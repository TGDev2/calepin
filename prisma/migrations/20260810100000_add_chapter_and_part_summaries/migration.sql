-- CAL-055. The two levels of the summary hierarchy, both append-only.
--
-- A validated chapter yields a brief summary and a detailed one, and the part
-- holding it yields a summary of its own. Both are versioned the way every
-- other narrative artefact here is versioned: a numbered revision per row,
-- nothing overwritten, the current one being the highest — the ChapterRevision
-- shape, with no updatedAt, no audit block and no isCurrent flag.
--
-- The chapter summary's foreign key names the *revision* it was made from,
-- through chapter_revisions' own (chapterId, id) unique key, and not the
-- chapter. Three things follow from that one choice: a summary of another
-- chapter's revision cannot be stored; the provenance a later obsolescence
-- read needs is a comparison of two numbers rather than a judgement about the
-- prose; and there is exactly one path from this table to chapters, so no
-- second key can disagree with the first about which chapter a row belongs to.
-- The cascade still reaches here from a chapter deletion — chapters ->
-- chapter_revisions -> chapter_summary_revisions is one subtree and therefore
-- one statement, which is the condition the add_timeline and add_outline
-- lessons say a cascade has to meet.
--
-- The part summary carries no provenance column. It is made from the current
-- summaries of its chapters, so naming one of them would name an arbitrary
-- member of a set and naming all of them is a link table for a question
-- createdAt already answers: the part summary is in doubt when a chapter
-- summary under it is newer.
--
-- No CHECK on the word counts, matching chapter_revisions.wordCount beside
-- them: the counts are written by countWords at write time and no caller
-- supplies one, so a constraint here would guard a value the code already owns.

-- AlterEnum
ALTER TYPE "generation_mission" ADD VALUE 'SUMMARIZE_PART';

-- CreateTable
CREATE TABLE "chapter_summary_revisions" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "chapterRevisionId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "briefSummary" TEXT NOT NULL,
    "detailedSummary" TEXT NOT NULL,
    "briefWordCount" INTEGER NOT NULL,
    "detailedWordCount" INTEGER NOT NULL,
    "generationId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_summary_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_summary_revisions" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "generationId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_summary_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chapter_summary_revisions_chapterRevisionId_idx" ON "chapter_summary_revisions"("chapterRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_summary_revisions_chapterId_revisionNumber_key" ON "chapter_summary_revisions"("chapterId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "part_summary_revisions_partId_revisionNumber_key" ON "part_summary_revisions"("partId", "revisionNumber");

-- AddForeignKey
ALTER TABLE "chapter_summary_revisions" ADD CONSTRAINT "chapter_summary_revisions_chapterId_chapterRevisionId_fkey" FOREIGN KEY ("chapterId", "chapterRevisionId") REFERENCES "chapter_revisions"("chapterId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_summary_revisions" ADD CONSTRAINT "chapter_summary_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_summary_revisions" ADD CONSTRAINT "chapter_summary_revisions_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_summary_revisions" ADD CONSTRAINT "part_summary_revisions_partId_fkey" FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_summary_revisions" ADD CONSTRAINT "part_summary_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_summary_revisions" ADD CONSTRAINT "part_summary_revisions_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
