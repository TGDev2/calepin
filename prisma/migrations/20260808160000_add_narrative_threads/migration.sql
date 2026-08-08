-- CreateEnum
CREATE TYPE "thread_status" AS ENUM ('OPEN', 'CONTINUED', 'CLOSED');

-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "outlineId" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "narrativePromise" TEXT NOT NULL,
    "openingChapterId" TEXT NOT NULL,
    "closingChapterId" TEXT,
    "status" "thread_status" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_continuations" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_continuations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "threads_outlineId_status_idx" ON "threads"("outlineId", "status");

-- CreateIndex
CREATE INDEX "threads_bibleId_openingChapterId_idx" ON "threads"("bibleId", "openingChapterId");

-- CreateIndex
CREATE INDEX "threads_bibleId_closingChapterId_idx" ON "threads"("bibleId", "closingChapterId");

-- CreateIndex
CREATE UNIQUE INDEX "threads_bibleId_id_key" ON "threads"("bibleId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "threads_outlineId_label_key" ON "threads"("outlineId", "label");

-- CreateIndex
CREATE INDEX "thread_continuations_chapterId_idx" ON "thread_continuations"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "thread_continuations_threadId_chapterId_key" ON "thread_continuations"("threadId", "chapterId");

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_bibleId_outlineId_fkey" FOREIGN KEY ("bibleId", "outlineId") REFERENCES "outlines"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- NO ACTION, and above all not CASCADE: deleting a single chapter that a
-- thread still opens at would take the thread with it without saying so, the
-- same protection chapters_outlineId_partId_fkey gives a part still holding
-- chapters. Deleting the outline, the bible or the project still works —
-- threads and chapters are both direct children of Outline, so both tables
-- are emptied by the same cascading statement before this check runs. Probed
-- against the real database, not assumed, per the CAL-017 lesson: the two-
-- subtree case that broke a bare NO ACTION for focalCharacterId in CAL-019
-- does not apply here, because nothing sits between Thread, Chapter and their
-- shared parent Outline.
ALTER TABLE "threads" ADD CONSTRAINT "threads_bibleId_openingChapterId_fkey" FOREIGN KEY ("bibleId", "openingChapterId") REFERENCES "chapters"("bibleId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
--
-- SET NULL on a **column list**, which Prisma cannot express and which is why
-- this statement is hand-written — the same trap and the same fix as
-- chapter_outlines_bibleId_focalCharacterId_fkey in add_outline_and_manuscript.
-- A bare SET NULL nulls every column of the composite key, "bibleId" included,
-- where it hits a NOT NULL with an error naming neither the thread nor the
-- cause; the column list, PostgreSQL 15 and later, nulls only
-- "closingChapterId" and keeps the same-bible guarantee.
ALTER TABLE "threads" ADD CONSTRAINT "threads_bibleId_closingChapterId_fkey" FOREIGN KEY ("bibleId", "closingChapterId") REFERENCES "chapters"("bibleId", "id") ON DELETE SET NULL ("closingChapterId") ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "thread_continuations" ADD CONSTRAINT "thread_continuations_bibleId_threadId_fkey" FOREIGN KEY ("bibleId", "threadId") REFERENCES "threads"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_continuations" ADD CONSTRAINT "thread_continuations_bibleId_chapterId_fkey" FOREIGN KEY ("bibleId", "chapterId") REFERENCES "chapters"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

