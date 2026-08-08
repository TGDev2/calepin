-- CreateEnum
CREATE TYPE "character_importance" AS ENUM ('MAIN', 'SECONDARY', 'MINOR');

-- CreateEnum
CREATE TYPE "character_field" AS ENUM ('NAME', 'AGE', 'ROLE', 'IMPORTANCE', 'APPEARANCE', 'INITIAL_SITUATION', 'APPARENT_DESIRE', 'DEEP_NEED', 'FEAR', 'CONTRADICTION', 'SECRET', 'PAST', 'PLANNED_ARC', 'SPEECH_STYLE', 'HELD_KNOWLEDGE', 'ELEMENTS_TO_PRESERVE');

-- CreateEnum
CREATE TYPE "relationship_type" AS ENUM ('FAMILY', 'ROMANTIC', 'FRIENDSHIP', 'PROFESSIONAL', 'MENTORSHIP', 'ALLIANCE', 'RIVALRY', 'HOSTILITY', 'OTHER');

-- CreateTable
CREATE TABLE "bibles" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_identities" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "workingTitle" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "subGenre" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "narrativePromise" TEXT NOT NULL,
    "themes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "counterThemes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "centralQuestion" TEXT NOT NULL,
    "endingNature" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bible_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_styles" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "pointOfView" TEXT NOT NULL,
    "focalization" TEXT NOT NULL,
    "tense" TEXT NOT NULL,
    "languageRegister" TEXT NOT NULL,
    "descriptiveDensity" TEXT NOT NULL,
    "pacing" TEXT NOT NULL,
    "dialogueBalance" TEXT NOT NULL,
    "recurringMotifs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "elementsToAvoid" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bible_styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "role" TEXT,
    "importance" "character_importance" NOT NULL DEFAULT 'SECONDARY',
    "appearance" TEXT,
    "initialSituation" TEXT,
    "apparentDesire" TEXT,
    "deepNeed" TEXT,
    "fear" TEXT,
    "contradiction" TEXT,
    "secret" TEXT,
    "past" TEXT,
    "plannedArc" TEXT,
    "speechStyle" TEXT,
    "heldKnowledge" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "elementsToPreserve" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lockedAt" TIMESTAMP(3),
    "lockedFields" "character_field"[] NOT NULL DEFAULT ARRAY[]::"character_field"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "fromCharacterId" TEXT NOT NULL,
    "toCharacterId" TEXT NOT NULL,
    "type" "relationship_type" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_rules" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "isSupernatural" BOOLEAN NOT NULL DEFAULT false,
    "limits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "costs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "failureConditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bibles_projectId_key" ON "bibles"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "bible_identities_bibleId_key" ON "bible_identities"("bibleId");

-- CreateIndex
CREATE UNIQUE INDEX "bible_styles_bibleId_key" ON "bible_styles"("bibleId");

-- CreateIndex
CREATE INDEX "characters_bibleId_importance_idx" ON "characters"("bibleId", "importance");

-- CreateIndex
CREATE UNIQUE INDEX "characters_bibleId_id_key" ON "characters"("bibleId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "characters_bibleId_name_key" ON "characters"("bibleId", "name");

-- CreateIndex
CREATE INDEX "relationships_toCharacterId_idx" ON "relationships"("toCharacterId");

-- CreateIndex
CREATE INDEX "relationships_bibleId_idx" ON "relationships"("bibleId");

-- CreateIndex
CREATE UNIQUE INDEX "relationships_fromCharacterId_toCharacterId_type_key" ON "relationships"("fromCharacterId", "toCharacterId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "places_bibleId_name_key" ON "places"("bibleId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "world_rules_bibleId_name_key" ON "world_rules"("bibleId", "name");

-- AddForeignKey
ALTER TABLE "bibles" ADD CONSTRAINT "bibles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bibles" ADD CONSTRAINT "bibles_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_identities" ADD CONSTRAINT "bible_identities_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_styles" ADD CONSTRAINT "bible_styles_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_bibleId_fromCharacterId_fkey" FOREIGN KEY ("bibleId", "fromCharacterId") REFERENCES "characters"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_bibleId_toCharacterId_fkey" FOREIGN KEY ("bibleId", "toCharacterId") REFERENCES "characters"("bibleId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_rules" ADD CONSTRAINT "world_rules_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The bible carries a validation status, and these two columns are that status.
-- Prisma cannot say that they move together: without the constraint a bible
-- could be validated by nobody, or record an author for a validation that never
-- happened. Same constraint, same reason, as analyses_validation_check.
ALTER TABLE "bibles" ADD CONSTRAINT "bibles_validation_check" CHECK (
    ("validatedAt" IS NULL AND "validatedById" IS NULL)
    OR ("validatedAt" IS NOT NULL AND "validatedById" IS NOT NULL)
);

-- The age is numeric so that CAL-093 can reject an arithmetically impossible
-- chronology and CAL-017 can compute an age at an event. A negative age would
-- make both computations meaningless. There is deliberately no upper bound: a
-- character can be eight hundred years old.
ALTER TABLE "characters" ADD CONSTRAINT "characters_age_check" CHECK (
    "age" IS NULL OR "age" >= 0
);

-- A relationship is an edge between two distinct characters. A self-edge would
-- satisfy every foreign key here and mean nothing, and the coherence engine
-- would count it as a tie the novel has to honour.
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_distinct_characters_check" CHECK (
    "fromCharacterId" <> "toCharacterId"
);

-- CAL-092's imperative: no supernatural element and no out-of-norm capability
-- may be declared without explicit limits. That is what makes a later
-- resolution by convenience detectable at all (CAL-159), so it is enforced
-- where it cannot be forgotten rather than left to the mission writing the row.
--
-- coalesce is load-bearing, not defensive noise. A CHECK only rejects a row
-- when it evaluates to FALSE, and `cardinality(NULL)` is NULL, so the first
-- version of this constraint — without coalesce — accepted a supernatural rule
-- whose limits column was never written. The array columns above are NOT NULL,
-- which closes that path too; the guard stays because the constraint must not
-- depend on a nullability declared three hundred lines away.
ALTER TABLE "world_rules" ADD CONSTRAINT "world_rules_supernatural_limits_check" CHECK (
    NOT "isSupernatural" OR coalesce(cardinality("limits"), 0) > 0
);
