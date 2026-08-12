-- CreateTable
CREATE TABLE "bible_versions" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "bible_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bible_versions_bibleId_versionNumber_key" ON "bible_versions"("bibleId", "versionNumber");

-- AddForeignKey
ALTER TABLE "bible_versions" ADD CONSTRAINT "bible_versions_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_versions" ADD CONSTRAINT "bible_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
