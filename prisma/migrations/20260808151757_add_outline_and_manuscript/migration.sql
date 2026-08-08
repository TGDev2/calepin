-- CreateEnum
CREATE TYPE "chapter_status" AS ENUM ('PLANNED', 'TO_WRITE', 'GENERATING', 'FIRST_DRAFT', 'TO_REVISE', 'VALIDATED', 'LOCKED');

-- CreateEnum
CREATE TYPE "chapter_revision_origin" AS ENUM ('GENERATED', 'EDITED');

-- CreateTable
CREATE TABLE "outlines" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts" (
    "id" TEXT NOT NULL,
    "outlineId" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dramaticObjective" TEXT,
    "initialState" TEXT,
    "tippingPoint" TEXT,
    "finalState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL,
    "outlineId" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "status" "chapter_status" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_outlines" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "workingTitle" TEXT,
    "targetWordCount" INTEGER,
    "focalCharacterId" TEXT,
    "placeId" TEXT,
    "periodStartDay" INTEGER,
    "periodEndDay" INTEGER,
    "periodPrecision" "timeline_precision",
    "periodLabel" TEXT,
    "dramaticFunction" TEXT,
    "immediateGoal" TEXT,
    "obstacle" TEXT,
    "decision" TEXT,
    "revelation" TEXT,
    "consequence" TEXT,
    "detailedSummary" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_outlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_outline_characters" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "chapterOutlineId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_outline_characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_outline_facts" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "chapterOutlineId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_outline_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_revisions" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "origin" "chapter_revision_origin" NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outlines_projectId_key" ON "outlines"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "outlines_bibleId_key" ON "outlines"("bibleId");

