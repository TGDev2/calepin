-- CreateEnum
CREATE TYPE "timeline_event_category" AS ENUM ('BACKSTORY', 'NARRATED', 'PLANNED');

-- CreateEnum
CREATE TYPE "timeline_precision" AS ENUM ('DAY', 'MONTH', 'SEASON', 'YEAR', 'DECADE');

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "category" "timeline_event_category" NOT NULL,
    "absoluteDay" INTEGER,
    "datePrecision" "timeline_precision",
    "dateLabel" TEXT,
    "precedingEventId" TEXT,
    "daysAfterPreceding" INTEGER,
    "durationPrecision" "timeline_precision",
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_event_participants" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "declaredAge" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timeline_event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timeline_events_bibleId_absoluteDay_idx" ON "timeline_events"("bibleId", "absoluteDay");

-- CreateIndex
CREATE INDEX "timeline_events_bibleId_precedingEventId_idx" ON "timeline_events"("bibleId", "precedingEventId");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_events_bibleId_id_key" ON "timeline_events"("bibleId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_events_bibleId_name_key" ON "timeline_events"("bibleId", "name");

-- CreateIndex
CREATE INDEX "timeline_event_participants_characterId_idx" ON "timeline_event_participants"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_event_participants_eventId_characterId_key" ON "timeline_event_participants"("eventId", "characterId");

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- NO ACTION, and above all not SET NULL, which is what Prisma emits by default
-- for an optional relation. PostgreSQL nulls every column of a composite key,
-- so SET NULL here would try to null "bibleId" too and fail on its NOT NULL —
-- an error naming neither the event nor the cause:
--
--   ERROR: null value in column "bibleId" of relation "timeline_events"
--     violates not-null constraint
--   CONTEXT: SQL statement "UPDATE ONLY "timeline_events"
--     SET "bibleId" = NULL, "precedingEventId" = NULL ..."
--
-- Deleting an anchored event is therefore refused, which is the intent: it
-- would silently un-place every event hanging off it. Deleting the bible or
-- the project still cascades, because the referencing rows go in the same
-- statement, before the check runs.
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_bibleId_precedingEventId_fkey" FOREIGN KEY ("bibleId", "precedingEventId") REFERENCES "timeline_events"("bibleId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "timeline_event_participants" ADD CONSTRAINT "timeline_event_participants_bibleId_eventId_fkey" FOREIGN KEY ("bibleId", "eventId") REFERENCES "timeline_events"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_event_participants" ADD CONSTRAINT "timeline_event_participants_bibleId_characterId_fkey" FOREIGN KEY ("bibleId", "characterId") REFERENCES "characters"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An event that can be placed neither on the day axis nor after another event
-- is not part of a chronology, and CAL-017's acceptance criterion is that the
-- chronology is reconstructible in order. Note that an anchor alone is a
-- complete placement: it orders the event without dating it, which is the case
-- the backlog names — events with no absolute date but a known order.
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_placement_check" CHECK (
    "absoluteDay" IS NOT NULL OR "precedingEventId" IS NOT NULL
);

-- A date and the precision it is known to move together. A day with no
-- precision would be read as day-precise by every consumer, and an age computed
-- from it would contradict a perfectly consistent novel to within six months; a
-- precision with no day describes nothing.
--
-- `(x IS NULL) = (y IS NULL)` is deliberate rather than `x IS NULL AND y IS
-- NULL OR ...`: it evaluates to TRUE or FALSE and never to NULL, which is the
-- trap add_narrative_bible's supernatural check fell into — a CHECK rejects a
-- row only when it evaluates to FALSE.
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_absolute_date_check" CHECK (
    ("absoluteDay" IS NULL) = ("datePrecision" IS NULL)
);

-- Same pairing for the relative placement, plus the anchor a duration is
-- measured from: "six months later" than nothing is not a placement.
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_relative_date_check" CHECK (
    ("daysAfterPreceding" IS NULL OR "precedingEventId" IS NOT NULL)
    AND (("daysAfterPreceding" IS NULL) = ("durationPrecision" IS NULL))
);

-- The duration is measured *since* the preceding event, so it never runs
-- backwards. This is what makes a chain a chain: every hop moves forward, the
-- resolution of a day terminates, and an event that happens earlier is anchored
-- the other way round rather than by a negative duration. Zero is allowed —
-- two events may be simultaneous.
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_duration_sign_check" CHECK (
    "daysAfterPreceding" IS NULL OR "daysAfterPreceding" >= 0
);

-- An event cannot follow itself. The composite foreign key above is satisfied
-- by a row pointing at its own (bibleId, id), so without this the shortest
-- possible cycle would be storable. Longer cycles span rows and no CHECK can
-- see them: resolveTimeline detects those and refuses to order a chronology
-- that contains one.
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_distinct_preceding_check" CHECK (
    "precedingEventId" IS NULL OR "precedingEventId" <> "id"
);

-- The age the text asserts for a character at an event. Negative is
-- meaningless, and the comparison CAL-093 runs between this and the computed
-- age would inherit the nonsense. No upper bound, for the same reason
-- characters_age_check has none.
ALTER TABLE "timeline_event_participants" ADD CONSTRAINT "timeline_event_participants_declared_age_check" CHECK (
    "declaredAge" IS NULL OR "declaredAge" >= 0
);
