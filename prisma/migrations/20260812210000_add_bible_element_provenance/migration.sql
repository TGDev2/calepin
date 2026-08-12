-- CAL-096 · the traceability pattern of CAL-073, reused by the bible as
-- ContentOrigin's own comment says it was written to be.
--
-- Added NOT NULL to tables that already have rows (characters, places,
-- relationships), so each column is added nullable, backfilled, and only then
-- constrained -- the add_element_provenance migration's own shape. The
-- backfill is the honest reading of what is already there: every row in
-- existence was written by a generation or by the seed standing in for one,
-- so its origin is GENERATED.
--
-- CanonFact is deliberately absent: it already carries source and status, and
-- a third column able to disagree with those two is the lesson CAL-012
-- records.

-- AlterTable: bible_identities
ALTER TABLE "bible_identities" ADD COLUMN "origin" "content_origin";
UPDATE "bible_identities" SET "origin" = 'GENERATED' WHERE "origin" IS NULL;
ALTER TABLE "bible_identities" ALTER COLUMN "origin" SET NOT NULL;

-- AlterTable: bible_styles
ALTER TABLE "bible_styles" ADD COLUMN "origin" "content_origin";
UPDATE "bible_styles" SET "origin" = 'GENERATED' WHERE "origin" IS NULL;
ALTER TABLE "bible_styles" ALTER COLUMN "origin" SET NOT NULL;

-- AlterTable: bible_worlds
ALTER TABLE "bible_worlds" ADD COLUMN "origin" "content_origin";
UPDATE "bible_worlds" SET "origin" = 'GENERATED' WHERE "origin" IS NULL;
ALTER TABLE "bible_worlds" ALTER COLUMN "origin" SET NOT NULL;

-- AlterTable: characters
ALTER TABLE "characters" ADD COLUMN "origin" "content_origin";
UPDATE "characters" SET "origin" = 'GENERATED' WHERE "origin" IS NULL;
ALTER TABLE "characters" ALTER COLUMN "origin" SET NOT NULL;

-- AlterTable: places
ALTER TABLE "places" ADD COLUMN "origin" "content_origin";
UPDATE "places" SET "origin" = 'GENERATED' WHERE "origin" IS NULL;
ALTER TABLE "places" ALTER COLUMN "origin" SET NOT NULL;

-- AlterTable: relationships
ALTER TABLE "relationships" ADD COLUMN "origin" "content_origin";
UPDATE "relationships" SET "origin" = 'GENERATED' WHERE "origin" IS NULL;
ALTER TABLE "relationships" ALTER COLUMN "origin" SET NOT NULL;

-- AlterTable: timeline_events
ALTER TABLE "timeline_events" ADD COLUMN "origin" "content_origin";
UPDATE "timeline_events" SET "origin" = 'GENERATED' WHERE "origin" IS NULL;
ALTER TABLE "timeline_events" ALTER COLUMN "origin" SET NOT NULL;

-- AlterTable: world_rules
ALTER TABLE "world_rules" ADD COLUMN "origin" "content_origin";
UPDATE "world_rules" SET "origin" = 'GENERATED' WHERE "origin" IS NULL;
ALTER TABLE "world_rules" ALTER COLUMN "origin" SET NOT NULL;
