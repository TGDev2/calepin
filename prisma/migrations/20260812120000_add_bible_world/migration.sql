-- CAL-092: the world section's scalar half, the fifth bible section and the
-- last one E09 left unmodelled. CAL-016 wrote `places` and `world_rules` and
-- deferred the rest here in as many words.
--
-- Shaped as `bible_styles` is, and for its reasons: one row per bible, every
-- content column NOT NULL so that a row existing means a section produced, one
-- `lockedAt` for CAL-095, and the audit quartet of CAL-022.
--
-- `politicalContext` is the one nullable content column. The specification
-- writes *contexte politique éventuel*, and the mission's own contract makes
-- the field required-but-nullable — so a null here is an answer, never a field
-- somebody skipped.
--
-- No column for *éléments surnaturels* and none for *les limites de ces
-- éléments*: both are `world_rules` rows, and the limits are those rows'
-- shape. A text column here holding the limits could be empty while a
-- supernatural rule existed, which is the single state this task exists to
-- make unreachable.
CREATE TABLE "bible_worlds" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "era" TEXT NOT NULL,
    "socialContext" TEXT NOT NULL,
    "politicalContext" TEXT,
    "technologies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "institutions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "constraints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL DEFAULT 'unattributed',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "bible_worlds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bible_worlds_bibleId_key" ON "bible_worlds"("bibleId");

-- AddForeignKey
ALTER TABLE "bible_worlds" ADD CONSTRAINT "bible_worlds_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DEFERRABLE INITIALLY DEFERRED, as every `updatedById` key of CAL-022 is:
-- NO ACTION alone only defers to the end of the *statement*, and deleting a
-- user reaches this row through two levels of cascade (users → projects →
-- bibles → bible_worlds), which is the depth at which the undeferred form
-- fails.
ALTER TABLE "bible_worlds" ADD CONSTRAINT "bible_worlds_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
