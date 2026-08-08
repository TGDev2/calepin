-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('DRAFT', 'ANALYSIS_IN_PROGRESS', 'DIRECTION_TO_CHOOSE', 'BIBLE_TO_VALIDATE', 'OUTLINE_IN_PROGRESS', 'WRITING_IN_PROGRESS', 'REVISION', 'COMPLETED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "target_length" AS ENUM ('SHORT', 'STANDARD', 'LONG', 'CUSTOM');

-- CreateEnum
CREATE TYPE "freedom_level" AS ENUM ('LOW', 'BALANCED', 'HIGH');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "targetLength" "target_length" NOT NULL DEFAULT 'STANDARD',
    "targetAudience" TEXT NOT NULL DEFAULT 'Grand public',
    "freedomLevel" "freedom_level" NOT NULL DEFAULT 'BALANCED',
    "status" "project_status" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_texts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_texts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_text_versions" (
    "id" TEXT NOT NULL,
    "sourceTextId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "editedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_text_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "projects_userId_idx" ON "projects"("userId");

-- CreateIndex
CREATE INDEX "projects_userId_status_idx" ON "projects"("userId", "status");

-- CreateIndex
CREATE INDEX "projects_userId_updatedAt_idx" ON "projects"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "source_texts_projectId_key" ON "source_texts"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "source_text_versions_sourceTextId_versionNumber_key" ON "source_text_versions"("sourceTextId", "versionNumber");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_texts" ADD CONSTRAINT "source_texts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_text_versions" ADD CONSTRAINT "source_text_versions_sourceTextId_fkey" FOREIGN KEY ("sourceTextId") REFERENCES "source_texts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_text_versions" ADD CONSTRAINT "source_text_versions_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
