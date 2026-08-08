-- CreateEnum
CREATE TYPE "generation_mission" AS ENUM ('ANALYZE_SOURCE_TEXT', 'PROPOSE_DIRECTIONS', 'EVALUATE_DIRECTION', 'CREATE_CHARACTER_SHEET', 'BUILD_CHAPTER_OUTLINE', 'WRITE_SCENE', 'EXTRACT_FACTS', 'CHECK_COHERENCE', 'FIX_ISSUE', 'SUMMARIZE_CHAPTER');

-- CreateEnum
CREATE TYPE "generation_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "generation_attempt_status" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "error_category" AS ENUM ('VALIDATION', 'NOT_FOUND', 'FORBIDDEN', 'CONFLICT', 'RATE_LIMIT', 'PROVIDER', 'TIMEOUT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "quality_issue_category" AS ENUM ('FACTUAL_CONTINUITY', 'PSYCHOLOGICAL_CONTINUITY', 'STRUCTURE', 'STYLE', 'ORIGINALITY');

-- CreateEnum
CREATE TYPE "quality_issue_severity" AS ENUM ('CRITICAL', 'MAJOR', 'MINOR');

-- CreateEnum
CREATE TYPE "quality_issue_status" AS ENUM ('DETECTED', 'ACCEPTED', 'TO_FIX', 'FIXED', 'IGNORED');

-- CreateEnum
CREATE TYPE "export_format" AS ENUM ('MARKDOWN', 'DOCX', 'PDF', 'EPUB', 'HTML', 'PLAIN_TEXT');

-- CreateEnum
CREATE TYPE "export_status" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "publication_visibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- AlterTable
ALTER TABLE "analysis_section_revisions" ADD COLUMN     "generationId" TEXT;

-- AlterTable
ALTER TABLE "chapter_revisions" ADD COLUMN     "generationId" TEXT;

-- CreateTable
CREATE TABLE "generations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "mission" "generation_mission" NOT NULL,
    "targetId" TEXT,
    "input" JSONB NOT NULL,
    "status" "generation_status" NOT NULL DEFAULT 'QUEUED',
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorCategory" "error_category",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_attempts" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUsd" DECIMAL(12,6),
    "durationMs" INTEGER,
    "status" "generation_attempt_status" NOT NULL DEFAULT 'RUNNING',
    "errorCode" TEXT,
    "errorCategory" "error_category",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "generation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_issues" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" "quality_issue_category" NOT NULL,
    "severity" "quality_issue_severity" NOT NULL,
    "status" "quality_issue_status" NOT NULL DEFAULT 'DETECTED',
    "checkId" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "proposedFix" TEXT,
    "detectedByGenerationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_issue_passages" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "chapterRevisionId" TEXT,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_issue_passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exports" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "format" "export_format" NOT NULL,
    "status" "export_status" NOT NULL DEFAULT 'QUEUED',
    "options" JSONB NOT NULL DEFAULT '{}',
    "storageKey" TEXT,
    "byteSize" INTEGER,
    "wordCount" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "visibility" "publication_visibility" NOT NULL DEFAULT 'PRIVATE',
    "title" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "blurb" TEXT,
    "coverStorageKey" TEXT,
    "firstPublishedAt" TIMESTAMP(3),
    "unpublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generations_projectId_mission_targetId_idx" ON "generations"("projectId", "mission", "targetId");

-- CreateIndex
CREATE INDEX "generations_projectId_createdAt_idx" ON "generations"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "generations_status_createdAt_idx" ON "generations"("status", "createdAt");

-- CreateIndex
CREATE INDEX "generation_attempts_startedAt_idx" ON "generation_attempts"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "generation_attempts_generationId_attempt_key" ON "generation_attempts"("generationId", "attempt");

-- CreateIndex
CREATE INDEX "quality_issues_projectId_status_severity_idx" ON "quality_issues"("projectId", "status", "severity");

-- CreateIndex
CREATE INDEX "quality_issues_projectId_category_idx" ON "quality_issues"("projectId", "category");

-- CreateIndex
CREATE INDEX "quality_issues_detectedByGenerationId_idx" ON "quality_issues"("detectedByGenerationId");

-- CreateIndex
CREATE INDEX "quality_issue_passages_chapterId_idx" ON "quality_issue_passages"("chapterId");

-- CreateIndex
CREATE INDEX "exports_projectId_createdAt_idx" ON "exports"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "exports_projectId_status_idx" ON "exports"("projectId", "status");

-- CreateIndex
CREATE INDEX "exports_requestedById_idx" ON "exports"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "publications_projectId_key" ON "publications"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "publications_slug_key" ON "publications"("slug");

