-- Redundant with "projects_userId_status_idx": a composite btree already serves
-- any lookup keyed on its leading column, so this one only cost a write on
-- every project mutation.
-- DropIndex
DROP INDEX "projects_userId_idx";

-- The fourth target length of the specification is a custom one, and until now
-- the enum could name it without the schema being able to store its value.
-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "targetWordCount" INTEGER;

-- The enum names the choice; this column carries the number only the custom
-- choice has. Prisma cannot express the biconditional, so it is written here:
-- without it, a CUSTOM project with no count, or a preset carrying a count that
-- contradicts its own range, would both be storable.
ALTER TABLE "projects" ADD CONSTRAINT "projects_custom_target_word_count_check" CHECK (
    ("targetLength" = 'CUSTOM' AND "targetWordCount" IS NOT NULL AND "targetWordCount" > 0)
    OR ("targetLength" <> 'CUSTOM' AND "targetWordCount" IS NULL)
);