-- CreateIndex
CREATE UNIQUE INDEX "outlines_bibleId_id_key" ON "outlines"("bibleId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "parts_outlineId_id_key" ON "parts"("outlineId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "parts_outlineId_title_key" ON "parts"("outlineId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "parts_outlineId_orderKey_key" ON "parts"("outlineId", "orderKey");

-- CreateIndex
CREATE INDEX "chapters_outlineId_idx" ON "chapters"("outlineId");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_bibleId_id_key" ON "chapters"("bibleId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_partId_orderKey_key" ON "chapters"("partId", "orderKey");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_outlines_chapterId_key" ON "chapter_outlines"("chapterId");

-- CreateIndex
CREATE INDEX "chapter_outlines_bibleId_focalCharacterId_idx" ON "chapter_outlines"("bibleId", "focalCharacterId");

-- CreateIndex
CREATE INDEX "chapter_outlines_bibleId_placeId_idx" ON "chapter_outlines"("bibleId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_outlines_bibleId_id_key" ON "chapter_outlines"("bibleId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_outlines_bibleId_chapterId_key" ON "chapter_outlines"("bibleId", "chapterId");

-- CreateIndex
CREATE INDEX "chapter_outline_characters_characterId_idx" ON "chapter_outline_characters"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_outline_characters_chapterOutlineId_characterId_key" ON "chapter_outline_characters"("chapterOutlineId", "characterId");

-- CreateIndex
CREATE INDEX "chapter_outline_facts_factId_idx" ON "chapter_outline_facts"("factId");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_outline_facts_chapterOutlineId_factId_key" ON "chapter_outline_facts"("chapterOutlineId", "factId");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_revisions_chapterId_revisionNumber_key" ON "chapter_revisions"("chapterId", "revisionNumber");

-- AddForeignKey
ALTER TABLE "outlines" ADD CONSTRAINT "outlines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlines" ADD CONSTRAINT "outlines_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_outlineId_fkey" FOREIGN KEY ("outlineId") REFERENCES "outlines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_bibleId_outlineId_fkey" FOREIGN KEY ("bibleId", "outlineId") REFERENCES "outlines"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- NO ACTION, and above all not CASCADE: deleting a part that still holds
-- chapters would take the manuscript with it without saying so. The plan
-- screen moves the chapters out first. Deleting the outline or the project
-- still works — the chapters are removed by the CASCADE above in the same
-- statement, and NO ACTION is checked at the end of it, which is the behaviour
-- the add_timeline migration probed rather than assumed.
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_outlineId_partId_fkey" FOREIGN KEY ("outlineId", "partId") REFERENCES "parts"("outlineId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chapter_outlines" ADD CONSTRAINT "chapter_outlines_bibleId_chapterId_fkey" FOREIGN KEY ("bibleId", "chapterId") REFERENCES "chapters"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- SET NULL on a **column list**, which Prisma cannot express and which is why
-- these two statements are hand-written. Deleting a character un-focalises the
-- chapters they focalised; deleting a place empties the chapters set in it. The
-- plan keeps its fifteen other attributes, and CAL-108 reports the hole.
--
-- Neither action the schema already uses works here, and it was the probe that
-- said so rather than the reasoning:
--
--   - a bare SET NULL nulls *every* column of the composite key, "bibleId"
--     included, where it hits a NOT NULL with an error naming neither the
--     chapter nor the cause — the trap the add_timeline migration records;
--   - NO ACTION, which is add_timeline's answer, makes deleting the **project**
--     fail with P2003 on this very constraint. There the referencing rows and
--     the referenced ones sat in one cascade subtree and went in the same
--     statement; here they sit in two — characters hang off the bible, chapter
--     outlines off the outline — and the check on the character delete fires
--     before the other branch has run.
--
-- The column list, available from PostgreSQL 15, keeps the same-bible guarantee
-- and the project cascade at the same time.
ALTER TABLE "chapter_outlines" ADD CONSTRAINT "chapter_outlines_bibleId_focalCharacterId_fkey" FOREIGN KEY ("bibleId", "focalCharacterId") REFERENCES "characters"("bibleId", "id") ON DELETE SET NULL ("focalCharacterId") ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chapter_outlines" ADD CONSTRAINT "chapter_outlines_bibleId_placeId_fkey" FOREIGN KEY ("bibleId", "placeId") REFERENCES "places"("bibleId", "id") ON DELETE SET NULL ("placeId") ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chapter_outline_characters" ADD CONSTRAINT "chapter_outline_characters_bibleId_chapterOutlineId_fkey" FOREIGN KEY ("bibleId", "chapterOutlineId") REFERENCES "chapter_outlines"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_outline_characters" ADD CONSTRAINT "chapter_outline_characters_bibleId_characterId_fkey" FOREIGN KEY ("bibleId", "characterId") REFERENCES "characters"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_outline_facts" ADD CONSTRAINT "chapter_outline_facts_bibleId_chapterOutlineId_fkey" FOREIGN KEY ("bibleId", "chapterOutlineId") REFERENCES "chapter_outlines"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_outline_facts" ADD CONSTRAINT "chapter_outline_facts_bibleId_factId_fkey" FOREIGN KEY ("bibleId", "factId") REFERENCES "canon_facts"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_revisions" ADD CONSTRAINT "chapter_revisions_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_revisions" ADD CONSTRAINT "chapter_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The shape of an order key, and the invariant the whole ordering rests on.
--
-- A key is a fraction written in base 36 over the alphabet spelled out below,
-- and it must never end in '0': "a1" and "a10" are the same fraction, so the
-- midpoint between them does not exist and an insertion between the two rows
-- would have nowhere to go. The domain never produces such a key
-- (@calepin/outline, orderKeyBetween); this makes one unstorable, including
-- through a direct SQL insert. The empty string is refused by the same
-- expression, since the last character class is not optional.
--
-- The alphabet is written out rather than as the ranges [0-9a-z], because a
-- range inside a bracket expression is interpreted through the database's
-- collation and PostgreSQL's own documentation calls ranges non-portable for
-- exactly that reason. An explicit set depends on nothing.
ALTER TABLE "parts" ADD CONSTRAINT "parts_order_key_check" CHECK (
    "orderKey" ~ '^[0123456789abcdefghijklmnopqrstuvwxyz]*[123456789abcdefghijklmnopqrstuvwxyz]$'
);

ALTER TABLE "chapters" ADD CONSTRAINT "chapters_order_key_check" CHECK (
    "orderKey" ~ '^[0123456789abcdefghijklmnopqrstuvwxyz]*[123456789abcdefghijklmnopqrstuvwxyz]$'
);

-- A chapter aiming at zero words is not a target, it is a missing value, and a
-- negative one is nonsense. Bounded below only, as characters_age_check and
-- projects_custom_target_word_count_check already are — a chapter may be very
-- long. The IS NULL guard keeps the expression TRUE rather than NULL when the
-- target has not been set.
ALTER TABLE "chapter_outlines" ADD CONSTRAINT "chapter_outlines_target_word_count_check" CHECK (
    "targetWordCount" IS NULL OR "targetWordCount" > 0
);

-- The period and the precision it is known to move together, the pairing
-- timeline_events_absolute_date_check established: a day with no precision
-- would be read as day-precise by every consumer, and a precision with no day
-- describes nothing. One precision covers both bounds — a chapter is stated at
-- a single granularity. Both sides evaluate to TRUE or FALSE and never to
-- NULL, since num_nonnulls never returns NULL.
ALTER TABLE "chapter_outlines" ADD CONSTRAINT "chapter_outlines_period_precision_check" CHECK (
    ("periodPrecision" IS NULL) = (num_nonnulls("periodStartDay", "periodEndDay") = 0)
);

-- A chapter that ends before it starts is structural nonsense, not narrative
-- evidence — unlike a chapter whose period disagrees with the chronology,
-- which E13 reports rather than refuses. Equal bounds are a chapter happening
-- in a single day. The IS NULL guards keep the expression TRUE rather than
-- NULL when either bound is unnumbered.
ALTER TABLE "chapter_outlines" ADD CONSTRAINT "chapter_outlines_period_order_check" CHECK (
    "periodStartDay" IS NULL OR "periodEndDay" IS NULL OR "periodStartDay" <= "periodEndDay"
);

-- Revisions are numbered from 1 and counted in whole words. Both columns are
-- NOT NULL, so neither expression can evaluate to NULL.
ALTER TABLE "chapter_revisions" ADD CONSTRAINT "chapter_revisions_revision_number_check" CHECK (
    "revisionNumber" >= 1
);

ALTER TABLE "chapter_revisions" ADD CONSTRAINT "chapter_revisions_word_count_check" CHECK (
    "wordCount" >= 0
);
