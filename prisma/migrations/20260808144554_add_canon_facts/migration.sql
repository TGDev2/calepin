-- CreateEnum
CREATE TYPE "canon_fact_validity" AS ENUM ('PERMANENT', 'DURING_PERIOD', 'UNTIL_EVENT');

-- CreateEnum
CREATE TYPE "canon_fact_source" AS ENUM ('SOURCE_TEXT', 'BIBLE', 'CHAPTER', 'USER');

-- CreateEnum
CREATE TYPE "canon_fact_status" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "canon_fact_belief_state" AS ENUM ('BELIEVES_TRUE', 'BELIEVES_FALSE', 'UNAWARE');

-- CreateTable
CREATE TABLE "canon_facts" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "isTrue" BOOLEAN NOT NULL,
    "validity" "canon_fact_validity" NOT NULL DEFAULT 'PERMANENT',
    "validFromDay" INTEGER,
    "validFromPrecision" "timeline_precision",
    "validFromLabel" TEXT,
    "validUntilDay" INTEGER,
    "validUntilPrecision" "timeline_precision",
    "validUntilLabel" TEXT,
    "invalidatedByEventId" TEXT,
    "source" "canon_fact_source" NOT NULL,
    "status" "canon_fact_status" NOT NULL DEFAULT 'PROPOSED',
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canon_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canon_fact_beliefs" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "state" "canon_fact_belief_state" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canon_fact_beliefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canon_fact_subjects" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "characterId" TEXT,
    "placeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canon_fact_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canon_facts_bibleId_status_idx" ON "canon_facts"("bibleId", "status");

-- CreateIndex
CREATE INDEX "canon_facts_bibleId_invalidatedByEventId_idx" ON "canon_facts"("bibleId", "invalidatedByEventId");

-- CreateIndex
CREATE UNIQUE INDEX "canon_facts_bibleId_id_key" ON "canon_facts"("bibleId", "id");

-- CreateIndex
CREATE INDEX "canon_fact_beliefs_characterId_idx" ON "canon_fact_beliefs"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "canon_fact_beliefs_factId_characterId_key" ON "canon_fact_beliefs"("factId", "characterId");

-- CreateIndex
CREATE INDEX "canon_fact_subjects_characterId_idx" ON "canon_fact_subjects"("characterId");

-- CreateIndex
CREATE INDEX "canon_fact_subjects_placeId_idx" ON "canon_fact_subjects"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "places_bibleId_id_key" ON "places"("bibleId", "id");

-- AddForeignKey
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- NO ACTION, and above all not SET NULL, which is what Prisma emits by default
-- for an optional relation. PostgreSQL nulls every column of a composite key,
-- "bibleId" included, where it hits a NOT NULL with an error naming neither
-- the fact nor the cause — the add_timeline migration records the probed
-- trace. Deleting an event a fact depends on is therefore refused, which is
-- the intent: it would silently strip the boundary that gives the fact its
-- meaning. Deleting the bible or the project still cascades, because the
-- facts go in the same statement, before the check runs.
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_bibleId_invalidatedByEventId_fkey" FOREIGN KEY ("bibleId", "invalidatedByEventId") REFERENCES "timeline_events"("bibleId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "canon_fact_beliefs" ADD CONSTRAINT "canon_fact_beliefs_bibleId_factId_fkey" FOREIGN KEY ("bibleId", "factId") REFERENCES "canon_facts"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_fact_beliefs" ADD CONSTRAINT "canon_fact_beliefs_bibleId_characterId_fkey" FOREIGN KEY ("bibleId", "characterId") REFERENCES "characters"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_fact_subjects" ADD CONSTRAINT "canon_fact_subjects_bibleId_factId_fkey" FOREIGN KEY ("bibleId", "factId") REFERENCES "canon_facts"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_fact_subjects" ADD CONSTRAINT "canon_fact_subjects_bibleId_characterId_fkey" FOREIGN KEY ("bibleId", "characterId") REFERENCES "characters"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_fact_subjects" ADD CONSTRAINT "canon_fact_subjects_bibleId_placeId_fkey" FOREIGN KEY ("bibleId", "placeId") REFERENCES "places"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Which columns a temporal mode may set. PERMANENT is the fact that needs no
-- other column; DURING_PERIOD is placed by at least one bound — a day or the
-- author's own wording, exactly as a timeline event may be placed by words
-- alone — and never by an invalidating event; UNTIL_EVENT is placed by its
-- event and by nothing else. A CASE on a NOT NULL enum column always takes a
-- branch, and every branch is built from IS NULL tests and num_nonnulls, so
-- the whole expression is never NULL — the trap add_narrative_bible's first
-- check fell into: a CHECK rejects a row only when it evaluates to FALSE.
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_validity_check" CHECK (
    CASE "validity"
        WHEN 'PERMANENT' THEN
            num_nonnulls("validFromDay", "validFromPrecision", "validFromLabel",
                         "validUntilDay", "validUntilPrecision", "validUntilLabel",
                         "invalidatedByEventId") = 0
        WHEN 'DURING_PERIOD' THEN
            "invalidatedByEventId" IS NULL
            AND num_nonnulls("validFromDay", "validFromLabel",
                             "validUntilDay", "validUntilLabel") >= 1
        WHEN 'UNTIL_EVENT' THEN
            "invalidatedByEventId" IS NOT NULL
            AND num_nonnulls("validFromDay", "validFromPrecision", "validFromLabel",
                             "validUntilDay", "validUntilPrecision", "validUntilLabel") = 0
    END
);

-- A bound and the precision it is known to move together — the pairing
-- timeline_events_absolute_date_check established, for the same reason: a day
-- with no precision would be read as day-precise by every consumer.
-- `(x IS NULL) = (y IS NULL)` evaluates to TRUE or FALSE and never to NULL.
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_valid_from_precision_check" CHECK (
    ("validFromDay" IS NULL) = ("validFromPrecision" IS NULL)
);

ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_valid_until_precision_check" CHECK (
    ("validUntilDay" IS NULL) = ("validUntilPrecision" IS NULL)
);

-- A period that ends before it starts is structural nonsense, not narrative
-- evidence — unlike a fact whose bounds disagree with the chronology, which
-- CAL-093 reports rather than refuses. Equal bounds are a fact true a single
-- day. The IS NULL guards keep the expression TRUE rather than NULL when
-- either bound is unnumbered.
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_period_order_check" CHECK (
    "validFromDay" IS NULL OR "validUntilDay" IS NULL OR "validFromDay" <= "validUntilDay"
);

-- A subject is a character or a place, exactly one. num_nonnulls never
-- returns NULL, so neither does the check.
ALTER TABLE "canon_fact_subjects" ADD CONSTRAINT "canon_fact_subjects_exactly_one_check" CHECK (
    num_nonnulls("characterId", "placeId") = 1
);

-- One subject row per entity per fact. Two partial unique indexes rather than
-- one three-column unique: PostgreSQL treats NULLs as distinct in a unique
-- index, so the plain index would admit every duplicate whose other column is
-- NULL — which is all of them. Prisma cannot express a partial index; the
-- shape is creative_directions_canonical_per_project_key's. Their leading
-- factId column also serves the subjects-of-a-fact read.
CREATE UNIQUE INDEX "canon_fact_subjects_factId_characterId_key" ON "canon_fact_subjects"("factId", "characterId") WHERE "characterId" IS NOT NULL;

CREATE UNIQUE INDEX "canon_fact_subjects_factId_placeId_key" ON "canon_fact_subjects"("factId", "placeId") WHERE "placeId" IS NOT NULL;