-- CreateIndex
CREATE INDEX "publications_visibility_firstPublishedAt_idx" ON "publications"("visibility", "firstPublishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_revisions_chapterId_id_key" ON "chapter_revisions"("chapterId", "id");

-- AddForeignKey
--
-- SET NULL on a single, already-optional column, so none of the composite-key
-- traps of add_timeline and add_outline_and_manuscript apply. Restrict would be
-- wrong here: a generation row is an accounting record with a retention of its
-- own, and losing the pointer to it must never cost the author a revision.
ALTER TABLE "analysis_section_revisions" ADD CONSTRAINT "analysis_section_revisions_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_revisions" ADD CONSTRAINT "chapter_revisions_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_detectedByGenerationId_fkey" FOREIGN KEY ("detectedByGenerationId") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_issue_passages" ADD CONSTRAINT "quality_issue_passages_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "quality_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_issue_passages" ADD CONSTRAINT "quality_issue_passages_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- The composite key that stops a passage naming one chapter while anchoring
-- into a revision of another. It coexists with the plain chapter key above
-- rather than replacing it: PostgreSQL's MATCH SIMPLE leaves a composite key
-- unchecked as soon as one of its columns is NULL, so a chapter-level passage —
-- no revision, no offsets — would otherwise reference nothing at all.
ALTER TABLE "quality_issue_passages" ADD CONSTRAINT "quality_issue_passages_chapterId_chapterRevisionId_fkey" FOREIGN KEY ("chapterId", "chapterRevisionId") REFERENCES "chapter_revisions"("chapterId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exports" ADD CONSTRAINT "exports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exports" ADD CONSTRAINT "exports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The constraints below are hand-written: Prisma's schema language cannot
-- express a CHECK, so they live here and their intent lives in the doc comments
-- of prisma/schema.prisma. They are written before the migration is applied —
-- editing an applied migration breaks its checksum, the CAL-018 lesson.

-- A terminal generation has an end, a pending one does not. The pairing shape
-- analyses_validation_check and bibles_validation_check already use: two
-- columns stamped by one code path, so a state where one is set without the
-- other is a bug and not a shape the schema should be able to hold.
ALTER TABLE "generations" ADD CONSTRAINT "generations_completion_check"
  CHECK (("completedAt" IS NOT NULL) = ("status" IN ('SUCCEEDED', 'FAILED', 'CANCELLED')));

-- A classification is a code *and* its category, and only a failure has one. A
-- cancelled generation is not a failed one: nothing went wrong, so there is
-- nothing to classify, and letting it carry an error code would put cancelled
-- work in the operations dashboard's error causes.
ALTER TABLE "generations" ADD CONSTRAINT "generations_failure_check"
  CHECK (
    ("errorCode" IS NULL) = ("errorCategory" IS NULL)
    AND ("errorCode" IS NULL OR "status" = 'FAILED')
  );

-- 1 for the first try, as AttemptContext.attempt is. A zeroth or negative
-- attempt would break the idempotency key's meaning, not just its ordering.
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_attempt_check"
  CHECK ("attempt" >= 1);

-- Usage and cost are measurements: negative ones are not a failure mode worth
-- representing, and a single negative row would make a project's total cost
-- wrong in the direction nobody checks.
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_usage_check"
  CHECK (
    ("inputTokens" IS NULL OR "inputTokens" >= 0)
    AND ("outputTokens" IS NULL OR "outputTokens" >= 0)
    AND ("estimatedCostUsd" IS NULL OR "estimatedCostUsd" >= 0)
    AND ("durationMs" IS NULL OR "durationMs" >= 0)
  );

-- An attempt that is no longer running has ended. A row left RUNNING with no
-- end is exactly what a worker that died mid-generation leaves behind, and what
-- CAL-060's reconciliation looks for — so that state stays storable on purpose.
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_completion_check"
  CHECK (("completedAt" IS NOT NULL) = ("status" <> 'RUNNING'));

ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_failure_check"
  CHECK (
    ("errorCode" IS NULL) = ("errorCategory" IS NULL)
    AND ("errorCode" IS NULL OR "status" = 'FAILED')
  );

-- Offsets come as a pair, in order, and only alongside the revision they index
-- into. An offset without a revision is a number into an unnamed text: every
-- consumer would have to guess which version it meant, and the guess would be
-- "the current one", which is the silent drift anchoring into a revision exists
-- to prevent. Null offsets with a chapter are the whole-chapter passage a
-- structural check reports (CAL-138), which is why they stay legal.
ALTER TABLE "quality_issue_passages" ADD CONSTRAINT "quality_issue_passages_offsets_check"
  CHECK (
    ("startOffset" IS NULL) = ("endOffset" IS NULL)
    AND (
      "startOffset" IS NULL
      OR ("chapterRevisionId" IS NOT NULL AND "startOffset" >= 0 AND "endOffset" >= "startOffset")
    )
  );

-- Same pairing as a generation's, over this table's own two terminal states.
ALTER TABLE "exports" ADD CONSTRAINT "exports_completion_check"
  CHECK (("completedAt" IS NOT NULL) = ("status" IN ('READY', 'FAILED')));

ALTER TABLE "exports" ADD CONSTRAINT "exports_failure_check"
  CHECK ("errorCode" IS NULL OR "status" = 'FAILED');

ALTER TABLE "exports" ADD CONSTRAINT "exports_size_check"
  CHECK (
    ("byteSize" IS NULL OR "byteSize" >= 0)
    AND ("wordCount" IS NULL OR "wordCount" >= 0)
  );

-- The public address is part of a URL forever, so its shape is a constraint and
-- not a convention — the same reasoning that makes the fractional index's
-- alphabet a CHECK in add_outline_and_manuscript. Lowercase alphanumerics
-- joined by single hyphens, 3 to 80 characters: no leading, trailing or
-- doubled hyphen, nothing a router or a share card would have to escape.
ALTER TABLE "publications" ADD CONSTRAINT "publications_slug_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") BETWEEN 3 AND 80);

-- A novel a reader can reach has a publication date, because the presentation
-- page shows one (CAL-203). Unpublishing returns the row to PRIVATE and leaves
-- the date standing, so a republication does not silently redate the novel.
ALTER TABLE "publications" ADD CONSTRAINT "publications_published_check"
  CHECK ("visibility" = 'PRIVATE' OR "firstPublishedAt" IS NOT NULL);
